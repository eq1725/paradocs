# Paste this into a new session to pick up where we left off

---

I'm Chase, the founder of **Paradocs** (discoverparadocs.com) — a paranormal/anomalous-experience archive (Next.js pages-router + TypeScript + Supabase) at `~/paradocs`. We've been working across many sessions; you're picking up an in-flight project.

**First, before anything else:**
1. Read `docs/HANDOFF_SESSION_CHECKPOINT.md` in full — it's the authoritative current state (what's running, what shipped, open items, how I operate).
2. There's a **CA ingest chain running on my Mac right now** (`ca-tranche-chain.sh`, tranches 1868–1897 → 1850–1867, self-advancing/self-stopping). Check its status by reading the latest `outputs/ca-daemon-*.log` and `outputs/ca-chain-*.log` for freshness + current tranche/wave, and give me a quick read: still running? which tranche/wave? rows/approved/pending so far? any 429s/errors? (Don't trust sandbox `ps`/`kill -0` — judge by log freshness; the sandbox is a different machine. For precise cost I check console.anthropic.com → Usage → Cost myself.)

**How I work (important):**
- I run all commands myself (git, SQL, scripts) on my Mac — give me exact, copy-paste-ready **single-line** commands (no `#` comments — zsh breaks on them). You don't commit; I do.
- Never put secrets/keys in chat — I paste them directly into the terminal/Vercel/Stripe/.env.local.
- You don't do permanent deletions (give me SQL/steps); reversible archiving is fine.
- Be concise and direct. For substantial design/strategy work, use the **expert-panel approach** (superteam personas + a red-team review pass), as in `docs/MY_RECORD_UX_PANEL_REVIEW.md` and `PARADOCS_SUPERTEAM_REVIEW.md`.
- Use the task list for multi-step work, and verify your work (typecheck via `node scripts/typecheck-gate.js`, spot-checks, etc.).

**Where we're headed (this session + beyond):** I want to keep moving toward **App Store submissions (Apple + Google)**, while also (a) standing up **more ingestion pipelines** and (b) continuing to **revise design / layouts / functionality** (the My Record redesign is queued, with 4 open founder questions in its doc).

**So: don't assume the task.** After you've given me the CA-chain status read, **prompt me on what to work on next** — use the question tool to offer the concrete directions, e.g.:
- **More ingestion** — stand up a new source pipeline (BFRO / Shadowlands / GhostsofAmerica / IANDS — adapters exist, need a driver + validation run).
- **Design/UX** — start the My Record redesign (answer its 4 open questions first) or another surface.
- **App Store prep** — work the `PARADOCS_APP_STORE_READINESS_PLAN.md` checklist toward Apple + Google submission (Capacitor shell + native plugins, privacy/data-safety, account deletion, age rating, UGC moderation).
- **Something else** — whatever's top of mind.

Then go deep on whatever I pick.
