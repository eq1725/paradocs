// V11.17.71 - Pro Dossier
//
// POST /api/lab/dossier/[id]/export-pdf
//
// Returns a printable HTML document (Content-Type text/html) the
// browser can directly "Save as PDF" via the print dialog. The
// document includes `@page { size: A5; margin: 18mm; }` so the
// printed result matches the book-like spec.
//
// True server-side PDF generation (puppeteer-core + @sparticuz/
// chromium) is a follow-up — those packages need to be added to
// package.json + the Vercel function timeout bumped. The HTML route
// ships now and gives a deterministic, Pro-grade artifact in any
// browser.
//
// Auth: Pro tier. Owner-only (no public PDF — public sharing is
// served via the share-card image, not the full PDF, per the spec).

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveDossierContext } from '@/lib/lab/dossier/dossier-auth'
import { getDossierById } from '@/lib/lab/dossier/dossier-service'
import { renderDossierPrintHtml } from '@/lib/lab/dossier/dossier-render'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var ctx = await resolveDossierContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var dossierId = (req.query.id as string) || ''
  if (!dossierId) return res.status(400).json({ error: 'missing_id' })

  var row = await getDossierById(ctx.svc, dossierId, ctx.user.id)
  if (!row || row.user_id !== ctx.user.id) {
    return res.status(404).json({ error: 'dossier_not_found' })
  }

  var html = renderDossierPrintHtml(row.sections_json, {
    ownerLabel: ctx.user.email || '',
  })

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    'inline; filename="paradocs-dossier-' + dossierId.substring(0, 8) + '.html"',
  )
  return res.status(200).send(html)
}
