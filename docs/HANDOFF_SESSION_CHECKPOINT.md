# Paradocs — Session Handoff Checkpoint

_Last updated: 2026-06-28. Authoritative current-state snapshot. Read this first when resuming._

---

## 0. What's running RIGHT NOW (check before doing anything)

**The CA ingest chain is live** — a self-advancing, self-terminating multi-tranche Chronicling-America run on Chase's Mac:

- Wrapper: `scripts/ca-tranche-chain.sh` (launched under `nohup caffeinate -i …`), order **1868–1897 → 1850–1867**.
- Each tranche runs the hardened daemon with `STOP_WHEN_DRAINED=1`; when a tranche is mined out (2 consecutive harvest waves add 0 new shards) it drains + exits, and the chain advances. After the last tranche it **stops itself** — no idle burn.
- **Monitor:** `cd ~/paradocs && set -a && source .env.local && set +a && bash scripts/ca-watch.sh` (refreshes 20s; Ctrl+C closes the view only). Shows tranche, wave/phase, this-run extracted, DB totals.
- **Stop the whole chain:** `touch outputs/ca-daemon.STOP` (finishes current wave, exits, chain halts; remove the file to resume).
- **If it dies (Mac slept, etc.):** `rm -rf outputs/ca-daemon.lock outputs/ca-daemon.STOP && nohup caffeinate -i bash scripts/ca-tranche-chain.sh > outputs/ca-chain.out 2>&1 &` (resumable — nothing lost).

**Latest stats (2026-06-28 ~14:22):** 20,057 CA rows · 12,190 approved · 1,759 pending_review (narrate backlog, drains over waves). Daemon pid 41449, tranche 1868–1897, wave 1.

**Cost:** ~$81/day while running. Anthropic balance was ~$414. Full chain (both tranches) ≈ **$320 total**, ~4–5 days, ~16k more good reports, then auto-stops. **Track precise spend at console.anthropic.com → Usage → Cost** (the only reliable number — local logs undercount ~5×).

**The pipeline is self-cleaning now** (see §1) — so when the chain finishes, the only manual step is the small foreign-state cleanup in §3.

---

## 1. What this session shipped (all committed + pushed)

**Matching / the reveal (the membership differentiator):**
- Semantic reveal matching wired end-to-end; **real overlap count** (not the fixed "8") — V11.21.8.
- **RADAR** plots a semantically-gated, well-distributed dot set whose density tracks the overlap — V11.23.
- **Hybrid retrieval** (vector + lexical RRF) + **Haiku rerank** of top candidates with explainable **"why you match"** reasons on the cards — V11.24.
- Onboarding: **experience-type auto-prefill** (AI best-guess from the story) + matcher-driven related types — V11.22.
- **24h in-progress draft recovery** on `/start` (no more losing what you wrote) — V11.21.9.

**Payments (smoke test PASSED):**
- End-to-end verified: Stripe checkout → webhook 200 → Member upgrade → billing record. The only defect was a dead post-checkout redirect to `beta.discoverparadocs.com`; **fixed** to use the real request host — V11.27.
- Tier chip now reads **"Member"** (was "Basic") — V11.28. Swept all dead `beta.discoverparadocs.com` → `www` across src (28 files).
- **`NEXT_PUBLIC_SITE_URL`** set in Vercel to `https://www.discoverparadocs.com` (needed for email/cron links).

**CA ingest pipeline hardening (so new tranches land clean, no rework):**
- **Country at source** — extractor asks the AI for the event's country and geocodes there instead of hardcoding US (the "Cheshire, England → Idaho" bug) — V11.29; plus don't borrow the paper's US state/city for foreign events — V11.29.1.
- **Folklore/fiction/ads auto-archived at ingest** (never pollute pending) — V11.29.
- **Self-cleaning semantic-dedup wave** in the daemon loop (reworded same-event reprints; content-fp guard already catches exact ones) — V11.29.
- **`STOP_WHEN_DRAINED` + `ca-tranche-chain.sh`** for hands-off multi-tranche runs — V11.31.

**Cost + tooling:**
- `scripts/anthropic-cost.ts` (precise billing-API tracker; needs an org-owner Admin key — Chase isn't owner, so use the Console instead) — V11.30.1.
- `ca-watch.sh` dashboard rewritten: real PID, tranche, wave/phase, this-run progress; fixed the line-74 bug — V11.30.
- New reversible scripts: `ca-archive-folklore.ts`, `ca-location-recheck.ts`, `ca-semantic-dedup.ts`.

**CA corpus cleanup (earlier in session):** archived 475 folklore + 7 text-reprints + 2,733 semantic dupes, fixed ~2,800 wrong-country geocodes, published the 1898–1928 backlog.

---

## 2. Cost reality (context for planning)

- CA is expensive because it runs **Haiku on every OCR snippet, and ~85% are rejected** — you pay to read the whole newspaper to find the gems. Effective ≈ **$0.02–0.03 / kept report**.
- Reddit/NUFORC/NDERF were nearly free at ingest because they arrived as **clean structured text filtered by regex (no AI)**. Key lesson for future pipelines: structured-text sources are cheap; OCR/raw sources are not.
- June MTD all-in spend ≈ **$3,551** (Console). The "$550" figure was always a single-tranche *estimate*, never a real total/cap.
- **Source exhaustion estimate:** ~19–24k good CA reports remain beyond 1898–1928; the running chain (1868–1897 + 1850–1867) captures most. Fully depleting CA ≈ ~$470–570 more total. Everything past 1850–1928 is diminishing returns.

---

## 3. Open items / what's next

**When the CA chain finishes (auto-stops):**
- One cleanup pass for **~99 already-ingested foreign rows with a wrong US state** (country is correct; these predate V11.29.1). Re-geocode their state from the now-correct country. Low priority, not matching-critical.

**Deferred (founder-approved, not started): My Record UX redesign.**
- Full two-panel review written: `docs/MY_RECORD_UX_PANEL_REVIEW.md`. Recommends killing the 3-tab dashboard for a single "Record spine" (Opening → Kindred → Dossier → Living Edge → Artifact), free-generous, depth-as-paid, no gamification, ship behind a flag with a trust guardrail.
- **4 founder taste-calls still open** (free generosity line; build introductions or not; center on n=1; keep the name) — answer these before implementing Phase 0/1.

**Directions Chase named for upcoming sessions:**
1. **More ingestion pipelines** — new sources whose **adapters exist but have no proven mass driver**: BFRO (Bigfoot), Shadowlands, GhostsofAmerica, IANDS, Erowid (each needs a driver + a daytime validation run; cheap *if* the source is structured text, expensive if OCR-like). NUFORC/NDERF/OBERF/ADCRF/SPR are fully drained.
2. **Design / layout / functionality revisions** — continue the expert-panel approach; My Record is the big one queued.
3. **App Store prep (Apple + Google)** — `docs/PARADOCS_APP_STORE_READINESS_PLAN.md` (§E web-first checkout done; Capacitor shell + native plugins, privacy labels/data-safety, account deletion, age rating, UGC moderation attestation still to do).

**Smaller open offers:** dedicated API key for the CA daemon (isolates CA spend on the Console); relabel the dashboard's misleading local "spend" line.

---

## 4. Working constraints (how Chase operates)

- **Chase runs all commands himself** (git commits, SQL, scripts) on his Mac. The assistant *provides* exact commands; it does not commit.
- **Never put credentials/tokens/keys in chat or commands** — Chase pastes them directly into the terminal / Vercel / Stripe / `.env.local`.
- **No multi-line pastes with `#` comments** — zsh breaks on them. Give clean single-line commands.
- **The assistant does not perform permanent deletions** — provides SQL/dashboard steps; archiving (reversible status change) is fine.
- **Don't fetch web content via bash/curl** — use the provided web tools only.
- **Style:** concise and direct; minimal preamble. Heavy design/strategy decisions go through the **expert panel** (superteam personas + red-team review).
- The repo is at `~/paradocs`; assume Chase is in that directory. The assistant's sandbox is a *different machine* — `kill -0`/`ps` can't see Mac PIDs, so judge daemon liveness by **log freshness**, not sandbox process checks.

---

## 5. Key paths
- Onboarding/reveal: `src/pages/start.tsx`; matcher: `src/pages/api/constellation/match.ts`
- My Record: `src/pages/lab.tsx` + `src/components/lab/*` + `src/components/dashboard/MyRecordTab.tsx`
- CA pipeline: `scripts/ca-ingest-daemon.sh`, `ca-tranche-chain.sh`, `ca-extract-ingest.ts`, `ca-harvest-parallel.sh`, `ca-watch.sh`, `ca-semantic-dedup.ts`, `ca-location-recheck.ts`, `ca-archive-folklore.ts`
- Cost: `scripts/anthropic-cost.ts` + console.anthropic.com → Usage → Cost
- Docs: `MY_RECORD_UX_PANEL_REVIEW.md`, `PARADOCS_APP_STORE_READINESS_PLAN.md`, `CA_TRANCHE_ONE_RUNBOOK.md`, `PARADOCS_SUPERTEAM_REVIEW.md`
