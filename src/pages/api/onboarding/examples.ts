/**
 * GET /api/onboarding/examples
 *
 * V11.20.7 — serves a HAND-CURATED set of real first-person experience
 * excerpts for the "Others shared" carousel on /start. Each was selected
 * from first-person sources (Reddit / NUFORC / NDERF) and lightly
 * copy-edited into a clean, self-contained excerpt (preambles/typos
 * trimmed; nothing invented). Replaces the prior random DB sampling,
 * which surfaced rough, off-voice, and occasionally unsafe content.
 *
 * Each curated item has a `short` (one punchy line) and a `long`
 * (2-3 sentences) version; the endpoint returns a shuffled mix of both
 * so the rotating carousel shows variety in length and category.
 *
 * Response: { examples: Array<{ id, title, summary, category }> }
 * Cached 5 min server-side.
 */

import type { NextApiRequest, NextApiResponse } from 'next'

interface Example {
  id: string
  title: string
  summary: string
  category: string
}

interface Curated {
  id: string
  category: string
  short: string
  long: string
}

// Curated June 2026 (V11.20.7). Real first-person reports, lightly edited
// for the showcase. `id` is the source report (kept for future linking).
var CURATED: Curated[] = [
  { id: 'a9d7ad17-52ee-40c1-9dad-7271b3206925', category: 'ghosts_hauntings', short: 'I saw faces appearing one after another, like a slideshow, while half-awake in my old apartment.', long: 'After a year living in a 100-year-old apartment where my wife and I felt watched and unwelcome at night, I started experiencing strange episodes while half-awake. I would see faces appearing one after another, almost like a slideshow, occurring in that state between sleep and wakefulness.' },
  { id: '32ba0400-1ef2-43b8-b61f-d8a3bdf565a0', category: 'ghosts_hauntings', short: 'My 4-year-old daughter woke crying, describing a dream where she kept disappearing from her bed while her body remained there.', long: "My daughter woke around 1:45 AM crying and told me about her dream. She said she kept 'disappearing' out of her bed—she knew her body was still there, but she kept vanishing into other rooms in the house, like our bedroom. She'd never described anything like this before and seemed genuinely shaken." },
  { id: 'cb6b8768-7856-4d7e-8c76-9d6eb9e47f3d', category: 'ghosts_hauntings', short: 'I heard heavy, slow footsteps in our colonial house whenever I was home alone—terrifying for a young teenage girl.', long: 'Our 90s colonial home in rural New England started with strange smells: cigarette smoke at the kitchen table despite no smokers in the family. My mom asked the ghost to stop and it never happened again. Then came the footsteps—heavy and slow, but only when one of us was home alone. I was a young teenage girl and it absolutely terrified me.' },
  { id: 'b1fc6bf1-2e78-4c39-886c-dbd4c5c4459c', category: 'cryptids', short: 'A black blur sprinted out of our house at impossible speed while my dad was inside—he never saw it leave.', long: "When I was about 10, waiting in the car before an Easter egg hunt, I saw something run out of our house at ridiculously fast speed—just a complete blur I couldn't focus on. My dad came back minutes later asking if I'd gone inside, since he heard the door beep. I told him what I'd seen: a black shape moving faster than anything I could process, with no face or details visible. We were both confused, because neither of us could explain what had actually left that house." },
  { id: '17beace1-fb51-42e3-8a96-6c2f81ff98b4', category: 'ghosts_hauntings', short: 'My father told me about Walter, a reclusive 1970s farmer linked to disappearances—then a bloodcurdling scream came from the pond.', long: 'During a summer stay on a remote Nebraska farm, my father shared a chilling story about Walter, a reclusive farmer from the 1970s linked to several disappearances in the area. One night, a bloodcurdling scream echoed across the fields from the pond near the farm, but when locals rushed to investigate, they found only still, dark water. Days later, Walter himself disappeared.' },
  { id: '0037d627-4de1-423b-a8eb-edd90ebef0fe', category: 'cryptids', short: 'A massive white wolf emerged from the ditch onto a rural Minnesota road and stopped directly in my lane, staring.', long: 'Driving down a rural Minnesota road on a night with an enormous yellow moon, I felt an overwhelming urge to accelerate at a four-way intersection. A mile past, a completely white wolf or dog walked up out of the ditch, stepped onto the road, stopped in my lane, and stared at me.' },
  { id: '63d33292-423b-4a5e-9566-0129c2fb65a7', category: 'cryptids', short: "While hiking railroad tracks near my friend's house, we spotted a monstrously tall figure in a torn coat and hat sprinting toward us from 450 feet away.", long: "While hiking railroad tracks behind my friend's house, one of us looked back and saw a monstrously tall person in a long torn coat and hat standing behind us. As we watched, he began running toward us. We bolted into the woods and eventually made it to a populated neighborhood, but I still can't explain what that figure was." },
  { id: 'f2f0af14-8a65-424c-b118-6755925288a0', category: 'cryptids', short: "I mumbled 'watch for snakes' on our driveway, and seconds later found one coiled directly in our path.", long: "Two weeks ago, Amy and I were driving down our 300-meter driveway to feed our neighbor's cats. Halfway there, I mumbled 'watch for snakes'—and seconds later, there was one coiled directly in our path on the road. In two years on our 40-acre property, we'd never seen a snake until that moment." },
  { id: 'e6db4cbd-e06f-437b-9961-a9bc09d45079', category: 'consciousness_practices', short: 'During sleep paralysis, I saw a black shadow at the foot of my bed while feeling my sheets being pulled away.', long: 'Nearly every night I experience sleep paralysis—a twilight state where I regain consciousness with my eyes open, aware of my surroundings, but completely unable to move. Last night, I saw a black shadow at the foot of my bed and felt my sheets being pulled off my body, as if my dreaming and waking consciousness were melding together.' },
  { id: '15074b15-8b7b-4a51-a23b-dbee600779d1', category: 'consciousness_practices', short: 'During meditation, I felt my mind literally melting into the floor in an intense, pleasurable state.', long: 'During my first serious meditation attempt, I lay still and breathed deeply from my abdomen. I felt my mind entering a completely different state—sinking deep into the floor with a literal, intense sensation that was surprisingly pleasurable. Though I could not hold it long, the experience felt like a genuine achievement.' },
  { id: '09c8559a-3096-49ed-842d-9dd1e46d3891', category: 'consciousness_practices', short: 'During meditation, my body started buzzing like a come-up on MDMA, and my hearing went completely quiet.', long: 'After 15 minutes of focused breathing meditation, I felt a shift in my body—a buzzing sensation throughout my limbs, similar to the onset of MDMA. At the same time, my hearing became unusually quiet.' },
  { id: '8a3cdeb8-7935-4139-95cf-36701793ce62', category: 'religion_mythology', short: 'I felt mechanical, electric vibrations coursing through my entire body as I entered a state between sleep and wakefulness.', long: "After three months of dedicated practice with relaxation techniques, I finally achieved a breakthrough in the summer of 1994. As I lay in bed around 10 PM, I induced deep progressive relaxation and quickly reached what I can only describe as the 'vibratory state'—my entire body filled with mechanical, electric-like vibrations." },
  { id: 'ca243779-a2bd-4d33-b8d4-6a72a59f8ecc', category: 'cryptids', short: "My brother and I saw a figure with no face standing in the V-shaped stone wall area outside our grandparents' house in Guatemala.", long: "When my brother and I stepped outside after dinner at my grandparents' house in Guatemala, we saw a figure standing in the V-shaped stone wall area between the two paths. It had a human shape, but where its face should have been was completely blank—no features at all, just smooth nothingness." },
  { id: 'd67f223b-d7c0-43df-9fc7-83625e67055b', category: 'psychic_phenomena', short: "I've had lifelong premonitions—lucid dreams that come true days later, sensing hidden pain in others, and avoiding places where I later learn something dangerous happened.", long: "Since childhood, I've experienced premonitions: lucid dreams I could control that would manifest days or weeks later, an acute sense for detecting when people are hiding their pain, and a strong intuition that warns me away from places or situations before something harmful occurs. These have proven accurate repeatedly, though I struggle to fully embrace them." },
  { id: '4a6295e8-615d-4010-bf2d-19464eb74754', category: 'religion_mythology', short: 'I heard piercing shrieking outside at night and discovered our elderly neighbor unconscious in her hallway.', long: 'When I was about 12, I heard shrieking outside around 10pm. My family and neighbors were standing confused in front of our building, hearing the sounds but unable to locate their source. I decided to investigate and walked past an open apartment door—where I found our older neighbor lady laying unconscious in her hallway with her young son sitting beside her.' },
  { id: 'e32de5fe-02f1-41ba-942e-4d8b404c9f17', category: 'religion_mythology', short: 'My sister drank from a Fanta handed to her by a cousin, and days later she began falling unconscious and doing things she could not remember, followed by voices speaking in tongues.', long: 'My sister drank from an opened Fanta that one of our cousins handed her during a family gathering in Kenya. Days after they left, she began falling unconscious and waking up to do things she had no memory of afterward. Then the voices in tongues began, and we had to call a sheikh to help.' },
  { id: 'fd00a65b-3a66-4083-8edf-3f44c94c1131', category: 'psychic_phenomena', short: 'My lights flickered and shut off while I was daydreaming about someone, then turned back on when I paid attention.', long: 'While deeply daydreaming about someone I had not spoken to in a year, my bedroom lights began flickering dramatically—off and on several times. When I ignored them and kept daydreaming, they continued to flicker, but the moment I stopped and focused on the darkness, they turned off completely and stayed off.' },
  { id: '0588cfc1-29de-42c7-abfe-dfd1f82ba0a2', category: 'esoteric_practices', short: "At my husband's grandfather's grave, I saw a clear image of a man in a rocking chair wearing 1980s clothing with a calm, sweet smile.", long: "At my husband's grandfather's grave in Michigan, I saw the clearest picture of a man sitting in a rocking chair, rocking gently, wearing 1980s/1990s clothing with a wide, calm and sweet grin. My husband didn't recognize him from family photos, yet his image remains vivid in my mind—he wasn't asking for help, just peacefully smiling at me." },
  { id: 'abcb6da3-5ea1-438b-b4df-f7702c07120e', category: 'ufos_aliens', short: 'Midday near the airport: a plane-sized object hanging motionless in the sky, close enough to see individual windows, visible only to me.', long: "Driving to the airport in an Uber, I saw what appeared to be a plane in side view, but it wasn't moving—frozen in place despite being close enough that I could make out individual windows. When I asked my wife if she saw it, she couldn't. By the time I leaned over to show her, it was gone." },
  { id: 'd582ed21-14c4-49d6-81e8-64adff2f32b7', category: 'ufos_aliens', short: 'At 1 AM at a container terminal, I watched a structured craft with multiple lights perform impossible angular maneuvers across the night sky.', long: 'December 2023, 1 AM at a container terminal: while waiting for a ship, I stepped outside the rail dispatcher base and witnessed a large structured object with multiple distinct lights executing sharp, angular movements across the sky—nothing conventional could move that way.' },
  { id: '7703840c-e6aa-4982-88d0-def48a8b2ff1', category: 'ufos_aliens', short: 'Missing time during lunch: I saw a classic disc UFO with colorful lights hovering directly overhead, then found myself walking home.', long: 'I experienced missing time while having lunch with my dog a couple blocks from home. I have a clear memory of looking up and seeing a classic disc-shaped UFO with colorful lights hovering close above me, then suddenly found myself walking home with no memory of the intervening period. My dog acted completely normal throughout.' },
]

function shuffle<T>(arr: T[]): T[] {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp
  }
  return arr
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Shuffle and return up to 10, alternating short/long for a length mix.
  var pool = shuffle(CURATED.slice())
  var examples: Example[] = pool.slice(0, 10).map(function (c, i) {
    return {
      id: c.id,
      title: '',
      summary: (i % 2 === 0) ? c.short : c.long,
      category: c.category,
    }
  })

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900')
  return res.status(200).json({ examples })
}
