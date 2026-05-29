import { DESCRIPTION_LEAD_PATTERNS } from '../src/lib/ingestion/filters/quality-filter'

const POSITIVES = [
  "If you think about it, eclipses could be the trigger for what we call paranormal hot spots.",
  "Imagine if every ghost sighting was just an echo of consciousness.",
  "What if the 37th parallel really is a convergence zone?",
  "Hypothetically, if a soul were to travel...",
  "Think about it. Every UFO report comes from a place near water.",
  "Consider this scenario where Bigfoot is actually a spirit.",
  "Hear me out, but ghosts might be living in another dimension.",
  "Just a thought, but maybe abductions correlate with eclipse cycles.",
  "What are the odds that two people have the exact same dream?",
  "Could it be that all these encounters share a common mechanism?",
  "Is it possible that telepathy is universal?",
]

const NEGATIVES = [
  "Last night I saw a tall shadow figure in my hallway.",
  "I was driving on Route 9 when I noticed a triangular craft hovering.",
  "My grandmother used to tell me she heard a banshee one night.",
  "Around 2am on Thursday I felt someone in the room.",
  "If I had to pick one moment that changed everything, it was the night of August 4th when I saw...",  // 'if I' is conditional within a real account
]

let posFails = 0, negFails = 0
for (const text of POSITIVES) {
  const matched = DESCRIPTION_LEAD_PATTERNS.some(p => p.test(text.substring(0, 300)))
  console.log(matched ? '✓' : '✗', text.substring(0, 60) + (text.length > 60 ? '…' : ''))
  if (!matched) posFails++
}
console.log('---')
for (const text of NEGATIVES) {
  const matched = DESCRIPTION_LEAD_PATTERNS.some(p => p.test(text.substring(0, 300)))
  console.log(matched ? '✗ FP' : '✓', text.substring(0, 60) + (text.length > 60 ? '…' : ''))
  if (matched) negFails++
}
console.log(`\nPositive misses: ${posFails}/${POSITIVES.length}`)
console.log(`False positives: ${negFails}/${NEGATIVES.length}`)
process.exit(posFails > 0 || negFails > 0 ? 1 : 0)
