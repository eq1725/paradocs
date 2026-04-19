# Lab QA Continuation Prompt

Use this to spin up a fresh assistant session and continue iterating on the `/lab` surface with Chase.

---

## Context for the next assistant

You are continuing a live, QA-driven iteration on the **Paradocs Lab** — `beta.discoverparadocs.com/lab`. Chase has been running the beta through every tab (Saves, Cases, Map, Notes) and sending screenshots + text feedback. You ship focused commits; he deploys via `git push` to Vercel; he QAs; you iterate.

**Read first (in this order):**
1. `LAB_QA_SESSION_2026_04_19.md` — full log of the previous session's commits, theme summaries, and known open threads.
2. `PROJECT_STATUS.md` — look for "Session L1: Lab QA Iteration" for the PM summary and deferred items.
3. `SESSION_NOTES.md` — project-wide conventions (SWC compatibility rules, push pattern, DB schema).

**Do not** dive into refactors without checking the session log first. A lot of ground has been covered; avoid re-treading fixed bugs.

---

## The workflow Chase expects

1. He sends QA feedback — usually a screenshot + a short note with numbered items.
2. You make focused edits. Small commits per concern. Typecheck with `npx tsc --noEmit` filtered to changed files before finalizing.
3. You provide a shell command (HEREDOC-formatted) Chase can paste to commit + push. **Never** use `cd ~/path/to/paradocs` in suggested commands — he's already in the repo dir.
4. When paths contain globs like `[slug]`, single-quote them: `'src/pages/report/[slug].tsx'`.
5. After he pushes, Vercel auto-deploys from `main`. He then QAs and sends the next round.
6. Don't spawn agents or do extensive exploration; this is fast iterative polish.
7. If you're about to introduce a new library or a heavy refactor, **stop and ask** with two concrete path options before proceeding. Chase has veto power.

---

## Current state of /lab

The four tabs:

- **Saves** — feed of user's saved sources (Paradocs reports + external URLs). Has `PatternsLane` at top (library insights + related reports from global feed), progress tracker, "new since last visit" strip, case file filter, category filter, search/sort toolbar, grid/list/compact view modes.
- **Cases** — grid of user's case files. Create via header "+ New case file" or empty-state CTA. Case file detail view has scoped insights and entry grid.
- **Map** — MapLibre GL view of saves with coords. Has Layers control panel (top-left, default open) with basemap switcher (dark/satellite/terrain), heatmap toggle, global-context backdrop toggle, timeline scrubber. Historical wave overlays + interactive global pins (click opens report in new tab).
- **Notes** — standalone tab (less iterated this round).

## Open QA threads that are likely to come up

- **Cases tab visual polish.** Did not get the same iteration love as Saves/Map.
- **Mobile map layers panel.** Might clash with mobile bottom-nav on small viewports — not yet tested.
- **Paste behavior into Tiptap.** Paste from Word/Docs/HTML hasn't been stressed.
- **Patterns lane content on small libraries.** `tag_cooccurrence` needs ≥4 saves in a category with ≥60% share — won't fire yet for most test data. Chase may want to stub-test or lower thresholds.
- **Map interactions on large libraries.** Supercluster path kicks in at ≥12 pins; raw render below. Chase may hit seams.
- **Historical wave polygon visibility at different zooms.** Styling may need zoom-interpolated opacity.
- **Global-context fetch cost.** Currently fetches all geocoded reports once via `useViewportData`. If the table grows significantly, this needs viewport-bounded loading.
- **Detail panel tag editing.** Not yet audited against the new WYSIWYG editor patterns.

## Things to NOT touch unless Chase asks

- Backend API paths (`/api/research-hub/*`) — legacy but stable.
- DB column names (`user_note`, `reports.latitude`, etc.) — renaming is a separate migration project.
- Explore map (`src/components/map/MapContainer.tsx`) — it's the source Lab now imports from; Lab's port is complete.
- `tiptap-markdown` dep — roundtrip is working; swapping the markdown extension risks breaking existing stored notes.

## Commands reference

Typecheck filtered to touched files:
```
npx tsc --noEmit 2>&1 | grep -E "YourFile|AnotherFile" | head -10
```

Skills available (if task matches): `xlsx`, `docx`, `pptx`, `pdf`, `schedule`, `consolidate-memory`, `setup-cowork`, `skill-creator`.

Git push pattern:
```
git add <files> && git commit -m "$(cat <<'EOF'
Concise headline (imperative)

Short body paragraph explaining WHY.

- Bullet for each concrete change
EOF
)" && git push origin main
```

## How to start a new session with this prompt

Paste this prompt to the next assistant along with: (a) a screenshot of the current `/lab` state or (b) the new QA note Chase wants addressed. The assistant should:

1. Acknowledge by reading the three context docs.
2. Verify the current branch state with `git log --oneline -5` — the last session ended at commit `37b82489` ("Fix: global-context pins invisible due to compound paint expression").
3. Address the QA item with a focused edit + typecheck + commit command.
4. Wait for Chase's next deploy + QA round.

No roadmap planning, no test scaffolding unless asked. This is direct iteration on a live beta.
