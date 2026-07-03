# Deckbound — setup runbook

A step-by-step to stand up the boss-plus-agents system against your actual repo.
Everything here is wired to what's really in `TaySchub/deckbound` — no
placeholders to fill in. The three things only you can own are pre-filled with
sensible defaults and marked **[your call]** so you're never staring at a blank.

## Which tool

Two valid paths, same files mostly:
- **Claude Code (recommended for the build):** the `.claude/agents/*.md` files
  become real subagents and `CLAUDE.md` is your orchestrator's brief. Best for
  code + git.
- **Cowork (what your `PROJECT.md` is written for):** one agent wears the role
  hats already defined in `PROJECT.md`; you don't strictly need the
  `.claude/agents/` files yet. `AGENTS.md`, `data/balance.json`, and
  `tools/balance_sim.py` apply either way.

If unsure, start in Claude Code — it's the game's natural home.

## Step 1 — add these files to the repo

New files (additive; they don't touch `GAME_BRIEF.md` / `PROJECT.md`):

```
AGENTS.md                     # read-first orientation + repo map
AUTONOMY.md                   # overnight policy: default-forward loop, gates, caps
CLAUDE.md                     # orchestrator/boss brief (Claude Code)
data/balance.json             # single source of truth for tunable numbers
tools/balance_sim.py          # deterministic difficulty check
.claude/agents/implementer.md
.claude/agents/qa.md
.claude/agents/designer.md
.claude/agents/researcher.md
.claude/agents/compliance.md
.claude/agents/architect.md
```

Put them at the paths shown (they mirror your existing `tools/` and `docs/`
layout). Commit on a branch and open a PR so your Actions checks run — unless
branch protection isn't enabled yet, in which case `PROJECT.md`'s bootstrap
exception lets you commit the scaffold straight to `main`.

## Step 2 — confirm the three [your call] settings

1. **Difficulty band — [your call, default 0.45–0.60].** Already set in
   `data/balance.json` as `target_win_rate`. Change it if you want the game
   harder or easier.
2. **Spend caps — [your call, defaults suggested].** Set a per-session token
   budget for the orchestrator + workers, a **tighter** separate budget for the
   Architect (Opus is the expensive tier), and a daily kill-switch. Pick real
   numbers you're comfortable with; start conservative.
3. **Model assignments — [your call, defaults set].** Boss/orchestrator =
   **Sonnet 5**; workers (implementer/qa/designer/researcher/compliance) =
   **Sonnet**; Architect = **Opus 4.8**. These are already in the agent files'
   frontmatter; change only if you have a reason.

## Step 3 — Phase 0: read-only audit (do this before any code)

Open the repo in Claude Code and give the orchestrator this first task, with
**no write access**:

> Read `AGENTS.md`, `GAME_BRIEF.md`, and `PROJECT.md`. List the open Issues and
> the latest Actions result. Then produce a short state report: what `main.js`
> actually contains today, confirm the repo map in `AGENTS.md` matches reality
> (flag any mismatch), and lay out the Issue order you'll drive. Write nothing.

This confirms the map, catches anything I described from the docs that differs on
disk, and shakes out your plumbing (does the boss decompose sanely? does logging
work? does the spend meter register?) with zero at stake.

## Step 4 — run the balance sim once yourself

From the repo root:

```
python3 tools/balance_sim.py
```

You'll see the baseline strategy land in the target band and the Frost card blow
past it to 100% — flagged TOO EASY. That win-rate, not anyone's opinion, is what
tells the Designer to tune `data/balance.json`. This is the verification loop the
whole system leans on; seeing it once makes the rest obvious.

## Step 5 — drive the backlog, in order, one Issue at a time

Your Issues are already a clean v1 plan. Have the orchestrator work them in this
order (it's encoded in `AGENTS.md` too):

1. **#2 Foundation: deploy** — **human gate.** The agent prepares everything, but
   *you* enable GitHub Pages / approve the deploy. It must not do this itself.
2. **Core, in sequence:** #4 enemy movement & lose → #5 wave system & win →
   #6 basic tower → #7 currency economy. These introduce the first real numbers —
   have the Implementer read them from `data/balance.json`, and the Designer +
   QA use the sim to freeze the wave count/scaling (`GAME_BRIEF` left this open).
3. **Hook:** #8 deck & hand → #9 live-during-wave placing/upgrading → #10 tower
   variety (~5–6 cards). #10 is your natural first multi-card balance pass.
4. **Depth:** #11 enemy variety → #12 tower upgrades → #13 meta-progression.
5. **#14 polish & playtest** closes the v1 milestone.

Keep it **sequential while everything is in one `main.js`** — parallel agents on
one file just fight over merge conflicts.

**To run this overnight:** point the boss at `AUTONOMY.md`. It defaults forward
(no yes needed) through everything on the allow-list, escalates a twice-failed
issue to Opus 4.8, parks anything Opus can't solve, and stops only at the four
gates or the spend cap. Set the daily spend cap before you walk away — that's the
piece that runs the whole night without you.

## Step 6 — the refactor that unlocks parallelism

Once the Core issues (#4–#7) work, do one structural PR: split `main.js` into
modules (e.g. `src/engine.js`, `src/render.js`, `src/data.js`). *This* is the
moment the boss can safely fan work out to parallel domain workers (engine /
frontend / balance), because they'd no longer touch the same file. Until then,
one worker at a time.

## Step 7 — the steady loop

From here it's the same cycle per Issue: boss picks the next ready Issue → routes
to a role → worker builds on a branch → verify (Actions checks + `balance_sim.py`
for anything touching difficulty) → escalate to the Architect only if a worker
fails twice or the change is cross-cutting → PR with a `CHANGELOG.md` entry →
report to `#studio-feed` → **you review and merge.** The boss never crosses a
human gate; you stay the real boss above it all.
