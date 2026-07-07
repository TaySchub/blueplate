# The studio playbook — the portable methodology

> **What this is:** the game-agnostic working method, extracted from the
> Blue-Plate Special record (PRs #15–#97) so it can seed a NEW game from a
> brief. Everything here is stated as a portable rule with its Blue-Plate
> evidence in parentheses — the parenthetical is the instance, the sentence is
> the method. Blue-Plate's own operational detail lives in `CLAUDE.md`;
> per-genre content (balance law, art rules, canon) lives in that game's docs.
> The operator this is written for: ONE solo developer pasting prompts into
> Claude chats, reviewing in the evening, merging what they trust.

## 1. The operating model — three seats, one merge gate

**PLANNER → BUILDER → REVIEWER → developer merge.** One planning chat with
persistent memory turns developer decisions into issues and kickoffs; a fresh
builder chat executes exactly one kickoff into exactly one PR and stops; a
fresh reviewer chat independently verifies flagged PRs; the developer is the
only merge gate and the only taste authority. Builder and reviewer are never
the same chat — a review that trusts the builder's numbers isn't a review
(every Blue-Plate checkpoint reproduced the gate from a clean worktree and
several found things the PR body couldn't have shown: stage commits re-run
#87, a mis-built parity bar retired #93).

What this replaces, on evidence: an orchestrator dispatching subagent workers
with a model-escalation ladder was the original design and was NEVER used as
designed — all 39 shipped PRs came from one chat per kickoff wearing
implementer/designer/QA/researcher hats as needed (#87/#91/#93 title their
hats explicitly). Institutionalize what happened, not what was drawn.

Chat-role hygiene that made it work:
- **The kickoff is a contract.** Ratified plan in the issue's first comment;
  the builder executes it and REPORTS deviations rather than improvising
  ("if the repo contradicts this kickoff, STOP and comment" — every kickoff
  since #67; #87's four reported deviations were each ruled sound in review).
- **Escape valve, not heroics:** if a bar resists honest effort, ship the best
  coherent configuration, title it `[NEEDS FOLLOW-UP]`, and document exactly
  where the tension is — "a documented near-miss beats an overfit 3am hack"
  (#93 shipped this way; its miss turned out to be a broken bar, not bad work).
- **Blocked = park with the exact blocker written out.** Never merge, never
  push through a gate (`AUTONOMY.md`; held across five overnight runs).

## 2. The kickoff — the unit of work

Every piece of work enters as a pasted kickoff with the same anatomy
(templates: `docs/kickoffs/`): reading list → fresh isolated worktree +
branch-before-any-edit → hard prerequisites verified before editing → the
mission → staged scope with per-stage proofs → behavior tests → the
verification list → PR-body requirements → stop-at-the-gate. The planner fills
blanks; the invariants ride in the template so no one re-remembers them.

Why each piece exists:
- **Branch from up-to-date origin/main, never from another feature branch** —
  branch-chaining merged PR #44 into its parent branch and stranded a night's
  work; banned since 2026-07-04.
- **Fresh isolated git worktree per chat** — two parallel chats once shared
  one checkout; one switched the tree's branch under the other's uncommitted
  work (#80's parallel-run note). Worktrees made parallel PRs safe and are now
  unconditional, parallel or not.
- **Hard prerequisites verified before any edit** — a kickoff written before
  a dependency merged states the check ("confirm 7 towers in balance.json");
  the builder verifies reality, not the plan's memory (#89, #94, #98).
- **Stop at the gate** — the PR opens, the link posts to the issue, the chat
  stops. The developer merges. No exception in 39 PRs.

## 3. Verification architecture — deterministic gates over opinions

The load-bearing idea of the whole studio: **the model's opinion of its own
work is not evidence.** Every claim in a PR is a number, a byte-diff, a test,
or a screenshot that someone else can reproduce.

- **One objective gauge, run by CI, seeded and deterministic.** A fixed-seed
  simulation of a scripted reference player through the REAL game engine; its
  number gates every PR (Blue-Plate: `sim.mjs --check`, survival@30 in a
  50–60% band). A gauge that can flake is not a gate.
- **The engine must be headless-runnable from day one** — game logic in one
  module with zero DOM/render/audio dependencies, side effects through no-op
  hooks. This is what makes the gauge, the behavior tests, and the whole
  content-beside-the-gate pattern possible (Blue-Plate's `engine.js` rule).
- **Byte-identity is the strongest proof of "this PR can't have broken that."**
  Art, audio, chrome, and beside-the-gate content PRs quote the gate and the
  seeded smoke runs byte-identical to main; staged PRs prove each boundary
  (#70's SHA-256-identical screenshots; #91's two-boundary proof).
- **Tests assert behavior, never tuned numbers** — so a retune never edits a
  test, and "tests green AND UNEDITED" becomes a review check (#60 → #93).
- **Content beside the gate:** new content (towers/enemies/maps) ships so the
  reference build never executes it — the gauge stays byte-identical and
  content needs no re-calibration PR (#90/#91). Content that legitimately
  moves the gate (new enemies in the waves) instead RE-HOLDS every bar in the
  balance law (#98's shape).
- **Instrument the feel questions you can't gate:** every tuning PR ships a
  playtest guide (what to feel for, single-lever-per-complaint) because the
  developer's evening playtest is a scheduled verification step, not a
  courtesy (#76 onward).

## 4. The proven PR shapes

Six shapes cover the record; each has a template in `docs/kickoffs/`:
content-beside-the-gate · gate-moving content · numbers-only tuning ·
display/chrome-only · audio pass · staged mechanic+tuning (overnight). Plus
one clause that composes with any of them: the parallel-run file contract.
If work fits no shape, it's a pattern-setting FIRST: scope it tightly, give it
a checkpoint (`docs/CHECKPOINT.md`), and mint the template afterward — that is
how every existing shape was born (#67→#68, #90→#91→followers).

## 5. Bootstrapping a NEW game — the sequence this project actually followed

Derived from Blue-Plate's own history; run it in order. Expect the early steps
to be days, not weeks.

1. **Freeze a brief** (`GAME_BRIEF.md` shape): pitch, genre, 3 design pillars,
   core loop, locked key decisions, an explicit "first version = done" list,
   an explicit OUT-of-scope list — and the **swap-anytime theme clause**:
   theme is declared re-skinnable without touching genre/pillars/loop.
   Evidence it works: Blue-Plate swapped its entire fantasy theme to the diner
   in five reskin PRs (#30–#40) with zero mechanical change, exactly as the
   clause promised. Ideation then CLOSES; stray ideas go to a parked-ideas
   graveyard file, never into the build.
2. **Walking-skeleton v1:** the full loop playable ugly — map, spawner,
   one tower/actor, lose condition, currency — in the first sessions
   (#15–#20), placeholder art sanctioned by the brief. Nothing else starts
   until the loop is fun-adjacent and stable.
3. **Derive the objective gauge — and expect to iterate it.** Ours took three
   tries: a Python statistical model → the real engine run headless (#57,
   gate-switched in #63 when the model and reality diverged by 20+ points) →
   re-anchored on survival@30 when the win condition changed (#76). The
   LESSON: start measuring immediately with the crude gauge, but budget for
   replacing it; the gauge is a design artifact that must track what "a good
   run" means, and only the real engine tells the truth.
4. **CI gates, then branch protection:** syntax, generated-file sync,
   behavior tests, content lint, the band gate — all deterministic (#48;
   protection + PR-only merges 2026-07-04). From this point "CI green" is a
   precondition of review, not a hope.
5. **Content pipelines:** turn each content class into data + a lint + a
   documented add-a-thing recipe so content PRs stop touching the engine
   (maps-as-content #70, add-a-tower #90, enemies #98). The pipeline PR is a
   pattern-setting first (checkpoint); its followers are cheap.
6. **Balance-philosophy research pass** once content outgrows tuning
   intuition: researched income/economy model, a role map where every option
   has ONE measurable best-at claim, a pricing rubric, and probe conventions —
   committed as law that future tuning PRs measure against (#92/#93,
   `BALANCE_PHILOSOPHY.md`). Before this doc exists, tuning PRs argue from
   targets in their kickoffs; after, they argue from the doc.

## 6. Honest constraints (read before seeding game #2)

**Developer taste is the non-optional bottleneck input.** The gates catch
regressions; they cannot say whether wave 1 is fun, whether a path choice
feels like style or power, or whether an execute moment "reads" — every
shipped balance state was ratified by an evening playtest, and two of the
biggest re-directions (endless-only #75, the economy overhaul #86) came from
the developer playing, not from a probe. Budget the developer's playtest time
as the scarcest resource in the loop.

**Genre simulability decides how much of this architecture transfers.** The
gate stack works because a tower defense runs headless and deterministic: a
scripted reference player is a meaningful proxy and byte-identity is
checkable. A genre with heavy player-execution skill, physics noise, or
real-time aim (a platformer, an action roguelite) inherits the seats, the
kickoff contract, CI, behavior tests, and byte-identity for inert changes —
but its difficulty gauge will be weaker, and the playtest tier carries
correspondingly more weight. Prefer deterministic/headless-able designs for
the next game if the gate architecture is wanted at full strength; if the
concept demands a feel-based genre, plan for more display-tier PRs, more
playtest rounds, and cruder gauges (e.g. completion/TTK envelopes instead of
a win-rate band) — and say so in that game's brief.
