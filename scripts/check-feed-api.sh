#!/bin/bash
# Hit the running feed-v2 API and check whether the new fields are present
curl -s 'http://localhost:3000/api/discover/feed-v2?limit=15&offset=0&seed=1' \
  | node -e "
const data = JSON.parse(require('fs').readFileSync(0,'utf-8'));
const nderf = (data.items || []).filter(i => i.source_type === 'nderf');
console.log('Total items:', (data.items||[]).length);
console.log('NDERF items:', nderf.length);
if (nderf[0]) {
  const r = nderf[0];
  console.log('');
  console.log('First NDERF item keys:', Object.keys(r).sort().join(', '));
  console.log('');
  console.log('paradocs_narrative present?', 'paradocs_narrative' in r, '/ null?', r.paradocs_narrative === null);
  console.log('paradocs_narrative length:', (r.paradocs_narrative||'').length);
  console.log('metadata present?', 'metadata' in r, '/ case_profile?', r.metadata && !!r.metadata.case_profile);
  if (r.metadata && r.metadata.case_profile) {
    console.log('case_profile keys:', Object.keys(r.metadata.case_profile).join(', '));
  }
  console.log('event_date_precision:', r.event_date_precision);
  console.log('title:', r.title);
} else {
  console.log('NO NDERF items in feed! Might be filtered out or not surfaced.');
  console.log('Source types seen:', [...new Set((data.items||[]).map(i=>i.source_type))].join(', '));
}
"
