# Template: content beside the gate (add a tower / add a map)

**When:** new content the sim's reference build never executes — a tower, a
map, an art asset class. The gauge cannot move, so the PR is provably safe by
byte-identity. **Evidence:** the add-a-tower pipeline was set in #90, ratified
in its checkpoint, reused in #91; maps-as-content set in #70/#74. **Review
tier:** followers of the established pipeline = CI + screenshot round (#68,
and #91's verdict pre-cleared "one PR each on this layer"); anything adding
NEW engine vocabulary escalates to a checkpoint — say which in the close.

**Planner blanks:** tower concept + fantasy · band/cost guess (rubric §3) ·
two paths (t1 stat → t2 signature, house format) · which EXISTING engine
vocabulary each signature rides · art direction line · branch name · prereqs.

```
[STANDARD HEADER — day PR unless stated; + docs/BALANCE_PHILOSOPHY.md
(pricing rubric + role map) and docs/ART_STYLE.md on the reading list]

THE INVARIANT THAT SHAPES EVERYTHING: the sim's reference build and both maps
are untouched, so `node tools/sim.mjs --check` AND both harness smoke JSONs
(seed 1, stat + signature) must come through BYTE-IDENTICAL to main
(re-baseline against actual origin/main first; quote the full-output diff).
New content rides BESIDE the gate: its branches must never run in the
reference build and must consume no gate RNG (#90/#91 pattern). If a design
choice would break this, STOP and comment here.

NEW TOWER: {NAME} ({id}, {band} band ~{COST} per the BALANCE_PHILOSOPHY
rubric — your final numbers, documented in the PR).
- Fantasy + attack: {WHAT IT DOES — name the existing engine vocabulary it
  reuses: multi-target / lock-on / knockback / combo state / the status
  layer's applyDot(src)/applyAmp / cone via inCone / periodic-burst timer
  (Ranch Keg) / execute rule (Probe Tender) / splash-radius application
  (crumb pattern). ZERO new engine systems — if the design seems to need
  one, STOP and comment}.
- Paths (t1 stat → t2 signature): {PATH A: t1 → t2 "NAME": effect} · {PATH B:
  t1 → t2 "NAME": effect}. Signature t2s that multiply crowds price +50–100
  over their stat sibling (the all-signature damping rule, rubric §3).
- Pipeline (CLAUDE.md landmarks): balance.json towers block (display name,
  blurb, per-tier costs/deltas + desc strings) + TOWER_ART + TOWER_ORDER + a
  drawCustomer branch in src/art.js (+ the optional per-type engine branch),
  then gen_balance.py. Rail + hub handle any roster size data-driven; names
  to 19 chars proven (#95).
- ART: {DIRECTION — silhouette-first, one identity feature; stations and
  standing figures welcome (the diversification ruling); signature colors
  called out}. Self-check vs docs/ART_STYLE.md + a decision-log line.
- AVAILABILITY: instantly available — add to the default unlocked set; the
  loadMeta unlocked-set UNION migration (#90) hands it to veteran saves.
  Upgrade sheet / sell / save-restore / codex handle it data-driven — verify
  each, change nothing structural. src/audio.js UNTOUCHED: reuse the closest
  existing FX and note that bespoke sounds ride a future audio pass.

TESTS (tools/tests/{id}.test.mjs — behavior, never tuned numbers): {each
mechanic claim as an assertion, e.g. "the DOT ticks only while X", "t2 does Y
and base does not"}. Extend save.test.mjs if the tower carries new
signature-flag state.

REPORT-ONLY PROBES (quote, not gated): 10× solo on the gate map; one A/B
board with vs without the newcomer (its value made visible).

ROLE DECLARATION: state the newcomer's intended BALANCE_PHILOSOPHY §2 role —
name, band, when-you-buy story, ONE measurable best-at claim + its probe,
and the niche fence against its nearest same-band neighbor. §2's
no-domination rule needs every tower claimed; the ratified §2 table row and
the claim's probe-proof land with the tower's next tuning pass (philosophy
edits are developer-ratified).

[STANDARD CLOSE — PR body adds: pricing rationale per rubric + the probe
table + contact-sheet screenshot (all upgrade states) + a board shot at phone
scale. Review tier per the header ruling above.]
```

**Map variant:** same invariant; the block is a `maps[]` JSON entry
(`tuned:false`, report-only until its own calibration PR) + prop drawers +
`maplint` green for ALL maps + the picker reappearing at 2 visible maps
(#74; carry its checkpoint's anchor-mix lesson: author a natural mix of
double- and single-cover anchors — they swing solo probes 3.5%→100%).
