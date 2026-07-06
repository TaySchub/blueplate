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

1. **Read the backlog.** The plan is the open GitHub Issues themselves —
   pinned first, then by what's ready. No doc keeps a copy of the backlog;
   don't trust one that does. Pick the next ready Issue.
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

## Where things live — THE repo map (single source; other docs point here)

**Game code (the only build targets; `src/` load order matters, plain globals,
no bundler — `file://` double-click still works):**
- `index.html` — page shell + canvas; its `<script>` tags carry `gen_balance`'s
  `?v=` cache-bust stamps.
- `src/data.js` — constants (incl. the `COLOR` palette) + the balance-data
  merge into `TOWER_TYPES`/`ENEMY_TYPES`/`RULES`. No DOM.
- `src/engine.js` — ALL game logic and state. **Must stay DOM/canvas/audio-free**
  (`tools/sim.mjs` runs it headless in Node); side effects go through its `FX`
  hooks, wired by `src/main.js`.
- `src/audio.js` — the procedural Web Audio object (dedicated audio branches only).
- `src/art.js` — pure draw functions (mascots, foods, glyphs, helpers).
- `src/render.js` — the render pass + all UI/screens; panel geometry shared
  with input hit-testing.
- `src/main.js` — the shell: boot, input, fixed-timestep loop, FX wiring.
- `style.css` — page styling around the canvas (no `image-rendering` override —
  the art is smooth vector, not pixel art).

**Data & pipeline:**
- `data/balance.json` — single source of truth for difficulty, economy, waves
  (`waveGen`), the maps (`maps[]` — each with `theme` + `path` / `placement`
  rules / `obstacles` / `simAnchors`; `maps[0]` is the default, `tuned:true`
  marks a calibrated map; the sims build at each map's `simAnchors`, the old
  slot coordinates, so the difficulty gauge is layout-stable), display
  names/blurbs, and
  `target_win_rate` (currently 50–60%). **After editing it — or any
  `src/*.js` file — run `python3 tools/gen_balance.py`** (regenerates
  `balance.data.js`, re-stamps `index.html`; CI fails if you forget). Changing
  gameplay numbers anywhere else is a bug; only pure art stays in `src/art.js`.
- `balance.data.js` — generated mirror; never edit by hand.

**Verification:**
- `.github/workflows/ci.yml` — JS syntax, mechanic tests, generated-file sync,
  map lint, the real-engine band gate.
- `tools/sim.mjs` — THE difficulty gauge, and the only one: the REAL engine run
  headless (`--check` is the CI gate as of Issue #54 PR 5; the Python
  second-opinion model and its wave-parity companion were retired in the
  economy overhaul).
- `tools/dev/harness.html` — contact sheet, seeded smoke run, play driver
  (`?map=<id>` selects a map).
- `tools/maplint.mjs` — validates every `maps[]` entry against the placement
  rules via the real `canPlace` (CI-gated); what makes adding a map cheap.

**Docs:**
- Law (edit only with the developer's say-so): `GAME_BRIEF.md` (frozen spec) ·
  `PROJECT.md` (how we work) · `AGENTS.md` (orientation) · `AUTONOMY.md`
  (overnight policy).
- Canon & taste: `docs/FRANCHISE_BACKBONE.md` (cast/tone) · `docs/ART_STYLE.md`
  (art rules + decision log) · `docs/art-refs/` (developer's visual refs).
- `docs/ideas-parked.md` — graveyard; never build from it.
- `docs/archive/` — superseded historical docs, kept for the record only.
- `CHANGELOG.md` — one entry per merged change (required) · `README.md` +
  `SETUP-AND-LAUNCH.md` — human-facing.

The backlog is GitHub Issues — the single roadmap. Don't create a parallel one.

## Code landmarks (grep to confirm; update this list when they move)

- **`src/data.js` — data merge:** `TOWER_ART`/`ENEMY_ART` (art-only) + `BAL`
  (balance.json) → `TOWER_TYPES`/`ENEMY_TYPES`; economy in `RULES`; `COLOR`.
- **`src/engine.js` — waves:** `makeWave(n)`/`waveTypeWeights` (data-driven from
  `waveGen.typeWeights` + `typeUnlock`) · `getWave` (endless past `waveCount`) ·
  `buildSpawnQueue`.
- **`src/engine.js` — combat:** `updateTowers()` (per-type firing incl. sniper
  straw-lock + zap multi pile-on) · `fireProjectile()` (cannon/zap/sniper act
  instantly; only arrow + frost shots travel) · `resolveHit()` ·
  `applyDamage()` · `pickTarget()` (First/Last/Strong/Close) · `moveEnemies()`
  (freeze → slow) · side effects via the `FX` hooks (wired in `src/main.js`).
- **`src/engine.js` — run loop & economy (ENDLESS — no "won" phase, Issue #75):**
  `startRun` · `startNextWave` · `checkWaveEnd` (always advances — clearing a
  wave never wins; arms auto-start) · `endRun` (defeat only; records
  `META.bestWave`, the persisted best-wave record); income = per-kill BOUNTIES
  (`enemy.bounty` from balance.json `enemyTypes`, paid in `applyDamage`; leaks
  pay nothing) + flat `earnPerWave`; auto-start rounds (`AUTOSTART_OPTIONS`,
  `META.autoStart`, countdown in `update`'s prep branch — armed only by a wave
  resolving, never on run start or restore); meta in `META`/`SHOP`/`loadMeta`;
  particles as pure data via `spawn*`/`updateParticles`. (The early-call bonus
  was removed in the economy overhaul.)
- **`src/engine.js` — save & continue (checkpoint = wave start, Issue #83):**
  `serializeRun` builds the minimal snapshot (`SAVE_KEY`/`SAVE_VERSION`: mapId,
  waveIndex, currency, lives, towers as `{typeId,x,y,upgradePath,upgradeTier,
  targeting}`); `saveCheckpoint` writes it (guarded localStorage, **zero
  Math.random** so the seeded sim stays byte-identical), `checkpointPrep` only in
  prep. Written on prep entry (`startRun`/`checkWaveEnd`), every prep mutation
  (`tryBuild`/`tryUpgrade`/`sellTower`/`setTargeting`), and frozen at the wave
  call (`startNextWave`) — so a tab closed mid-wave already has its wave-start
  save. `restoreRun` → `loadMap` + reset + `rebuildTowerFromSave` (real
  `tryBuild`/upgrade paths, cost bypassed, no RNG — the `restoring` flag suppresses
  mid-rebuild writes), and disarms auto-start for its first prep (the breather).
  `endRun` calls `clearSave`; `readSave`/`hasSave` validate + discard a
  version-mismatch/unparseable/unknown-map blob. Behavior test:
  `tools/tests/save.test.mjs`.
- **`src/engine.js` — free placement (no fixed slots, no tower cap):**
  `canPlace(x, y)` (bounds / `pathBuffer` off the belt / `towerSpacing` /
  obstacle rects, all from the ACTIVE map's bound state) · `tryBuild(x, y)`
  seats the selected type at that point. Obstacles block placement ONLY — no
  line-of-sight.
- **`src/engine.js` — maps as content:** `MAPS` (balance.json `maps[]`) +
  `loadMap(id|obj)` rebinds the per-map bindings (`MAP`/`PATH`/`CORE`/
  `SEGMENT_LENGTHS`/`PATH_LENGTH`/`PLACEMENT`/`OBSTACLES`/`SIM_ANCHORS`/`THEME`);
  boot loads `maps[0]`, the hub `MAP_BTN` picker + `game.mapId` choose it
  (remembered in `META.mapId`). `loadMap` consumes no RNG. Adding a map = a JSON
  block + prop drawers; `tools/maplint.mjs` validates every map via real
  `canPlace`. Per-map `theme` capabilities are **data-driven, default-OFF** so
  new maps don't disturb existing ones: `wallFrame` (margin trim), belt
  `chevrons`, `coreStyle` ("chute" | "dishReturn"), and `theme.props` (recolors
  shared obstacle drawers; absent → the drawers' hardcoded defaults). Two maps
  ship: `blueplate` (default + `tuned:true`, the gate — calibrated to the endless
  survival gauge in Issue #75) + `diner` (`tuned:false`, report-only).
- **`src/engine.js` — upgrades (paths):** two exclusive paths per tower
  (`towerPaths`/`pathAvailable`/`nextTier`); `tryUpgrade(t, pathId)` commits a
  path (locks the other) and applies a tier's deltas via `applyUpgradeDeltas`
  (stat keys + signature flags: `pierce`, `crumbRadius`/`crumbDamage`,
  `knockbackBase`/`knockbackSizeRef`, `freezeTargets`/`drainTargets`,
  `maxTargetsAdd`). The headless sim's reference player buys along a fixed
  `SIM_PATHS` path. Rework tracked in pinned Issue #54. `sellTower(t)` refunds
  `floor(RULES.sellRefund × t.spent)` (spend tracked per tower: base + tiers)
  and frees the floor; the scripted sims never sell.
- **`src/art.js`:** `drawCustomer()` → `drawRegular`/`drawBigAppetite`/
  `drawPhotographer`/`drawMilkshakeSlurper`/`drawKidsTable` · `drawFood()` +
  `drawFoodBites`/`BITE_SPOTS` · shared helpers `drawFace`/`drawLimb`/
  `fillCircle`/`roundRect`/`drawSpark4`.
- **`src/render.js`:** `render()` · `drawToolbar`/`drawHUD`/
  `drawSelectedTowerPanel` + `towerPanel()` (geometry shared with input
  hit-testing) · scene draws (`drawPath`/`drawCore`/`drawEnemies`/
  `drawTowers`/`drawSlurpStraws`/`drawObstacles`) · `drawPlacementGhost`
  (replaced `drawSlots`: pointer-follow build ghost + range preview,
  green/red by `canPlace` + affordability). Scene surfaces (floor/belt/kitchen/
  chute) read the active map's `THEME`, so a reskin is JSON-only; the hub
  `MAP_BTN` map picker (drawMenu) cycles `MAPS`. Pause menu `drawPausedOverlay` +
  `pauseMenuRects` (auto-start segmented row / Resume / Save & Quit, board-space,
  shared draw+hit geometry); hub `RESUME_RUN_BTN` "Continue — Wave N" (drawMenu,
  shown when `hasSave()`, Issue #83).
- **`src/main.js`:** boot · `setupInput` · `startGameLoop` (fixed timestep) ·
  the FX wiring. Pause-menu + hub-Continue hit-testing route to `restoreRun`; the
  `pagehide`/`visibilitychange→hidden` listeners auto-pause on mobile (Issue #83 —
  the checkpoint is already on disk, so no unload save write is needed).
- **`src/audio.js`:** the `audio` object (`voice`/`noiseBurst`/`env` +
  per-event effects) — touch only on a dedicated audio branch.

## Sequencing after the split

Modules unlock parallel work: an art PR (`src/art.js`) and an engine PR
(`src/engine.js`) no longer collide. The rule is now **one worker per FILE at
a time** — never two agents editing the same module concurrently. Cross-module
features (most gameplay work touches engine + render) still run as ONE
worker's branch.

## Verification (prefer deterministic checks over opinions)

CI (`.github/workflows/ci.yml`) runs on every PR: JS syntax, the mechanic
behavior tests (`tools/tests/*.test.mjs`), generated-file sync, map lint, and
the balance band (`node tools/sim.mjs --check` — the real engine, the only
gauge). Never open a PR you expect to fail it.

**Definition of verified — do ALL of this yourself before requesting review.
Never hand the developer an unverified change to preview:**

1. **Everything:** serve the repo root (`python3 -m http.server`), load the
   game, zero console errors.
2. **Difficulty/economy:** run `node tools/sim.mjs --check` (the real-engine
   gate, the ONLY gauge) and quote the win-rate in the PR. The number — not a
   model's "looks balanced" — is the signal that tells the designer to tune
   `data/balance.json`.
3. **Any gameplay change:** run the smoke run in `tools/dev/harness.html`
   (`?mode=smoke&seed=1`) and paste its JSON verdict in the PR. Same seed →
   same run, so a failing seed is a repro URL.
4. **Art:** render the contact sheet (`tools/dev/harness.html?mode=sheet`),
   screenshot it, attach it to the PR, and self-check it against
   `docs/ART_STYLE.md` first. Batch a whole art pass into ONE sheet and one
   review round — never ping the developer per-asset.
5. **Feel checks:** drive the real game in the harness's play section (speed
   multiplier + frame-step) instead of asking the developer to click around.
6. **New mechanic:** it ships with a targeted test in `tools/tests/` (assert
   BEHAVIOR, not tuned numbers, so PR 5 can retune freely; CI runs
   `tools/tests/*.test.mjs`) AND the signature-paths smoke JSON
   (`?mode=smoke&paths=signature`) pasted alongside the stat one.

## Human gates — never cross these without in-the-moment approval

Merging to `main`, cutting a release, **deploying beyond the automatic
Pages-on-merge**, installing a dependency, spending money, or changing repo
settings.
Also honor `PROJECT.md` §6 in full. When you hit a gate, stop and ask.

## Spend & safety

Keep a per-session token budget; the Architect (Opus) has a tighter, separate
budget and every Architect call must be justified in one line. If spend crosses
the cap, stop and report — don't start new Issues. Log every dispatch, model
call, and escalation.
