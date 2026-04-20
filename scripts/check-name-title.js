require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('reports')
    .select('id, title, slug, source_type, source_url')
    .eq('slug', 'other-experience-1981-4mxwct')
    .limit(1);
  if (error) { console.error(error); process.exit(1); }
  console.log('Target report:', JSON.stringify(data, null, 2));

  // Try pattern matching each substring looking for "<Cap> <Single Letter>"
  if (data && data[0]) {
    const t = data[0].title;
    console.log('Title:', t);
    const patterns = [
      /(^|\s)[A-Z]\.?\s+(?=[A-Z][a-z])/,
      /\b[A-Z]\.\s?[A-Z]\.?/,
      /\b(Mr|Mrs|Ms|Mx|Dr|Sr|Fr|Rev)\.?\s+[A-Z][a-z]+/,
    ];
    patterns.forEach((p, i) => console.log('  pattern', i, '→', p.test(t)));
  }

  // Also fetch all OBERF reports to inspect
  const { data: oberf } = await supabase
    .from('reports')
    .select('id, title, slug')
    .eq('source_type', 'oberf')
    .limit(100);
  console.log('\nAll OBERF titles (sample):');
  (oberf || []).forEach(r => console.log('  ' + r.slug + ' : ' + r.title));
}
main();
