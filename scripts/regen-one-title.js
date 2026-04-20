/**
 * Regenerate the compelling title for a specific report using the
 * updated compelling-title.service.ts rules (name-guard patterns +
 * source-chrome stripping).
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const slug = process.argv[2];
if (!slug) { console.error('usage: node regen-one-title.js <slug>'); process.exit(1); }

async function main() {
  const { data } = await supabase
    .from('reports')
    .select('id, title, slug, description, summary, category, phenomenon_type_id, event_date, location_name')
    .eq('slug', slug).single();
  if (!data) { console.error('not found'); process.exit(1); }

  // Import the title service via ts-node's register
  require('ts-node/register');
  const svc = require('../src/lib/services/compelling-title.service.ts');

  // Get phenomenon type name
  let phenomenonType = null;
  if (data.phenomenon_type_id) {
    const { data: pt } = await supabase.from('phenomenon_types')
      .select('name').eq('id', data.phenomenon_type_id).single();
    phenomenonType = pt && pt.name;
  }

  const result = await svc.generateCompellingTitle({
    phenomenonType: phenomenonType,
    category: data.category,
    description: data.description,
    summary: data.summary,
    locationName: data.location_name,
    eventDate: data.event_date,
  });
  console.log('Old:', data.title);
  console.log('New:', result.title, '(attempts=' + result.attempts + ', model=' + result.model + ')');

  if (result.title && result.title !== data.title) {
    const { error } = await supabase.from('reports')
      .update({ title: result.title }).eq('id', data.id);
    if (error) console.error('update failed:', error); else console.log('Updated successfully.');
  }
}
main();
