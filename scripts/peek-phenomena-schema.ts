#!/usr/bin/env tsx
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await sb.from('phenomena').select('*').eq('slug', 'mothman').limit(1)
  if (data && data[0]) {
    console.log('phenomena columns + sample row (mothman):')
    for (const [k, v] of Object.entries(data[0])) {
      const sv = typeof v === 'string' ? (v.length > 200 ? v.slice(0, 200) + '...' : v) : JSON.stringify(v)
      console.log(`  ${k.padEnd(28)} ${sv}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
