# Template: display/chrome-only

**When:** UI layout, readability, menus, display strings, renames — anything
the player sees that gameplay never feels. **Evidence:** #72 (icon pass), #95
(10-tower chrome), #97 (menu + display rename); the safety architecture is
#81's DESIGN/BOARD transform. **Review tier:** no checkpoint — CI + the
developer's one batched screenshot round (#72's explicit precedent).

**Planner blanks:** the reported problems (quote the developer/device report
verbatim where possible — #94 was "developer-reported on real device") ·
what's explicitly out of scope · branch · prereqs.

```
[STANDARD HEADER — + docs/ART_STYLE.md]

THE IRON RULE: this PR is DISPLAY-ONLY. You may ADD display strings to
data/balance.json (desc lines, names — display data lives there by design)
but change ZERO numbers and ZERO mechanics; src/engine.js untouched. The
gate (`--check`) and both smoke JSONs must come through BYTE-IDENTICAL to
main — quote the full-output diff. {RENAME RIDER if applicable: internal ids,
localStorage keys, tool flags, CI/branch names are FROZEN — renaming keys
loses player saves (#97); display strings only, and the PR body lists every
place the old name intentionally remains.}

THE PROBLEMS: {NUMBERED LIST — each with its observable fix bar, e.g. "every
tower name renders in full at desktop AND ~844×390" / "prove headroom with
the longest plausible future name"}.

HOUSE CHROME RULES (all set by precedent): chrome extends the DESIGN canvas,
never the 800×450 board space (#81 — one ctx.translate in render, one
inverse in input); ONE geometry source shared by draw + hit-testing per
control (towerPanel/cardRect/railCardRect discipline); new surface colors are
NAMED COLOR entries in src/data.js — maps[].theme is not chrome and stays
untouched (#71/#72); scrollable zones reuse the rail's drag/wheel pattern
with its 8px drag threshold (#90).

[STANDARD CLOSE — PR body adds: before/after screenshots for each problem,
desktop AND phone scale; the touch-target table; any flow the chrome
touches re-drilled end-to-end (the #97 save/continue drill through the new
menu). Tier: no checkpoint — CI + the developer's screenshot round.]
```
