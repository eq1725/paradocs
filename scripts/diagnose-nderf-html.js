// Fetch one of the newly ingested NDERF pages using its stored source_url
// and inspect the questionnaire markup.
// Run: node scripts/diagnose-nderf-html.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Get the shortest report so we can dump the whole HTML if needed
  const { data, error } = await sb
    .from('reports')
    .select('id, title, source_url')
    .eq('id', 'f2b2824e-7328-40d8-b28a-278e350063b2')
    .single();
  if (error) {
    console.error(error);
    return;
  }
  console.log('Report:', data.title);
  console.log('Source URL:', data.source_url);

  const res = await fetch(data.source_url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParadocsBot/1.0)' },
  });
  console.log('HTTP status:', res.status);
  if (!res.ok) return;
  const html = await res.text();
  console.log('Total HTML length:', html.length);

  // Find all span class patterns
  const classMatches = [...html.matchAll(/<span[^>]*class="(m\d+)"[^>]*>([^<]{1,150})<\/span>/g)];
  const classCounts = {};
  for (const m of classMatches) {
    classCounts[m[1]] = (classCounts[m[1]] || 0) + 1;
  }
  console.log('\nspan classes found:', classCounts);

  // Print first 30 of each class
  for (const cls of Object.keys(classCounts)) {
    const spans = classMatches.filter((m) => m[1] === cls).slice(0, 30);
    console.log(`\nFirst ${spans.length} ${cls} spans:`);
    spans.forEach((m, i) => console.log(`  ${i + 1}. "${m[2].trim().slice(0, 100)}"`));
  }

  // Search for specific questionnaire phrases we rely on
  const phrases = [
    'Date of NDE',
    'Gender',
    'Age at time of experience',
    'Did you pass into or through a tunnel',
    'Did you see a light',
    'Did you experience a separation of your consciousness',
    'Did you experience a review of past events',
    'Did you meet or see any other beings',
    'Did you come to a boundary',
    'Did time seem to speed up',
    'What emotions did you feel',
    'life-threatening event',
  ];
  console.log('\nPhrase presence check:');
  for (const p of phrases) {
    const idx = html.indexOf(p);
    if (idx === -1) {
      console.log(`  [MISS] ${p}`);
    } else {
      const ctxStart = Math.max(0, idx - 80);
      const ctx = html.slice(ctxStart, idx + p.length + 60).replace(/\s+/g, ' ');
      console.log(`  [HIT]  ${p}`);
      console.log(`         ...${ctx}...`);
    }
  }

  // Save the raw HTML so we can inspect later if needed
  require('fs').writeFileSync('/tmp/nderf-sample.html', html);
  console.log('\nSaved raw HTML to /tmp/nderf-sample.html');
})();
