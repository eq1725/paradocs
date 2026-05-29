/**
 * One-off: clean up the 2 r/cryptids reports stuck at pending_review.
 *   - cca0ec5d... (Eclipse Totality) — speculative, mark rejected
 *   - 390e922d... (INSUFFICIENT title) — AI rejected, mark rejected + scrub title
 */
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const main = async () => {
  const ids = [
    'cca0ec5d-1763-4315-9e27-b3922adf02b0',
    '390e922d-d9ed-4294-9c4e-d5426ac1f7d4',
  ]
  for (const id of ids) {
    const { error } = await sb.from('reports').update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) console.error(id, error.message)
    else console.log('rejected:', id)
  }
}
main()
