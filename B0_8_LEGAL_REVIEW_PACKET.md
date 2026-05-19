# Paradocs — Legal review packet (B0.8)

One-page brief for outside counsel. Pre-launch (≤1k users today; targeting
mass-market launch within weeks).

## What Paradocs does

Paradocs (`discoverparadocs.com`) is a paranormal-experience archive and
analysis platform. Users browse and search:

  1. **First-party submissions** — text and video reports of paranormal
     experiences contributed directly by registered users. Videos are
     transcribed (Whisper) and analyzed (Claude Sonnet) into a Paradocs
     editorial summary.
  2. **Third-party ingested content** — paranormal-experience reports
     pulled from public archives (NUFORC, OBERF, NDERF, and planned
     additions Reddit and YouTube). Each ingested report is AI-rewritten
     into a Paradocs editorial narrative, with source attribution +
     external link.

## What we need counsel to opine on

### 1. Ingested third-party content (highest priority)

Paradocs ingests publicly-accessible reports from:

  - **NUFORC** (`nuforc.org`) — National UFO Reporting Center, public
    sightings database
  - **OBERF / NDERF** (`oberf.org`, `nderf.org`) — Out-of-Body and Near-
    Death Experience Research Foundation, public testimony archives
  - **Reddit** (planned) — public subreddit text posts about paranormal
    experiences. No private content; no DMs.
  - **YouTube** (planned) — public video metadata + transcripts of
    paranormal-experience uploads

For each:
  - Paradocs stores the source URL and source label
  - The original verbatim text is **scrubbed before client render**
    (we never display the source content directly; only an AI-
    rewritten Paradocs narrative is shown)
  - The Paradocs report page includes a prominent "Read original at
    [source] →" link back to the original
  - We honor any takedown request via a Source-level admin tool that
    removes all reports from a given source

**Questions for counsel:**

  1. Does our usage qualify as transformative use under U.S. fair use,
     given the AI rewrite + analysis lens + sourceback link?
  2. For Reddit and YouTube specifically, do we need user-level opt-in,
     or is the original platform's public posting terms sufficient?
  3. What disclosures should appear on the report page, the privacy
     policy, and the source attribution block?
  4. Recommended ToS language for third-party content ingestion?

### 2. First-party user submissions

Users record short video accounts of their paranormal experiences
through Paradocs' submit flow. Whisper transcribes the audio; Claude
Sonnet writes a third-person analysis. The user owns their content
but grants Paradocs a license to display + analyze it.

**Questions for counsel:**

  1. Recommended language for the submission ToS — content license
     scope, moderation rights, takedown rights, revocation procedure?
  2. AI-rewrite disclosure — what must we tell the submitter about
     how their video will be transcribed + analyzed?
  3. Age-gating — current submit flow requires sign-in; do we need
     to add explicit 18+ confirmation given the topic matter and
     spoken-word video content?

### 3. Privacy policy review

We have a draft privacy policy at `/privacy` covering:
  - Account data (email, display name)
  - User-submitted content (text, photos, video)
  - Behavioral analytics (PostHog, session replay with privacy
    safeguards)
  - Ingested third-party content (covered in section above)
  - Sharing: payment processor (Stripe), no advertising

**Questions for counsel:**

  1. Is the existing policy sufficient for U.S. + EU launch?
  2. Are we required to support data export / deletion under
     CCPA / GDPR? (We have a delete-account endpoint already.)
  3. PostHog session replay scope — what blurring / opt-out
     defaults do we need to disclose?

### 4. Content moderation framework

  - First-party submissions go through OpenAI moderation API before
    publish.
  - Reports flagged by moderation enter an admin review queue.
  - We have a takedown endpoint for both individual reports and
    full sources.
  - No comments are enabled on ingested content (only on first-
    party submissions).

**Question for counsel:** is this sufficient for Section 230 safe
harbor and DMCA-style notice-and-takedown protection?

## What we are NOT doing

  - **No medical / legal advice claims** — the AI analysis is framed
    as editorial interpretation, never as diagnosis or counsel.
  - **No advertising** — Paradocs is subscription-supported ($5.99
    Basic, $14.99 Pro).
  - **No deepfakes / AI-generated impersonation** — the AI rewrites
    third-party text into our own editorial voice but does NOT
    generate fake quotes or attribute statements to real people.
  - **No data sales** — we don't sell user data to third parties.

## Attached references

  - Privacy policy: `https://discoverparadocs.com/privacy`
  - Terms of service: `https://discoverparadocs.com/terms`
  - Sample ingested report: `https://discoverparadocs.com/report/psychic-experience-kansas-4hxm98`
  - Sample first-party video report: `https://discoverparadocs.com/report/video-2ad44f71`
  - Submit flow: `https://discoverparadocs.com/start`
  - Database schema migrations: `/supabase/migrations/` in the repo

## Asks of counsel

  1. Review the four sections above and flag highest-risk areas.
  2. Recommend ToS + privacy policy revisions before B2 mass-ingestion
     launches (NUFORC + Reddit + YouTube).
  3. Confirm whether each new third-party source needs its own
     review or whether a single ingested-content framework covers
     them all.
  4. Estimated turnaround time and quoted fee.

— Paradocs Engineering, William Chase (williamschaseh@gmail.com)
