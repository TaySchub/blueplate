# Changelog

All notable changes to Deckbound are recorded here. Newest at the top.
Format is deliberately simple and plain-language.

## [Unreleased]

### Fixed
- **Blocky canvas scaling on Retina/iPhone screens.** `style.css` forced
  `image-rendering: pixelated` on the game canvas ("crisp edges when we draw
  pixel art later") — but the art became smooth vector-style canvas drawing,
  not pixel art, so on any screen where the 800×450 canvas is scaled
  (devicePixelRatio 2–3 on Mac Retina and every iPhone) all the mascots,
  outlines, and canvas text rendered visibly jagged with nearest-neighbor
  sampling. Removed the override so the browser's default smooth scaling
  applies; canvas text now matches the page's HTML text in sharpness.
  No gameplay/balance change. File: `style.css`.

### Changed
- **Docs/comment alignment + a balance ease** (Developer hat). Post-rework cleanup
  so nothing reads as outdated: `docs/FRANCHISE_BACKBONE.md` cast roles +
  personalities rewritten to the new combat identities (Big Appetite = heavy
  single bite, Photographer = freeze→slow, Milkshake Slurper = fast drain, Kids'
  Table = multi-target); `GAME_BRIEF.md` behavior examples updated; stale `main.js`
  comments fixed (Big Appetite plate/single-bite, Slurper fast-drain, the audio
  `sniper` case renamed off "Chopstick Sensei"); a pointer note added to the
  historical `deckbound-retheme-prompt.md` naming map. Balance ease: Big Appetite
  cooldown **3.0 → 2.8s** — reference build **53.0% (BALANCED)**. (Flagged for the
  audio branch: some attack *sounds* no longer match the reworked attacks.)
- **Combat feel tweaks** (Developer hat, follow-up to the rework):
  - **Milkshake Slurper** — the straw now **stays attached** to one dish and sips
    fast until it dies or leaves range (was rapid-firing separate straws); sip
    sound throttled. Sniper fires instantly now (no traveling projectile).
  - **Big Appetite** — **lunges ~2× farther** and the CHOMP is punchier (bite
    flash + chunkier crumbs). **More damage, slower reload** (72→90 dmg,
    2.4→3.0s); reference re-checked at **46.5% (BALANCED)**.
  - **Kids' Table** — the grab hands now have **little arms** (sleeve + forearm)
    so they read as kids reaching in.
- **Combat rework: five distinct attack identities + new mechanics** (Developer
  hat). Builds on the art deep-dive branch. Each customer now fights differently,
  with the mechanics mirrored in `tools/balance_sim.py` so the sim stays honest:
  - **The Regular** (`arrow`) — throws forks; mid damage, medium speed (unchanged
    numbers, now a themed fork projectile).
  - **Big Appetite** (`cannon`) — **single-target** now (was splash): lunges in and
    his **mouth chomps** the dish right on the belt (instant, big damage 90→72,
    slow 2.4s reload, short range). Reusable tower-lunge added.
  - **The Photographer** (`frost`) — new **freeze** mechanic: a flash makes the dish
    **pose (freeze) 1s**, then it's **slowed 3s** (0.62×); very low damage. Camera
    viewfinder-frame visual, no ice.
  - **The Milkshake Slurper** (`sniper`) — tiny damage, **very fast** (~7 sips/sec),
    small-med range: you watch a dish's HP drain up the straw.
  - **The Kids' Table** (`zap`) — new **multi-target**: 3 hands grab up to 3 dishes;
    if only one is in range all three pile onto it (3× damage). Instant hand-grab
    visual.
  - **Progressive food bites:** dishes show a bite eaten out past 3/4 HP that grows
    past 1/2 HP; the Fry Swarm loses fries (5→3→1). Reads a dish's health at a glance.
  - **Balance:** `balance_sim.py` extended for freeze + multi + single-target; a
    tuning pass lands the reference build at **50.7% (BALANCED)** while keeping the
    Photographer's 1s/3s feel. `audio` object untouched.
- **Art deep-dive: all 5 customers + 4 foods redrawn** (Developer hat). Every
  tower is now a fully-drawn seated-diner mascot with its own body and props
  (still canvas-only, signature color kept as the at-a-glance ID), and every
  enemy is a food-forward, faceless dish designed to read on the belt at ~15px:
  - **Customers** (`drawCustomer`, now dispatched to a per-id mascot; the shared
    legacy glyph is gone): **The Regular** (raised fork), **Big Appetite** (round
    glutton holding a plate), **The Photographer** (beret + camera, flash on
    fire), **The Milkshake Slurper** (soda-jerk sipping a shake — renamed from
    Chopstick Sensei; the long slurp-straw is reserved for the attack pass), and
    **The Kids' Table** (a huddle of party-hat kids).
  - **Foods** (`drawFood`): **Hot Dog** (renamed from Chicken Nugget), **Slider**,
    **Tough Steak**, **Fry Swarm** — silhouette-first, sized by HP, with grounding
    shadows; distinct in both shape and color.
  - Two **display-name** changes only (sniper → *The Milkshake Slurper*, mote →
    *Hot Dog*) in `data/balance.json` + `docs/FRANCHISE_BACKBONE.md`; ran
    `gen_balance.py`. **No IDs, balance numbers, gameplay, map, or the `audio`
    object touched.** `balance_sim.py`: reference **55.5% (BALANCED)**, unchanged.
- **Audio warmth pass** (Developer hat). Feedback was that "pretty much every
  sound kind of has a robotic sound to it" — the Phase 4 audio reskin got the
  *themes* right but the raw oscillators/white-noise still sounded synthetic.
  Same 100% procedural Web Audio, no files, no libraries — just better synthesis:
  - New shared helpers in the `audio` object: `env()` (soft-attack, click-free
    exponential-release gain envelope — the #1 fix for "robotic," since hard
    gain jumps/stops are what read as digital clicks) and `voice()` (2–3
    slightly detuned oscillators layered through a lowpass filter, with
    optional vibrato/pitch drift and a filter-cutoff sweep). `tone()` now
    delegates to `voice()` so every caller gets the envelope for free.
  - `noiseBurst()` now runs white noise through a bandpass/lowpass filter
    (instead of raw broadband noise) for organic chomp/crunch/clatter
    transients instead of "static."
  - Every effect rebuilt on these helpers: attacks (bite/chomp per customer —
    cannon=deep gulp, frost=shutter-click nibble, sniper=crisp pluck,
    zap=tiny nibble, default=fork-stab), kill (crunch + gulp), leak (clatter +
    descending "trombone," now with a touch of vibrato), upgrade ("order up!"
    bell), hit (light fork tink), build/deny/waveStart/buy/win/lose. Same
    per-type distinction and pitch randomization as before — only the timbre
    changed.
  - **No gameplay/balance change** — sim still reads **55.5% (BALANCED)**. Mute
    toggle and first-tap unlock behave exactly as before (verified: zero
    oscillators created while muted; no throw when not yet unlocked).
  - Verified structurally in a browser: no JS console errors, AudioContext
    reaches `"running"` after unlock, and every `audio.*` effect method runs
    without throwing. Actual sound quality still needs on-device confirmation
    from the developer — the preview tooling can't play audio. Files:
    `main.js` (+ `index.html` cache-bust).

### Added
- **Re-theme, Phase 5 — file follow-up design** (Game Designer hat; file-only, no
  build). Closes out the retheme by recording future work: filed **Issue #39 —
  "Map 2: the Pizzeria + Pizza Supreme (splitter enemy)"** (the franchise's first
  new mechanic — spawn-on-death, needs an engine + sim + balance pass), and parked
  three later restaurant concepts (seafood shack / drive-thru / buffet) in
  `docs/ideas-parked.md`. No gameplay change. (The optional internal-ID→themed-name
  migration was deferred.) File: `docs/ideas-parked.md`.
- **Re-theme, Phase 4 — audio reskin** (Developer hat; Issue #37). The procedural
  Web Audio (generated in code, no files, no deps) now sounds like the diner.
  **No gameplay/balance change** — the sim still reads **55.5% (BALANCED)**.
  - **Attacks are bites/chomps**, one flavor per customer (per-type distinction +
    ±7% pitch randomization kept): deep inhaling gulp (Big Appetite), shutter-click
    nibble (The Photographer), crisp pluck (Chopstick Sensei), tiny fast nibble
    (The Kids' Table), steady fork-stab (The Regular).
  - **Kill = a satisfying crunch + gulp** (swallow-down sweep + a low tail).
  - **Leak = a clatter + a sad descending 'trombone' blip** — a new `audio.leak()`
    fired when a dish reaches the trash chute (the flash + shake already there).
  - **Upgrade = an "order up!" service-bell ding-ding** (bell-like).
  - Non-lethal hit = a light fork *tink*. The **mute toggle + first-tap unlock are
    unchanged**.
  - Verified in a browser: no JS errors; the AudioContext runs and every sound
    generates without throwing; `audio.leak()` fires exactly once on a real leak
    (lives decrement correctly). Actual sound to be confirmed on-device (the
    preview can't capture audio). Files: `main.js` (+ `index.html` cache-bust).
- **Re-theme, Phase 3 — Map 1: the conveyor belt** (Developer hat; Issue #35).
  Map 1 now reads as an American diner: food leaves the **kitchen** (spawn), rides
  a **conveyor belt** past the tables, and any dish reaching the **trash chute** is
  wasted. **No gameplay/balance change** — the map geometry (`map.path`/`map.slots`)
  is unchanged, so the sim still reads **55.5% (BALANCED)**; this is all rendering.
  - **Belt** (`drawPath`): metal rails + a belt surface with **slats that animate
    toward the chute** (offset driven by `game.elapsed`, so the fixed-timestep loop
    conveys it for free).
  - **Kitchen door** (`drawKitchenDoor`) at the spawn — swinging half-doors + a
    "KITCHEN" sign; dishes emerge from its dark mouth. (Trash chute was already
    themed in Phase 2.)
  - **Diner background** (`drawBackground`): a low-contrast checkerboard floor +
    booth/table pads under the seats — kept subtle so the belt, customers, and food
    stay the things that pop. Verified at desktop + iPhone (375px).
  - **Why the geometry is untouched:** the existing serpentine already reads as a
    winding conveyor line (kitchen at the left entry, chute at the right end), and
    keeping it guarantees the balance the sim locked at 55.5% — which the spec
    prioritizes ("keep total path length + slot count so balance holds"). A future
    map redesign can be its own issue.
  - Removed the now-dead path-color constants. Files: `main.js` (+ `index.html`
    cache-bust).
- **Re-theme, Phase 2 — art reskin** (Developer hat; Issue #33). All-new
  canvas art for the restaurant theme — original, cheap shapes, one readable
  identity feature each. **No gameplay, no balance numbers, no internal IDs, no
  dependencies**; the reference board still reads **55.5% (BALANCED)** (the sim
  reads only `data/balance.json`, which is untouched).
  - **Enemies are now food** (`drawFood`): Chicken Nugget (golden blob, googly
    eyes, legs), The Slider (bun/patty/bun burger with motion lines), Tough Steak
    (dark slab, grill marks, thick outline — reads as the big one), Fry Swarm (a
    scatter of yellow sticks). Enemy colors are now food colors; **radii are kept**
    because they already echo real HP (steak > nugget > slider > fries).
  - **Towers are now seated customers** (`drawCustomer`): The Regular (raised
    fork), Big Appetite (open mouth), The Photographer (camera + a flash burst
    when firing), Chopstick Sensei (glasses + chopsticks), The Kids' Table (party
    hat). Upgrades add a napkin/bib (Entrée) and a chef's-kiss sparkle (Dessert),
    reusing the existing grow/glow/pips.
  - **Core → trash chute/bin** (lid, ridges, "TRASH"); the leak flash + screen
    shake are kept.
  - **HUD icons:** lives → a star-rating glyph; currency → a tip coin ($).
  - **Kill juice → CHOMP:** a bite-flash pop + scattering crumbs; the kill popup
    is now "+$N tip". The non-lethal white spark (fork tink) is kept.
  - Removed the now-unused geometric `drawTowerShape`/`drawTowerDetail` and the
    dead `shape` field. Verified all 5 customers + 4 foods read distinctly at
    desktop and iPhone (375px) size. Files: `main.js` (+ `index.html` cache-bust).
- **Re-theme, Phase 1 — text & label reskin** (Developer hat; Issue #31). Every
  player-facing string now reads as the restaurant theme; **no gameplay, no
  balance numbers, no internal IDs changed** — the reference board still reads
  **55.5% (BALANCED)** in `tools/balance_sim.py`, and a pre-change localStorage
  save still loads.
  - **Display names are now data-driven.** Tower `name`/`blurb` and enemy `name`
    moved out of `main.js`'s art objects into `data/balance.json` (read via the
    generated `balance.data.js`), so future reskins are a JSON edit. IDs
    (`arrow`/`mote`/…) are unchanged; only added string fields.
  - **Customers (towers):** The Regular, Big Appetite, The Photographer, Chopstick
    Sensei, The Kids' Table. **Runaway food (enemies):** Chicken Nugget, The
    Slider, Tough Steak, Fry Swarm.
  - **UI strings:** Golden Forks (was Essence), Tips (currency), Health (lives),
    the TRASH chute (core), upgrade levels shown as **Appetizer → Entrée →
    Dessert**, "Open for Service", "Send Wave", "Full menu / All-you-can-eat"
    modes, hub/shop labels (Reserve Chopstick Sensei's seat, Cash float, Forgiving
    inspector), and end screens ("Service complete" / "Shut down by the health
    inspector"). `index.html` tagline/footer/aria-label themed too.
  - **Kept "Wave"** (not "Course") for the wave counter, because "Course" now
    collides with the Appetizer/Entrée/Dessert upgrade levels.
  - **Known cosmetic follow-up for Phase 2 (art):** the longer names are tight in
    the small deck/toolbar cards (shrunk to 9px as a stopgap); Phase 2 redraws
    those cards and will fit them cleanly.
  - Files: `data/balance.json`, `main.js`, `index.html`, `balance.data.js`
    (generated).
- **Re-theme, Phase 0 — docs only** (Game Designer hat; Issue #29). Starts
  re-skinning the game from the arcane-wardens / Wellspring / Blight placeholder
  to **hungry restaurant customers vs. runaway food** (the towers are seated diner
  customers; the enemies are dishes escaping down a conveyor belt to the trash
  chute). This phase changes **documentation only** — no gameplay, no balance
  numbers, and no internal IDs (`arrow`/`mote`/etc.) change; the reference board
  still reads 55.5% (BALANCED) in `tools/balance_sim.py`. Changes:
  - New `deckbound-retheme-prompt.md` at the repo root — the authoritative
    retheme spec (naming map, hard invariants, phased plan).
  - Rewrote the **Theme** section of `GAME_BRIEF.md` (that section only, which the
    brief marks as swappable) to the restaurant theme.
  - New `docs/FRANCHISE_BACKBONE.md` — core relationship, through-line, cast table
    (5 towers + 4 enemies with personalities), threat definition, core verb
    (**CHOMP**), and tone rules.
  - Updated `README.md`'s one-liner to mention the theme.
  - **Developer deviation from the spec:** the spec said to *park* the old theme
    in `docs/ideas-parked.md` ("parked, not deleted"); per developer direction the
    old theme was **removed** instead, so it is dropped rather than parked.
  Files: `deckbound-retheme-prompt.md`, `GAME_BRIEF.md`, `docs/FRANCHISE_BACKBONE.md`,
  `README.md`.
- **Larger map, generated waves, and endless groundwork** (developer-approved
  post-v1 addition, beyond the frozen v1 scope).
  - **Bigger map**: a longer, more-winding single map — a six-lane serpentine
    (~2300 px vs ~1350) with 10 tower slots — all in `data/balance.json` (`map`),
    so the game and sim both use it. Still one 16:9 map (multi-map stays parked).
  - **Wave generation**: the fixed 10-wave table is replaced by a `waveGen`
    formula block; `makeWave(n)` (mirrored in `tools/balance_sim.py`) produces
    wave n's hp/speed/interval/composition from base parameters. Finite play now
    runs 20 formula-scaled rounds and still ends in a win. Re-tuned so the sim's
    reference strategy reads ~55.5% — inside the 45–60% band (`hpGrowth` 1.134,
    `countStep` 0.6).
  - **Endless groundwork** (off by default): a finite/endless hub toggle, a wave
    counter, and a score. Endless keeps generating waves until you lose
    (survival + score) — verified by the sim's median-waves-survived metric, not
    win-rate. **Default is finite with the win condition intact; whether to
    offer/keep endless is flagged for the developer (it removes the win.)**
  - Files: `data/balance.json`, `main.js`, `index.html`, `balance.data.js`
    (generated), `tools/balance_sim.py`, `docs/design-bigger-map-endless.md`.
- **Per-tower targeting priority** (developer-approved post-v1 addition). Each
  placed tower now has a targeting mode — **First** (furthest along the path,
  default), **Last**, **Strong** (most HP), **Close** (nearest to the tower).
  Click a placed tower to open a panel with the four modes plus its upgrade
  button; the choice is per-tower and can be changed live during a wave, visibly
  changing which enemy the tower fires at. Default First matches the balance
  sim's frontmost targeting, so no balance change and no sim change. Files:
  `main.js`.
- **Call the wave early for a bonus** (developer-approved post-v1 addition). The
  Start Wave button now shows a currency bonus (e.g. `+18`) that's full the
  instant a prep phase begins and decays linearly to 0 over
  `economy.earlyCallWindow` seconds. Calling the wave grants the current bonus —
  rewarding aggressive play without adding a forced countdown (prep stays
  no-clock; you're never made to start). Bonus size/window are tunable in
  `data/balance.json` (`economy.earlyCallBonus`, `economy.earlyCallWindow`).
  Balance: the sim's steady reference doesn't call early, so the band gauge is
  unchanged (59.5%, BALANCED); the sim reports a "call early" upper bound (88%)
  as the free-income worst case (real aggressive play pays a prep-time cost the
  sim can't model). Files: `data/balance.json`, `main.js`, `tools/balance_sim.py`.

### Changed
- **Cache-busting on deploy.** `tools/gen_balance.py` now also stamps a short
  content-hash version onto `index.html`'s script tags (`main.js?v=…`,
  `balance.data.js?v=…`). GitHub Pages serves assets with a fixed ~10-minute
  cache and no header override, so without this a browser could keep running an
  old `main.js` (or mix a new page with a stale script) after a deploy. The hash
  changes only when a file's contents change — no manual version bumping. (The
  query is ignored by the `file://` resolver, so double-click play is unaffected.)
- **The map is now data-driven.** The path and tower slots moved out of hardcoded
  arrays in `main.js` into `data/balance.json` (`map.path`, `map.slots`,
  `map.coreRadius`). The game builds `PATH`/`SLOTS`/`CORE` from that data, so a
  map can be redesigned by editing JSON — no code change. `tools/balance_sim.py`
  now reads the same map and simulates combat on the real path (enemies march by
  arc-length; towers fire from real 2-D slot positions using 2-D range), so its
  win-rate tracks whatever map you build. The shipped map is unchanged and still
  reads BALANCED (~60%). Only pure art (colors/shapes) remains in `main.js`.
  Files: `data/balance.json`, `main.js`, `balance.data.js` (generated),
  `tools/balance_sim.py`.
- **Balance is now a real single source of truth.** Difficulty & economy numbers
  (tower stats + upgrade deltas, enemy types, the 10-wave table, and the economy)
  moved out of hardcoded constants in `main.js` into `data/balance.json`. The
  game now reads them from `window.BALANCE`, sourced from the JSON via a
  generated `balance.data.js` (so the game still runs when you double-click
  `index.html` — a `fetch()` would be blocked on `file://`). Run
  `python3 tools/gen_balance.py` after editing the JSON. `tools/balance_sim.py`
  was rewritten to model the real 5-tower game (combat, upgrades, economy) from
  the same file — so the sim's win-rate finally reflects what players face. The
  shipped config reads BALANCED (~60% for the reference strategy, in the 45–60%
  band). Art (colors/shapes) and level geometry (path, slots) stay in `main.js`.
  Files: `data/balance.json`, `balance.data.js` (generated), `tools/gen_balance.py`,
  `tools/balance_sim.py`, `main.js`, `index.html`.

### Fixed
- **iPhone landscape clipping.** On a real iPhone in Safari, rotating to
  landscape clipped the top and bottom of the game off-screen — the previous
  fix relied on a flexbox percentage-height chain (`canvas { height: 100% }`
  inside a `100dvh` flex column) that desktop browsers resolve but iOS Safari
  does not, and `dvh` let the canvas size into the strip Safari's floating
  toolbars sit over. Reworked so the canvas sizes ITSELF from the viewport:
  `width: min(100%, (100svh − chrome) * 16 / 9)` with height derived from the
  locked 16:9 ratio — no flex height chain, and `svh` (viewport *with* Safari's
  bars showing) guarantees nothing hides behind the toolbars. Both orientations
  now fit fully and switch cleanly on rotation; also added left/right
  safe-area-inset padding for the landscape notch. File: `style.css`.
  (Note: a web page can't force/lock orientation in iOS Safari, so the phone's
  own rotation is the switch — but portrait and landscape both work now.)

### Added
- **Overnight polish pass** — a full headless run-through (via a script driven
  in a real browser context, stepping `update()`/`render()` through complete
  10-wave runs) confirmed the v1 build with no bugs found, then:
  - **Balance retune.** The old curve let even a 3-tower, no-upgrade build hold
    all 20 lives through wave 9 — all the tension was dumped onto wave 10.
    Lowered `startCurrency` (200→150), raised `upgradeCost` (55/85→70/100),
    lowered `earnPerWave` (45→40) and per-enemy currency rewards (mote 6→5,
    runner 7→5, brute 12→9, swarm 3→2), and steepened the `WAVES` hp/count/
    speed curve so difficulty escalates across the whole run instead of just
    the finale. Verified: a genuinely good build (a handful of well-chosen
    towers, upgraded rather than spread thin across every slot) wins with real
    tension (finishes around 8/20 lives); a weak build (one un-upgraded tower,
    or no towers at all) loses by wave 3.
  - **Juice.** Non-lethal hits now spawn a quick white spark; kills show a
    floating "+currency" popup; the core flashes *and* the screen shakes
    briefly when an enemy reaches it; the HUD lives readout pulses red when
    lives drop to 25% or below.
  - **Mobile landscape fix.** `#game-canvas` only capped width, not height, so
    rotating to landscape overflowed the short viewport. It's now bound by
    *both* dimensions (width-driven in portrait/tall views, height-driven in
    short landscape, via a media query — never both at once, which is what
    was silently stretching the canvas out of its 16:9 ratio during testing).
    Verified at 375×812, 812×375, 844×390, and a 768×1024/1024×768 tablet with
    no overflow or distortion in any of them.
  - **New HUD icons.** The plain ◆/♥ glyphs in `drawHUD` are now small original
    canvas-drawn icons — a warded-shield glyph for lives, a faceted essence
    shard for currency — instead of generic symbol characters.
  - **Richer tower art.** Each of the 5 tower types now has a small original
    ornamental detail layered onto its base shape when placed in-run (arrow's
    nested facet, cannon's stubby barrel, frost's rime spikes, sniper's scope,
    zap's etched bolt), so they read as more than flat silhouettes while
    staying distinct and cheap to draw. Toolbar/hub cards keep the plain
    shapes so they stay legible at small size.
  File: `main.js`, `style.css`.
- **Deck / collection + meta-progression + polish** (Stage 3; Issues #8, #13, #14)
  — completes the v1 loop. New **hub / start screen** showing your card collection
  and an **Essence shop**. Finishing a run earns **Essence** (more for going
  further / winning), which **persists between runs** (saved in the browser via
  localStorage) and can be spent to permanently **unlock the Sniper card** and buy
  starting perks (**+50 currency**, **+3 lives**). Your **deck** = the tower cards
  you've unlocked; the in-run toolbar shows only those (in-run card management kept
  light for v1, per the brief). Runs now flow hub → prep → waves → win/lose →
  run-summary (with Essence earned) → back to the hub. This is the "always
  progressing" pillar: you get stronger across runs. File: `main.js` (+ label
  updates in `index.html`).
- **Content & depth — tower/enemy variety + per-type upgrades** (Stage 2; Issues
  #10, #11, #12). **5 tower types** with genuinely different behaviors, chosen
  from a new bottom **toolbar**: Arrow (balanced single-target), Cannon (splash
  AoE), Frost (slows enemies it hits), Sniper (long range / big hits / slow fire),
  Zap (cheap, fast, weak). **4 enemy types** that waves now mix: Mote (basic),
  Runner (fast, frail), Brute (slow, tanky), Swarm (tiny, many). **Upgrades scale
  each tower's identity** (Frost slows harder, Cannon's splash radius grows, Sniper
  reaches further, etc.). Each tower type also has its own shot sound. Balance is
  still first-pass. File: `main.js` (+ label updates in `index.html`).
- **Core loop — a full playable round** (Stage 1 of finishing the build; covers
  the heart of Issues #4–#7 + #9). Turns the feel-prototype into a real game:
  **build** towers on fixed slots and **upgrade** them by spending **currency**;
  survive **10 escalating waves** with a calm prep phase between them (and you can
  build/upgrade live mid-wave — the "interactive" pacing). Enemies reaching the
  **core** cost **lives**; **win** by surviving all waves, **lose** at 0 lives —
  both with an end screen + "Play again". On-canvas Start Wave button, HUD
  (lives / currency / wave), build & upgrade cost hints, and can't-afford
  feedback. Economy & wave curve are first-pass and **not yet balance-tuned**.
  Keeps the kill/upgrade juice + procedural audio. File: `main.js` (+ label
  updates in `index.html`). Plain canvas, no dependencies.
- **Combat feel-prototype** (on top of #3) — makes two developer ideas playable:
  **juicy upgrade visuals** and **cool, unique kill sounds**. Enemies ("blight
  motes") walk the fixed path; two pre-placed towers auto-target and fire at
  them; hits show health bars and a hurt-flash, kills spawn a particle burst +
  an expanding ring. **Click a tower to upgrade it** (up to level 3) — it visibly
  grows, brightens, gains glow and level pips, and fires faster/harder, with an
  upgrade sparkle + sound. All audio is **generated in-code via the Web Audio
  API** (original, license-clean — no sound files): distinct shoot / hit / kill
  (randomised so it never feels repetitive) / upgrade effects, with a **mute
  toggle** and browser-safe unlock on first tap. Works with mouse and touch.
  NOTE: this is a *feel* prototype — tower positions/stats are hard-coded; real
  placement (#6), currency (#7), waves (#4/#5) and cards (#8+) come next, in order.
  File: `main.js` (plus label/footer updates in `index.html`). Still plain canvas,
  no dependencies.
- **Issue #3 — map & core, game loop.** The canvas now draws the level's single
  fixed path and the **core** (Wellspring) we defend, rendered by a real game
  loop with a stable *fixed timestep* (60 updates/sec, independent of screen
  refresh rate). A small debug readout (fps · elapsed time · update count) and a
  glowing dot travelling the path make it obvious the loop is ticking. The
  travelling dot is only a temporary liveness indicator — not an enemy. Reusable
  path helper (`pointAtDistance`) is ready for enemy movement in #4. File:
  `main.js` (plus label/footer updates in `index.html`). Still plain canvas — no
  new dependencies.
- **Task 1 — project skeleton.** A minimal HTML5 + JavaScript page: a titled
  page ("Deckbound") with a game-canvas placeholder that draws a simple frame
  and title text. No game logic yet. Files: `index.html`, `style.css`,
  `main.js`.
- **Studio Feed workflow** (`.github/workflows/studio-feed.yml`): posts to the
  `#studio-feed` Slack channel on every push and on an hourly heartbeat.
- Project docs versioned at repo root: `PROJECT.md`, `GAME_BRIEF.md`.
- `README.md`, `.gitignore`, `docs/ideas-parked.md`, and a beginner setup guide
  (`SETUP-AND-LAUNCH.md`).
