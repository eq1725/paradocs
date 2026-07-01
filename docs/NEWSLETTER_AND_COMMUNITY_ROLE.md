# Paradocs — Newsletter Automation + Community/Editorial Role

_A pre-revenue, low-budget design for a recurring email (à la Atlas Obscura / Gaia) powered by a backend "Editor's Digest" automation, plus the part-time role that could own it (and support/moderation). Grounded in what we've already built._

---

## 1. The opportunity

A recurring editorial email is the cheapest durable retention + acquisition channel we have (Atlas Obscura's list is its crown jewel; forwards drive signups). **Our unfair advantage:** we don't have to *manually hunt* for compelling stories — the archive + matching engine can *surface* them automatically. The email's job is "documented wonder, curated" — a few genuinely striking, data-grounded items per issue, in our documentary voice.

The human is a **curator + voice**, not a researcher. The backend does the finding; the person picks, frames, and sends. That's what keeps this a few hours a week, not a full-time job.

---

## 2. The automation — the "Editor's Digest"

A weekly job produces a ranked shortlist of candidate items across a handful of editorial "buckets," each pre-annotated with the *hook* (why it's interesting) and a link. Every signal below **already exists in our system**:

| Bucket | What it surfaces | Data we already have |
|---|---|---|
| **Report of the Week** | Vivid, high-quality single accounts | `quality_score`, descriptor rarity, narrative, `has_photo_video`, witness-credibility dimension |
| **Corroboration / "You're not alone"** | An event multiple independent people described | the matching engine + the dedup **event-clustering** ("N accounts, none knew each other") |
| **Cluster / Flap** | A place+time where reports spike | geographic (`cluster.nearby_count`) + temporal (`context.peak_*`) SIGNAL surfaces |
| **Cross-source find** | One event documented across sources | dedup **provenance** (`also_reported_in`: "in NUFORC *and* an 1897 newspaper") |
| **On This Date / From the Archive** | Anniversaries, historical gems | `event_date` + the historical CA/BFRO corpus |
| **New to the Archive** | Notable recent ingests | newest approved rows (e.g., the 5k BFRO cryptid reports) |
| **Engagement highlights** *(post-launch)* | Most-saved / most-resonated / trending | `saved_reports`, `report_resonance`, `view_count`, PostHog |
| **Rising pattern** | A phenomenon or motif gaining reports | phenomena/pattern detection (PatternsRail), embeddings |

**Output** for the editor: a single admin page (or an email to *her*) listing the top ~3–5 candidates per bucket, each with title, the one-line hook, key stats, and a deep link — plus a "featured before?" flag so we don't repeat. She never touches SQL or the raw DB.

---

## 3. The process / SOP (weekly or bi-weekly, ~2–4 hrs)

1. **Digest runs** (e.g. Monday 7am) → editor opens the admin page / receives the digest email.
2. **Curate** — pick **1 hero + 3–5 supporting items** across buckets (a template mix: 1 corroboration, 1 archive/on-this-date, 1 new-to-archive, 1 cluster).
3. **Frame** — write short intros in the documentary voice (the template has slot copy + a 1-page voice guide: even-handed, wonder-first, never clickbait or credibility claims).
4. **Assemble** in the email template (fixed sections; drop in items + framing).
5. **Review** — founder 5-min glance at first (trust-building), self-approve once the SOP is proven.
6. **Send** via the ESP; **log** featured item ids (feeds the "don't repeat" flag + lets us measure which buckets/items drive opens/clicks → tune the ranker).

**ESP (pre-revenue):** Beehiiv or Substack (free at low volume, handle deliverability/templates/analytics natively) or Mailchimp free tier. Don't build sending ourselves.

---

## 4. The role

**Title:** *Community & Editorial Coordinator* — part-time contractor, **~5–10 hrs/week** to start. Pre-revenue: a fractional generalist or a capable, well-trained VA — not a full-time hire.

**Owns (in priority order for this stage):**
1. **The newsletter** — produce each issue from the Editor's Digest (curate → frame → assemble → send). The core recurring deliverable.
2. **Customer support** — the help inbox: triage, FAQs, account/login/billing basics, escalate the rest. Runs off a support SOP + canned responses.
3. **Light UGC moderation** *(once live)* — work the report-review queue: catch inappropriate content / PII, approve the clean, escalate edge cases. Runs off a moderation SOP + escalation path.

**Grows into** (as you scale + revenue arrives): community management (social, replies, seeding discussion), engagement campaigns, and eventually owning the content calendar.

**Who to look for:** a clear writer who can match a documentary voice; reliable and organized (it's recurring); comfortable with a simple admin tool + an ESP; empathetic and calm for support. Editorial instinct > technical skill (the automation removes the technical need).

**Access:** scoped admin — *read* the digest + queue, take *limited* actions (approve/flag reports, send the email). **No raw DB / no destructive access.** (We already deprecate destructive actions; this role fits that posture.)

---

## 5. What I'd build to enable it (dev artifacts — queued, not now)

1. **Editor's Digest ranker + admin page** — a scheduled job scoring candidates across the buckets in §2 (reusing matching/quality/cluster/provenance/engagement data), rendered on a simple `/admin/digest` page (or emailed). ~The biggest piece; everything else is docs.
2. **Featured log** — a table of what's been featured (don't-repeat + performance tracking).
3. **Support SOP + FAQ / canned-response library** — a doc she works from.
4. **Moderation SOP + escalation path** — a doc + the scoped admin role.
5. **ESP hookup** — export/segment our list into Beehiiv/Substack (a one-time integration, not custom send infra).

---

## 6. Pre-revenue reality check + sequence

- **Don't over-hire.** With the automation + SOPs this is a **few hours a week**. Options: (a) you run it yourself off the digest until revenue justifies a hire, or (b) a part-time contractor owns it now for low cost.
- **De-risk by proving it yourself first.** Recommended sequence: **build the Editor's Digest → *you* run 3–4 issues** to refine the ranker, the template, and the voice guide → **then hand the turnkey SOP to the coordinator.** She inherits a working machine, not a blank page — which is exactly what makes a low-cost generalist succeed here.
- **Bundle support + moderation with the newsletter** so one part-time person has a coherent, ~10-hr/week remit rather than three thin ones. That's the most budget-efficient shape at this stage.

**Bottom line:** the tech we've built (matching, dedup/clustering, provenance, quality scoring, SIGNAL surfaces, engagement) is *already* most of a newsletter engine. The missing pieces are one ranker + a page + three SOP docs — then a part-time Community & Editorial Coordinator can own the newsletter, support, and moderation on a small budget.
