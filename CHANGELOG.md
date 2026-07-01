# Changelog

All notable changes to Deckbound are recorded here. Newest at the top.
Format is deliberately simple and plain-language.

## [Unreleased]

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
