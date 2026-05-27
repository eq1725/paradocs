// Shared Quality Filter Module
// Centralized filtering and quality scoring for all ingestion adapters

import { ScrapedReport } from '../types';

// ============================================================================
// REJECTION PATTERNS - Content that should NOT be ingested
// ============================================================================

// Meta posts that ask for stories rather than share experiences
export const META_POST_PATTERNS = [
  // Asking for experiences
  /\b(share your|tell me about|tell us about|what's your|what are your)\b/i,
  /\b(dump your|drop your|post your|leave your)\s+(experience|stor|thought|comment)/i,
  /\b(everybody|everyone)\s+(share|dump|drop|post|tell|comment)/i,
  /\b(looking for|searching for|collecting) (stories|experiences|accounts)\b/i,
  /\b(anyone have|does anyone have|has anyone had|who has had)\b/i,
  /\b(anyone else|has anyone else|did anyone else)\b/i,
  // Research/media requests
  /\b(i'm (making|creating|writing|working on)|for my (book|podcast|channel|video|documentary|research|project|zine))\b/i,
  /\b(gathering|collecting|compiling) (stories|experiences|data)\b/i,
  // Challenges/contests
  /\b(challenge|contest|giveaway)\b/i,
  // Questions seeking multiple responses
  /\bwhat (paranormal|supernatural|strange|weird|creepy) (experience|thing|event)s? (have you|did you)\b/i,
  // Discussion prompts + recurring community threads
  /\b(discussion|megathread|weekly thread)\b/i,
  /\btalk about (anything|whatever|something)\b/i,
  /\b(let's|lets) (discuss|talk about|hear)\b/i,
  /\b(open )?discussion\s*(thread|post|prompt)?\b/i,
  /\b(sound off|chime in|weigh in)\b/i,
  // V11 — recurring "Weekly/Monthly/Daily <topic> Thread/Request/Post"
  // patterns. Caught "Weekly Divination Request Thread Open for Readings"
  // that slipped through smoke 2.
  /\b(weekly|monthly|daily|bi[\s-]?weekly|nightly)\s+\w+\s+(thread|request|post|chat|check[\s-]?in|stickied|sticky)\b/i,
  /\b(weekly|monthly|daily)\s+(open|free|request|reading|divination|q[\s-]?and[\s-]?a|qna|qa|introductions?|check[\s-]?in)\b/i,
  // Poll/hypothetical questions - NOT real experiences
  /\b(which (one )?would you|would you rather|if you could|would you want to be)\b/i,
  /\b(vote|poll|survey|choose one|pick one)\b/i,
  // Practice/technique questions (not experiences)
  /\b(do you|does your|have you)\s+(practice|do|use|try)\b.*\?/i,
  /\b(has|have)\s+(tulpamancy|meditation|astral projection|lucid dreaming)\s+(affected|changed|helped)/i,
  /\b(how do you|how does your|what's your)\s+(practice|technique|method|approach)\b/i,
  /\b(reincarnated as|come back as|be turned into)\b/i,
  /\b(favorite|best|worst|scariest|creepiest) (cryptid|creature|ghost|ufo|alien)\?/i,
  /\b(what do you think|what would you do|how would you)\b/i,
  /\b(unpopular opinion|hot take|change my mind)\b/i,
  // V11 — seeker / process / self-learning posts. Not experience reports.
  // Caught a DMT post "I have been experimenting with dmt for months now but
  // havent got the courage to breaktrough yet. Im wondering how hard it is
  // to let go" that slipped through smoke 3.
  /\b(i'?m\s+wondering|i\s+wonder)\s+(how|if|what|whether|when)\b/i,
  /\b(haven'?t\s+got\s+(the\s+)?courage|don'?t\s+have\s+(the\s+)?courage)\b/i,
  /\b(any\s+(tips?|advice|recommendations?|pointers?|suggestions?))\b/i,
  /\b(how\s+do\s+(you|i|y'?all|u(?:\s+guys)?|you\s+guys|anyone))\b/i,
  // V11 — allow adverbs between "i" and the seeking verb so "I really
  // want to start meditating" matches. Smoke 4 surface: a meditation-
  // teacher-seeker post slipped through because the previous pattern
  // required "i want to" with no intervening word.
  //
  // V11.8 — broadened verb list to include "take/attempt/trip/use/try
  // out" so prospective drug-use posts ("I want to take LSD for the
  // first time…") get rejected. Smoke #7 surface: an LSD-trip-planning
  // post slipped through the previous (learn|figure out|…) list.
  /\bi\s+(?:really\s+|just\s+|finally\s+|truly\s+|so\s+|honestly\s+)?(?:want\s+to|hope\s+to|need\s+to|wish\s+to|would\s+like\s+to|plan\s+to|planning\s+to|gonna|am\s+going\s+to)\s+(learn|figure\s+out|understand|start|try|begin|do|find|meditate|practice|develop|take|attempt|experience|use|trip|try\s+out|dose|microdose|smoke|drop|ingest)\b/i,
  /\b(how\s+can\s+i\s+(learn|start|begin|practice|develop|find))\b/i,
  /\b(im\s+trying\s+to|i\s+am\s+trying\s+to)\s+(learn|start|figure\s+out|master)\b/i,
  /\b(having\s+a\s+hard\s+time|having\s+trouble)\s+(with|figuring|learning|understanding)\b/i,
  // V11.7 — Seeking-others / community-survey patterns. Smoke #6
  // slipped through the "are there any other Christian tulpamancers
  // out there?" post because it's framed as a community lookup, not
  // a personal experience.
  /\bare\s+there\s+any\s+(?:other|more)\b/i,
  /\b(?:anyone|anybody)\s+(?:else|here|out\s+there)\s+(?:have|had|experienc|tried|practic)/i,
  // V11.7 — Loosened "wondering" patterns. Existing patterns required a
  // trailing question-word; "we kinda wonder", "we're just wondering",
  // and "I'm wondering" (standalone) all need to match.
  /\b(?:i'?m|we'?re|we|i)\s+(?:just\s+|kinda\s+|sort\s+of\s+|kind\s+of\s+|sorta\s+)?wonder(?:ing)?\b/i,
  // V11.10 — Prospective drug-use / journey-planning posts where the
  // subject is split from the verb by intervening clauses. Smoke #9
  // surfaced "I will be visiting Peru in August and for years have
  // been planning to experience an ayahuasca ceremony." The V11.8
  // pattern required "i" + (want|hope|plan) to be adjacent; this
  // catches the "have been planning/wanting/hoping/etc." standalone
  // form regardless of the subject pronoun's distance.
  /\bhave\s+been\s+(?:planning|wanting|hoping|trying|considering|thinking\s+about|looking\s+forward)\s+to\b/i,
  /\bfor\s+years\s+(?:i'?ve|i\s+have|i\s+had|i\s+(?:was|am|am\s+still))?\s*been\s+(?:planning|wanting|hoping|trying)\s+to\b/i,
];

// Art, merchandise, and promotional content
export const NON_EXPERIENCE_PATTERNS = [
  // Art and crafts
  /\b(i (made|drew|painted|created|designed|crafted|stitched|knitted|crocheted))\b/i,
  /\b(my (art|artwork|drawing|painting|sketch|illustration|design|craft|creation))\b/i,
  /\b(cross[- ]?stitch|embroidery|crochet|knitting|quilting|woodworking|sculpture)\b/i,
  /\b(fan ?art|oc|original character|commission)\b/i,
  /\b(digital art|traditional art|pixel art|3d model)\b/i,
  // NEW: Catch standalone "art" mentions in titles like "more Cryptid art"
  /\b(more|some|new|another|latest)\s+\w*\s*art\b/i,
  /\b(cryptid|ufo|alien|ghost|bigfoot|paranormal|mothman)\s+art\b/i,
  /\bart\s*(i|of|for|post|piece|work|style)\b/i,
  // Art threads and recurring art posts
  /\b(weekly|monthly|daily)?\s*art\s*(thread|tuesday|gift|post|contest|challenge)\b/i,
  /\b(art|tulpa)\s+(tuesday|thread|gift)\b/i,
  /\bshitpost\s*(sunday|saturday)?\b/i,
  /\bpsychedelic\s+art\s+tributes?\b/i,
  /\bvisualizing\s+consciousness.*art\b/i,
  // Daily/weekly recurring content posts (not experiences)
  /\b(daily|weekly|monthly)\s*(cryptid|creature|monster|ufo|alien|ghost|paranormal)\b/i,
  /\b(cryptid|creature|monster)\s*(of the|for)\s*(day|week|month)\b/i,
  /\b(today'?s?|this week'?s?)\s*(cryptid|creature|monster|featured)\b/i,
  // "Look at this" / image sharing posts (not personal experiences)
  /\b(look at|check out|found this|saw this|here'?s? a?n?)\s*(pic|photo|image|video|clip)\b/i,
  /\b(thought you'?d?|you guys might|y'?all might)\s*(like|enjoy|appreciate)\b/i,
  // Merchandise and promotional
  /\b(for sale|buy now|shop|store|etsy|redbubble|teepublic|amazon)\b/i,
  /\b(merch|merchandise|t-shirt|shirt|poster|sticker|mug|print)\b/i,
  /\b(link in (bio|comments|description)|check out my)\b/i,
  /\b(free download|download free|pattern free)\b/i,
  // SELF-PROMOTION - YouTube, podcasts, channels
  /\b(i started a|check out my|subscribe to my|my new|just started a|just launched) (youtube|channel|podcast|blog|website|series)\b/i,
  /\b(new (youtube )?channel|my (youtube )?channel|started a (youtube )?channel)\b/i,
  /\b(please subscribe|hit subscribe|smash.{0,10}subscribe|like and subscribe)\b/i,
  /\b(support my|support the) (channel|podcast|blog|patreon|work)\b/i,
  /\b(first video|new video|latest video|just uploaded|just posted)\b/i,
  // Media/entertainment (not experiences)
  /\b(movie|film|show|series|episode|trailer|review|rating)\s+(about|of|for)/i,
  /\b(game|video ?game|indie game|rpg|tabletop)\b/i,
  /\b(podcast episode|new episode|latest episode)\b/i,
  /\b(book release|new book|my novel|my book)\b/i,
  // NEW: Book promos, Kindle giveaways, and promotional content
  /\b(kindle|ebook|e-book)\s*(giveaway|free|promo)/i,
  /\b(free|win|enter)\s*(kindle|ebook|e-book|book)\b/i,
  /\b(book|kindle)\s*(promo|promotion|giveaway|contest)\b/i,
  /\bgiveaway!?\s*.{0,30}(book|kindle|read|novel)/i,
  /\bfree\s*(kindle|book)\s*(giveaway|download)/i,
  // Memes and jokes
  /\b(meme|shitpost|joke|lol|lmao|rofl)\b/i,
  /\b(wrong answers only|caption this)\b/i,
  // Tattoos and cosplay
  /\b(my (new )?tattoo|got (a |this )?tattoo|tattoo (design|idea|artist))\b/i,
  /\b(cosplay|costume|dressed as|dressed up as)\b/i,
  // News/articles (not personal experiences)
  /\b(according to|scientists|researchers found|study shows|report says)\b/i,
  // V11.17.14 — Meta-commentary / news-summary / press-release /
  // legislative-policy posts (Kecksburg-style). Reddit r/UFOs in
  // particular floods with these: link-shares of Wired articles,
  // congressional amendment discussions, scientific coalition
  // press releases, etc. None are first-person witness accounts.
  /\b(this|the)\s+\d{4}\s+(wired|atlantic|guardian|nytimes|nyt|wsj|forbes|cnn|bbc|npr|pbs|fox|cbs|nbc|abc|ap|associated\s+press|reuters)\s+article\b/i,
  /\b(wired|atlantic|guardian|new\s+york\s+times|washington\s+post|cnn|bbc|forbes|reuters|associated\s+press)\s+article\s+(documents|reveals|reports|states|describes|details|recounts)\b/i,
  /\bpress\s+release\s+(announces|reads|states|reveals|details)\b/i,
  /\b(today|recently|yesterday)[,.]?\s+\w+\s+(released|announced|published|issued)\s+(the\s+)?(following\s+)?press\s+release\b/i,
  /\bobtained\s+and\s+released\s+(those|the|these|these)\b/i,
  /\bcongressional\s+(hearing|testimony|amendment|record|committee|subcommittee)\b/i,
  /\b(senate|house)\s+(amendment|hearing|committee|subcommittee|floor)\b/i,
  /\b(advisory|disclosure|standing|select|special)\s+(committee|subcommittee|panel|task\s+force)\b/i,
  /\bamendment\s+(in\s+nature\s+of\s+(a\s+)?substitute|proposal|filed)\b/i,
  /\b(submitted|filed|proposed)\s+an?\s+amendment\b/i,
  // Reddit r/UFOs convention — Submission Statements are the
  // mandatory blurb for LINK posts (always non-experience).
  /\b(?:^|\n)\s*submission\s+statement\s*[:|\-—]/i,
  /\bsubmission\s+statement\b.*\b(this|the)\s+(article|video|post|paper|study|report)\b/i,
  // V11 — help/advice-request posts. "Woman Seeks Exorcism Help for
  // Mother in Phoenix" type — a real person genuinely needs help, but
  // it isn't an experience report we can archive editorially.
  /\b(seeks?|seeking|looking for|need|needs|in need of)\s+(help|advice|guidance|assistance|recommendation|practitioner|exorcist|exorcism|cleanse|cleansing|reading|healer|medium|psychic|priest|exorcism|protection)\b/i,
  /\b(can|could)\s+(anyone|someone|you)\s+(help|recommend|tell me|please)\b/i,
  /\b(does anyone (know|live|practice))\b/i,
  /\b(if anybody|if anyone)\s+(knows|can|practices)\b/i,
  // V11 — declarative theorizing. "Shadow people are X" is a theory, not
  // an experience report. Distinguishes from "I saw shadow people" type.
  // (NOTE: anchored patterns moved to DESCRIPTION_LEAD_PATTERNS below
  // because META/NON_EXPERIENCE checks run against combinedText where the
  // title precedes the description and `^` never matches.)
  /\b(my\s+theory\s+is|i\s+think\s+(they'?re|they\s+are|its|it'?s))\b/i,
  /\b(explanation\s+for|theory\s+(about|of)\s+|theories\s+(about|on))\b/i,
  /\b(are\s+(just|simply|merely|nothing\s+more\s+than|basically))\s+\w+/i,
  /\b(let\s+me\s+(explain|tell\s+you\s+about))\b/i,
  // V11 — self-promotion of platforms / tools / apps / sites the OP built.
  // Allow up to 3 intermediate adjective/noun words between "a/an/etc"
  // and the noun ("Created a public reporting platform" → "public
  // reporting" between "a" and "platform"). Smoke 5 surfaced the
  // "Public Reporting Platform Maps State-By-State UFO Sightings"
  // post slipping through the stricter v1 pattern.
  /\b(created|built|launched|made|started|developed|designed|published|releasing)\s+(a|an|the|this|my|our)\s+(?:[\w\-]+\s+){0,3}(platform|app|website|site|tool|database|directory|tracker|service|dashboard|aggregator|reporter|submission\s+form|repository|archive)\b/i,
  /\b(submit\s+(your|a|an)\s+(report|sighting|experience))\b/i,
  /\bhttps?:\/\/\S+\s+(check|visit|see)\b/i,
  // V11.8 — Product / equipment troubleshooting (cultivation, vapes,
  // tinctures, mycology setups). Phenomenon-shaped openers ("I don't
  // know what happened. The first time it turned completely liquid…")
  // can fool the existing filters because they read narrative; the
  // tell is the noun phrase. Smoke #7 surface: a DMT vape-cart
  // hardware-diagnosis post and a grain-spawn humidity question both
  // slipped through and were given phenomenon-y AI headlines.
  /\b(?:my|the|this|a)\s+(?:cart(?:ridge)?|vape|pen|jar|substrate|grain\s+spawn|mycelium|spore\s+syringe|syringe|tincture|extract|crystals?|dab)\s+(?:turned|stopped|started|won'?t|wouldn'?t|broke|leaked|melted|hardened|crystalliz|liquefi|spotted|moldy|contaminated|colonized?|sprouted|fruited)\b/i,
  // V11.8 — Cultivation / mycology technical vocabulary cluster. The
  // existence of multiple cultivation-specific terms together is a
  // strong signal the post is a how-to, not an experience. Three or
  // more of these tokens in the title+description triggers rejection
  // via the META_POST flow (handled separately below).
  /\b(?:grain\s+spawn|colonize|colonization|spawn\s+bag|fruiting\s+chamber|monotub|substrate|mycelium|spore\s+print|spore\s+syringe|inoculate|humidifier|absolute\s+humidity|temp\s+controlled)\b.*\b(?:grain\s+spawn|colonize|colonization|spawn\s+bag|fruiting\s+chamber|monotub|substrate|mycelium|spore\s+print|spore\s+syringe|inoculate|humidifier|absolute\s+humidity|temp\s+controlled)\b/i,
  // V11.10 — DMT / spice extraction process documentation. Smoke #9
  // surfaced "tonight was my first time extraction DMT and I used
  // 200Grams of root bark. So it's done and I have 4 pans from my
  // first pull and on one pan the yield came to just about 1 gram.
  // Is that about right?" — process documentation + yield question,
  // not a consciousness experience. Two co-occurring terms suffices.
  /\b(?:root\s+bark|first\s+pull|second\s+pull|third\s+pull|extra\s+pull|extraction\s+(?:method|procedure|yield|tek)|spice\s+(?:yield|extraction)|crystalliz(?:e|ed|ing|ation)|recrystall|d?[\s-]?limonene|naphtha|sodium\s+hydroxide|naoh|lye\s+pull|freeze\s+precipitat|pan\s+pull|grams?\s+of\s+root\s+bark|mhrb|mimosa\s+hostilis|acacia\s+confusa)\b.*\b(?:root\s+bark|first\s+pull|second\s+pull|third\s+pull|extra\s+pull|extraction\s+(?:method|procedure|yield|tek)|spice\s+(?:yield|extraction)|crystalliz(?:e|ed|ing|ation)|recrystall|naphtha|sodium\s+hydroxide|naoh|lye\s+pull|freeze\s+precipitat|pan\s+pull|grams?\s+of\s+root\s+bark|yield\s+(?:came|was|of)|mhrb|mimosa\s+hostilis|acacia\s+confusa)\b/i,
  // V11.10 — Single-term extraction-yield signal that's strong enough
  // on its own. "yield came to just about 1 gram" / "yield was 0.8g"
  // — pure chemistry/yield reporting.
  /\byield\s+(?:came\s+to|was\s+(?:just\s+about|approximately|roughly|around)?\s*\d|of\s+\d|came\s+in\s+at)/i,
];

// V11 — patterns that run against ONLY the first 300 chars of the
// description body, NOT combined title+description. Anchored patterns
// (`^`) live here because META_POST_PATTERNS / NON_EXPERIENCE_PATTERNS
// are tested against `<title>\n<description>` and the `^` anchor
// would only match the very start of that combined string, which is
// always the title.
//
// Use this set for "lead of body" disqualifiers — things the body
// opens with that signal "not an experience report" regardless of
// what the title says.
export const DESCRIPTION_LEAD_PATTERNS = [
  // Body opens with "Shadow people are…" / "Cryptids are…" theorizing.
  /^\s*shadow\s+people\s+are\b/i,
  /^\s*(cryptids?|ufos?|aliens?|ghosts?|spirits?|demons?|orbs?|entities|shadow\s+(figures?|beings?|entities))\s+are\b/i,
  // Body opens with "My thoughts are…" / "I honestly go with the X theory"
  // — declarative position-statement about other people's experiences.
  /^\s*my\s+thoughts\s+(are|on)\b/i,
  /^\s*i\s+(honestly|personally)\s+(go\s+with|believe|think|subscribe\s+to)\b/i,
  // Body opens with a markdown link or bare URL. Catches:
  //   "[http://51.81.253.114:9000/...](http://51.81.253.114:9000/...)"
  //   "https://www.youtube.com/watch?v=… You should check this out…"
  /^\s*\[\s*https?:\/\//i,
  /^\s*\[[^\]]{0,80}\]\s*\(https?:\/\//i,
  /^\s*https?:\/\//i,
  // V11.7 — Explainer / encyclopedia opener. "Gematria is the concept of
  // adding up letters…" — definition-led, not experience. Trailing
  // `\s+of\b` prevents false positives on "Sleep paralysis is a
  // phenomenon I've experienced for years" (no "of" follows phenomenon).
  // Smoke #7 prep: catches the Gematria post that slipped through limit=100.
  /^\s*\w+(?:\s+\w+){0,2}\s+is\s+(?:the\s+|a\s+|an\s+)?(?:concept|practice|tradition|study|art|technique|belief|theory|idea|doctrine|principle|notion|process|method|teaching|phenomenon|term|name|word)\s+of\b/i,
  // V11.7 — Quote-sharing opener. Body opens with a quoted excerpt
  // (≥30 chars between paired quote marks) or a markdown blockquote.
  // Quote-share posts (often passages from books/teachers) are not
  // experience reports. Smoke #7 prep: catches the Huxley
  // "Perennial Philosophy" excerpt that slipped through limit=100.
  /^\s*["“„][^"“”„]{30,}["”“„]/,
  /^\s*>\s+\S/,
  // V11.7 — Rhetorical / philosophical opener. "Why have people found
  // it so easy to express their hate online?" — discussion prompt,
  // not experience. Smoke #7 prep: catches the meditative-cleansing
  // rant post.
  /^\s*why\s+(?:have|has|do|does|are|is|would|did|don'?t|doesn'?t|can'?t|cant)\s+(?:people|we|you|so\s+many|everyone|anyone|humans?|society|the\s+world|they)\b/i,
  // V11.7 — Self-labeled question post. "Ok. Ok, last question today."
  // "Quick question for the group." OP literally labels their post a
  // question rather than an experience. Smoke #7 prep: catches the
  // Tulpa-question post that slipped through limit=100.
  /^\s*(?:ok|okay)[.,!?]*\s+(?:ok|okay)?[.,!?]*\s*(?:last|first|another|one\s+more|quick)\s+question\b/i,
  /^\s*(?:quick|just\s+a|one|a|another)\s+question\s+(?:for|to|about|regarding|y'?all|everyone|the)\b/i,
  // V11.7 — Markdown heading or emoji-bullet chrome opener. Posts that
  // open with structured markdown (## header, - 🗓️ Date: bullets) are
  // personal symbol-system / journal content, not experiential narrative.
  // Smoke #7 prep: catches the "Reverberation Node" post.
  /^\s*\\?#{1,6}\s+\S/,
  // Emoji-bullet opener (🗓️, 🧠, ⚡, etc.) — explicit unicode ranges so we
  // don't need the /u flag (project targets pre-ES6 in tsc). Covers BMP
  // dingbats (U+2600-U+27BF) and the high-surrogate range for
  // supplementary-plane emoji (U+1F000-U+1FFFF).
  /^[\s\-*•]*(?:[☀-➿]|[\uD83C-\uD83E][\uDC00-\uDFFF])/,
  // V11.10 — Essay / encyclopedia geographic-temporal opener. Smoke #9
  // surfaced "In the West, Astral Projection is often debated as a
  // neurological glitch…" — a structured essay, not an experience
  // report. The geographic/temporal preamble ("In the West/East/past/
  // modern world/ancient world/…") is the diagnostic.
  /^\s*in\s+the\s+(?:west|east|north|south|past|present|future|modern\s+(?:world|era|age|times?)|ancient\s+(?:world|era|times?|past)|us|usa|uk|americas?|europe|asia|orient|occident|middle\s+ages?|nineteen\s+\w+ies?|twentieth\s+century|twenty[\s-]?first\s+century|early\s+\d{4}s|late\s+\d{4}s|\d{4}s|days?\s+(?:of|before|since)|history|literature|tradition|scriptures?)[,.]?\s+\w/i,
  // V11.10 — Opinion markers / comment-reply openers. Smoke #9
  // surfaced a love-spells thread cluster where commenters opened
  // with "In my opinion, …", "First of all, there's no such thing…",
  // "I'd say 99% of the time…", "Well, OP, you got your answer…".
  // These are reply/commentary, not experience reports.
  /^\s*in\s+(?:my|our|the\s+author'?s)\s+opinion[,.]?\s+/i,
  /^\s*first\s+of\s+all[,.]?\s+/i,
  /^\s*i'?d\s+say\s+\d+\s*%/i,
  /^\s*well[,.]?\s+(?:op|y'?all|everyone|folks?)\b/i,
  /^\s*well[,.]?\s+\w+[,.]?\s+(?:you|y'?all|op)\s+(?:got|asked|wanted|need)/i,
  // V11.10 — Analogy explainer opener. "Magick is like water: it
  // takes the path of least resistance." Same shape across topics
  // (Magic / Energy / Consciousness / Reality / etc. + "is like").
  /^\s*(?:magick?|magic|energy|consciousness|spirit|witchcraft|the\s+self|the\s+universe|reality|the\s+soul|karma|the\s+mind|the\s+ego|the\s+truth|love|faith|knowledge)\s+is\s+like\s+\w+/i,
  // V11.10 — Declarative theory opener. "It explains how existence
  // even works." / "We can prove it any way." Pure speculation.
  /^\s*it\s+explains\s+(?:how|why|what|where|when)\b/i,
  /^\s*we\s+can\s+prove\s+\w+/i,
  // V11.14 — Hypothetical / thought-experiment opener. Smoke run on
  // r/cryptids surfaced "Eclipse Totality and the 37th Parallel
  // Convergence" — title sounded like a witness claim but body was
  // pure speculation ("If you think about it, eclipses could…").
  // These are op-eds, not experiences. The title-side QUESTION_ONLY
  // regex catches "What if X" / "hypothetically" / "if you/we/they"
  // in titles; this set mirrors that on the body lead.
  /^\s*if\s+you\s+(?:think\s+about\s+it|consider|imagine)\b/i,
  /^\s*if\s+(?:we|you|one)\s+(?:assume|suppose|posit|grant|imagine)\b/i,
  /^\s*imagine\s+(?:if|that|a|the|for\s+a|you|we)\b/i,
  /^\s*what\s+if\s+\w+/i,
  /^\s*hypothetically[,.]?\s+/i,
  /^\s*think\s+about\s+it[,.]?\s+/i,
  /^\s*consider\s+(?:this|the\s+following|a\s+scenario|for\s+a\s+moment)\b/i,
  /^\s*hear\s+me\s+out[,.]?\s+/i,
  /^\s*just\s+a\s+(?:thought|theory|hypothesis|hunch|wild\s+idea)\b/i,
  // V11.14 — "What are the odds that X" / "Could it be that X" —
  // speculation framed as rhetorical inquiry, not a witnessed event.
  /^\s*what\s+(?:are|is)\s+the\s+(?:odds|chances|probability|likelihood)\s+(?:that|of)\b/i,
  /^\s*could\s+(?:it\s+be|this\s+be|there\s+be|that\s+be)\s+that\b/i,
  /^\s*is\s+it\s+(?:possible|conceivable|plausible)\s+that\b/i,
  // V11.17.14 — Meta-commentary openers (Kecksburg-style leak).
  // These are body-leads that signal "this is a link-share / news
  // commentary post, not a first-person witness account."
  //
  // "Okay so, somebody on a other post mentioned..." — referencing
  // other Reddit posts as the subject (Kecksburg report's opener).
  /^\s*ok(?:ay)?[,.!]?\s+so[,.]?\s+(?:somebody|someone|a\s+person|this\s+\w+|the\s+\w+)\s+(?:on|in|from)\s+(?:a|an|the|another|other)\s+(?:post|thread|sub|video|article)/i,
  // "I can't believe it took me X to notice..." — rhetorical news commentary
  /^\s*i\s+can'?t\s+believe\s+(?:it|how)\s+(?:took|long)\s+/i,
  // "Today, X released the following..." — press release dump
  /^\s*today[,.]?\s+\w+\s+(?:released|announced|published|posted|issued)\s+(?:the\s+following\s+)?(?:press\s+release|statement|announcement)\b/i,
  // "I found this Y and thought..." / "I found this fascinating and..."
  /^\s*i\s+found\s+this\s+\w+\s+(?:fascinating|interesting|incredible|amazing|disturbing|striking|important|fasinating)/i,
  // "This is just a..." / "This is an amendment proposal..." — link-share preamble
  /^\s*this\s+is\s+(?:just\s+)?an?\s+\w+\s+(?:proposal|amendment|article|link|share|update|news|press)/i,
  // "I'm looking into / I was looking at / I came across" — research/curation framing
  /^\s*i\s+(?:was|am)\s+(?:looking\s+(?:into|at|up)|reading|researching|going\s+through)\s+(?:a|an|the|this)\s+(?:article|paper|study|book|wiki|website|sub|thread|post)/i,
  // "Submission statement:" (Reddit r/UFOs convention for link-share posts)
  /^\s*submission\s+statement\s*[:|\-—]/i,
];

// Fiction markers - stories that are explicitly fictional
export const FICTION_PATTERNS = [
  /\b(creative writing|fiction|short story|writing prompt)\b/i,
  /\b(inspired by|based on the game|fan fiction|fanfic)\b/i,
  /\b(in this movie|in the show|in the book|in the game)\b/i,
  /\b(nosleep|creepypasta|let me tell you a story)\b/i,
  /\b(part \d+|chapter \d+|continued from)\b/i,
  /\b(trigger warning.*fiction|this is fictional|not a true story)\b/i,
];

// Low-effort content markers
export const LOW_EFFORT_PATTERNS = [
  /^.{0,50}$/,  // Very short content (less than 50 chars)
  /^[A-Z\s!?.]{20,}$/,  // All caps
  /[!?]{3,}/,  // Excessive punctuation
  /(.)\1{4,}/,  // Repeated characters (aaaaa, !!!!!!)
  /^(help|what|why|how|does|is|can|should)\s/i,  // Questions only
];

// Single-word or very short titles that are just creature/phenomenon names (not experiences)
export const NAME_ONLY_TITLE_PATTERNS = [
  // Common cryptid names as standalone titles
  /^(bigfoot|sasquatch|yeti|mothman|chupacabra|jackalope|wendigo|skinwalker|dogman|goatman)$/i,
  /^(thunderbird|jersey devil|loch ness|nessie|ogopogo|champ|mokele-mbembe)$/i,
  /^(grey|gray|nordic|reptilian|mantis)s?\s*(alien)?$/i,
  /^(ufo|uap|orb|triangle|tic tac|cigar)s?$/i,
  /^(ghost|apparition|poltergeist|shadow person|hat man|demon)s?$/i,
  /^(tulpa|nde|obe|astral projection|sleep paralysis)$/i,
  // Very short titles (1-3 words) that don't indicate a personal experience
  /^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/,  // "Bigfoot" or "Bigfoot Sighting" without context
  // Titles that are just [Cryptid] + generic noun
  /^[A-Za-z]+\s+(photo|pic|image|video|footage|evidence|proof|sighting)s?$/i,
];

// Question-only posts - these are discussions, not experiences
export const QUESTION_ONLY_PATTERNS = [
  // Direct questions about phenomena (not experiences)
  /^what (are|is|do|does|would|could|should|might|can)\b/i,
  /^(why|how|where|when) (are|is|do|does|would|could|should|can)\b/i,
  /^(does|do|is|are|can|could|would|should|has|have|will) (anyone|anybody|someone|somebody|you|we|they)\b/i,
  /^(can|could|would|should|do|does|is|are) (it|this|that|there)\b/i,
  // "What are X made of?" type questions
  /what (?:are|is) .{1,50} made of/i,
  /what (?:do|does) .{1,50} (look like|sound like|feel like|eat|want)/i,
  /what (?:would|could|should) .{1,50} (do|be|look|happen)/i,
  // Hypothetical/speculative questions
  /^if (you|we|they|someone|a|an|the)\b/i,
  /\bwhat if\b/i,
  /\bhypothetically\b/i,
  /\btheoretically\b/i,
  // Opinion seeking
  /^(thoughts on|opinions? on|what do you think about)\b/i,
  /your (thoughts|opinion|take) on/i,
  /\bwhat'?s? your (favorite|least favorite|best|worst)\b/i,
  // "Has anyone" / "Does anyone" patterns
  /^has (anyone|anybody|someone) (ever|here)\b/i,
  /^does (anyone|anybody|someone) (know|have|remember|think)\b/i,
  // Definition/explanation seeking
  /^what (?:exactly )?(?:is|are) (?:a |an |the )?(?:\w+\s?){1,4}\??$/i,  // "What is a UFO?" "What are cryptids?"
  /^(explain|define|eli5|tldr)\b/i,
  // V11.8 — "Is it better/safer/possible/ok to X?" comparison-question
  // opener. Smoke #7 surface: a grain-spawn cultivation question
  // ("Is it better to have my grain spawn colonize at 72F…") slipped
  // through because the previous patterns required a wh-word lead.
  /^is\s+it\s+(?:better|safer|worse|fine|ok|okay|good|bad|possible|wise|smart|stupid|normal|common|weird|strange)\b/i,
  // V11.8 — "Should I X?" how-to opener.
  /^should\s+i\s+(?:use|do|try|wait|change|adjust|increase|decrease|run|set|put|switch|stop|start|continue|buy|sell|sell|take|smoke|drop)\b/i,
];

// Spam URL patterns
export const SPAM_URL_PATTERNS = [
  /etsy\.com/i,
  /redbubble\.com/i,
  /teepublic\.com/i,
  /society6\.com/i,
  /zazzle\.com/i,
  /spreadshirt\.com/i,
  /cafepress\.com/i,
  /teespring\.com/i,
  /printful\.com/i,
  /patreon\.com/i,
  /ko-fi\.com/i,
  /buymeacoffee\.com/i,
  /gumroad\.com/i,
  /linktr\.ee/i,
  /bit\.ly/i,
  /tinyurl\.com/i,
  /onlyfans\.com/i,
  // YouTube and video platforms (self-promotion)
  /youtube\.com\/(?:channel|c|user|@)/i,
  /youtube\.com\/shorts/i,
  /youtu\.be/i,
  // Social media self-promo
  /tiktok\.com\/@/i,
  /instagram\.com\/(?!p\/)/i,  // Profile links, not post links
  /twitter\.com\/(?!.*\/status\/)/i,  // Profile links, not tweet links
  /discord\.gg/i,
  /t\.me\//i,  // Telegram
  // Crowdfunding
  /kickstarter\.com/i,
  /indiegogo\.com/i,
  /gofundme\.com/i,
];

// Patterns for content that is PRIMARILY just links (link-spam)
export const LINK_HEAVY_PATTERNS = [
  // Content that's just a link with minimal text
  /^.{0,50}https?:\/\/.{10,}$/i,  // Very short text followed by URL
  /^\[?https?:\/\/[^\]]+\]?\(?https?:\/\/[^\)]+\)?$/i,  // Just markdown links
];

// ============================================================================
// V11.7 — NON-ENGLISH CONTENT DETECTOR
// ============================================================================
//
// Paradocs is English-only for the V1 launch. Posts in other languages (most
// commonly Portuguese, Spanish, and French on the spiritual/esoteric subs)
// reach the adapter pipeline and pass quality filters because the regex
// patterns are English-tuned and don't fire on non-English text. They then
// produce broken AI titles / narratives downstream. This detector catches
// non-English text BEFORE Haiku/Sonnet ever runs.
//
// Two cheap heuristics on the first 1000 chars of the description:
//   1. Diacritic frequency: Latin diacritic chars / total alphabetic chars
//      > 2.5%. Catches Romance languages (Portuguese, Spanish, French,
//      Italian) and most non-English Latin-script languages. English
//      borrowed terms like "café" or "déjà vu" stay well under 1%.
//   2. Non-English stopword density: counts ~50 common Romance/Germanic
//      function words that almost never appear in English text. ≥3 hits
//      with fewer English stopwords nearby → non-English.
//
// Returns true if the text appears non-English. Intentionally
// false-positive-conservative.

var NON_ENGLISH_STOPWORDS_RE = /\b(que|para|los|las|como|muy|porque|tambien|também|não|nao|muito|essa|esse|isso|uma|este|estos|estas|sou|estou|sei|isto|aqui|onde|qualquer|nosso|nossa|seus|suas|mesmo|mesma|todo|todos|nada|alguns|sempre|nunca|então|ainda|depois|antes|também|sobre|entre|dentro|fora|junto|menos|mais|bem|melhor|grande|pode|pude|sido|estar|temos|têm|tinha|será|foi|foram|fazer|disse|dizer|esto|esta|donde|cuando|hablar|hablo|estoy|tengo|hace|hacer|cuando|porque|allá|alli|c'est|n'est|nous|vous|ils|elles|cette|avec|sans|pour|alors|comme|peut|être|avoir|toute|toutes|leur|leurs|aussi|sehr|nicht|ich|du|er|sie|wir|ihr|ist|war|sind|werden|haben|hatte|kann|sein|seine|meine|deine|eine|einen|der|die|das|den|dem|des|und|oder|aber|weil|wenn|nach|vor|bei|von|mit|für|über|unter|durch|ohne|gegen|zwischen)\b/gi;

var ENGLISH_STOPWORDS_RE = /\b(the|and|of|to|in|that|is|was|for|on|with|as|by|at|from|this|but|not|are|were|have|has|had|been|i'?m|i'?ve|i'?ll|we'?re|they'?re|it'?s|don'?t|didn'?t|can'?t|won'?t|shouldn'?t|wouldn'?t|couldn'?t|me|my|we|us|our|i)\b/gi;

var LATIN_DIACRITIC_RE = /[áàâãäåéèêëíìîïóòôõöúùûüñçÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ]/g;
var TOTAL_LATIN_LETTER_RE = /[A-Za-zÀ-ÿ]/g;

export function isLikelyNonEnglish(text: string): boolean {
  if (!text || text.length < 100) return false;
  var head = text.substring(0, 1000);

  // Heuristic 1: diacritic frequency
  var diacritics = (head.match(LATIN_DIACRITIC_RE) || []).length;
  var totalLetters = (head.match(TOTAL_LATIN_LETTER_RE) || []).length;
  if (totalLetters > 0 && diacritics / totalLetters > 0.025) {
    return true;
  }

  // Heuristic 2: non-English stopword density vs English stopwords
  var nonEnglishHits = (head.match(NON_ENGLISH_STOPWORDS_RE) || []).length;
  var englishHits = (head.match(ENGLISH_STOPWORDS_RE) || []).length;
  if (nonEnglishHits >= 3 && englishHits < nonEnglishHits) {
    return true;
  }

  return false;
}

// ============================================================================
// QUALITY SCORING SYSTEM
// ============================================================================

export interface QualityScore {
  total: number;  // 0-100
  lengthScore: number;  // 0-25
  detailScore: number;  // 0-25
  coherenceScore: number;  // 0-25
  sourceScore: number;  // 0-25
  breakdown: {
    wordCount: number;
    hasLocation: boolean;
    hasDate: boolean;
    hasWitnesses: boolean;
    hasTimeOfDay: boolean;
    hasWeather: boolean;
    sentenceCount: number;
    avgSentenceLength: number;
    sourceCredibility: string;
  };
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
  qualityScore?: QualityScore;
}

// Source credibility rankings (0-25 scale)
const SOURCE_CREDIBILITY: Record<string, number> = {
  'bfro': 22,        // Established organization with standards
  'nuforc': 20,      // Long-running database with verification
  'mufon': 22,       // Major UFO organization
  'wikipedia': 18,   // Curated but secondary source
  'reddit': 15,      // User-submitted, variable quality
  'shadowlands': 12, // Less moderated
  'ghostsofamerica': 12, // Community submissions
  // Session 10: New sources
  'youtube': 14,     // Video transcripts, variable quality
  'news': 18,        // News articles, generally reliable
  'erowid': 16,      // Structured self-reports, good format
  'podcast': 15,     // Transcript-based, moderate quality
  'government': 22,  // Official government documents
  'default': 10,
};

// BFRO class mapping for additional source credibility boost
export const BFRO_CLASS_BOOST: Record<string, number> = {
  'Class A': 5,   // Clear sighting
  'Class B': 2,   // Possible sighting
  'Class C': 0,   // Secondhand
};

/**
 * Calculate length score based on description word count
 * Diminishing returns after optimal length
 */
function calculateLengthScore(text: string): number {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount < 50) return Math.floor(wordCount / 5);  // 0-10 for short
  if (wordCount < 150) return 10 + Math.floor((wordCount - 50) / 10);  // 10-20
  if (wordCount < 500) return 20 + Math.floor((wordCount - 150) / 70);  // 20-25
  return 25;  // Max score for 500+ words
}

/**
 * Calculate detail score based on specific details present
 */
function calculateDetailScore(text: string): number {
  let score = 0;
  const lowerText = text.toLowerCase();

  // Location details (5 points each, max 10)
  const locationPatterns = [
    /\b(near|at|in|by)\s+[A-Z][a-z]+/,  // Named location
    /\b\d+\s*(mile|kilometer|km|ft|feet|yard|meter)s?\b/i,  // Distance
    /\b(highway|road|street|avenue|route)\s*\d*/i,  // Road reference
    /\b(forest|woods|mountain|lake|river|creek|field|farm|park)\b/i,  // Terrain
  ];
  let locationPoints = 0;
  for (const pattern of locationPatterns) {
    if (pattern.test(text)) locationPoints += 3;
  }
  score += Math.min(locationPoints, 10);

  // Time details (5 points)
  const timePatterns = [
    /\b\d{1,2}:\d{2}\s*(am|pm)?\b/i,  // Specific time
    /\b(morning|afternoon|evening|night|midnight|dawn|dusk)\b/i,
    /\b(around|about|approximately)\s*\d+\s*(am|pm|o'clock)/i,
  ];
  if (timePatterns.some(p => p.test(text))) score += 5;

  // Date details (3 points)
  const datePatterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
    /\b(last|this)\s+(week|month|year|summer|winter|spring|fall)\b/i,
  ];
  if (datePatterns.some(p => p.test(text))) score += 3;

  // Witness details (4 points)
  if (/\b(witness|saw|observed|noticed|spotted)\b/i.test(lowerText)) score += 2;
  if (/\b(my (wife|husband|friend|brother|sister|mother|father|son|daughter)|we both|together)\b/i.test(lowerText)) score += 2;

  // Physical description (3 points)
  if (/\b(\d+\s*(foot|feet|ft|inch|meter|tall|high|wide|long))\b/i.test(text)) score += 3;

  return Math.min(score, 25);
}

/**
 * Calculate coherence score based on text structure
 */
function calculateCoherenceScore(text: string): number {
  let score = 0;

  // Count sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const sentenceCount = sentences.length;

  // Proper sentence count (5 points)
  if (sentenceCount >= 3) score += 3;
  if (sentenceCount >= 5) score += 2;

  // Average sentence length check (5 points)
  if (sentences.length > 0) {
    const avgLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    if (avgLength >= 8 && avgLength <= 30) score += 5;  // Good sentence length
    else if (avgLength >= 5 && avgLength <= 40) score += 3;  // Acceptable
  }

  // Paragraph structure (5 points)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
  if (paragraphs.length >= 2) score += 3;
  if (paragraphs.length >= 3) score += 2;

  // First person narrative (5 points) - indicates personal experience
  if (/\b(I|we|my|our)\b/.test(text)) score += 3;
  if (/\b(I saw|I heard|I felt|I noticed|I remember|I was)\b/i.test(text)) score += 2;

  // Logical flow indicators (5 points)
  const flowWords = ['then', 'after', 'before', 'suddenly', 'when', 'while', 'as soon as', 'next', 'finally'];
  const flowCount = flowWords.filter(w => text.toLowerCase().includes(w)).length;
  score += Math.min(flowCount, 5);

  return Math.min(score, 25);
}

/**
 * Calculate source credibility score
 */
function calculateSourceScore(sourceType: string, metadata?: Record<string, any>): number {
  let score = SOURCE_CREDIBILITY[sourceType] || SOURCE_CREDIBILITY['default'];

  // Apply BFRO class boost if applicable
  if (sourceType === 'bfro' && metadata?.bfroClass) {
    score += BFRO_CLASS_BOOST[metadata.bfroClass] || 0;
  }

  // Apply Reddit engagement boost
  if (sourceType === 'reddit' && metadata?.score) {
    if (metadata.score > 100) score += 5;
    else if (metadata.score > 50) score += 3;
    else if (metadata.score > 20) score += 1;
  }

  return Math.min(score, 25);
}

/**
 * Calculate complete quality score for a report
 */
export function calculateQualityScore(
  report: ScrapedReport,
  metadata?: Record<string, any>
): QualityScore {
  const text = `${report.title} ${report.description}`;
  const lowerText = text.toLowerCase();

  const lengthScore = calculateLengthScore(report.description);
  const detailScore = calculateDetailScore(text);
  const coherenceScore = calculateCoherenceScore(report.description);
  const sourceScore = calculateSourceScore(report.source_type, metadata);

  const sentences = report.description.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const wordCount = report.description.split(/\s+/).filter(w => w.length > 0).length;

  return {
    total: lengthScore + detailScore + coherenceScore + sourceScore,
    lengthScore,
    detailScore,
    coherenceScore,
    sourceScore,
    breakdown: {
      wordCount,
      hasLocation: !!report.location_name || /\b(near|at|in)\s+[A-Z][a-z]+/.test(text),
      hasDate: !!report.event_date,
      hasWitnesses: /\b(witness|together|we both)\b/i.test(lowerText),
      hasTimeOfDay: /\b(morning|afternoon|evening|night|midnight|dawn|dusk|\d{1,2}:\d{2})\b/i.test(lowerText),
      hasWeather: /\b(rain|snow|fog|cloudy|clear|sunny|storm|wind)\b/i.test(lowerText),
      sentenceCount: sentences.length,
      avgSentenceLength: sentences.length > 0
        ? Math.round(sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length)
        : 0,
      sourceCredibility: report.source_type,
    }
  };
}

// ============================================================================
// MAIN FILTER FUNCTION
// ============================================================================

/**
 * Main filter function - determines if content should be ingested
 * Returns passed: true if content is acceptable, false if it should be rejected
 */
export function filterContent(
  title: string,
  description: string,
  sourceType: string,
  options?: {
    checkMeta?: boolean;
    checkFiction?: boolean;
    checkLowEffort?: boolean;
    checkSpam?: boolean;
    checkNonExperience?: boolean;
    checkLanguage?: boolean;
    minLength?: number;
  }
): FilterResult {
  const opts = {
    checkMeta: true,
    checkFiction: true,
    checkLowEffort: true,
    checkSpam: true,
    checkNonExperience: true,
    checkLanguage: true,
    minLength: 100,
    ...options
  };

  const combinedText = `${title} ${description}`;
  const lowerText = combinedText.toLowerCase();

  // Determine if this is a Reddit comment (comments are responses, often first-hand accounts)
  const isComment = sourceType === 'reddit-comments';

  // Strong first-person narrative signals (positive indicator for experiences)
  const hasFirstPersonExperience = /\b(I|we)\s+(saw|heard|felt|experienced|encountered|witnessed|noticed|remember|was there|had a|have had)\b/i.test(description);
  const hasStoryMarkers = /\b(this happened|it happened|one time|one night|a few years ago|back in|when I was)\b/i.test(description);

  // Check minimum length
  if (description.length < opts.minLength) {
    return { passed: false, reason: `Content too short (${description.length} < ${opts.minLength} chars)` };
  }

  // Check for deleted/removed content
  if (description === '[removed]' || description === '[deleted]') {
    return { passed: false, reason: 'Content was deleted or removed' };
  }

  // V11.17.39 (#22) — Paranormal-bearing gate for YouTube comments.
  //
  // YouTube adapter scrapes comments on paranormal channels (Jesse Michels,
  // Anthony Chene, Next Level Soul, etc.), but the COMMENTS themselves are
  // a firehose of all dramatic personal stories — not just paranormal ones.
  // Spot-check verification surfaced three landed reports that shouldn't
  // exist on Paradocs:
  //   - "Lightning Strike Blindness During Havana Storm" (medical incident)
  //   - "Charging Bull Elephant Pursues Safari Vehicle" (wildlife)
  //   - "Pier Stargazing Shifts Witness's Perception of Space" (vague awe)
  // All three passed length + first-person + dramatic-narrative checks.
  // None contained any anomalous-experience signal.
  //
  // Fix: when the source is YouTube-comments-derived, require at least one
  // anomalous-experience keyword somewhere in title+description, OR a
  // pre-set category. The keyword list spans the major Paradocs phenomenon
  // categories. Costs ~0 (regex), zero false positives on real paranormal
  // content (a YouTube comment about a shadow figure includes "shadow").
  //
  // Scoped to YouTube only — Reddit/NDERF/OBERF/ADCRF have curation upstream.
  const isYouTube = sourceType === 'youtube' || sourceType === 'youtube-comments'
  if (isYouTube) {
    const PARANORMAL_KEYWORDS = /\b(ufo|uap|alien|extraterrestrial|abduct|implant|saucer|disc|orb|triangle|cigar.shaped|tic.tac|ghost|spirit|apparition|phantom|haunt|poltergeist|shadow.figure|shadow.person|shadow.man|hat.man|cryptid|bigfoot|sasquatch|dogman|skinwalker|wendigo|mothman|chupacabra|loch.ness|lake.monster|nde|near.death|out.of.body|astral|astral.projection|life.review|tunnel.of.light|precognit|premonit|telepath|telekines|psychokines|clairvoyan|psychic|possession|possessed|exorcism|demon|djinn|entity|angel|deity|paranormal|supernatural|anomal|synchronic|deja.vu|time.slip|missing.time|mandela.effect|manifestation|apport|reincarnat|past.life|witchcraft|spell|ritual|sigil|ouija|spirit.board|seance|medium(ship)?|channeling|automatic.writing|levitat|telepor|materializ|sleep.paralysis|hag|incubus|succubus|tulpa)\b/i
    if (!PARANORMAL_KEYWORDS.test(combinedText)) {
      return {
        passed: false,
        reason: 'YouTube source has no paranormal-bearing keywords in title or description (filtered to prevent non-anomalous content like medical/wildlife/awe reports)',
      };
    }
  }

  // V11.7 — Non-English content gate. Paradocs is English-only for the
  // V1 launch. Posts in Portuguese / Spanish / French would otherwise
  // pass quality filters (they're English-tuned) and produce broken AI
  // titles + narratives downstream. Catches them before Haiku/Sonnet
  // ever runs. Skipped for curated sources via assessQuality wiring.
  if (opts.checkLanguage && isLikelyNonEnglish(description)) {
    return { passed: false, reason: 'Non-English content detected' };
  }

  // Check meta post patterns - ONLY for posts, not comments
  // Comments on meta threads often contain actual first-hand experiences
  if (opts.checkMeta && !isComment) {
    for (const pattern of META_POST_PATTERNS) {
      if (pattern.test(combinedText)) {
        return { passed: false, reason: `Meta post pattern: ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // For comments: if they have strong first-person experience markers, they're likely valid
  // Skip stricter filters for these as they're responding to prompts with actual experiences
  const isLikelyExperience = isComment && (hasFirstPersonExperience || hasStoryMarkers);

  // Check question-only patterns (titles that are just questions, not experiences)
  // Only apply to posts - comments don't have meaningful titles and are often valid responses
  if (!isComment) {
    for (const pattern of QUESTION_ONLY_PATTERNS) {
      if (pattern.test(title)) {
        return { passed: false, reason: `Question-only post (not an experience): ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // Check non-experience patterns (skip for comments that are clearly first-person experiences,
  // and skip for curated sources where "game" could mean "game trail" etc.)
  if (opts.checkNonExperience && !isLikelyExperience) {
    for (const pattern of NON_EXPERIENCE_PATTERNS) {
      if (pattern.test(combinedText)) {
        return { passed: false, reason: `Non-experience content: ${pattern.source.substring(0, 30)}...` };
      }
    }
    // V11 — description-lead anchors. These patterns use `^` to detect
    // posts that OPEN with a theory, position-statement, or URL-drop.
    // They run against the first 300 chars of description ONLY, not the
    // combined title+description (where the leading `^` would only ever
    // match the start of the title).
    var descLead = (description || '').substring(0, 300);
    for (const pattern of DESCRIPTION_LEAD_PATTERNS) {
      if (pattern.test(descLead)) {
        return { passed: false, reason: `Non-experience lead: ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // Check fiction patterns
  if (opts.checkFiction) {
    for (const pattern of FICTION_PATTERNS) {
      if (pattern.test(combinedText)) {
        return { passed: false, reason: `Fiction marker: ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // Check low effort patterns (only for title or very short content)
  if (opts.checkLowEffort && description.length < 200) {
    for (const pattern of LOW_EFFORT_PATTERNS) {
      if (pattern.test(title)) {
        return { passed: false, reason: `Low effort content: ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // Check name-only titles (creature names without experience context)
  for (const pattern of NAME_ONLY_TITLE_PATTERNS) {
    if (pattern.test(title.trim())) {
      // Only reject if description also lacks first-person narrative
      const hasFirstPerson = /\b(I|we|my|our)\s+(saw|heard|felt|experienced|encountered|witnessed|noticed)\b/i.test(description);
      if (!hasFirstPerson) {
        return { passed: false, reason: `Name-only title without personal experience` };
      }
    }
  }

  // Check spam URLs
  if (opts.checkSpam) {
    for (const pattern of SPAM_URL_PATTERNS) {
      if (pattern.test(description)) {
        return { passed: false, reason: `Spam URL detected` };
      }
    }

    // Check for link-heavy content (posts that are just links with minimal text)
    for (const pattern of LINK_HEAVY_PATTERNS) {
      if (pattern.test(description.trim())) {
        return { passed: false, reason: `Link-heavy content (minimal text with URL)` };
      }
    }
  }

  return { passed: true };
}

/**
 * Full quality assessment - filters and scores content
 * Returns filter result with quality score if passed
 */
export function assessQuality(
  report: ScrapedReport,
  metadata?: Record<string, any>
): FilterResult & { qualityScore?: QualityScore } {
  // Get source-specific thresholds for minimum description length
  var thresholds = getSourceThresholds(report.source_type);

  // Curated/institutional sources (BFRO, NUFORC, NDERF, OBERF, IANDS, Erowid) are
  // field research reports, not social media posts — skip meta-post, low-effort,
  // and non-experience filters. These Reddit-tuned patterns cause false positives
  // on structured questionnaire content (e.g., NDERF/OBERF pages mention "survey"
  // in page chrome, triggering the meta-post heuristic).
  var isCuratedSource = ['bfro', 'nuforc', 'nderf', 'oberf', 'adcrf', 'iands', 'erowid'].indexOf(report.source_type) !== -1;

  // First run content filter with source-specific min length
  const filterResult = filterContent(
    report.title,
    report.description,
    report.source_type,
    {
      minLength: thresholds.minDescLength,
      checkMeta: !isCuratedSource,
      checkLowEffort: !isCuratedSource,
      checkNonExperience: !isCuratedSource,
      // Curated sources (NDERF/IANDS/OBERF/etc.) are English by curation;
      // skip the language detector to avoid false positives on legitimate
      // English text that happens to contain diacritics or borrowed terms.
      checkLanguage: !isCuratedSource,
    }
  );

  if (!filterResult.passed) {
    return filterResult;
  }

  // Calculate quality score
  const qualityScore = calculateQualityScore(report, metadata);

  return {
    passed: true,
    qualityScore
  };
}

// Source-specific quality thresholds
// Each source type can have custom approve/review cutoffs and minimum description lengths
// Sources not listed here fall through to the defaults (70/40)
var SOURCE_THRESHOLDS: Record<string, { approve: number; review: number; minDescLength: number }> = {
  // Government/FOIA — highest trust, lowest bar
  'government': { approve: 50, review: 30, minDescLength: 100 },
  'blackvault': { approve: 50, review: 30, minDescLength: 100 },
  'bluebook':   { approve: 50, review: 30, minDescLength: 100 },
  'foia':       { approve: 50, review: 30, minDescLength: 100 },
  'geipan':     { approve: 50, review: 30, minDescLength: 100 },

  // Academic / structured questionnaire — credible format, moderate bar
  'nderf':  { approve: 55, review: 35, minDescLength: 200 },
  'iands':  { approve: 55, review: 35, minDescLength: 200 },
  'oberf':  { approve: 55, review: 35, minDescLength: 200 },
  // V11.17.15 — ADCRF (Dr. Long's After-Death Communication archive).
  // Same questionnaire format as NDERF/OBERF; same moderate threshold.
  'adcrf':  { approve: 55, review: 35, minDescLength: 200 },

  // Investigation orgs — established standards, moderate bar
  'bfro':   { approve: 60, review: 40, minDescLength: 150 },
  // V11.17.13 — NUFORC bar raised pre-mass-ingestion. Table summaries are
  // 50-130 chars; the adapter auto-fetches the detail page to recover the
  // longer narrative. Lifting minDescLength 100 → 200 drops thin "saw a
  // light, 3 seconds" stubs that scored high only via the structural
  // +date/+location boosts. See nuforc.ts for paired detail-page auto-fetch
  // threshold and NUFORC-debunked-explanation rejection.
  'nuforc': { approve: 60, review: 40, minDescLength: 200 },
  'mufon':  { approve: 60, review: 40, minDescLength: 150 },

  // News — editorial oversight, moderate-high bar
  'news':   { approve: 65, review: 45, minDescLength: 200 },

  // Community / user-submitted — parity with NDE-form sources (55/35)
  // after May 2026 panel review.
  //
  // The thresholds were originally set 15 points higher than NDERF/IANDS
  // because Reddit/YouTube are uncurated at the source. But our adapter
  // pipeline runs extensive pre-scoring filters (META_POST_PATTERNS,
  // NON_EXPERIENCE_PATTERNS, QUESTION_TITLE_PATTERNS, LINK_HEAVY_PATTERNS,
  // FICTION_PATTERNS, LOW_EFFORT_PATTERNS, NAME_ONLY_TITLE_PATTERNS,
  // first-person body detection) — by the time content reaches scoring
  // it's functionally a first-person account, the same shape as NDERF.
  // Stricter threshold here was double-counting the "uncurated source"
  // penalty and tanking auto-approval rate.
  //
  // Goal: ~95% auto-approval at this score range, ~5% borderline →
  // admin queue. Admin-approval path now also fires Sonnet analysis
  // (report-review.ts), so pending reports get full AI copy as soon
  // as they're cleared.
  'reddit':           { approve: 55, review: 35, minDescLength: 300 },
  'reddit-v2':        { approve: 55, review: 35, minDescLength: 300 },
  'youtube':          { approve: 55, review: 35, minDescLength: 200 },
  'youtube-comments': { approve: 55, review: 35, minDescLength: 150 },

  // Ghost databases — typically short entries, lower bar
  'shadowlands':    { approve: 50, review: 30, minDescLength: 80 },
  'ghostsofamerica':{ approve: 50, review: 30, minDescLength: 80 },
  'paranormaldb-uk':{ approve: 50, review: 30, minDescLength: 80 },

  // Reference / historical — not eyewitness, lower bar
  'wikipedia':    { approve: 50, review: 30, minDescLength: 100 },
  'cryptid-wiki': { approve: 50, review: 30, minDescLength: 100 },

  // Erowid — needs paranormal dimension, higher bar
  'erowid': { approve: 70, review: 50, minDescLength: 300 },

  // Bulk imports (Kaggle/HuggingFace) — pre-cleaned, moderate bar
  'kaggle-import': { approve: 55, review: 35, minDescLength: 100 },
};

/**
 * Get source-specific thresholds, falling back to defaults
 */
export function getSourceThresholds(sourceType?: string): { approve: number; review: number; minDescLength: number } {
  if (sourceType && SOURCE_THRESHOLDS[sourceType]) {
    return SOURCE_THRESHOLDS[sourceType];
  }
  return { approve: 70, review: 40, minDescLength: 100 };
}

/**
 * Determine the status based on quality score and source type
 * Different sources have different approval thresholds — government sources
 * auto-approve at lower scores while community sources need higher scores
 */
export function getStatusFromScore(score: number, sourceType?: string): 'approved' | 'pending_review' | 'rejected' {
  var thresholds = getSourceThresholds(sourceType);
  if (score >= thresholds.approve) return 'approved';
  if (score >= thresholds.review) return 'pending_review';
  return 'rejected';
}

/**
 * Smart re-evaluation for borderline reports.
 *
 * When a report lands in pending_review, this checks WHY the score is low.
 * If the main penalty is short description length but the content has real
 * substance (first-hand details, location specifics, coherent narrative),
 * promote it to approved.
 *
 * This avoids overwhelming the admin review queue with legitimate short reports
 * from trusted sources like NUFORC, BFRO, etc.
 */
export function smartReEvaluate(
  qualityScore: QualityScore,
  report: { title: string; description: string; source_type: string; location_name?: string | null; event_date?: string | null; category?: string | null }
): { promote: boolean; reason: string } {
  var thresholds = getSourceThresholds(report.source_type);
  var shortfall = thresholds.approve - qualityScore.total;

  // Only re-evaluate if score is within 20 points of approval
  // (i.e., not a deeply low-quality report)
  if (shortfall > 20 || shortfall <= 0) {
    return { promote: false, reason: 'Score too far from threshold (shortfall: ' + shortfall + ')' };
  }

  var desc = report.description;
  var lowerDesc = desc.toLowerCase();
  var wordCount = qualityScore.breakdown.wordCount;
  var boostPoints = 0;
  var reasons: string[] = [];

  // Sources where EVERY submission is inherently a first-hand witness report.
  // These get a significant baseline boost because the source itself provides
  // structural credibility that the scoring dimensions can't capture.
  var witnessReportSources = ['nuforc', 'bfro', 'mufon', 'nderf', 'iands', 'oberf', 'adcrf'];
  var isWitnessSource = witnessReportSources.indexOf(report.source_type) !== -1;

  // Broader set of trusted, moderated sources (includes witness + government/academic)
  var trustedSources = ['nuforc', 'bfro', 'mufon', 'nderf', 'iands', 'oberf', 'adcrf', 'government', 'blackvault', 'geipan', 'foia', 'bluebook'];
  var isTrusted = trustedSources.indexOf(report.source_type) !== -1;

  // 1. Witness-report source baseline boost
  // NUFORC, BFRO, etc. are curated databases where every submission is a real
  // witness report. A short NUFORC report still has editorial value — the witness
  // took time to submit it through a structured form with location/date/shape fields.
  if (isWitnessSource) {
    boostPoints += 8;
    reasons.push('Witness-report source (' + report.source_type.toUpperCase() + ')');
  }

  // 2. Length is the main penalty — check if lengthScore is disproportionately low
  var nonLengthScore = qualityScore.detailScore + qualityScore.coherenceScore + qualityScore.sourceScore;
  var nonLengthMax = 75; // 3 dimensions × 25 max each
  var nonLengthPct = nonLengthScore / nonLengthMax;

  if (qualityScore.lengthScore < 15 && nonLengthPct >= 0.45) {
    boostPoints += 5;
    reasons.push('Short but other dimensions solid (' + Math.round(nonLengthPct * 100) + '%)');
  }

  // 3. First-person account indicators — strong value even when brief
  var firstPersonPatterns = [
    /\bI\s+(saw|seen|noticed|observed|watched|heard|felt|smelled|looked|was)\b/i,
    /\bmy\s+(friend|wife|husband|daughter|son|family|partner|dog|cat|neighbor|brother|sister|mother|father|boyfriend|girlfriend|coworker)\b/i,
    /\bwe\s+(were|saw|noticed|heard|both|all|drove|walked|looked|went)\b/i,
    /\bwoke\s+(up|me)\b/i,
    /\blooking\s+(at|out|up|through|down|around)\b/i,
    /\b(I|we)\s+(couldn't|could not|can't|did not|didn't)\s+(believe|explain|understand|identify|sleep)\b/i,
    /\b(scared|frightened|terrified|amazed|shocked|startled|confused|awestruck)\b/i,
  ];
  var firstPersonCount = firstPersonPatterns.filter(function(p) { return p.test(desc); }).length;
  if (firstPersonCount >= 2) {
    boostPoints += 5;
    reasons.push('First-hand account (' + firstPersonCount + ' indicators)');
  } else if (firstPersonCount === 1) {
    boostPoints += 3;
    reasons.push('Likely first-hand account');
  }

  // 4. Specific observational details — timestamps, distances, directions
  var specificityPatterns = [
    /\b\d{1,2}:\d{2}\s*(am|pm|a\.m\.|p\.m\.)?/i,               // Exact time
    /\b(approximately|about|roughly|estimated|around)\s+\d+/i,   // Estimated measurements
    /\b(north|south|east|west|northeast|northwest|southeast|southwest)\b/i, // Compass directions
    /\b(seconds?|minutes?|hours?)\b/i,                           // Duration mentions
    /\b(altitude|height|elevation|distance|feet|foot|meters?|miles?|yards?|inches?|kilometers?)\b/i, // Spatial
    /\b(triangle|triangular|sphere|spherical|disc|disk|cigar|oval|diamond|cylinder|orb|chevron|boomerang)\b/i, // Shape description
    /\b(red|green|blue|white|orange|yellow|amber|silver|black)\s+(light|glow|color|object|craft)\b/i, // Color + object
  ];
  var specificityCount = specificityPatterns.filter(function(p) { return p.test(desc); }).length;
  if (specificityCount >= 3) {
    boostPoints += 5;
    reasons.push('High specificity (' + specificityCount + ' detail types)');
  } else if (specificityCount >= 1) {
    boostPoints += 3;
    reasons.push('Some specificity (' + specificityCount + ')');
  }

  // 5. Structured metadata from a trusted source
  if (isTrusted && qualityScore.breakdown.hasLocation && qualityScore.breakdown.hasDate) {
    boostPoints += 5;
    reasons.push('Trusted source with complete metadata');
  } else if (isTrusted && (qualityScore.breakdown.hasLocation || qualityScore.breakdown.hasDate)) {
    boostPoints += 3;
    reasons.push('Trusted source with partial metadata');
  }

  // V11.14.7 — DATE + LOCATION STRUCTURAL BOOST (any source).
  // Chase explicitly called this out: "reports with dates AND
  // locations should be prioritized". Independent of source trust,
  // a report that names a specific date AND a specific place is
  // structurally a witness account with verifiable scaffolding.
  // This is the single strongest signal we have outside of body text.
  // Sized so a 35-49 borderline Reddit report (currently pending) gets
  // promoted automatically if both metadata fields are populated.
  if (qualityScore.breakdown.hasLocation && qualityScore.breakdown.hasDate) {
    boostPoints += 10;
    reasons.push('Has both date + location (structural witness signal)');
  } else if (qualityScore.breakdown.hasLocation || qualityScore.breakdown.hasDate) {
    boostPoints += 4;
    reasons.push('Has ' + (qualityScore.breakdown.hasDate ? 'date' : 'location') + ' (partial metadata)');
  }

  // 6. Sensory details — seeing, hearing, feeling — indicate real experience
  var sensoryPatterns = [
    /\b(bright|dim|glowing|flashing|pulsing|shimmering|luminous|lit up|illuminat)\b/i,
    /\b(loud|quiet|humming|buzzing|silent|noise|sound|rumbl|roar|whir|hiss)\b/i,
    /\b(cold|warm|tingling|pressure|vibrat|numb|sick|dizzy|goosebumps|hair.*stood)\b/i,
    /\b(smell|odor|stench|sulfur|ozone|burning|metallic)\b/i,
  ];
  var sensoryCount = sensoryPatterns.filter(function(p) { return p.test(desc); }).length;
  if (sensoryCount >= 2) {
    boostPoints += 3;
    reasons.push('Multiple sensory details');
  } else if (sensoryCount === 1) {
    boostPoints += 1;
    reasons.push('Sensory detail present');
  }

  // Decision: promote if boost points exceed the shortfall
  if (boostPoints >= shortfall) {
    return {
      promote: true,
      reason: 'Auto-promoted: ' + reasons.join(', ') + ' (boost: +' + boostPoints + ', needed: ' + shortfall + ')'
    };
  }

  return {
    promote: false,
    reason: 'Insufficient content signals (boost: +' + boostPoints + ', needed: ' + shortfall + '): ' + (reasons.length > 0 ? reasons.join(', ') : 'no strong indicators')
  };
}

/**
 * Quick check if content is obviously low quality (for early rejection)
 */
export function isObviouslyLowQuality(title: string, description: string): boolean {
  // Very short
  if (description.length < 50) return true;

  // All caps
  if (title === title.toUpperCase() && title.length > 10) return true;

  // Mostly punctuation or special characters
  const alphanumeric = description.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length < description.length * 0.5) return true;

  // Repetitive content
  if (/(.{10,})\1{2,}/.test(description)) return true;

  // Single-word cryptid names as titles (not experiences)
  const nameOnlyPatterns = [
    /^(bigfoot|sasquatch|yeti|mothman|chupacabra|jackalope|wendigo|skinwalker|dogman)$/i,
    /^(thunderbird|jersey devil|loch ness|nessie|ogopogo|champ)$/i,
    /^(ghost|apparition|poltergeist|shadow person|demon|tulpa)s?$/i,
    /^(ufo|uap|orb|nde|obe)s?$/i,
  ];
  for (const pattern of nameOnlyPatterns) {
    if (pattern.test(title.trim())) return true;
  }

  // Question-only titles (not personal experiences)
  const questionOnlyPatterns = [
    /^what (are|is|do|does|would|could|should|might|can)\b/i,
    /^(why|how|where|when) (are|is|do|does|would|could|should|can)\b/i,
    /^(does|do|is|are|can|could|would|should) (anyone|anybody|someone|you|we|they)\b/i,
    /what (?:are|is) .{1,50} made of/i,
    /^what (?:exactly )?(?:is|are) (?:a |an |the )?(?:\w+\s?){1,4}\??$/i,
    /^(thoughts on|opinions? on|what do you think)\b/i,
    /^has (anyone|anybody) (ever|here)\b/i,
    /^does (anyone|anybody) (know|have|remember)\b/i,
  ];

  for (const pattern of questionOnlyPatterns) {
    if (pattern.test(title)) return true;
  }

  // V11.15.4 — Solicitations / news synthesis / meta-commentary / debate
  // posts. Sample reports that motivated this set: "Radio Host Seeks
  // Bigfoot Witness Interview", "1947 ABC News radio report documents...",
  // "A user reframes the UAP debate", "calls out UFO disclosure
  // advocates", "connects David Grusch's testimony... into a single
  // cascading premise". None of these are first-person witness accounts.
  const titleAndBody = (title + '\n' + description).slice(0, 2000)
  const metaPatterns: RegExp[] = [
    // Solicitation
    /\b(seeks?|seeking|soliciting|recruiting|looking for|need)\s+(first[-\s]?hand\s+)?(witness(es)?|accounts?|stories|encounters|testimon(y|ies))\b/i,
    /\bfor\s+(my|our)\s+(podcast|radio\s+show|interview\s+series|documentary|youtube\s+channel)\b/i,
    /\binterview\s+series\b/i,
    // V11.17.26 — Bug #13: recruitment / community-pitch / "join us"
    // patterns. Triggering report: "Any fellow Mainers into ITC or
    // paranormal investigation? Just putting this out there in case
    // there are others in Maine into paranormal research..."
    /\bany\s+fellow\s+\w+(er|ers|ans|ites|ites)?\b/i,                          // "Any fellow Mainers", "any fellow researchers"
    /\bjust\s+putting\s+this\s+out\s+there\b/i,                                // "Just putting this out there"
    /\bin\s+case\s+(there\s+(are|might\s+be)|anyone\s+(is|else))\s+(others?|interested|out\s+there)\b/i,
    /\b(seeks?|seeking|looking\s+for|recruiting|wants?|want\s+to\s+find)\s+(fellow|other|local|nearby)\s+(researchers?|investigators?|collaborators?|enthusiasts?|members?|hobbyists?|practitioners?|paranormal|ufo|cryptid|witch(es)?|psychic(s)?|medium(s)?)\b/i,
    /\b(seeks?|seeking|looking\s+for|recruiting|wants?)\s+(collaborators?|partners?|teammates?|members?)\b/i,
    /\b(if\s+you'?(d|re)\s+(be\s+)?(interested|willing|down|into|game)|dm\s+me\s+if|message\s+me\s+if|reach\s+out\s+if|hit\s+me\s+up\s+if)\b/i,
    /\bjoin\s+(us|our|the|a|my)(\s+\w+){0,3}\s+(community|group|team|forum|server|discord|sub(reddit)?|patreon|telegram|whatsapp|signal|club|meetup|society)\b/i,
    /\bjoin\s+us\s+(if|today|tonight|now|here|on|at|in)\b/i,                   // bare "join us if/today/etc" — recruitment ask
    /\b(starting|started|forming|forming\s+up)\s+(a|an|our|the|my)(\s+\w+){0,3}\s+(group|community|team|club|investigation|research\s+(group|team))\b/i,
    /\b(check\s+out|come\s+(visit|check\s+out)|drop\s+by|stop\s+by|head\s+to|swing\s+by)\s+(my|our)\s+(channel|sub|page|site|website|podcast|substack|stream|server)\b/i,
    /\bnew\s+to\s+(the\s+)?(sub|community|forum|reddit|group)\b.{0,40}\b(introduc|introduce|hello|hi everyone|hi all)\b/i,
    /\bpromot(ing|e|ion)\s+(my|our)\s+(book|channel|podcast|substack|patreon|kickstarter|gofundme)\b/i,
    // V11.17.27 — Database/registry meta-discussion patterns. Triggering
    // reports: "396 New UFO Reports Posted to NUFORC Database", "657 UFO
    // Reports Posted at NUFORC in October", "NUFORC Database Updated With
    // 422 November Reports", "NUFORC Maintains Stricter Vetting Than MUFON
    // Alaska Reports", "Sixty-Five Drone Reports in One Week". These are
    // r/UFOs posts ABOUT registries, not first-person experiences.
    /\b\d+\s+(new\s+)?(ufo\s+)?(reports?|sightings?|cases?|encounters?|submissions?|accounts?)\s+(posted|added|received|received\s+by|published|logged|filed)\s+(to|at|in|by|with)\s+(NUFORC|MUFON|the\s+\w+\s+(database|databank|archive|registry|center))\b/i,
    /\b(NUFORC|MUFON|the\s+\w+\s+(database|databank|archive|registry|center))\s+(database|databank|archive|registry)?\s*(updated|update|added|publishes?|posts?|logs?|logged|received|maintains|filters?|screens?)\b/i,
    /\bNUFORC\s+(database\s+)?(updated\s+)?with\s+\d+/i,
    /\b\d+\s+(reports?|sightings?|cases?)\s+(posted|added|received|published)\s+at\s+NUFORC\b/i,
    /\b(comparing|compared|comparison\s+of)\s+(NUFORC|MUFON|UFO\s+(reports|databases|registries))\b/i,
    /\b(NUFORC|MUFON)\s+(reports?|sightings?|cases?|data|database|archive|collection)\s+(reveals?|shows?|indicates?|suggest|proves?|demonstrates?)\b/i,
    // r/UFOs / r/aliens meta-analysis vocabulary that doesn't appear in
    // first-person experience reports: "X reports defy Y", "X stable
    // visual signature", "patterns across X reports".
    /\b(\d+\s+|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)[-\s]?(?:five|six|seven|eight|nine|two|three|four|one)?\s+)?(reports?|sightings?|cases?|encounters?|accounts?|drone\s+reports?)\s+(defy|defying|defies)\s+(identification|explanation|debunking)\b/i,
    /\b(stable|consistent|recurring|persistent)\s+(visual\s+)?(signature|pattern|features?|geometry|geometries|morphology)\s+(across|in|among)\s+(reports?|sightings?|cases?|the\s+(data|cohort|corpus|set))\b/i,
    /\bpatterns?\s+(across|among|in)\s+\d+\s+(reports?|sightings?|cases?|submissions?|accounts?)\b/i,
    // Historical news synthesis
    /\b(ABC|CBS|NBC|CNN|BBC|FOX|NPR|AP|Reuters)\s+(News|news|radio|report|tv|article)\b/,
    /\bdocumented\s+by\s+(ABC|CBS|NBC|CNN|BBC|FOX|NPR)\b/i,
    // Meta-commentary about disclosure / the debate
    /\b(the|UAP|UFO)\s+disclosure\s+(debate|movement|community|advocates?)\b/i,
    /\b(reframes?|reframing)\s+(the\s+)?(UAP|UFO|disclosure|debate|argument)\b/i,
    /\bcalls?\s+out\s+(\w+\s+)?(advocates?|insiders?|whistleblowers?|figures?)\b/i,
    /\binvert(ing|s|ed)?\s+the\s+burden\s+of\s+proof\b/i,
    // Synthesis posts
    /\bconnects?\s+\w+(\s+\w+)?(['']s)?\s+(congressional\s+)?(testimony|claims?|allegations?)\b.{0,80}\b(into|with)\s+(a\s+)?(single|cascading|broader)\b/i,
  ];
  for (const pattern of metaPatterns) {
    if (pattern.test(titleAndBody)) return true;
  }

  return false;
}
