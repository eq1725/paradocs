/**
 * Controlled Emotion Vocabulary for NDE Case Profiles
 *
 * WHY THIS EXISTS
 * ---------------
 * Source sites like NDERF host first-person questionnaire responses written
 * by experiencers. Reproducing those answers verbatim on our index pages is
 * a ToS + copyright concern (it's not transformative, and NDERF grants
 * research/educational use — not a republishing license).
 *
 * Instead of storing the raw "What emotions did you feel?" string as a
 * direct quote, we tokenize it against a controlled vocabulary of named
 * emotions / affective states commonly reported in NDEs. This turns the
 * quoted prose into categorical structured data, which is fair-use-safe and
 * renders nicely as discrete chips in the UI.
 *
 * Anything that doesn't match the vocabulary is dropped. Free-text
 * responses longer than two words are not surfaced.
 */

// Ordered buckets — rendered in this order when they appear.
// Valence groups emotions for optional styling (positive / ambivalent /
// negative / transcendent). Label is the human-readable token we emit.
export type EmotionValence = 'positive' | 'transcendent' | 'ambivalent' | 'negative'

export interface EmotionToken {
  slug: string
  label: string
  valence: EmotionValence
}

interface EmotionEntry {
  slug: string
  label: string
  valence: EmotionValence
  // All lower-cased surface forms we treat as evidence for this emotion.
  patterns: string[]
}

const VOCABULARY: EmotionEntry[] = [
  // ——— Transcendent (classic NDE affects) ———
  { slug: 'love', label: 'Love', valence: 'transcendent', patterns: ['love', 'loved', 'loving', 'unconditional love', 'overwhelming love', 'pure love', 'divine love'] },
  { slug: 'peace', label: 'Peace', valence: 'transcendent', patterns: ['peace', 'peaceful', 'peacefulness', 'tranquility', 'serenity', 'calm', 'calmness'] },
  { slug: 'joy', label: 'Joy', valence: 'transcendent', patterns: ['joy', 'joyful', 'joyous', 'delight', 'delighted', 'elation', 'elated'] },
  { slug: 'bliss', label: 'Bliss', valence: 'transcendent', patterns: ['bliss', 'blissful', 'ecstasy', 'ecstatic', 'euphoria', 'euphoric', 'rapture', 'rapturous'] },
  { slug: 'awe', label: 'Awe', valence: 'transcendent', patterns: ['awe', 'awed', 'awestruck', 'awestricken', 'awesomeness'] },
  { slug: 'wonder', label: 'Wonder', valence: 'transcendent', patterns: ['wonder', 'wonderment', 'amazement', 'amazed', 'astonishment'] },
  { slug: 'oneness', label: 'Oneness', valence: 'transcendent', patterns: ['oneness', 'unity', 'unified', 'connection', 'connectedness', 'connected to all', 'universal love'] },
  { slug: 'reverence', label: 'Reverence', valence: 'transcendent', patterns: ['reverence', 'reverent', 'sacred', 'sacredness', 'holy', 'holiness'] },

  // ——— Positive ———
  { slug: 'happiness', label: 'Happiness', valence: 'positive', patterns: ['happy', 'happiness', 'content', 'contentment', 'cheerful'] },
  { slug: 'gratitude', label: 'Gratitude', valence: 'positive', patterns: ['gratitude', 'grateful', 'thankful', 'thankfulness', 'appreciation'] },
  { slug: 'safety', label: 'Safety', valence: 'positive', patterns: ['safe', 'safety', 'secure', 'security', 'protected', 'sheltered'] },
  { slug: 'comfort', label: 'Comfort', valence: 'positive', patterns: ['comfort', 'comforted', 'comforting', 'reassured', 'reassurance'] },
  { slug: 'freedom', label: 'Freedom', valence: 'positive', patterns: ['free', 'freedom', 'liberated', 'liberation', 'weightless', 'weightlessness'] },
  { slug: 'compassion', label: 'Compassion', valence: 'positive', patterns: ['compassion', 'compassionate', 'empathy', 'empathic', 'mercy'] },
  { slug: 'hope', label: 'Hope', valence: 'positive', patterns: ['hope', 'hopeful', 'optimism', 'optimistic'] },
  { slug: 'relief', label: 'Relief', valence: 'positive', patterns: ['relief', 'relieved'] },
  { slug: 'clarity', label: 'Clarity', valence: 'positive', patterns: ['clarity', 'clear', 'lucid', 'lucidity', 'understanding', 'knowing'] },
  { slug: 'acceptance', label: 'Acceptance', valence: 'positive', patterns: ['acceptance', 'accepted', 'accepting'] },
  { slug: 'familiarity', label: 'Familiarity', valence: 'positive', patterns: ['familiar', 'familiarity', 'homecoming', 'home', 'at home'] },

  // ——— Ambivalent / mixed ———
  { slug: 'curiosity', label: 'Curiosity', valence: 'ambivalent', patterns: ['curious', 'curiosity', 'interested', 'interest'] },
  { slug: 'confusion', label: 'Confusion', valence: 'ambivalent', patterns: ['confusion', 'confused', 'disorientation', 'disoriented', 'bewildered', 'bewilderment'] },
  { slug: 'surprise', label: 'Surprise', valence: 'ambivalent', patterns: ['surprise', 'surprised', 'shock', 'shocked', 'startled'] },
  { slug: 'detachment', label: 'Detachment', valence: 'ambivalent', patterns: ['detached', 'detachment', 'separated', 'separate', 'dissociation', 'dissociated'] },
  { slug: 'timelessness', label: 'Timelessness', valence: 'ambivalent', patterns: ['timeless', 'timelessness', 'eternity', 'eternal', 'no time'] },

  // ——— Negative ———
  { slug: 'fear', label: 'Fear', valence: 'negative', patterns: ['fear', 'fearful', 'afraid', 'scared', 'frightened', 'frightful'] },
  { slug: 'terror', label: 'Terror', valence: 'negative', patterns: ['terror', 'terrified', 'horror', 'horrified', 'horrific', 'dread'] },
  { slug: 'anxiety', label: 'Anxiety', valence: 'negative', patterns: ['anxiety', 'anxious', 'worry', 'worried', 'nervous', 'nervousness'] },
  { slug: 'sadness', label: 'Sadness', valence: 'negative', patterns: ['sad', 'sadness', 'sorrow', 'sorrowful', 'grief', 'grieving', 'mourning', 'mournful'] },
  { slug: 'loneliness', label: 'Loneliness', valence: 'negative', patterns: ['lonely', 'loneliness', 'alone', 'isolation', 'isolated'] },
  { slug: 'guilt', label: 'Guilt', valence: 'negative', patterns: ['guilt', 'guilty', 'shame', 'ashamed'] },
  { slug: 'anger', label: 'Anger', valence: 'negative', patterns: ['anger', 'angry', 'rage', 'enraged', 'furious', 'fury'] },
  { slug: 'regret', label: 'Regret', valence: 'negative', patterns: ['regret', 'regretful', 'remorse', 'remorseful'] },
  { slug: 'pain', label: 'Pain', valence: 'negative', patterns: ['pain', 'painful', 'suffering', 'agony', 'agonizing'] },
  { slug: 'helplessness', label: 'Helplessness', valence: 'negative', patterns: ['helpless', 'helplessness', 'powerless', 'powerlessness'] },
]

// Compile a lookup map for fast matching.
// Note: we match whole-word patterns, longest-first so "unconditional love"
// wins over "love" when both could match.
const COMPILED = (function () {
  const entries: { pattern: string; entry: EmotionEntry }[] = []
  for (const entry of VOCABULARY) {
    for (const pattern of entry.patterns) {
      entries.push({ pattern: pattern.toLowerCase(), entry })
    }
  }
  // Longest patterns first so multi-word phrases take precedence.
  entries.sort((a, b) => b.pattern.length - a.pattern.length)
  return entries
})()

/**
 * Tokenize a raw emotions string from a questionnaire response into a list
 * of controlled-vocabulary EmotionTokens. Deduplicated, ordered by first
 * appearance in the source.
 *
 * Returns an empty array when nothing matches — we never fall back to the
 * verbatim string.
 */
export function tokenizeEmotions(raw: string | null | undefined): EmotionToken[] {
  if (!raw) return []
  // Normalize: lowercase, strip punctuation to spaces, collapse whitespace.
  // Use a plain ASCII/latin range rather than unicode property escapes so
  // we don't require ES2018+ regex support.
  const text = ' ' + raw
    .toLowerCase()
    .replace(/[^a-z0-9àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ\s'-]+/g, ' ')
    .replace(/\s+/g, ' ') + ' '

  const found: { slug: string; label: string; valence: EmotionValence; position: number }[] = []
  const seen = new Set<string>()

  for (const { pattern, entry } of COMPILED) {
    // Match as whole words. For multi-word patterns this is a simple
    // substring check bounded by spaces; for single words ensure we don't
    // match inside longer tokens (e.g. "lovely" shouldn't trigger "love").
    const needle = ' ' + pattern + ' '
    const idx = text.indexOf(needle)
    if (idx === -1) continue
    if (seen.has(entry.slug)) continue
    seen.add(entry.slug)
    found.push({ slug: entry.slug, label: entry.label, valence: entry.valence, position: idx })
  }

  found.sort((a, b) => a.position - b.position)
  return found.map(({ slug, label, valence }) => ({ slug, label, valence }))
}
