import { parseLocation } from '../src/lib/ingestion/utils/location-parser'

interface Case { text: string; expected: { country?: string; international: boolean }; label: string }

const CASES: Case[] = [
  // Positives — these MUST match the relevant country
  {
    label: 'r/Ghosts Italy post (real failing case)',
    text: 'Tldr; I went on a trip to Italy and got a room with a wardrobe blocking a tiny door. In high school late 2000s I had saved up all my money from summer jobs to afford a nice trip to Italy where I would study abroad for a bit. After hitting southern Italy we moved up north heading to Milan. The hotel was eerie.',
    expected: { country: 'Italy', international: true },
  },
  {
    label: 'rural northern Italy directional qualifier',
    text: 'My family and I were in rural northern Italy when we saw something strange in the sky. We had been traveling for several weeks. It happened in the countryside outside a small village.',
    expected: { country: 'Italy', international: true },
  },
  {
    label: 'visiting Peru',
    text: 'I was visiting Peru for an ayahuasca retreat in the Amazon. The shaman warned us not to step outside the circle.',
    expected: { country: 'Peru', international: true },
  },
  {
    label: 'moved to Germany',
    text: 'We moved to Germany about ten years ago. Our apartment in Berlin has had strange occurrences ever since.',
    expected: { country: 'Germany', international: true },
  },
  {
    label: 'multi-mention India (no clear preposition)',
    text: 'India was where this happened. My grandmother lived there her whole life. She told me stories about the spirits that visited her in India during the monsoon season. Every year in India the same thing would happen.',
    expected: { country: 'India', international: true },
  },
  {
    label: 'in Iceland (basic positive)',
    text: 'This was in Iceland during a research trip. I was studying glacial formations near a remote outpost.',
    expected: { country: 'Iceland', international: true },
  },

  // Negatives — these MUST NOT match (avoid false positives)
  {
    label: 'casual Italy reference, US setting',
    text: 'I once had Italian food at a restaurant in Brooklyn. Anyway, the haunting started after I moved into a new apartment in New York. I never went to Italy.',
    expected: { international: false },
  },
  {
    label: 'short body should not trigger multi-mention',
    text: 'India India',
    expected: { international: false },
  },
  {
    label: 'V11.14.5: "Haunted in New England" must NOT match UK',
    text: 'Knox Mansion is in Johnstown NY. Haunted in New England did a investigation of the Knox Mansion on Oct 31, 2023. Eric Perry founder of Haunted in New England led the team. The mansion has long been a fixture of New York paranormal lore.',
    expected: { international: false },
  },
  {
    label: 'V11.14.5: "Little Britain Road" must NOT match UK',
    text: 'On our way through the Kawartha Lakes tonight, my BF and I were driving east on Little Britain Road around 9:40pm. It was just starting to get dark, and I was approaching a tractor riding on the shoulder of Little Britain Road. Something blocked out the right side of my headlight beam.',
    expected: { international: false },
  },
  {
    label: 'V11.14.5: "in New Mexico" must NOT match Mexico',
    text: 'I grew up in New Mexico, near the Sandia mountains. My family had stories about strange lights in the desert. We were in New Mexico for over thirty years before we moved away.',
    expected: { international: false },
  },
  {
    label: 'V11.14.6: "half mexican" + "stories from visiting mexico" must NOT match Mexico (Lakewood case)',
    text: 'So im half mexican and some people in there area are into the occult or whatever. I mean people do that stuff anywhere and im too young to care/give a shit. I used to play outside and leave my shoes outside a lot something my mom would get mad at me about. Of course I have more stories as I seem to attract weird shit happening to me but If anything else/new happens at this new house ill be sure to share it here, I have a lot more stories from my dads childhood and some of his stories from visiting mexico.',
    expected: { international: false },
  },
  {
    label: 'V11.14.6: "while visiting Italy" still matches (positive preserved)',
    text: 'While visiting Italy last summer, my partner and I noticed something strange in the hotel room near Rome. The wardrobe blocked a small door that we never found a key for.',
    expected: { country: 'Italy', international: true },
  },
  {
    label: 'V11.14.6: "I am French" alone must NOT match France (no other context)',
    text: 'I am French but I grew up in California. The haunting happened after I moved to a new apartment in Los Angeles. The shadow figure appeared three nights in a row.',
    expected: { international: false },
  },
  {
    label: 'V11.14.8: Irish witness + Texas event — should pick Texas, not Ireland',
    text: "Hey, I'm 37m from Ireland and my Wife is 35F from Texas, I have an interest in horror movies and scary stories. My wife had told me about experiencing paranormal encounters in her family home which I shrugged off as I have slept in buildings a thousand years old and experienced nothing. We went to visit her family one Thanksgiving and stayed in her childhood bedroom.",
    expected: { country: 'United States', international: false },
  },
  {
    label: 'V11.14.8: "in California" alone matches United States',
    text: 'I grew up in California, near San Francisco. The house had several incidents over the years. We were living in California for over twenty years before we moved.',
    expected: { country: 'United States', international: false },
  },
  {
    label: 'V11.14.9: clean city+state ("in Pittsburgh, Pennsylvania")',
    text: 'I lived in Pittsburgh, Pennsylvania when this happened. The old house had a basement that no one would go into alone.',
    expected: { country: 'United States', international: false },
  },
  {
    label: 'V11.14.9: clean city+state code ("in Austin, TX")',
    text: 'We moved to Austin, TX in 2018 and the house had a strange room nobody used. The previous owners left a journal.',
    expected: { country: 'United States', international: false },
  },
  {
    label: 'V11.14.9: garbage prefix "specifically, Pennsylvania" must NOT capture as city',
    text: 'It was in a small town in Pennsylvania, specifically, Pennsylvania state north region. My grandfather lived there for thirty years.',
    expected: { country: 'United States', international: false },
  },
]

let passed = 0, failed = 0
for (const c of CASES) {
  const got = parseLocation(c.text)
  const okIntl = got.isInternational === c.expected.international
  const okCountry = c.expected.country ? got.country === c.expected.country : true
  if (okIntl && okCountry) {
    console.log('✓ ' + c.label + (got.country ? ' → ' + got.country : ''))
    passed++
  } else {
    console.log('✗ ' + c.label + ' (got country=' + got.country + ' intl=' + got.isInternational + ', wanted country=' + (c.expected.country || '?') + ' intl=' + c.expected.international + ')')
    failed++
  }
}
console.log()
console.log('Passed: ' + passed + '/' + CASES.length)
process.exit(failed > 0 ? 1 : 0)
