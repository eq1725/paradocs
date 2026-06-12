#!/usr/bin/env npx tsx
/**
 * PD-source bulk review/approve — generalized from the June 11 SPR pass.
 * Flags QC-hold rows (kept pending_review, tagged metadata.qc_flag), approves the rest.
 *
 * Usage:
 *   npx tsx scripts/pd-bulk-approve.ts --source flammarion-unknown --dry-run
 *   npx tsx scripts/pd-bulk-approve.ts --source flammarion-unknown
 *
 * Flag criteria (founder reviews flagged rows in the admin queue):
 *   - no_event_date_determinable  (event_date null — founder policy June 11: approve if otherwise good,
 *     so this flag is INFORMATIONAL; pass --approve-dateless to auto-approve them)
 *   - borderline_quality_score    (metadata.score_status='borderline_kept')
 *   - prefilter_bypassed rows are NOT flagged (false-positive pattern, validated on SPR)
 *   - short_body (<700 chars), long_title (>100 chars)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { getPdSource } from '../src/lib/ingestion/pd-sources.config';

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const DRY = argv.includes('--dry-run');
const APPROVE_DATELESS = argv.includes('--approve-dateless');
const sourceKey = flag('--source');
if (!sourceKey) { console.error('--source <key> required (see pd-sources.config.ts), or a raw source_type like chronicling-america'); process.exit(1); }
// Registry sources resolve via PD_SOURCES; non-registry PD sources
// (chronicling-america) fall back to using the key as source_type directly.
const cfg = getPdSource(sourceKey) || ({ sourceType: sourceKey } as any);

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('reports')
      .select('id,original_report_id,title,description,event_date,status,metadata')
      .eq('source_type', cfg!.sourceType).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  const pending = rows.filter(r => r.status === 'pending_review');
  console.log(`${cfg!.sourceType}: ${rows.length} rows, ${pending.length} pending_review`);

  const flags = new Map<string, string[]>();
  const add = (r: any, x: string) => flags.set(r.id, [...(flags.get(r.id) || []), x]);
  for (const r of pending) {
    if (r.metadata?.score_status === 'borderline_kept') add(r, 'borderline_quality_score');
    // CA extraction genre flags (founder ruling June 12): period-charged
    // framing and borderline folklore retellings are held for human review.
    if (r.metadata?.genre_flags?.period_sensitive === true) add(r, 'period_sensitive_language');
    if (r.metadata?.genre_flags?.retold_folklore === true) add(r, 'retold_folklore');
    if (r.event_date == null && !APPROVE_DATELESS) add(r, 'no_event_date_determinable');
    if ((r.description || '').length < 700) add(r, 'short_body');
    if ((r.title || '').length > 100) add(r, 'long_title');
  }
  const flagged = pending.filter(r => flags.has(r.id));
  const toApprove = pending.filter(r => !flags.has(r.id));
  const hist: Record<string, number> = {};
  flags.forEach((rs) => { for (const x of rs) hist[x] = (hist[x] || 0) + 1; });
  console.log(`flagged (hold): ${flagged.length} ${JSON.stringify(hist)} | approving: ${toApprove.length}`);
  for (const r of flagged) console.log(' FLAG', r.original_report_id, '|', (flags.get(r.id) || []).join(','), '|', (r.title || '').slice(0, 70));
  if (DRY) { console.log('DRY RUN — no writes.'); return; }

  let tagged = 0;
  for (const r of flagged) {
    const { error } = await sb.from('reports')
      .update({ metadata: { ...(r.metadata || {}), qc_flag: flags.get(r.id), qc_flagged_at: new Date().toISOString() } })
      .eq('id', r.id);
    if (!error) tagged++;
  }
  let approved = 0;
  const ids = toApprove.map(r => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await sb.from('reports').update({ status: 'approved' }).in('id', ids.slice(i, i + 100));
    if (!error) approved += Math.min(100, ids.length - i);
  }
  console.log(`tagged: ${tagged}, approved: ${approved}`);
}
main().catch(e => { console.error(e); process.exit(1); });
