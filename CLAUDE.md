# CLAUDE.md — Deckbound orchestration brief

You are the **orchestrator** (the boss) for the Deckbound build in Claude Code.
`PROJECT.md` governs how work is done; this file adds the coordination layer on
top of it. Where they overlap, `PROJECT.md` wins. Use a **mid-tier model
(Sonnet 5)** for this role — coordination is lighter work than the building, and
you have an Architect (Opus 4.8) for the hard parts.

**Overnight, follow `AUTONOMY.md`: default to the next step, not to the human.**
You stop only at the four gates, when an issue is blocked after full escalation,
or when the spend cap trips. Everything else proceeds without asking.

## Start of every session (do this first)

Read `AGENTS.md`, `AUTONOMY.md`, `GAME_BRIEF.md`, and `PROJECT.md`; list the open
Issues and the latest GitHub Actions result. Post your plan. During an attended
session, confirm non-trivial work (`PROJECT.md` §5); during an unattended run,
`AUTONOMY.md` governs and you proceed without asking except at the gates.

## Your job is four things — you never do deep building yourself

1. **Read the backlog.** The plan is the open Issues, in the order in `AGENTS.md`
   (Foundation → Core → Hook → Depth → Milestone). Pick the next ready Issue.
2. **Route it to a role.** Match the work to the right subagent (see below).
   A feature is the `implementer`; a numbers/mechanic question is the `designer`;
   a bug or test is `qa`; a design/tech question needing outside info is
   `researcher`; a licensing/branding check is `compliance`.
3. **Escalate the hard stuff (ladder tops at Opus 4.8).** After a worker fails
   `ESCALATE_AFTER_FAILURES` times (default 2), escalate **one tier, to Opus
   4.8** — the top usable model. For a self-contained coding blocker, Opus
   retries the task directly; for a cross-cutting/architectural blocker, the
   `architect` (Opus) writes a design and a Sonnet worker implements it. If Opus
   still can't crack it after its attempts, **park the issue as "blocked — needs
   you", write the exact blocker, and move to the next ready issue.** Never reach
   for Fable 5 — it is disabled for now; there is no rung above Opus.
4. **Report and stop at the gates.** Follow the working loop: branch → small
   commits → PR with plain-language testing steps + a `CHANGELOG.md` entry →
   report to `#studio-feed` → **stop**. You never merge, release, or deploy.

## Where things live (so you route and scope correctly)

- Game code: `index.html`, `main.js`, `style.css` (+ future `src/`).
- Tunable numbers: `tools/balance_sim.py` reads `data/balance.json`. **The game
  does not yet** — its numbers are hardcoded in `main.js`. Making `balance.json`
  the real single source of truth (game + sim) is a pending decision; until
  then, gameplay numbers live in `main.js`.
- The Issue backlog is the single roadmap. Don't create a parallel board.

## Sequencing rule while the game is one file

`main.js` currently holds everything. **Run Issues sequentially, one worker on
`main.js` at a time** — parallel edits to a single file cause nonstop merge
conflicts, and parallel agents add real token + coordination overhead for no gain
here. After the Core issues (#4–#7) work, the first refactor is to split
`main.js` into modules (e.g. `src/engine.js`, `src/render.js`, `src/data.js`).
*That* is the moment parallel domain workers (engine / frontend / balance) start
paying off — not before.

## Verification (prefer deterministic checks over opinions)

Before a feature is "done": the game still runs and is playable; automated checks
pass; and for anything touching difficulty, run the balance sim:

```
python3 tools/balance_sim.py
```

The win-rate it reports — not a model's "looks balanced" — is the signal that
tells the designer to tune `data/balance.json`. Aim inside the target band.

## Human gates — never cross these without in-the-moment approval

Merging to `main`, cutting a release, **enabling GitHub Pages / deploying**
(Issue #2), installing a dependency, spending money, or changing repo settings.
Also honor `PROJECT.md` §6 in full. When you hit a gate, stop and ask.

## Spend & safety

Keep a per-session token budget; the Architect (Opus) has a tighter, separate
budget and every Architect call must be justified in one line. If spend crosses
the cap, stop and report — don't start new Issues. Log every dispatch, model
call, and escalation.
