/**
 * adopt-drive-images.ts — V11.18.40
 *
 * Operator-curated image adoption from the Google-Drive batch
 * (paradocs/"Paradocs Phenomena Images "). Reads the mapping report
 * (drive-image-mapping-report.csv), groups _NN variants per phenomenon,
 * re-encodes hero/card/thumb webp, uploads to the `phenomena-images` bucket,
 * and REPLACES primary_image_url + image_gallery with short attribution
 * labels (Editorial / CC BY-SA / Licensed stock / Public domain).
 *
 * Time-boxed + resumable (sandbox 45s cap): each run processes phenomena until
 * a wall-clock deadline, records applied slugs to a snapshot, and skips them
 * next run. Loop until "remaining: 0".
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/adopt-drive-images.ts --dry-run
 *   npx tsx scripts/adopt-drive-images.ts --apply           # loop until remaining:0
 *   npx tsx scripts/adopt-drive-images.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import sharp from 'sharp'

const DRIVE = path.resolve(process.cwd(), 'Paradocs Phenomena Images ')
const REPORT = path.resolve(process.cwd(), 'drive-image-mapping-report.csv')
const SNAP = path.resolve(process.cwd(), 'outputs/drive-adopt-snapshot.json')
const STORAGE_BUCKET = 'phenomena-images'
const SIZES = [
  { name: 'hero', width: 1200, height: 1200 },
  { name: 'card', width: 600, height: 450 },
  { name: 'thumb', width: 120, height: 90 },
]
const DEADLINE_MS = 24000
const POOL = 4

const CAT_TO_FOLDER: Record<string, string> = {
  consciousness_practices: 'Consciousness Practices', cryptids: 'Cryptids',
  esoteric_practices: 'Esoteric & Occult', ghosts_hauntings: 'Ghosts & Hauntings',
  psychic_phenomena: 'Psychic Phenomena', psychological_experiences: 'Psychological Experiences',
  religion_mythology: 'Religion & Mythology', ufos_aliens: 'UFOS & Aliens',
}
// recoveries from the unmatched set (Chase-approved)
const OVERRIDE: Record<string, { slug: string; cat: string }> = {
  'ufos_and_aliens_cigar_shaped_ufo.jpg': { slug: 'cigar-ufo', cat: 'ufos_aliens' },
  'esoteric_occult_aura.jpg': { slug: 'aura-reading', cat: 'esoteric_practices' },
  'religion_mythology_afterlife.jpg': { slug: 'afterlife', cat: 'religion_mythology' },
  'religion_mythology_djinn.jpg': { slug: 'djinn', cat: 'religion_mythology' },
  'religion_mythology_demonic_possesion.jpg': { slug: 'demonic-possession', cat: 'religion_mythology' },
}
// deprecated/archived phenomena — do NOT apply
const SKIP = new Set<string>([
  'psychological_experiences_gang_stalking_delusion.jpg',
  'psychological_experiences_truman_show_delusion.jpg',
  'psychological_experiences_confabulation.jpg',
  'psychological_experiences_mass_hysteria.jpg',
  'ufos_and_aliens_psychosocial_hypothesis_01.jpg',
  'ufos_and_aliens_psychosocial_hypothesis_02.jpg',
])

function labelToLicense(lbl: string): string {
  const l = (lbl || '').replace('?', '')
  if (l === 'CC BY-SA') return 'cc_by_sa'
  if (l === 'Licensed stock') return 'licensed'
  if (l === 'Public domain') return 'pd'
  return 'editorial'
}
function cleanLabel(lbl: string): string { return (lbl || 'Editorial').replace('?', '') }

function parseCsv(txt: string): string[][] {
  const rows: string[][] = []; let f = '', row: string[] = [], q = false
  for (let i = 0; i < txt.length; i++) { const c = txt[i]
    if (q) { if (c === '"') { if (txt[i+1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' }
      else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i+1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' }
      else f += c } }
  if (f.length || row.length) { row.push(f); rows.push(row) }
  return rows
}

type Variant = { file: string; folder: string; variant: string; source: string; label: string; sha?: string }
type Group = { slug: string; cat: string; variants: Variant[] }

function buildGroups(): Map<string, Group> {
  const rows = parseCsv(fs.readFileSync(REPORT, 'utf8')); const head = rows.shift()!
  const ix = (n: string) => head.indexOf(n)
  const groups = new Map<string, Group>()
  for (const r of rows) {
    if (!r[ix('filename')]) continue
    const filename = r[ix('filename')], folderCat = r[ix('db_category')], status = r[ix('status')]
    const matched = r[ix('matched_slug')], variant = r[ix('variant')] || '', source = r[ix('source')] || '', label = r[ix('license_label')] || 'Editorial'
    if (SKIP.has(filename)) continue
    let slug = '', cat = folderCat
    if (OVERRIDE[filename]) { slug = OVERRIDE[filename].slug; cat = OVERRIDE[filename].cat }
    else if ((status === 'matched' || status === 'ambiguous') && matched) { slug = matched }
    else continue // unmatched w/o override → skip
    const folder = CAT_TO_FOLDER[folderCat]
    const key = cat + '|' + slug
    if (!groups.has(key)) groups.set(key, { slug, cat, variants: [] })
    groups.get(key)!.variants.push({ file: filename, folder, variant, source, label })
  }
  // order variants: non-numbered first, then by variant number; dedup by sha
  for (const g of groups.values()) {
    for (const v of g.variants) {
      try { v.sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(DRIVE, v.folder, v.file))).digest('hex') } catch { v.sha = v.file }
    }
    const seen = new Set<string>(); g.variants = g.variants.filter(v => { if (seen.has(v.sha!)) return false; seen.add(v.sha!); return true })
    g.variants.sort((a, b) => (a.variant === '' ? -1 : b.variant === '' ? 1 : parseInt(a.variant) - parseInt(b.variant)))
  }
  return groups
}

async function encodeUpload(sb: any, objectBase: string, buf: Buffer): Promise<string | null> {
  let heroUrl: string | null = null
  await Promise.all(SIZES.map(async (s) => {
    const enc = await sharp(buf).rotate().resize(s.width, s.height, { fit: 'cover', position: 'attention' }).toFormat('webp', { quality: 82 }).toBuffer()
    const objectPath = s.name + '/' + objectBase + '.webp'
    await sb.storage.from(STORAGE_BUCKET).upload(objectPath, enc, { contentType: 'image/webp', upsert: true })
    if (s.name === 'hero') { const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath); heroUrl = data?.publicUrl ? data.publicUrl + '?v=' + Date.now() : null }
  }))
  return heroUrl
}

async function main() {
  const apply = process.argv.includes('--apply')
  const dry = process.argv.includes('--dry-run') || !apply && !process.argv.includes('--revert')
  const revert = process.argv.includes('--revert')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  let snap: any = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { appliedSlugs: [], prior: {} }
  if (revert) {
    const slugs = Object.keys(snap.prior || {})
    console.log('[drive-adopt] REVERT ' + slugs.length + ' phenomena')
    for (const s of slugs) { const p = snap.prior[s]; await sb.from('phenomena').update(p).eq('slug', s) }
    console.log('[drive-adopt] reverted'); return
  }

  const groups = [...buildGroups().values()]
  // resolve to active phenomena
  const slugs = groups.map(g => g.slug)
  const phMap = new Map<string, any>()
  for (let i = 0; i < slugs.length; i += 200) {
    const r = await sb.from('phenomena').select('id,slug,name,category,status,primary_image_url,image_gallery,image_source,image_license,image_attribution,image_alt_text,image_adopted_at').in('slug', slugs.slice(i, i + 200))
    for (const p of (r.data || [])) phMap.set(p.slug, p)
  }
  const applied = new Set<string>(snap.appliedSlugs || [])
  // auto-resume from DB: anything already stamped this batch counts as applied
  for (const g of groups) { const p = phMap.get(g.slug); if (p && typeof p.image_source === 'string' && p.image_source.startsWith('drive:')) applied.add(g.slug) }
  const todo = groups.filter(g => { const p = phMap.get(g.slug); return p && p.status === 'active' && !applied.has(g.slug) })
  const missing = groups.filter(g => !phMap.get(g.slug) || phMap.get(g.slug).status !== 'active')

  const totalImgs = groups.reduce((n, g) => n + g.variants.length, 0)
  console.log('=== adopt-drive-images ' + (dry ? '(DRY RUN)' : '(APPLY)') + ' ===')
  console.log('groups: ' + groups.length + ' | images: ' + totalImgs + ' | with gallery(>1): ' + groups.filter(g => g.variants.length > 1).length)
  console.log('already applied: ' + applied.size + ' | remaining(active): ' + todo.length + (missing.length ? ' | skipped(not active): ' + missing.length : ''))
  if (dry) {
    console.log('\nphenomena with multiple variants:')
    for (const g of groups.filter(x => x.variants.length > 1)) console.log('  ' + g.slug.padEnd(34) + g.variants.length + '  [' + g.variants.map(v => v.variant || 'P').join(',') + ']')
    if (missing.length) { console.log('\nNOT active (skipped): ' + missing.map(g => g.slug).join(', ')) }
    return
  }

  const deadline = Date.now() + DEADLINE_MS
  let done = 0, imgs = 0, failed = 0, cursor = 0, sinceFlush = 0
  const flush = () => { snap.appliedSlugs = [...applied]; fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify(snap)) }
  async function worker() {
    while (cursor < todo.length && Date.now() < deadline) {
      const g = todo[cursor++]; const p = phMap.get(g.slug)
      try {
        const gallery: any[] = []
        let primaryUrl: string | null = null, primaryV: Variant | null = null
        for (let i = 0; i < g.variants.length; i++) {
          const v = g.variants[i]
          const buf = fs.readFileSync(path.join(DRIVE, v.folder, v.file))
          const objBase = i === 0 ? g.slug : g.slug + '-' + (i + 1)
          const url = await encodeUpload(sb, objBase, buf)
          if (!url) { failed++; continue }
          imgs++
          if (i === 0) { primaryUrl = url; primaryV = v }
          else gallery.push({ url, source_url: '', attribution: cleanLabel(v.label), license: labelToLicense(v.label) })
        }
        if (!primaryUrl) { failed++; continue }
        const pv = primaryV!
        snap.prior[g.slug] = { primary_image_url: p.primary_image_url, image_gallery: p.image_gallery, image_source: p.image_source, image_license: p.image_license, image_attribution: p.image_attribution, image_alt_text: p.image_alt_text, image_adopted_at: p.image_adopted_at }
        await sb.from('phenomena').update({
          primary_image_url: primaryUrl,
          image_gallery: gallery,
          image_source: 'drive:' + (pv.source || 'unlogged'),
          image_license: labelToLicense(pv.label),
          image_attribution: cleanLabel(pv.label),
          image_alt_text: p.name,
          image_adopted_at: new Date().toISOString(),
        }).eq('id', p.id)
        applied.add(g.slug); done++
        if (++sinceFlush >= 10) { flush(); sinceFlush = 0 }
      } catch (e: any) { failed++; console.error('  ERR ' + g.slug + ': ' + (e?.message || e)) }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  flush()
  const remaining = todo.length - done
  console.log('this run → phenomena: ' + done + ' | images uploaded: ' + imgs + ' | failed: ' + failed)
  console.log('remaining: ' + remaining + (remaining > 0 ? '  (run again to continue)' : '  ✓ done'))
}
main().catch(e => { console.error('[drive-adopt] unhandled:', e); process.exit(1) })
