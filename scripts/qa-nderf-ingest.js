// QA script: dump case_profile + paradocs_narrative for the 5 new NDERF reports
// Run: node scripts/qa-nderf-ingest.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function wc(s) {
  return s ? s.trim().split(/\s+/).filter(Boolean).length : 0;
}

(async () => {
  // Pull the 5 most recently ingested NDERF reports
  const { data, error } = await sb
    .from('reports')
    .select('id, title, slug, event_date, event_date_precision, location_name, description, summary, feed_hook, paradocs_narrative, paradocs_assessment, metadata')
    .eq('source_type', 'nderf')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }

  for (const r of data) {
    // description holds the full narrative; summary is a 300-char teaser
    const srcWords = wc(r.description || r.summary);
    const anaWords = wc(r.paradocs_narrative);
    const cp = r.metadata?.case_profile || null;
    console.log('\n' + '='.repeat(80));
    console.log('ID:       ', r.id);
    console.log('TITLE:    ', r.title);
    console.log('SLUG:     ', r.slug);
    console.log('DATE:     ', r.event_date, '(' + r.event_date_precision + ')');
    console.log('LOCATION: ', r.location_name || '(none)');
    console.log('SRC WORDS:', srcWords, '  ANALYSIS WORDS:', anaWords, '  RATIO:', (anaWords / srcWords).toFixed(2));
    console.log('HOOK:     ', r.feed_hook);
    console.log('\nANALYSIS:');
    console.log(r.paradocs_narrative);
    if (cp) {
      console.log('\nCASE PROFILE:');
      Object.keys(cp).forEach((k) => {
        if (cp[k] !== null && cp[k] !== undefined) {
          console.log('  ' + k + ':', cp[k]);
        }
      });
    } else {
      console.log('\nCASE PROFILE: (missing!)');
    }
    console.log('\nSOURCE (first 500 chars of full narrative):');
    console.log((r.description || r.summary)?.slice(0, 500) + '...');
  }
})();
