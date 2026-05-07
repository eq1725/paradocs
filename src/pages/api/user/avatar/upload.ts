/**
 * POST /api/user/avatar/upload
 *
 * V9.7 Phase 2 — custom avatar upload endpoint.
 *
 * Pipeline:
 *   1. Auth check via Supabase session
 *   2. Read raw image bytes from the request body (multipart not
 *      required — client sends a cropped Blob as application/octet-
 *      stream with size + mime in headers)
 *   3. Reject if size > 2MB or mime not in [jpeg, png, webp, heic]
 *   4. Process via sharp:
 *        - Auto-rotate based on EXIF
 *        - Strip ALL metadata (EXIF GPS leak prevention — Sam's
 *          panel point)
 *        - Resize to 256x256 cover-crop (client already cropped
 *          square, this is just a safety resize)
 *        - Convert to WebP quality 90
 *   5. Send through AWS Rekognition DetectModerationLabels
 *   6. Decision tree:
 *        a. Hard-reject labels (CSAM, explicit nudity, hate symbols)
 *           with confidence > 75 → 422 with friendly error
 *        b. Borderline labels (suggestive, violence, drugs) with
 *           confidence 40-75 → save to Storage as pending, set
 *           avatar_pending_review = TRUE, return queued response
 *        c. Clean → save to Storage, update avatar_url immediately
 *   7. On approval: write to Supabase Storage at
 *      avatars-user/{user_id}/{uuid}.webp, update profiles.avatar_url
 *
 * Storage cleanup:
 *   - When a new avatar replaces an old custom-uploaded one, the old
 *     one is deleted from Storage in the same request (best-effort,
 *     non-blocking).
 *
 * AWS_REKOGNITION_ENABLED=false bypasses moderation entirely (treats
 * everything as clean). Useful for first-deploy testing before
 * touching real user uploads.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition'

export const config = {
  api: {
    bodyParser: {
      // We expect raw image bytes; cap a touch above the 2MB user-facing
      // limit so we have headroom for metadata + cropping artifacts.
      sizeLimit: '3mb',
    },
  },
}

// Hard-reject labels at this threshold or above (out of 100).
const HARD_REJECT_THRESHOLD = 75
// Borderline → admin queue band.
const QUEUE_THRESHOLD = 40
// Hard-reject categories (parents of more specific labels per
// Rekognition's taxonomy). Anything matching these names with
// confidence ≥ HARD_REJECT_THRESHOLD is auto-rejected.
const HARD_REJECT_LABELS = [
  'Explicit Nudity',
  'Explicit Sexual Activity',
  'Graphic Violence Or Gore',
  'Hate Symbols',
  'Visually Disturbing',
  // CSAM-like is detected via the Explicit Nudity tree on minors;
  // Rekognition flags this independently. Keep as separate guard:
  'Sexual Activity',
  'Nudity',
]
// Borderline categories — sent to admin queue rather than auto-
// rejected. Drug references and weapons fall here because context
// matters (a costume vs. an actual threat).
const QUEUE_LABELS = [
  'Suggestive',
  'Violence',
  'Drugs & Tobacco',
  'Drugs',
  'Tobacco',
  'Alcohol',
  'Rude Gestures',
  'Weapons',
]

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_BYTES = 2 * 1024 * 1024 // 2MB

interface ModerationLabel {
  Name?: string
  Confidence?: number
  ParentName?: string
}

function classifyDecision(labels: ModerationLabel[]): {
  decision: 'approved' | 'pending' | 'rejected'
  reason?: string
  matched?: ModerationLabel
} {
  // Walk the labels and pick the worst single hit.
  let worst: ModerationLabel | null = null
  let worstSeverity = 0 // 0 clean, 1 queue, 2 reject

  for (const label of labels) {
    const name = label.Name || ''
    const parent = label.ParentName || ''
    const conf = label.Confidence || 0

    // Hard-reject?
    if (HARD_REJECT_LABELS.includes(name) || HARD_REJECT_LABELS.includes(parent)) {
      if (conf >= HARD_REJECT_THRESHOLD && worstSeverity < 2) {
        worst = label
        worstSeverity = 2
      }
    }
    // Queue?
    if (QUEUE_LABELS.includes(name) || QUEUE_LABELS.includes(parent)) {
      if (conf >= QUEUE_THRESHOLD && worstSeverity < 1) {
        worst = label
        worstSeverity = 1
      }
    }
  }

  if (worstSeverity === 2) {
    return { decision: 'rejected', reason: worst?.Name || 'unsafe_content', matched: worst || undefined }
  }
  if (worstSeverity === 1) {
    return { decision: 'pending', reason: worst?.Name || 'review_required', matched: worst || undefined }
  }
  return { decision: 'approved' }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1. Auth — accept Authorization Bearer token (preferred, what
  //    the client sends) and fall back to no-auth → reject. The
  //    cookie-based session pickup wasn't reliably working for
  //    octet-stream POSTs, so we explicitly use the access token
  //    the same way the admin endpoints do.
  const authHeader = req.headers.authorization || ''
  const accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: userData, error: authErr } = await authClient.auth.getUser(accessToken)
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  const userId = userData.user.id

  // 2. Read body. Client sends raw bytes with X-Mime header.
  const mime = (req.headers['x-mime'] as string) || (req.headers['content-type'] as string) || ''
  if (!ALLOWED_MIME.some(m => mime.indexOf(m) === 0)) {
    return res.status(415).json({ error: 'Unsupported image type', mime })
  }
  const raw = req.body as Buffer
  if (!raw || !raw.length) {
    return res.status(400).json({ error: 'Empty body' })
  }
  if (raw.length > MAX_BYTES) {
    return res.status(413).json({ error: 'Image too large', maxBytes: MAX_BYTES })
  }

  // 3. Process via sharp — strip EXIF, resize, convert to WebP.
  let processed: Buffer
  try {
    processed = await sharp(raw)
      .rotate() // auto-orient based on EXIF before stripping
      .resize(256, 256, { fit: 'cover', position: 'center' })
      .webp({ quality: 90 })
      .withMetadata({ exif: {} } as any) // strip GPS + camera metadata
      .toBuffer()
  } catch (err: any) {
    console.error('[AvatarUpload] sharp error:', err?.message)
    return res.status(422).json({ error: 'Could not process image. Try a JPEG or PNG.' })
  }

  // 4. Moderation — AWS Rekognition.
  let decision: 'approved' | 'pending' | 'rejected' = 'approved'
  let reason: string | undefined
  let matched: ModerationLabel | undefined
  let allLabels: ModerationLabel[] = []
  const moderationEnabled = process.env.AWS_REKOGNITION_ENABLED === 'true'

  if (moderationEnabled) {
    try {
      const client = new RekognitionClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      })
      const cmd = new DetectModerationLabelsCommand({
        Image: { Bytes: processed },
        MinConfidence: 30, // capture queue-band labels too
      })
      const out = await client.send(cmd)
      allLabels = (out.ModerationLabels || []) as ModerationLabel[]
      const verdict = classifyDecision(allLabels)
      decision = verdict.decision
      reason = verdict.reason
      matched = verdict.matched
    } catch (err: any) {
      // Don't block the user on Rekognition outages — fall back to
      // the admin queue so a human looks at it.
      console.error('[AvatarUpload] Rekognition error, queueing:', err?.message)
      decision = 'pending'
      reason = 'rekognition_error'
    }
  }

  // 5. If hard-rejected, return immediately without writing to Storage.
  if (decision === 'rejected') {
    return res.status(422).json({
      error: 'We weren’t able to use that image. Please pick something else or use one of our preset avatars.',
      reason: reason,
      moderation: { labels: allLabels.slice(0, 5) }, // small payload for debugging
    })
  }

  // 6. Upload to Supabase Storage. Service-role client because we
  //    want server to control path + can update profiles atomically.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const filename = userId + '/' + crypto.randomUUID() + '.webp'
  const { error: uploadErr } = await admin.storage
    .from('avatars-user')
    .upload(filename, processed, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: false,
    })
  if (uploadErr) {
    console.error('[AvatarUpload] Storage upload error:', uploadErr.message)
    return res.status(500).json({ error: 'Failed to save image. Try again.' })
  }
  const { data: urlData } = admin.storage.from('avatars-user').getPublicUrl(filename)
  const newUrl = urlData.publicUrl

  // 7. Best-effort cleanup: if the user previously had a custom avatar
  //    (one in our avatars-user bucket), delete the old file.
  try {
    const { data: prevProfile } = await (admin
      .from('profiles') as any)
      .select('avatar_url, avatar_pending_url')
      .eq('id', userId)
      .single()
    const previousUrls = [
      prevProfile?.avatar_url,
      prevProfile?.avatar_pending_url,
    ].filter(function (u: string) { return u && u.indexOf('avatars-user/') > -1 })
    for (const url of previousUrls) {
      // Extract the path after the bucket name in the URL.
      const m = (url as string).match(/\/avatars-user\/(.+)$/)
      if (m && m[1]) {
        await admin.storage.from('avatars-user').remove([m[1]])
      }
    }
  } catch { /* non-fatal */ }

  // 8. Update profiles row.
  const updates: any = {
    avatar_moderation_score: { labels: allLabels, decision, reason: reason || null },
    avatar_moderation_decision: decision,
    updated_at: new Date().toISOString(),
  }
  if (decision === 'approved') {
    updates.avatar_url = newUrl
    updates.avatar_pending_review = false
    updates.avatar_pending_url = null
    updates.avatar_pending_uploaded_at = null
  } else {
    // 'pending' — store as pending, leave existing avatar_url alone
    // so other users keep seeing the previous avatar until review.
    updates.avatar_pending_review = true
    updates.avatar_pending_url = newUrl
    updates.avatar_pending_uploaded_at = new Date().toISOString()
  }
  const { error: updateErr } = await (admin.from('profiles') as any)
    .update(updates)
    .eq('id', userId)
  if (updateErr) {
    console.error('[AvatarUpload] profile update error:', updateErr.message)
    return res.status(500).json({ error: 'Saved image but could not link it. Contact support.' })
  }

  return res.status(200).json({
    decision: decision,
    avatar_url: decision === 'approved' ? newUrl : null,
    pending_url: decision === 'pending' ? newUrl : null,
    reason: reason,
  })
}
