/**
 * Quick script to fix NDE phenomenon category
 * Run: npx tsx scripts/fix-nde-category.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load .env.local manually
const envFile = readFileSync('.env.local', 'utf-8')
const env: Record<string, string> = {}
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=')
  if (key && val.length) env[key.trim()] = val.join('=').trim()
})

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('Updating NDE category from psychic_phenomena to psychological_experiences...')

  const { data, error } = await supabase
    .from('phenomena')
    .update({ category: 'psychological_experiences' })
    .eq('slug', 'near-death-experience')
    .select('id, name, category')
    .single()

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log('Updated successfully!')
  console.log('NDE is now under:', data.category)
}

main()
