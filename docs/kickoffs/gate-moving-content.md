# Template: gate-moving content (new enemies / anything entering the waves)

**When:** content the reference build MUST meet — new enemy dishes, waveGen
reshapes. The gate legitimately moves, so stage 1 ships the content and stage
2 re-holds every balance bar. **Evidence:** the #98 dishes kickoff (this
template's source); the bars are BALANCE_PHILOSOPHY §4's, set by #87/#93.
**Review tier:** checkpoint before merge, always — gate-moving (#63/#76/#87/
#93 precedent).

**Planner blanks:** the content set + the stat/art archetype LANES each fills
(builder designs within lanes) · staged-introduction expectations · branch ·
prereqs · what is explicitly reserved (mechanics saved for later features).

```
[STANDARD HEADER — day-or-overnight; + docs/BALANCE_PHILOSOPHY.md (your bars
live in §4), docs/ART_STYLE.md, docs/FRANCHISE_BACKBONE.md]

MISSION: {WHY — e.g. "the roster doubled but the belt serves the same four
dishes"}. Add {N} new enemy types as STAT + ART variants ONLY — zero new
engine mechanics ({RESERVED — e.g. "no splitting; the splitter is Map 2's"});
if a design you want seems to need code, STOP and comment here. This is a
content-PLUS-RETUNE PR: new enemies in the waves legitimately MOVE the gate,
unlike the tower pipeline's byte-identical pattern. ONE PR, TWO staged
commits.

STAGE 1 — THE CONTENT (commit separately):
For each new type, within its lane ({LANES — e.g. ultra-fast glass-cannon /
awkward mid-tank / rare premium high-bounty}): a balance.json enemyTypes
entry (hp/speed muls, radius, bounty ≈ 15×hpMul rubric) + waveGen
typeUnlock/typeWeights entries (staged debut waves — keep the early ramp
learnable) + a drawFood branch with bite states (drawFoodBites/BITE_SPOTS
pattern) at TRUE belt size + the contact-sheet row. Engine: ZERO changes
expected — enemies are data-driven.

STAGE 2 — RE-HOLD EVERY BAR (numbers only):
Retune (waveGen weights/hpGrowth + the new types' own stats/bounties;
existing content only if unavoidable, each with a one-line why) until ALL of
BALANCE_PHILOSOPHY §4 holds — gate 50–60 aim ~55, ≥52 at the exact CI config,
confirmed seeds 1/1000/5000 ×200 + seed 1 ×1000; engagement/pacing/spam/
recoverability bars; the three roster boards quoted. THE CONTENT MUST MATTER:
quote died-at-wave / composition evidence that each new type creates pressure
the old set didn't. METHOD: json round-trip driver only; explore 100 /
confirm 200 / final 1000; respect the §3 cliff map.

[STANDARD CLOSE — PR body adds: per-type archetype rationale + the full
tuning table with one-line whys + NEW smoke baselines quoted + a playtest
guide naming which waves showcase each newcomer. Tier: checkpoint before
merge; the reviewer re-runs the gate suite and probes.]
```
