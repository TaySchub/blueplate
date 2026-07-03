# FIRST-NIGHT.md — filled-in checklist + how to run it

Everything here is set to real values. The only thing left is the physical clicks
(installing, enabling branch protection, flipping Pages) — which only you can do.

## 1. Spend cap — 500,000 tokens / night (set)

- **What it is:** cumulative token usage (input + output) across the whole run —
  not a single context window. The context window is 200K and auto-summarizes;
  usage accrues across every turn.
- **Scale check:** an average Claude Code session already runs ~500K–1M tokens,
  so 500K is about one session's worth. Expect night one to finish ~1–3 small
  issues (fewer if Opus escalates or you enable Agent Teams). That's the point —
  learn the real burn, then raise it.
- **Cost:** at ~Sonnet $3/$15 and Opus 4.8 $5/$25 per million tokens in/out,
  500K mostly-Sonnet tokens ≈ a few dollars. Cache reads make it cheaper.
- **Sub-caps (already in `AUTONOMY.md`):** nightly 500K · per-issue ~200K ·
  Architect/Opus sub-budget ~100K.

### How the cap is actually enforced (pick one)

- **Claude Code on Max (default):** no "stop at 500K" dial exists. Your real
  ceilings are the plan's 5-hour + weekly limits — watch `/usage` or `/status`
  in Claude Code, and scope the run to a few issues. Treat 500K as a monitored
  target here.
- **Usage credits (money backstop):** enable them to continue past plan limits at
  API rates under a **monthly dollar cap you set**. Closest thing to a hard money
  stop on the subscription.
- **Agent SDK (true auto-stop):** non-interactive usage draws on a separate
  monthly credit and stops when exhausted; wrap the loop to sum tokens per
  response and abort at exactly 500K.
- **Keep it on subagents, not Agent Teams** — Agent Teams use ~7x the tokens and
  would blow through 500K fast.

## 2. Branch protection — makes "merge is a morning gate" real (set once)

In the repo on GitHub: **Settings → Branches → add a rule for `main`:**

- Require a pull request before merging.
- Require status checks to pass (select your GitHub Actions checks).
- Do not allow direct pushes to `main` (after the one bootstrap commit).

Result: overnight work can only land as PRs; nothing merges itself.

## 3. Deploy gate — leave GitHub Pages OFF (Issue #2)

Keep Pages disabled until you enable it yourself: **Settings → Pages → Source =
Deploy from branch → `main`.** The agent prepares the deploy and stops; you flip
the switch. This is the one Foundation gate.

## 4. Implement the system — step by step

1. **Install Claude Code** and sign in with your Max account (or open the **Code**
   tab in the Claude desktop app).
2. **Get the repo locally** — clone `TaySchub/deckbound`, or point the Code tab at
   it.
3. **Drop in the setup files** at these paths, then commit (use `PROJECT.md`'s
   bootstrap exception for this first commit, or open a PR):
   ```
   AGENTS.md  AUTONOMY.md  CLAUDE.md  SETUP-RUNBOOK.md  FIRST-NIGHT.md
   data/balance.json
   tools/balance_sim.py
   .claude/agents/implementer.md  qa.md  designer.md  researcher.md  compliance.md  architect.md
   ```
4. **Turn on branch protection** (section 2) and confirm **Pages is off**
   (section 3).
5. **Run the sim once** from the repo root to see the verification loop:
   `python3 tools/balance_sim.py`
6. **Phase 0 audit (read-only, no writes):** give the boss this:
   > Read `AGENTS.md`, `AUTONOMY.md`, `GAME_BRIEF.md`, `PROJECT.md`. List open
   > Issues + latest Actions. Produce a state report on what `main.js` contains,
   > confirm the repo map, and lay out the Issue order. Write nothing.
7. **Set the money backstop (optional but recommended):** enable usage credits
   with a monthly dollar cap, so 500K has a hard stop behind it.
8. **Kick off the night.** One instruction to the boss:
   > Follow `AUTONOMY.md`. Work the backlog starting at Issue #2, in order, one
   > issue at a time. Default forward; stop only at the gates, on a fully-escalated
   > block, or at the 500K cap. Chain branches off the previous issue's branch.
   Then walk away. Keep it on subagents, not Agent Teams.
9. **Morning review:** read the spend log, review the stack of PRs and merge them
   in order, and approve any parked gates (e.g. enable Pages for #2).

## 5. When to loosen

After 2–3 nights you'll know your real per-issue burn. Then: raise the nightly
cap toward what actually clears a useful chunk of work, and — once Core (#4–#7)
is merged and you've split `main.js` into `src/` modules — consider turning on
Agent Teams for parallel workers, with the cap raised to match their ~7x cost.
