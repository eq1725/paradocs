// Test extractField against a real NDERF page to pinpoint which labels fail.
// Run: node scripts/diagnose-extract-field.js
const fs = require('fs');

// Load the saved HTML from the previous diagnostic run
const html = fs.readFileSync('/tmp/nderf-sample.html', 'utf-8');
console.log('HTML length:', html.length);

function cleanText(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

function extractField(html, fieldLabel) {
  const cleanLabel = fieldLabel.replace(/[?:]+\s*$/, '');
  const escaped = cleanLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    '<span[^>]*class="m105"[^>]*>' + escaped + '[?:]?\\s*</span>\\s*[?:]?\\s*([\\s\\S]+?)(?:<br|<span)',
    'i'
  );
  const match = html.match(pattern);
  if (match) {
    return cleanText(match[1]).trim();
  }
  return null;
}

const labels = [
  'Gender',
  'Date of NDE',
  'At the time of your experience, was there an associated life-threatening event',
  'Did you pass into or through a tunnel',
  'Did you see an unearthly light',
  'Did you see or feel surrounded by a brilliant light',
  'Did you feel separated from your body',
  'Did scenes from your past come back',
  'Did you see any beings in your experience',
  'Did you encounter or become aware of any deceased',
  'Did you come to a border or point of no return',
  'Did you reach a boundary or limiting physical structure',
  'Did time seem to speed up or slow down',
  'What emotions did you feel during the experience',
  'At what time during the experience were you at your highest level of consciousness',
];

console.log('\n=== extractField results ===');
for (const label of labels) {
  const val = extractField(html, label);
  console.log(`  ${val === null ? '[NULL]' : '[OK]  '} ${label}`);
  if (val) console.log(`         → "${val.slice(0, 80)}"`);
}

// Now also dump the raw surrounding HTML for Gender to see actual bytes
console.log('\n=== Raw Gender snippet (byte-level) ===');
const idx = html.indexOf('Gender');
if (idx !== -1) {
  const snippet = html.slice(idx - 60, idx + 80);
  console.log(JSON.stringify(snippet));
}
