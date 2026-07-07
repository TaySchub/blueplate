# Template: numbers-only tuning (§4-driven)

**When:** rebalancing existing content — data/balance.json values move,
nothing else. **Evidence:** #63 (first balance pass), #76 part B, #78
(evenness), #87 stage 3, #93 (deep rebalance); method law consolidated in
BALANCE_PHILOSOPHY. **Review tier:** checkpoint before merge, always — and
name the frozen/tunable contract, because the reviewer JSON-walks the diff
against it (#76/#78/#93 verdicts).

**Planner blanks:** the complaint/goal · the TUNABLE set · the FROZEN set
(signature counts/identities are ALWAYS frozen — design, not tuning) ·
whether delta magnitudes are unfrozen this run (a developer decision, #78/#92
precedent) · branch · prereqs.

```
[STANDARD HEADER — + docs/BALANCE_PHILOSOPHY.md: it is the law this PR
measures against; argue with it in the PR body or satisfy it, never quietly
ignore it]

MISSION: {THE COMPLAINT — e.g. "path X dominates its sibling by +30" / "the
newcomers are shelf-priced and probe-dead"}.

TUNABLE: {LIST — e.g. costs, tier costs, bounties, waveGen numerics(, tier
delta MAGNITUDES if the developer unfroze them — stat and cost move
TOGETHER)}. FROZEN: signature counts and identities (tune how hard, never
what they are) · engine mechanics · maps · the reference build {± anything
else}. If two configs tie, ship the one with fewer changes.

MEASURE FIRST (stage-0 baselines before touching anything, #63/#87/#93):
the full --check output · the §4 probe suite (path matrix, solo + equal-spend
fingerprints, slot-9 marginals, spam probe, all-signature premium, micro
benches for any role claims in play) · purchase timeline + pacing stats.
Then tune ONE LEVER FAMILY at a time, re-running the affected probes after
each family — read tables, not one-off runs (batch the sweeps in scratchpad
scripts; keep a journal of every applied value).

TARGETS, priority order: (1) gate 50–60 aim ~55, ≥52 at the exact CI config,
confirmed seeds 1/1000/5000 ×200 + seed 1 ×1000; (2) {THE MISSION BAR — e.g.
sibling |Δ|≤8 / every tower #1 on its role claim / all-sig ≤~+12}; (3) the
§4 engagement/pacing/spam/recoverability bars all HOLD.

METHOD (house law, BALANCE_PHILOSOPHY §3–4): json.load/json.dump round-trip
driver only — NEVER regex/sed balance.json (corrupted twice); explore --sims
100, confirm 200, final 1000; the cliffs are real (±2 damage has swung the
gate 15–20 pts; frost slowDur stays 3.0) — map a cliff before committing to
an edge value and confirm across the three seed bases; prefer round
player-facing numbers; behavior tests must pass UNEDITED — if one fails,
your change broke behavior: fix the change, never the test.

[STANDARD CLOSE — PR body adds: the complete before/after tuning table
(EVERY changed value + a one-line why — the overfit guard is documentation,
not minimalism, #87), the probe tables before/after, NEW smoke baselines
quoted, and a playtest guide with single-lever-per-complaint mapping. Tier:
checkpoint; expect the reviewer to re-run the probe suite. If a bar resists
honest effort, ship the best coherent configuration titled [NEEDS FOLLOW-UP]
with the tension documented — a checkpoint once retired a bar on that
evidence rather than fail the work (#93).]
```
