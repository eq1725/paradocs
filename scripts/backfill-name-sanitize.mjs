/**
 * Backfill: re-apply `stripExperiencerNames` to already-generated
 * `paradocs_narrative` + `paradocs_assessment.*` fields so existing reports
 * stop leaking experiencer first names.
 *
 * Run:
 *   node scripts/backfill-name-sanitize.mjs           # dry-run (prints diffs)
 *   node scripts/backfill-name-sanitize.mjs --write   # actually update rows
 *
 * EXCLUSIONS:
 *   - `the-roswell-incident-july-1947-showcase` — "Brazel" is the real
 *     historical rancher Mack Brazel, not an anonymous experiencer. Skip.
 *
 * QA/QC Apr 15 2026.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

var WRITE = process.argv.includes('--write');
var EXCLUDE = new Set([
  'the-roswell-incident-july-1947-showcase',
]);

// ─── Inlined sanitizer (mirror of src/lib/services/paradocs-analysis.service.ts) ───
var NON_NAME_TOKENS = {'The':1,'This':1,'That':1,'These':1,'Those':1,'A':1,'An':1,'And':1,'But':1,'Or':1,'So':1,'Yet':1,'For':1,'He':1,'She':1,'They':1,'It':1,'We':1,'You':1,'I':1,'His':1,'Her':1,'Their':1,'Our':1,'My':1,'Your':1,'Its':1,'One':1,'Two':1,'Three':1,'Four':1,'Five':1,'Six':1,'Someone':1,'Everyone':1,'Anyone':1,'Nobody':1,'Somebody':1,'Others':1,'Several':1,'Many':1,'Most':1,'Some':1,'Few':1,'Both':1,'Neither':1,'Either':1,'Each':1,'All':1,'None':1,'Witness':1,'Witnesses':1,'Reporter':1,'Narrator':1,'Experiencer':1,'Experiencers':1,'Observer':1,'Observers':1,'Subject':1,'Subjects':1,'Person':1,'People':1,'Respondent':1,'Police':1,'Officer':1,'Officers':1,'Deputy':1,'Sheriff':1,'Doctor':1,'Doctors':1,'Nurse':1,'Nurses':1,'Paramedic':1,'Researcher':1,'Researchers':1,'Scientist':1,'Scientists':1,'Author':1,'Writer':1,'Editor':1,'Dreamer':1,'Sleeper':1,'Meditator':1,'Pilot':1,'Driver':1,'Man':1,'Woman':1,'Boy':1,'Girl':1,'Child':1,'Children':1,'Patient':1,'Mother':1,'Father':1,'Son':1,'Daughter':1,'Husband':1,'Wife':1,'Brother':1,'Sister':1,'Friend':1,'Neighbor':1,'Uncle':1,'Aunt':1,'Grandmother':1,'Grandfather':1,'Grandma':1,'Grandpa':1,'Family':1,'Group':1,'Team':1,'Couple':1,'Pair':1,'While':1,'During':1,'After':1,'Before':1,'When':1,'Where':1,'As':1,'Although':1,'Though':1,'Because':1,'Since':1,'If':1,'Unless':1,'Until':1,'Then':1,'Now':1,'Later':1,'Today':1,'Yesterday':1,'Tomorrow':1,'Once':1,'Twice':1,'Again':1,'Earlier':1,'Afterward':1,'Also':1,'Even':1,'Still':1,'However':1,'Thus':1,'Therefore':1,'Meanwhile':1,'Moreover':1,'Nevertheless':1,'Consequently':1,'In':1,'On':1,'At':1,'By':1,'With':1,'Without':1,'Of':1,'From':1,'To':1,'Under':1,'Over':1,'Above':1,'Below':1,'Near':1,'Inside':1,'Outside':1,'Here':1,'There':1,'Nowhere':1,'Somewhere':1,'Anywhere':1,'Elsewhere':1,'Single':1,'Multiple':1,'Only':1,'Just':1,'What':1,'Who':1,'Whom':1,'Whose':1,'Which':1,'Why':1,'How':1,'Adult':1,'Adults':1,'Infant':1,'Infants':1,'Consciousness':1,'Awareness':1,'Perception':1,'Memory':1,'Memories':1,'Vision':1,'Visions':1,'Dream':1,'Dreams':1,'Experience':1,'Experiences':1,'Event':1,'Events':1,'Incident':1,'Case':1,'Cases':1,'Report':1,'Reports':1,'Account':1,'Accounts':1,'Narrative':1,'Narratives':1,'Story':1,'Stories':1,'Encounter':1,'Encounters':1,'Sighting':1,'Sightings':1};
var REPORTING_VERBS = ['reports','describes','recounts','narrates','shares','offers','recalls','presents','submits','provides','details','documents','writes','states','experiences','experienced','says','claims','notes','observes','remembers','recollects','awakens','awakes','encounters','witnesses','sees','saw','hears','heard','feels','felt','explains','explained','tells','told','described','reported','recalled','mentions','mentioned','wakes','woke','reveals','revealed','relates','related'].join('|');

function strip(text) {
  if (!text) return text;
  var byline = new RegExp('(^|[.!?\\n]\\s+)([A-Z][a-zA-Z\'\\-]{1,24})\\s+([A-Z])\\.?(?=\\s+(?:'+REPORTING_VERBS+'|a |an |the )|\\s*[\'\u2019]s\\b)','g');
  var cleaned = text.replace(byline, (_m, pre) => (pre || '') + 'The witness');
  var bareByline = new RegExp('(^|[.!?\\n]\\s+)([A-Z][a-z][a-zA-Z\'\\-]{1,23})(?=\\s+(?:'+REPORTING_VERBS+')\\b)','g');
  cleaned = cleaned.replace(bareByline, (m, pre, name) => NON_NAME_TOKENS[name] ? m : (pre || '') + 'The witness');
  var initPoss = /(^|[.!?\n]\s+)([A-Z][a-zA-Z'\-]{1,24})\s+([A-Z])\.?['\u2019]s\b/g;
  cleaned = cleaned.replace(initPoss, (_m, pre) => (pre || '') + 'The witness\u2019s');
  var bareFP = /(^|[.!?\n]\s+)([A-Z][a-z][a-zA-Z'\-]{1,23})['\u2019]s\b/g;
  cleaned = cleaned.replace(bareFP, (m, pre, name) => NON_NAME_TOKENS[name] ? m : (pre || '') + 'The witness\u2019s');
  return cleaned;
}

function sanitizeAssessment(a) {
  if (!a || typeof a !== 'object') return { value: a, changed: false };
  var next = Object.assign({}, a);
  var changed = false;
  for (var k of ['pull_quote','credibility_signal']) {
    if (typeof next[k] === 'string') {
      var s = strip(next[k]);
      if (s !== next[k]) { next[k] = s; changed = true; }
    }
  }
  if (Array.isArray(next.mundane_explanations)) {
    next.mundane_explanations = next.mundane_explanations.map((me) => {
      if (!me || typeof me !== 'object') return me;
      var meNext = Object.assign({}, me);
      for (var k of ['explanation','reasoning']) {
        if (typeof meNext[k] === 'string') {
          var s = strip(meNext[k]);
          if (s !== meNext[k]) { meNext[k] = s; changed = true; }
        }
      }
      return meNext;
    });
  }
  // Legacy fields for older reports
  if (typeof next.credibility_reasoning === 'string') {
    var s = strip(next.credibility_reasoning);
    if (s !== next.credibility_reasoning) { next.credibility_reasoning = s; changed = true; }
  }
  return { value: next, changed };
}

// ─── Fetch candidates ───
console.log('Fetching reports with paradocs_narrative set...');
const { data, error } = await sb
  .from('reports')
  .select('id, slug, paradocs_narrative, paradocs_assessment')
  .not('paradocs_narrative', 'is', null);
if (error) { console.error(error); process.exit(1); }
console.log('Scanning', data.length, 'reports');

var updates = [];
for (const r of data) {
  if (EXCLUDE.has(r.slug)) continue;
  var narBefore = r.paradocs_narrative || '';
  var narAfter = strip(narBefore);
  var narChanged = narBefore !== narAfter;
  var { value: asmtAfter, changed: asmtChanged } = sanitizeAssessment(r.paradocs_assessment);
  if (narChanged || asmtChanged) {
    updates.push({ id: r.id, slug: r.slug, narAfter, asmtAfter, narChanged, asmtChanged });
  }
}

console.log('\nReports needing update:', updates.length);
for (const u of updates) {
  console.log('  -', u.slug, '(narrative:', u.narChanged ? 'Y' : 'n', 'assessment:', u.asmtChanged ? 'Y' : 'n', ')');
}

if (!WRITE) {
  console.log('\nDRY RUN — pass --write to apply updates.');
  process.exit(0);
}

console.log('\nWriting updates...');
var okCount = 0, failCount = 0;
for (const u of updates) {
  var patch = {};
  if (u.narChanged) patch.paradocs_narrative = u.narAfter;
  if (u.asmtChanged) patch.paradocs_assessment = u.asmtAfter;
  const { error: upErr } = await sb.from('reports').update(patch).eq('id', u.id);
  if (upErr) {
    console.error('  FAIL', u.slug, upErr.message);
    failCount++;
  } else {
    okCount++;
  }
}
console.log('\nDone. Updated:', okCount, 'Failed:', failCount);
