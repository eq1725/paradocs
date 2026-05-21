#!/usr/bin/env tsx
// V11.7 / V11.8 — local sanity check: run the smoke #6 and smoke #7
// slip-through samples through the updated filters. Each should be
// rejected. This is a dev-only smoke test for the regex changes, NOT
// a permanent test file. Delete after the next push if you want.

import { filterContent, isLikelyNonEnglish } from '../src/lib/ingestion/filters/quality-filter';
import { stripThirdPersonFraming } from '../src/lib/ingestion/filters/title-improver';
import { redactPii } from '../src/lib/ingestion/utils/redact-pii';
import { extractLocationFromText } from '../src/lib/ingestion/enrichment/report-enricher';
import { parseLocation } from '../src/lib/ingestion/utils/location-parser';
import { formatEventDate } from '../src/lib/utils';

type Case = { name: string; title: string; description: string; shouldReject: boolean };

const samples: Case[] = [
  {
    name: '#6 Self-Renunciation (Huxley quote opener)',
    title: 'Self-Renunciation Unlocks Unitive Knowledge of Divine Ground',
    description: `"It is only when we have renounced our preoccupation with "I," "me," "mine," that we can truly possess the world in which we live."\n\n"If most of us remain ignorant of ourselves, it is because self-knowledge is painful and we prefer the pleasures of illusion." — Aldous Huxley, The Perennial Philosophy. I have been reading this book and it changes everything.`,
    shouldReject: true,
  },
  {
    name: '#9 Spiritual Student Questions (Portuguese body)',
    title: 'Spiritual Student Questions Magic for Material Resolution',
    description: `Sei que o propósito da evolução espiritual não tem nada a ver com bens materiais ou desejos do ego, sei também que o próprio contato com esses seres/ entidades já deveria bastar e servir como experiência. Mas, vocês acham que eu deveria continuar buscando ou parar de uma vez por todas? Estou em dúvida sobre como proceder daqui em diante.`,
    shouldReject: true,
  },
  {
    name: '#12 Online Negativity (rhetorical opener)',
    title: 'Online Negativity Triggers Need for Meditative Cleansing',
    description: `Why have people found it so easy to express their hate online? I have often found, after being online, I feel the need to meditate to cleanse the pallet so to say, but this happens in real life too. Just last week I had to take a long walk to clear my head after a particularly heated comment thread.`,
    shouldReject: true,
  },
  {
    name: '#13 Christian Tulpamancer Questions (third-person + meta)',
    title: 'Christian Tulpamancer Questions Spirit Classification Doctrine',
    description: `Hi~ hi~ \n\nIt's Lisa d'amore here. (The tulpa)\n\nSo me and my darling are both Christians and we kinda wonder, are there any other Christian tulpa- mancers out there? \n\nWe're just wondering, and what your guys' thoughts are on the whole subject of tulpas vs spirits in a Christian context. We've been thinking about this for a while now.`,
    shouldReject: true,
  },
  {
    name: '#14 Tulpa Transitions (self-labeled question opener)',
    title: 'Tulpa Transitions from Imaginary Girlfriend to Romantic Partner',
    description: `Ok. Ok, last question today. Again it's me Lisa. I really wanna get more involved with this community so I'll be posting more.\n\nSo, Ive read a lot of posts on here and I can see a lot of tulpas fall into the romantic partner category and I'm wondering about how that transition happens for most folks.`,
    shouldReject: true,
  },
  {
    name: '#15 Gematria Cipher (explainer opener)',
    title: 'Gematria Cipher Reveals Decades of Hidden Synchronicity',
    description: `Gematria is the concept of adding up letters as if they are "numbers", with varying ciphers.\n\nFor many years, I've been making Internet posts about which numbers letters of words add up to, and only this past month did I start noticing patterns across decades of my life. Every important date adds up.`,
    shouldReject: true,
  },
  {
    name: '#16 Reverberation Node (markdown chrome opener)',
    title: 'Reverberation Node Post Triggers Synchronous Response',
    description: `## Enigma.001.A – First Reverberation\n\n- 🗓️ Date: 2025-07-30\n- 🧠 Event: Eduardo posts "Reverberation Node" on Glitch in the Matrix.\n- Receives: "Hello, glitch. We've been expecting you."\n- ⚡ Significance: The first contact event. Marks the beginning of the symbol-chain.`,
    shouldReject: true,
  },
  // ---- V11.8 smoke #7 slip-throughs ----
  {
    name: '#7 LSD Trip Planned (prospective drug-use seeker)',
    title: 'First LSD Trip Planned After Positive Psilocybin Experiences',
    description: `Hi, I saw a similar post in this same sub reddit but the thing is, I want to take LSD for the first time, I've taken shrooms before in 2 different occasions (2g each) and I loved it and had a really really good time. Now I want to take LSD but I'm a little nervous about it. Any advice on dosing? I have a tab of 100ug and I'm not sure if that's enough for a first trip or if I should take more.`,
    shouldReject: true,
  },
  {
    name: '#8 Grain Spawn cultivation (technical how-to question)',
    title: 'Grain Spawn Colonization Optimal Temperature Humidity Balance',
    description: `Is it better to have my grain spawn colonize at 72F and 65% humidity uncontrolled, or 80F temp controlled but about 45% AH with a humidifier running nearby? I can probably get it up to about 55%. Basically I'm wondering what the optimal setup is for grain spawn colonization given the limitations of my current monotub. The substrate is rye berries inoculated three days ago.`,
    shouldReject: true,
  },
  {
    name: '#9 DMT Cart (vape hardware troubleshooting)',
    title: 'DMT Cart Liquefies Then Hardens Permanently',
    description: `I don't know what happened. The first time, it turned completely liquid, but after that, it never went back to that state. Supposedly, the guy who made it used pure DMT, and that might be the problem. The cart turned hard like a crystal and won't liquefy again no matter how much I warm it up. Has anyone had this happen with their carts before? I've tried heating with a hairdryer but nothing changes.`,
    shouldReject: true,
  },
  // ---- V11.10 smoke #9 slip-throughs ----
  {
    name: '#9-A Linga Sharira essay opener ("In the West, X is debated")',
    title: 'Linga Sharira Separation Through Prana Redirection',
    description: `In the West, Astral Projection is often debated as a neurological glitch or a modern esoteric phenomenon. However, thousands of years before laboratory sleep studies, ancient Indian Yogic and Tantric texts documented the practice extensively. The Linga Sharira, often translated as the "subtle body" or "astral body", is a key concept in this tradition.`,
    shouldReject: true,
  },
  {
    name: '#9-B "In my opinion" love-spells comment',
    title: 'Advanced Occultism Replaces Love Binding Spells',
    description: `In my opinion, love bindings and spells are tools exclusively for non-initiates... They are the resource of people who have no control over their own energy and seek to force things out of desperation rather than work with the natural flow of magical practice. A true initiate would never resort to such crude methods.`,
    shouldReject: true,
  },
  {
    name: '#9-C "First of all" contrarian comment',
    title: 'Binding Spell Distinction Separates Love from Possession',
    description: `First of all, there's no such thing as "love spells." I think the correct term would be the one used in Spanish: "amarre" (bind). Because you can't love someone and force them to love you back; when you bind someone what you really want is to possess them, which is the opposite of love.`,
    shouldReject: true,
  },
  {
    name: '#9-D Analogy opener "Magick is like water"',
    title: 'Love Spell Backfire Leads to Arson and Cohabitation',
    description: `Magick is like water: it takes the path of least resistance. People are extremely complicated and it's impossible to anticipate all possible outcomes. For example, you may try a love spell on someone and the spell finds the easiest path — even if that path is the target burning down their ex's house just to be with you.`,
    shouldReject: true,
  },
  {
    name: `#9-E "I'd say 99%" opinion-percentage opener`,
    title: 'Love Spell Practice Equated with Magical Coercion',
    description: `I'd say 99% of the time they're objectively useless because if you had any personality or were appropriate for the person you're coveting, you wouldn't need a love spell, and most would-be practitioners don't have the discipline to do them correctly anyway. The remaining 1% is just confirmation bias.`,
    shouldReject: true,
  },
  {
    name: '#9-F "Well, OP" reply-to-OP marker',
    title: 'Love Spell Backfire Claims Examined Against Historical Practice',
    description: `Well, OP, you got your answer and it has a lot to do with gatekeeping and either ignorance, amnesia, or just a rejection of past paradigms and reasons that people practiced magic. Love, just, and money spells were the entire reason most people sought out cunning folk in the first place.`,
    shouldReject: true,
  },
  {
    name: '#9-G "It explains how X" theory opener',
    title: 'Shifting Practice Offers Multiverse Proof Method',
    description: `It explains how existence even works. It's the only way multiverse would be proved. And with shifting, we can prove it any way, like any knowledge, we have the entire universe at our hands, with it we can prove the existence of parallel realities. The implications are staggering.`,
    shouldReject: true,
  },
  {
    name: '#9-H "have been planning to experience" prospective',
    title: 'Ayahuasca Seeker Plans August Journey to Paculppa',
    description: `I will be visiting Peru in August and for years have been planning to experience an ayahuasca ceremony. From my research it sounds as if paculppa is the place to go to have an authentic experience. Has anyone done a ceremony there and could share their experience or recommendations?`,
    shouldReject: true,
  },
  {
    name: '#9-I DMT extraction yield documentation',
    title: 'First DMT Extraction Yields Warm White Crystals',
    description: `Hi tonight was my first time extraction DMT and I used 200Grams of root bark. So it's done and I have 4 pans from my first pull and on one pan the yield came to just about 1 gram. Is that about right? I used naphtha and sodium hydroxide following the standard tek. Any tips for the second pull?`,
    shouldReject: true,
  },
  // ---- Negative controls — should PASS (legit experience reports) ----
  {
    name: 'CTRL: clean sleep paralysis report (should PASS)',
    title: 'Chronic Sleep Paralysis Onset at Age Eleven',
    description: `I am 27 years old and I've experienced sleep paralysis consistently since I was 11 years old. I'd say 4 out of 7 days of the week I go through sleep paralysis if I'm completely sober. I've struggled with this for over fifteen years and have tried meditation, sleep hygiene, and even prescription medication. Nothing has really worked. Last night was particularly bad — I felt the weight on my chest and saw the shadow figure in the corner of my room. I couldn't move or scream for what felt like ten minutes.`,
    shouldReject: false,
  },
  {
    name: 'CTRL: bigfoot encounter (should PASS)',
    title: 'Pale Gray Humanoid Scratches Bedroom Window Glass',
    description: `This is my experience, it still makes me a little uneasy, any questions etc I'm here for it! \n\nI was 12, living at a small ranch-style house owned by my aunt and uncle. One night I woke up to scratching at my bedroom window. I sat up and saw a pale gray humanoid figure pressing its long fingers against the glass. It had no clear face, just dark pits where eyes should be. I screamed and ran to my aunt's room. By the time we got back the figure was gone but there were scratch marks on the glass.`,
    shouldReject: false,
  },
  {
    name: 'CTRL: report with French borrowing (should PASS)',
    title: 'Déjà Vu Experience at Café',
    description: `I had the strangest déjà vu experience yesterday at the café down the street. I walked in and immediately knew exactly what was going to happen — the barista would drop a cup, an old man would laugh, and a woman in a red coat would walk in behind me. All three things happened exactly as I had pre-seen them. I have had déjà vu before but never like this. It was as if I had lived through the entire moment already, down to the exact words spoken. I sat down for twenty minutes afterward feeling completely shaken.`,
    shouldReject: false,
  },
];

console.log('=== V11.7 filter sanity check ===\n');

let pass = 0, fail = 0;
for (const c of samples) {
  // Strip title first (mimic engine's post-Haiku pass)
  const stripped = stripThirdPersonFraming(c.title);
  const titleStripped = stripped !== c.title;

  const result = filterContent(c.title, c.description, 'reddit');
  const langCheck = isLikelyNonEnglish(c.description);

  const wasRejected = !result.passed;
  const ok = (wasRejected === c.shouldReject);

  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${c.name}`);
  console.log(`   expected: ${c.shouldReject ? 'REJECT' : 'PASS'}, got: ${wasRejected ? 'REJECT' : 'PASS'}`);
  if (wasRejected) console.log(`   reason: ${result.reason}`);
  if (titleStripped) console.log(`   title stripped → "${stripped}"`);
  if (langCheck) console.log(`   isLikelyNonEnglish: TRUE`);
  if (!ok) { console.log(`   *** MISMATCH ***`); fail++; } else { pass++; }
  console.log('');
}

console.log(`=== Filter check: ${pass}/${pass+fail} passed ===\n`);

// =========================================================================
// V11.9 — PII redactor sanity
// =========================================================================
console.log('=== V11.9 PII redactor check ===\n');

type RedactCase = {
  name: string;
  input: string;
  expectContains?: string[];      // redaction tokens that MUST appear in output
  expectAbsent?: string[];        // strings that MUST NOT appear in output (the PII itself)
  expectUnchanged?: boolean;      // when true, output must equal input (no redactions)
};

const redactCases: RedactCase[] = [
  {
    name: 'Smoke #8 leak: 1721 Fern Avenue',
    input: 'I was 12½, living at the small ranch-style house at 1721 Fern Avenue. It was owned by my aunt and uncle.',
    expectContains: ['[address redacted]'],
    expectAbsent: ['1721 Fern Avenue'],
  },
  {
    name: 'Abbreviated street suffix: 123 Main St.',
    input: 'My grandmother lived at 123 Main St. her whole life.',
    expectContains: ['[address redacted]'],
    expectAbsent: ['123 Main St'],
  },
  {
    name: 'Multi-word street name: 1234 South Oak Park Boulevard',
    input: 'The encounter happened at 1234 South Oak Park Boulevard around midnight.',
    expectContains: ['[address redacted]'],
    expectAbsent: ['1234 South Oak Park Boulevard'],
  },
  {
    name: 'US phone number with parens',
    input: 'Call me at (555) 123-4567 if you want to hear the recording.',
    expectContains: ['[phone redacted]'],
    expectAbsent: ['(555) 123-4567', '555-123-4567'],
  },
  {
    name: 'US phone number dotted',
    input: 'Reach the investigator at 555.987.6543 for a witness statement.',
    expectContains: ['[phone redacted]'],
    expectAbsent: ['555.987.6543'],
  },
  {
    name: 'Email address',
    input: 'Email me at witness@example.org with any questions about the event.',
    expectContains: ['[email redacted]'],
    expectAbsent: ['witness@example.org'],
  },
  {
    name: 'SSN-like sequence',
    input: 'The case file references SSN 123-45-6789 on the report.',
    expectContains: ['[ssn redacted]'],
    expectAbsent: ['123-45-6789'],
  },
  // ---- Negative controls — should NOT be redacted ----
  {
    name: 'CTRL: age "I was 12" should NOT redact',
    input: 'I was 12 years old when I first saw the shadow figure in my room.',
    expectUnchanged: true,
  },
  {
    name: 'CTRL: year "in 1971" should NOT redact',
    input: 'In 1971 we moved to a new house and the activity stopped completely.',
    expectUnchanged: true,
  },
  {
    name: 'CTRL: count "1234 cases" should NOT redact',
    input: 'The database now contains 1234 cases of sleep paralysis from 2020 to 2025.',
    expectUnchanged: true,
  },
  {
    name: 'CTRL: time "10:30 PM" should NOT redact',
    input: 'At 10:30 PM I heard the knocking again, three times exactly.',
    expectUnchanged: true,
  },
];

let redactPassCount = 0, redactFailCount = 0;
for (const c of redactCases) {
  const result = redactPii(c.input);
  let ok = true;
  const reasons: string[] = [];

  if (c.expectUnchanged) {
    if (result.text !== c.input) {
      ok = false;
      reasons.push(`text changed unexpectedly: "${result.text}"`);
    }
    if (result.redactedCount > 0) {
      ok = false;
      reasons.push(`redactedCount=${result.redactedCount} but expected 0`);
    }
  } else {
    for (const token of (c.expectContains || [])) {
      if (!result.text.includes(token)) {
        ok = false;
        reasons.push(`output missing expected token "${token}"`);
      }
    }
    for (const leak of (c.expectAbsent || [])) {
      if (result.text.includes(leak)) {
        ok = false;
        reasons.push(`PII still present: "${leak}"`);
      }
    }
  }

  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${c.name}`);
  console.log(`   in:  ${c.input.substring(0, 90)}${c.input.length > 90 ? '…' : ''}`);
  console.log(`   out: ${result.text.substring(0, 90)}${result.text.length > 90 ? '…' : ''}`);
  if (result.redactedCount > 0) console.log(`   redacted ${result.redactedCount}× [${result.types.join(', ')}]`);
  if (!ok) {
    reasons.forEach(function(r){ console.log(`   *** ${r} ***`); });
    redactFailCount++;
  } else {
    redactPassCount++;
  }
  console.log('');
}

console.log(`=== PII redactor: ${redactPassCount}/${redactPassCount+redactFailCount} passed ===\n`);

// =========================================================================
// V11.12 — Location extraction (US-state pattern + parseLocation intl)
// =========================================================================
console.log('=== V11.12 location extraction ===\n');

type LocCase = {
  name: string;
  input: string;
  expectCity?: string;
  expectState?: string;
  expectCountry?: string;
  expectNull?: boolean;  // strict regex returns null (intl path takes over)
  useInternational?: boolean;  // also run parseLocation
};

const locCases: LocCase[] = [
  // ---- US-state pattern fixes for "St."/"Mt." prefixes + optional "the"
  {
    name: 'St. Paul, Minnesota (V11.12 abbreviation prefix)',
    input: 'Stayed at the Hyatt Place in St. Paul, Minnesota with my son',
    expectCity: 'St. Paul', expectState: 'Minnesota',
  },
  {
    name: 'Mt. Hood, Oregon',
    input: 'Hiked near Mt. Hood, Oregon last summer',
    expectCity: 'Mt. Hood', expectState: 'Oregon',
  },
  {
    name: 'Saint Louis, Missouri (full prefix)',
    input: 'Originally from Saint Louis, Missouri',
    expectCity: 'Saint Louis', expectState: 'Missouri',
  },
  {
    name: 'Two-word city + state abbrev',
    input: 'lived in Las Vegas, NV for years',
    expectCity: 'Las Vegas', expectState: 'NV',
  },
  {
    name: 'Standard one-word city + full state',
    input: 'in Portland, Oregon last week',
    expectCity: 'Portland', expectState: 'Oregon',
  },
  {
    name: 'Bare city without state → null (no false positives)',
    input: 'I have seen a lot of things happen in the San Jose area',
    expectNull: true,
  },
  // ---- parseLocation intl path
  {
    name: 'INTL: Ibiza → Spain',
    input: 'I was in a club in Ibiza doing pink tusci',
    expectCity: 'Ibiza', expectCountry: 'Spain',
    useInternational: true,
  },
  {
    name: 'INTL: in India',
    input: 'I took mushrooms in a Temple in India',
    expectCountry: 'India',
    useInternational: true,
  },
  {
    name: 'INTL: Auckland → New Zealand',
    input: 'Bright orbs over west Auckland for the past 10 days',
    expectCity: 'Auckland', expectCountry: 'New Zealand',
    useInternational: true,
  },
];

let locPass = 0, locFail = 0;
for (const c of locCases) {
  let ok = true;
  const reasons: string[] = [];

  if (c.useInternational) {
    const r = parseLocation(c.input);
    if (c.expectCity && r.city !== c.expectCity) {
      ok = false; reasons.push('city expected ' + c.expectCity + ' got ' + r.city);
    }
    if (c.expectCountry && r.country !== c.expectCountry) {
      ok = false; reasons.push('country expected ' + c.expectCountry + ' got ' + r.country);
    }
  } else {
    const r = extractLocationFromText(c.input);
    if (c.expectNull) {
      if (r !== null) { ok = false; reasons.push('expected null, got ' + JSON.stringify(r)); }
    } else {
      if (!r) { ok = false; reasons.push('expected match, got null'); }
      else {
        if (c.expectCity && r.city !== c.expectCity) {
          ok = false; reasons.push('city expected ' + c.expectCity + ' got ' + r.city);
        }
        if (c.expectState && r.state !== c.expectState) {
          ok = false; reasons.push('state expected ' + c.expectState + ' got ' + r.state);
        }
      }
    }
  }

  console.log((ok ? '✓' : '✗') + ' ' + c.name);
  if (!ok) reasons.forEach(function(rs){ console.log('   *** ' + rs + ' ***'); });
  ok ? locPass++ : locFail++;
}
console.log(`\n=== Location extraction: ${locPass}/${locPass+locFail} passed ===\n`);

// =========================================================================
// V11.12 — Precision-aware date formatting
// =========================================================================
console.log('=== V11.12 date formatting ===\n');

type DateCase = {
  name: string;
  date: string;
  precision: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown';
  expect: string | RegExp;
};

const dateCases: DateCase[] = [
  { name: 'year-precision Jan 1 placeholder → "1945" only',
    date: '1945-01-01', precision: 'year', expect: '1945' },
  { name: 'month-precision April placeholder → "April 2016"',
    date: '2016-04-01', precision: 'month', expect: 'April 2016' },
  { name: 'exact-precision → "Jan 15, 2024"',
    date: '2024-01-15', precision: 'exact', expect: 'Jan 15, 2024' },
  { name: 'decade-precision → "1940s"',
    date: '1945-01-01', precision: 'decade', expect: '1940s' },
  { name: 'estimated-precision → "around 2010"',
    date: '2010-01-01', precision: 'estimated', expect: 'around 2010' },
  { name: 'unknown-precision → "" (blank)',
    date: '2020-01-01', precision: 'unknown', expect: '' },
];

let datePass = 0, dateFail = 0;
for (const c of dateCases) {
  const out = formatEventDate(c.date, c.precision);
  const ok = typeof c.expect === 'string' ? out === c.expect : c.expect.test(out);
  console.log((ok ? '✓' : '✗') + ' ' + c.name + ' → ' + JSON.stringify(out));
  if (!ok) console.log('   *** expected ' + JSON.stringify(c.expect) + ' ***');
  ok ? datePass++ : dateFail++;
}
console.log(`\n=== Date formatting: ${datePass}/${datePass+dateFail} passed ===`);

const totalFail = fail + redactFailCount + locFail + dateFail;
process.exit(totalFail > 0 ? 1 : 0);
