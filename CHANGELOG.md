# Changelog

All notable changes to Deckbound are recorded here. Newest at the top.
Format is deliberately simple and plain-language.

## [Unreleased]

### Added
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
