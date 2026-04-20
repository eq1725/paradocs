// Find reports whose titles look like they contain experiencer names,
// based on the same heuristics used in compelling-title.service.ts.
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('reports')
    .select('id, title, slug, source_type')
    .not('published_at', 'is', null)
    .limit(2000);
  if (error) { console.error(error); process.exit(1); }

  // Role noun whitelist from compelling-title.service.ts
  const roleWhitelist = new Set([
    'witness','witnesses','woman','man','girl','boy','child','teen','teenager',
    'worker','nurse','doctor','driver','pilot','sailor','soldier','police','officer',
    'hiker','rancher','farmer','fisherman','patient','mother','father','wife','husband',
    'daughter','son','sister','brother','grandmother','grandfather','couple','family'
  ]);

  const patterns = [
    /(^|\s)[A-Z]\.?\s+(?=[A-Z][a-z])/,
    /\b[A-Z]\.\s?[A-Z]\.?/,
    /\b(Mr|Mrs|Ms|Mx|Dr|Sr|Fr|Rev)\.?\s+[A-Z][a-z]+/,
  ];

  const suspects = [];
  for (const r of data) {
    const t = r.title || '';
    for (const p of patterns) {
      if (p.test(t)) {
        const firstCap = t.match(/\b([A-Z][a-z]+)\b/);
        if (!firstCap || !roleWhitelist.has(firstCap[1].toLowerCase())) {
          suspects.push(r);
          break;
        }
      }
    }
  }
  console.log('Found ' + suspects.length + ' candidate titles with name patterns:');
  for (const s of suspects) {
    console.log('  [' + s.source_type + '] ' + s.slug + '  |  ' + s.title);
  }
}
main();
