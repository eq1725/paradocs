/**
 * Event-location extractor smoke test.
 *
 * Runs the LLM-backed extractor against a battery of hand-crafted
 * multi-location narratives to verify it picks the EVENT location,
 * not whichever place the narrator happens to mention first. Run with:
 *
 *   npx tsx scripts/test-event-location.ts
 *
 * Requires ANTHROPIC_API_KEY in .env.local. Prints a pass/fail summary.
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import { extractEventLocation } from '../src/lib/services/event-location.service';

interface Case {
  name: string;
  narrative: string;
  expect?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
  // If true, we expect no event location (narrative is too vague / doesn't name one).
  expectNone?: boolean;
}

const CASES: Case[] = [
  {
    name: 'Home vs. vacation — Beaumont/Cheyenne',
    narrative:
      'I lived in Beaumont, Texas at the time but one summer night I saw a bright light ' +
      'in the sky while we were on vacation in Cheyenne, Wyoming. We were driving back to the ' +
      'motel when my wife first pointed it out. I will never forget what I saw that evening in ' +
      'Cheyenne, no matter how many years have passed.',
    expect: { city: 'Cheyenne', state: 'Wyoming' },
  },
  {
    name: 'Grew up elsewhere — event in hospital state',
    narrative:
      'I grew up in rural Iowa. After college I moved to Boston for work. The near-death ' +
      'experience happened at Massachusetts General Hospital during surgery in 2003. I had a ' +
      'cardiac event and my heart stopped for nearly four minutes.',
    expect: { city: 'Boston', state: 'Massachusetts' },
  },
  {
    name: 'Event at home, single location',
    narrative:
      'I was at my home in Portland, Oregon when it happened. I had just put the kids to bed ' +
      'and was reading on the couch when suddenly I felt myself lift out of my body. The whole ' +
      'experience lasted maybe ten minutes but felt like hours.',
    expect: { city: 'Portland', state: 'Oregon' },
  },
  {
    name: 'Referential mention only — coast of California',
    narrative:
      'My grandmother used to tell me stories about the coast of California, where her sister ' +
      'had seen strange lights in the 1950s. But my own experience happened much later, during ' +
      'meditation at a retreat center. I do not remember where exactly — I had been travelling ' +
      'through several states that month and had lost track of where I was.',
    expectNone: true,
  },
  {
    name: 'Country-only precision',
    narrative:
      'I was backpacking through Nepal in 1998 when the experience happened. I was in a ' +
      'small teahouse in the mountains — I honestly could not tell you which village. A ' +
      'sudden illness took me close to death and I had a vision of a tunnel of light.',
    expect: { country: 'Nepal' },
  },
  {
    name: 'Two US states — event on trip',
    narrative:
      'My family is from Michigan and we still live there. Last summer we drove down to ' +
      'Tennessee to visit my sister-in-law. On the second night of the trip, at a rest stop ' +
      'in Tennessee, I saw an object move across the sky unlike anything I had ever seen.',
    expect: { state: 'Tennessee' },
  },
  {
    name: 'Passive "reminded of" mention',
    narrative:
      'The landscape I saw during my near-death experience reminded me of Kansas — the wide ' +
      'open fields, the sky, the feeling of distance. But the actual experience happened in a ' +
      'hospital bed in Denver, Colorado, after a serious accident.',
    expect: { city: 'Denver', state: 'Colorado' },
  },
];

function matchesField(actual: string | null, expected: string | null | undefined): boolean {
  if (expected === undefined) return true; // field not asserted
  if (expected === null) return actual === null;
  if (!actual) return false;
  return actual.toLowerCase() === expected.toLowerCase();
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing from .env.local — cannot run LLM test');
    process.exit(1);
  }

  console.log('Event-location extractor smoke test');
  console.log('='.repeat(72));

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    process.stdout.write(`• ${c.name} ... `);
    const result = await extractEventLocation({ narrative: c.narrative });
    const loc = result.location;

    if (c.expectNone) {
      const ok = !loc || loc.confidence === 'none' || (!loc.city && !loc.state && !loc.country);
      if (ok) { console.log('PASS (no location)'); passed++; }
      else {
        console.log(`FAIL expected none, got ${loc?.city}, ${loc?.state}, ${loc?.country} (conf=${loc?.confidence})`);
        failed++;
        failures.push(c.name);
      }
      continue;
    }

    if (!loc) {
      console.log(`FAIL got null (reason: ${result.fallbackReason || 'unknown'})`);
      failed++;
      failures.push(c.name);
      continue;
    }

    const exp = c.expect || {};
    const cityOk = matchesField(loc.city, exp.city);
    const stateOk = matchesField(loc.state, exp.state);
    const countryOk = matchesField(loc.country, exp.country);
    if (cityOk && stateOk && countryOk) {
      console.log(`PASS (${[loc.city, loc.state, loc.country].filter(Boolean).join(', ')} @ ${loc.confidence})`);
      passed++;
    } else {
      console.log(`FAIL expected={${JSON.stringify(exp)}} got={city:${loc.city}, state:${loc.state}, country:${loc.country}} conf=${loc.confidence}`);
      console.log(`    reasoning: ${loc.reasoning.substring(0, 160)}`);
      failed++;
      failures.push(c.name);
    }
  }

  console.log('='.repeat(72));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failing cases:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
