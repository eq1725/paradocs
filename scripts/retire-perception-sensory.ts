/**
 * retire-perception-sensory.ts — V11.18.33
 *
 * Retire the deprecated `perception_sensory` category. Its content is a
 * sleep-paralysis corpus (8,305 of 10,413 titles mention "paralysis"; the
 * rest are the same cluster — false awakenings, hypnagogic presences/figures),
 * whose canonical home is the Sleep Paralysis phenomenon under
 * `psychological_experiences`. Its own 414 phenomena were the early
 * clinical/optical-illusion concept and are already status='archived'.
 *
 * This migration RECATEGORIZES every perception_sensory report ->
 * psychological_experiences. It records the moved report IDs to
 * outputs/perception-sensory-retired-ids.json so the move is fully
 * reversible. It does NOT touch the phenomena (already archived) and does
 * NOT re-tag reports to a phenomenon (the classifier can do that on its
 * normal pass; category move alone makes them browsable in the new home).
 *
 * USAGE (operator terminal or sandbox; bulk UPDATE is one statement)
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/retire-perception-sensory.ts            # DRY RUN (no writes)
 *   npx tsx scripts/retire-perception-sensory.ts --apply    # perform the move
 *   npx tsx scripts/retire-perception-sensory.ts --revert   # undo using the saved id file
 *
 * Reversal: --revert reads outputs/perception-sensory-retired-ids.json and
 * sets those rows back to category='perception_sensory'.
 */

import * as fs from 'fs';
import * as path from 'path';

const FROM = 'perception_sensory';
const TO = 'psychological_experiences';
const ID_FILE = path.resolve(process.cwd(), 'outputs/perception-sensory-retired-ids.json');

async function main() {
  const apply = process.argv.includes('--apply');
  const revert = process.argv.includes('--revert');

  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Source .env.local.'); process.exit(1); }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key);

  const countBy = async (category: string, status?: string) => {
    let q = sb.from('reports').select('id', { count: 'exact', head: true }).eq('category', category);
    if (status) q = q.eq('status', status);
    const r = await q;
    return r.count ?? 0;
  };

  // ── REVERT ───────────────────────────────────────────────────────────
  if (revert) {
    if (!fs.existsSync(ID_FILE)) { console.error('No id file at ' + ID_FILE + ' — nothing to revert.'); process.exit(1); }
    const ids: string[] = JSON.parse(fs.readFileSync(ID_FILE, 'utf8')).ids || [];
    console.log('[retire-ps] REVERT: restoring ' + ids.length + ' rows -> ' + FROM);
    const CHUNK = 500;
    let done = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const r = await sb.from('reports').update({ category: FROM, updated_at: new Date().toISOString() }).in('id', slice);
      if (r.error) { console.error('revert chunk error: ' + r.error.message); process.exit(1); }
      done += slice.length;
      process.stdout.write('\r  reverted ' + done + '/' + ids.length);
    }
    console.log('\n[retire-ps] revert complete. ' + FROM + ' now has ' + (await countBy(FROM)) + ' rows.');
    return;
  }

  // ── DRY RUN / APPLY ──────────────────────────────────────────────────
  const before = await countBy(FROM);
  const byStatus: Record<string, number> = {};
  for (const st of ['approved', 'pending_review', 'archived']) byStatus[st] = await countBy(FROM, st);
  const toBefore = await countBy(TO);

  // phenomena status sanity (should be all archived already)
  const phActive = (await sb.from('phenomena').select('id', { count: 'exact', head: true }).eq('category', FROM).eq('status', 'active')).count ?? 0;
  const phArchived = (await sb.from('phenomena').select('id', { count: 'exact', head: true }).eq('category', FROM).eq('status', 'archived')).count ?? 0;

  console.log('=== retire perception_sensory ===');
  console.log('reports in ' + FROM + ': ' + before + '  (approved=' + byStatus.approved + ', pending=' + byStatus.pending_review + ', archived=' + byStatus.archived + ')');
  console.log(TO + ' currently: ' + toBefore + ' -> would become ' + (toBefore + before));
  console.log('phenomena in ' + FROM + ': active=' + phActive + ' (should be 0), archived=' + phArchived + ' (left as-is)');

  if (!apply) {
    console.log('\nDRY RUN — no writes. Re-run with --apply to recategorize all ' + before + ' reports ' + FROM + ' -> ' + TO + '.');
    console.log('(The move is reversible: ids will be saved to ' + ID_FILE + '; undo with --revert.)');
    return;
  }

  // Snapshot ids first (reversibility). Page through to get them all.
  console.log('[retire-ps] snapshotting ids for reversibility…');
  const ids: string[] = [];
  let from = 0;
  while (true) {
    const r = await sb.from('reports').select('id').eq('category', FROM).range(from, from + 999);
    if (r.error) { console.error('id snapshot error: ' + r.error.message); process.exit(1); }
    const rows = r.data || [];
    for (const row of rows as any[]) ids.push(row.id);
    if (rows.length < 1000) break;
    from += 1000;
  }
  fs.mkdirSync(path.dirname(ID_FILE), { recursive: true });
  fs.writeFileSync(ID_FILE, JSON.stringify({ from: FROM, to: TO, savedAt: new Date().toISOString(), ids }, null, 0));
  console.log('[retire-ps] saved ' + ids.length + ' ids to ' + ID_FILE);

  // Bulk recategorize in chunks by id (avoids any single-statement caps; keeps progress).
  const CHUNK = 500;
  let moved = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const r = await sb.from('reports').update({ category: TO, updated_at: new Date().toISOString() }).in('id', slice);
    if (r.error) { console.error('\nupdate chunk error at ' + i + ': ' + r.error.message); process.exit(1); }
    moved += slice.length;
    process.stdout.write('\r  recategorized ' + moved + '/' + ids.length);
  }

  const afterFrom = await countBy(FROM);
  const afterTo = await countBy(TO);
  console.log('\n[retire-ps] done. ' + FROM + ' now ' + afterFrom + ' (was ' + before + '); ' + TO + ' now ' + afterTo + ' (was ' + toBefore + ').');
  if (afterFrom !== 0) console.log('⚠ ' + FROM + ' still has ' + afterFrom + ' rows — re-run --apply to sweep stragglers.');
  console.log('Reversible via: npx tsx scripts/retire-perception-sensory.ts --revert');
}

main().catch(e => { console.error('[retire-ps] unhandled:', e); process.exit(1); });
