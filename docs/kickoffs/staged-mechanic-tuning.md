# Template: staged mechanic + tuning (the overnight two/three-stage)

**When:** a mechanic or system change whose tuning depends on it — the
heaviest shape. Stages are separately committed and separately verified
because the reviewer will check out each stage commit and re-run the gate.
**Evidence:** #76 (restructure→calibrate), #87 (retire gauge→inert
mechanics→rescale; its checkpoint made the pattern "house precedent for
mechanic+tuning PRs"), #91 (system→content), #93 (research/tooling→retune).
**Review tier:** checkpoint before merge, always; if the mechanic is a new
engine SYSTEM, a CI/gauge-policy change, or touches persistence/save format,
the top tier applies — checkpoint PLUS the developer runs `/code-review
ultra <PR#>` on the open PR (docs/CHECKPOINT.md).

**Planner blanks:** the ratified developer decisions driving the run (list
them — every overnight kickoff on record opens with "developer-ratified") ·
stage boundaries · the frozen/tunable contract · targets in priority order ·
branch · prereqs. Overnight header variant; AUTONOMY.md on the reading list.

```
[STANDARD HEADER — overnight variant; + docs/BALANCE_PHILOSOPHY.md]

This prompt is the developer-approved plan for exactly ONE PR built in
{TWO/THREE} STAGED COMMITS (the #76/#87 precedent — stages are separately
committed and separately verified because stage {N}'s tuning depends on
stage {N−1}'s mechanics). Record STAGE-0 BASELINES before touching anything:
the full --check output + the §4 probes your targets cite.

STAGE 1 — {THE MECHANIC/SYSTEM}, PROVABLY INERT (commit separately):
{The design, scoped to exactly what stage 2 uses. House engine rules: plain
fields on existing objects over class machinery (the slowTimer → dots[]
lineage); effects through the NORMAL damage/economy paths so bounty/kill
credit/FX compose (#91); zero Math.random in bookkeeping; FX hooks default
no-op; neutral/zero-valued config so nothing moves.}
Behavior tests for the new mechanics (assert behavior, never tuned numbers).
END-OF-STAGE PROOF: gate + both smokes BYTE-IDENTICAL to main — if a quirk
makes true byte-identity impossible, document the exact cause and quote the
minimal diff instead of hacking around it (the #87 stage-2 smoke finding:
explained > hidden).

{STAGE 2 — CONTENT RIDING THE SYSTEM (if any; the #91 shape): still beside
the gate — byte-identical proof at this boundary too.}

FINAL STAGE — THE TUNE (numbers only): {targets in priority order — gate
50–60 aim ~55 ≥52 at CI config confirmed across seed bases; the mission
bars; §4 engagement/pacing/spam/recoverability HOLD}. METHOD: the
tuning-numbers-only template's method block applies verbatim (json driver,
one lever family at a time, cliff mapping, sims 100/200/1000, tests
UNEDITED).

[STANDARD CLOSE — overnight riders: stop after the PR is open, post the link
on this issue (+ the #studio-feed one-liner if available); CHANGELOG per
stage; a MORNING PLAYTEST GUIDE focused on feel; checkpoint in the morning
{+ ultra recommendation if top-tier}. Park-don't-grind: if blocked after
honest effort, park with the exact blocker written on the PR.]
```
