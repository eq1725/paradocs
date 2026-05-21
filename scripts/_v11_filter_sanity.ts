#!/usr/bin/env tsx
// V11.7 — local sanity check: run the seven smoke #6 slip-through samples
// through the updated filters. Each sample should be rejected. This is a
// dev-only smoke test for the regex changes, NOT a permanent test file.
// Delete after the next push if you want.

import { filterContent, isLikelyNonEnglish } from '../src/lib/ingestion/filters/quality-filter';
import { stripThirdPersonFraming } from '../src/lib/ingestion/filters/title-improver';

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

console.log(`=== ${pass}/${pass+fail} passed ===`);
process.exit(fail > 0 ? 1 : 0);
