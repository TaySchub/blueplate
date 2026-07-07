# The checkpoint — review policy + recipe

> **What this is:** when a PR needs an independent review chat, and the exact
> recipe that chat follows. Reverse-engineered from the nine checkpoint
> verdicts on record (PRs #63, #70, #74, #76, #78, #87, #90, #91, #93) so the
> practice survives the reviewer-seat model change (Issue #101). The planner
> sets the tier in the kickoff; the reviewer is a fresh chat, never the
> builder; the developer still merges.

## The policy table — what review does a PR get?

| Tier | Applies to | Review | Evidence |
|---|---|---|---|
| **Checkpoint + recommended ultra** | New engine SYSTEM (a layer future content inherits) · CI/gauge-policy changes · persistence/save-format changes | Reviewer-chat checkpoint (recipe below) **plus** the planner recommends `/code-review ultra <PR#>` in the kickoff — user-triggered and billed, so the DEVELOPER runs it on the open PR; its findings land on the PR and go back to the builder chat | Status layer #91, save subsystem #85, gauge switch #63, Python-sim retirement #87 — the heaviest verdicts on record. Ultra tier ratified by the developer 2026-07-07 (Issue #101 amendment): post-Fable it buys back top-tier bug-hunting depth on exactly the diffs where the reviewer-seat downgrade matters most |
| **Checkpoint** | Gate-moving PRs (the `--check` number legitimately changes) · numbers-only retunes · unfreezing a lever class · pattern-setting FIRSTS (the first PR of a new shape) | Reviewer-chat checkpoint before merge | Gate-movers #63/#76/#87/#93 (+#98's kickoff); delta-unfreeze #78 ("this run unfroze deltas — full checkpoint") and #93; firsts #67 (free placement), #70 (map platform), #74 (first content map), #81 (layout transform), #90 (add-a-tower pipeline) |
| **CI + screenshot round** | Display/chrome-only · art-only · audio passes · content-beside-the-gate that FOLLOWS an established pattern | CI green + byte-identical proofs quoted in the PR + the developer's one batched screenshot (or on-device audio) round. No checkpoint | #72 ("no Fable checkpoint — CI + your screenshot review carries it"), #84 (art-only), #95/#97 (display-only), #80 (audio; developer auditions on device), #68 (followed #67's fresh pattern, no checkpoint) |

Rules of thumb the record supports:
- **The first of a shape gets a checkpoint; followers don't.** #67 was
  checkpointed, #68 (same files, established pattern) was not; #90/#91 were
  checkpointed, and #91's verdict explicitly pre-cleared the next status towers
  as "one PR each on this layer" (i.e. followers).
- **Checkpoint BEFORE merge.** The record's two deviations were both flagged as
  such: #70's ran post-merge ("nothing found that would have blocked — for the
  record") and #85 merged with its checkpoint still owed. Don't normalize them.
- When in doubt, the planner escalates one tier. A wasted checkpoint costs an
  evening; a missed one costs a bad merge into the tuning baseline.

## The recipe — what the reviewer chat does

Work in a **fresh isolated worktree off the PR branch** (`git worktree add
<scratchpad-dir> <branch>`), never the shared checkout. You are read-only on
the branch: no commits, no rebases, no test edits — if something needs fixing,
that goes back to the builder (post-Fable rule; the one reviewer-performed
rebase on record, #81, is retired practice).

1. **Reproduce the gate yourself — never trust quoted numbers.** Run
   `node tools/sim.mjs --check` (and on tuning PRs the full §4 read: seeds
   1/1000/5000 ×200, seed 1 ×1000). Every number you confirm gets a ✓; every
   number you can't reproduce is a finding. All nine verdicts opened this way.
2. **Stage-boundary inertness, proven not asserted.** For staged PRs, check
   out each stage commit and re-run the gate: a "provably inert" stage must
   print the pre-PR numbers byte-for-byte (#87: "I checked out the stage-2
   commit and ran the gate"; #91: both boundaries; #93: stage 1).
3. **JSON-walk the balance diff.** Produce the complete changed-leaf list from
   `data/balance.json` (load both sides, deep-compare — never eyeball the text
   diff) and classify every change against the kickoff's frozen/tunable
   contract. "Strictly additive" and "zero delta changes" are claims to verify
   (#76: exactly 7 leaves; #87: 39; #90: strictly additive; #93: 43, with the
   scanner's one false positive ruled on explicitly).
4. **Contract greps.** Files the kickoff says are untouched must be
   byte-identical to the merge base (`git diff origin/main -- <file>`): engine
   on display PRs (#95), audio on non-audio PRs, tests on every retune
   (**green AND unedited** — diff `tools/tests/`, #63/#93).
5. **Probe re-runs (tuning PRs).** Re-run the §4 suite per
   `docs/BALANCE_PHILOSOPHY.md`: matrix spot-checks on the PR's headline
   claims, spam probe, all-signature premium, solo fingerprints, and the
   role-claim benches for any tower whose numbers moved. Reproduce the PR's
   *honest misses* too — a documented tension that reproduces to the decimal
   is evidence of care, not a block (#93: "the honest-miss anatomy reproduces
   to the decimal").
6. **Sensitivity probe where warranted.** Nudge the touched lever (±1 notch),
   read the gate, RESTORE it — to learn how close the config sits to a cliff
   (#63's ±2-damage probe found a 14-pt window; #93 pinned frost `slowDur`).
7. **Screenshot/feel review.** Check the committed screenshots against
   `docs/ART_STYLE.md` and the PR's claims (side-by-side fidelity #74,
   phone-scale usability #81, statuses-read-at-size #91).
8. **Law audit.** Any `GAME_BRIEF.md`/`PROJECT.md` edit must be exactly the
   pre-authorized string(s) — quote-compare (#67, #76, #97).
9. **Deviations ruled on, one by one.** Every place the builder departed from
   the kickoff gets an explicit verdict — sound / unsound, with the reasoning
   (#87's four deviations; #67's spawnRing correction). A reported deviation
   is the builder doing its job; an unreported one is a finding.

## The verdict — a PR comment, findings ranked

Post ONE comment on the PR: **PASS / FAIL + "recommend merge" (or not)** — the
reviewer recommends, the developer merges. Then, in order: what reproduced
(with numbers), findings ranked most-severe first (blocking → eyes-open notes
→ for-the-record), rulings on deviations, and any residuals queued as explicit
developer decisions (#76's verdict queued three; two became Issues #77/#86).
A checkpoint may also RULE on the bars themselves when the evidence warrants
it — #93's verdict retired a mis-built parity bar rather than fail good
balance against it; large rulings get folded back into the relevant law doc.
