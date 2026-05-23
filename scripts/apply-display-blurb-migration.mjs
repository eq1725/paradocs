#!/usr/bin/env node
// V11.17.11 — Apply the phenomena.display_blurb migration via the
// exec_sql RPC. Idempotent — IF NOT EXISTS guards on every clause.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/apply-display-blurb-migration.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(url, key)

const statements = [
  `ALTER TABLE phenomena ADD COLUMN IF NOT EXISTS display_blurb TEXT`,
  `ALTER TABLE phenomena ADD COLUMN IF NOT EXISTS display_blurb_at TIMESTAMPTZ`,
  // CHECK constraint — wrap so re-run doesn't fail if it already exists.
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'phenomena_display_blurb_length_chk'
     ) THEN
       ALTER TABLE phenomena
         ADD CONSTRAINT phenomena_display_blurb_length_chk
         CHECK (display_blurb IS NULL OR char_length(display_blurb) <= 180);
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS phenomena_display_blurb_missing_idx
     ON phenomena (id)
     WHERE display_blurb IS NULL AND status = 'active'`,
]

async function execSql(sql) {
  // Try the RPC first (most robust path through Supabase admin).
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_query: sql }),
  })
  if (res.ok) return { ok: true }
  const text = await res.text()
  return { ok: false, status: res.status, body: text }
}

async function verify() {
  // After the alter, the column should be selectable. Read 1 row.
  const { data, error } = await supabase
    .from('phenomena')
    .select('id, display_blurb, display_blurb_at')
    .limit(1)
  if (error) {
    console.error('  verify failed:', error.message)
    return false
  }
  console.log('  verify ok — column reads. Sample row:', data?.[0])
  return true
}

async function main() {
  for (const sql of statements) {
    const preview = sql.replace(/\s+/g, ' ').slice(0, 80)
    console.log(`→ ${preview}…`)
    const r = await execSql(sql)
    if (!r.ok) {
      console.error(`  failed: ${r.status} ${r.body?.slice(0, 200)}`)
      console.error('  This statement may need to be run manually in Supabase SQL editor.')
    } else {
      console.log('  ok')
    }
  }
  console.log('\nVerifying column…')
  await verify()
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
