# Template: audio pass

**When:** new or reworked sounds. Standing rule: `src/audio.js` is touched
ONLY on dedicated audio branches (set at the module split, held through #80).
**Evidence:** PR #80 (bespoke tower/signature/economy sounds) — including the
local-RNG determinism rule and the sound-board protocol; issue #64 carries
the running debt list (all five roster newcomers still owe bespoke sounds).
**Review tier:** no checkpoint — CI + byte-identical proofs + the developer
auditioning ON DEVICE (preview tooling can't play audio; #64/#80 precedent).

**Planner blanks:** the event list (engine hook → intended sound feel) ·
which existing FX hooks suffice vs which need new no-op hooks · branch.

```
[STANDARD HEADER — + docs/FRANCHISE_BACKBONE.md for tone]

FILE CONTRACT (the #80 shape, whether or not a parallel chat is running):
you own src/audio.js + the FX-wiring block in src/main.js + no-op call-site
additions in src/engine.js ONLY (new FX hooks default to () => {} so the
headless sim runs them as no-ops and the gauge cannot move — one line each).
No render.js/art.js/data.js/style.css.

THE RNG TRAP (the invariant): all audio randomness uses a LOCAL xorshift rng
(audio._rand — the #80 pattern), NEVER the global Math.random — the seeded
smokes desync otherwise and the byte-identity proof below will catch you.

EVENT → SOUND MAP: {TABLE — engine hook/event → the sound's fantasy, e.g.
"pit smoke tick → low charcoal crackle". 100% procedural Web Audio in the
house voice/noiseBurst/env style — no assets, no deps, Saturday-morning
tone.}

MIX DISCIPLINE (#80): everything routes through the shared master gain +
soft limiter; repeat-heavy events throttle per-key so a full board can't
clip or machine-gun.

THE SOUND BOARD: extend tools/dev/harness.html?mode=sounds with a play
button per new event (buttons satisfy the browser audio-unlock rule) — the
audio contact sheet; the whole pass auditionable in one place.

[STANDARD CLOSE — verification adds: gate + BOTH smokes byte-identical to
main (the RNG-trap check); structural in-browser verification (zero throws,
context runs, every hook fires — quote which); the developer confirms actual
sound on device. Tier: no checkpoint. Update issue #64's debt list.]
```
