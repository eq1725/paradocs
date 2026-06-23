/**
 * map-drive-images.ts — one-off mapping report (V11.18.40)
 *
 * Walks paradocs/"Paradocs Phenomena Images "/<Category>/*.jpg, derives a
 * phenomenon slug from each filename, groups _NN variants, matches against the
 * DB phenomena per category, and joins source/license from
 * drive-image-sources.csv. Writes a review report (no DB writes).
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/map-drive-images.ts
 */
import * as fs from 'fs'
import * as path from 'path'

// V11.20.11 — IMG_DIR / IMG_OUT env overrides let this run for later
// tranches (e.g. Phase 2) without duplicating the script.
const DRIVE = path.resolve(process.cwd(), process.env.IMG_DIR || 'Paradocs Phenomena Images ')
const SOURCES_CSV = path.resolve(process.cwd(), process.env.IMG_SOURCES || 'drive-image-sources.csv')
const OUT = path.resolve(process.cwd(), process.env.IMG_OUT || 'drive-image-mapping-report.csv')

const FOLDER_TO_CAT: Record<string, string> = {
  'Consciousness Practices': 'consciousness_practices',
  'Cryptids': 'cryptids',
  'Esoteric & Occult': 'esoteric_practices',
  'Ghosts & Hauntings': 'ghosts_hauntings',
  'Psychic Phenomena': 'psychic_phenomena',
  'Psychological Experiences': 'psychological_experiences',
  'Religion & Mythology': 'religion_mythology',
  'UFOS & Aliens': 'ufos_aliens',
}
const PREFIXES = [
  'ufos_and_aliens_', 'ufo_and_aliens_', 'ufos_aliens_', 'ufo_aliens_', 'esoteric_occult_', 'esoteric_practices_',
  'psychic_phenomena_', 'pshchic_phenomena_', 'psychological_experiences_',
  'consciousness_practices_', 'ghosts_and_hauntings_', 'ghosts_hauntings_',
  'religion_and_mythology_', 'religion_mythology_', 'cryptids_',
].sort((a, b) => b.length - a.length)

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\.(jpe?g|png|webp)$/i, '').replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/['’`]/g, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
}
function stripVariant(slug: string): { base: string; variant: string } {
  const m = slug.match(/^(.*?)-?(\d{1,2})$/)
  if (m && m[1] && m[1].length >= 3) return { base: m[1].replace(/-$/, ''), variant: m[2] }
  return { base: slug, variant: '' }
}
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1))
  return d[a.length][b.length]
}
function licenseLabel(src: string): string {
  const s = (src || '').toLowerCase()
  if (/pex|unsplash|pixabay|gpt/.test(s)) return 'Editorial'
  if (/wiki/.test(s)) return 'CC BY-SA'
  if (/istock/.test(s)) return 'Licensed stock'
  if (/openverse/.test(s)) return 'CC BY-SA?'
  if (/\bloc\b|library of congress|nasa|noaa|public domain/.test(s)) return 'Public domain'
  if (!s) return 'Editorial?'
  return 'Editorial?'
}
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

async function main() {
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // sources map
  const srcMap = new Map<string, { source: string; url: string }>()
  if (fs.existsSync(SOURCES_CSV)) {
    const rows = parseCsv(fs.readFileSync(SOURCES_CSV, 'utf8')); rows.shift()
    for (const r of rows) if (r[0]) srcMap.set(r[0].trim(), { source: r[2] || '', url: r[3] || '' })
  }

  // phenomena per category
  const cats = Array.from(new Set(Object.values(FOLDER_TO_CAT)))
  const byCat: Record<string, { slug: string; name: string; aliases: string[] }[]> = {}
  for (const c of cats) {
    const r = await sb.from('phenomena').select('slug,name,aliases').eq('category', c).eq('status', 'active')
    byCat[c] = (r.data || []).map((p: any) => ({ slug: p.slug, name: p.name, aliases: p.aliases || [] }))
  }

  type Rec = { folder: string; cat: string; file: string; base: string; variant: string;
    status: string; mslug: string; mname: string; source: string; license: string; note: string }
  const recs: Rec[] = []
  const groups = new Map<string, number>() // cat|slug -> count of matched files

  for (const folder of Object.keys(FOLDER_TO_CAT)) {
    const cat = FOLDER_TO_CAT[folder]
    const dir = path.join(DRIVE, folder)
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    const phs = byCat[cat] || []
    const slugSet = new Map(phs.map(p => [p.slug, p]))
    const nameSet = new Map(phs.map(p => [slugify(p.name), p]))
    const aliasSet = new Map<string, any>()
    for (const p of phs) for (const a of p.aliases) { const k = slugify(a); if (k) aliasSet.set(k, p) }

    for (const file of files) {
      let sub = file
      for (const pre of PREFIXES) if (sub.toLowerCase().startsWith(pre)) { sub = sub.slice(pre.length); break }
      const slug = slugify(sub)
      const { base, variant } = stripVariant(slug)
      const src = srcMap.get(file)?.source || ''
      const license = licenseLabel(src)
      let status = 'unmatched', mslug = '', mname = '', note = ''
      let hit = slugSet.get(base) || nameSet.get(base) || aliasSet.get(base)
      if (!hit && variant) hit = slugSet.get(slug) || nameSet.get(slug) || aliasSet.get(slug) // some real slugs end in a digit
      if (hit) { status = 'matched'; mslug = hit.slug; mname = hit.name }
      else {
        // fuzzy: nearest slug in category
        let best: any = null, bestD = 99
        for (const p of phs) { const dd = Math.min(lev(base, p.slug), lev(base, slugify(p.name)))
          if (dd < bestD) { bestD = dd; best = p } }
        if (best && bestD <= 2) { status = 'ambiguous'; mslug = best.slug; mname = best.name; note = 'fuzzy d=' + bestD }
        else if (best) { note = 'nearest: ' + best.slug + ' (d=' + bestD + ')' }
      }
      if (!srcMap.has(file)) note = (note ? note + '; ' : '') + 'not in sheet'
      if (status === 'matched') groups.set(cat + '|' + mslug, (groups.get(cat + '|' + mslug) || 0) + 1)
      recs.push({ folder, cat, file, base, variant, status, mslug, mname, source: src, license, note })
    }
  }

  // write report
  const esc = (s: any) => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  const head = ['db_category','filename','derived_slug','variant','status','matched_slug','matched_phenomenon','group_image_count','source','license_label','note']
  const lines = [head.join(',')]
  for (const r of recs) {
    const gc = r.status === 'matched' ? (groups.get(r.cat + '|' + r.mslug) || 1) : ''
    lines.push([r.cat, r.file, r.base, r.variant, r.status, r.mslug, r.mname, gc, r.source, r.license, r.note].map(esc).join(','))
  }
  fs.writeFileSync(OUT, lines.join('\n'))

  // summary
  const tot = recs.length
  const m = recs.filter(r => r.status === 'matched').length
  const a = recs.filter(r => r.status === 'ambiguous').length
  const u = recs.filter(r => r.status === 'unmatched').length
  console.log('=== DRIVE IMAGE MAPPING ===')
  console.log('files: ' + tot + ' | matched: ' + m + ' | ambiguous: ' + a + ' | unmatched: ' + u)
  console.log('distinct phenomena matched: ' + new Set(recs.filter(r=>r.status==='matched').map(r=>r.cat+'|'+r.mslug)).size)
  const multi = [...groups.entries()].filter(([,n]) => n > 1)
  console.log('phenomena with multiple images (gallery): ' + multi.length)
  console.log('\nby category (files: matched/ambiguous/unmatched):')
  for (const c of cats) { const rr = recs.filter(r => r.cat === c)
    console.log('  ' + c.padEnd(26) + rr.length + ': ' + rr.filter(r=>r.status==='matched').length + '/' + rr.filter(r=>r.status==='ambiguous').length + '/' + rr.filter(r=>r.status==='unmatched').length) }
  console.log('\n--- AMBIGUOUS (fuzzy, needs confirm) ---')
  for (const r of recs.filter(r => r.status === 'ambiguous')) console.log('  [' + r.cat + '] ' + r.file + '  →?  ' + r.mslug + '  (' + r.note + ')')
  console.log('\n--- UNMATCHED ---')
  for (const r of recs.filter(r => r.status === 'unmatched')) console.log('  [' + r.cat + '] ' + r.file + '   ' + (r.note || ''))
  console.log('\nreport → ' + OUT)
}
main().catch(e => { console.error('unhandled:', e); process.exit(1) })
