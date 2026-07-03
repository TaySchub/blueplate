# GAME_BRIEF.md — "Deckbound" (working title)

> **Frozen source of truth for the build.** Chosen at the commitment gate. Ideation is **closed** for this game — new ideas go to `/docs/ideas-parked.md`. Refinements *within* this concept are welcome; scope-expanding additions are parked.

## One-line pitch
A tower-defense deckbuilder: draw tower cards, place them along the path, and survive escalating waves — then collect and upgrade new cards between runs.

## Genre
Tower defense + roguelite deckbuilder. Single-player, 2D, web.

## Design pillars (the feel we're protecting)
1. **Collect & build** — a growing collection of tower cards you assemble into a deck (the "ultimate team" satisfaction).
2. **Escalate & survive** — waves get harder; how far can you get? (the round-based-survival tension).
3. **Always progressing** — you earn and upgrade in every run, and unlock permanently between runs (the steady-reward loop).

## Core loop
**Between runs (meta):** build a deck from your unlocked tower cards; pick a map.

**In a run:**
1. **Prep phase** (no clock): draw a hand of tower cards from your deck; spend currency to place towers along the path and upgrade them.
2. **Wave phase:** enemies march the path toward your core; towers auto-fire. **You stay hands-on** — placing and upgrading towers live while the wave runs.
3. **Resolve:** earn currency from the wave; the next wave is bigger and tougher. Repeat.

You **lose** when too many enemies reach your core; you **win** by surviving all waves on the map.

**After a run:** unlock or earn new cards, growing your collection for future decks.

## Key design decisions (locked for v1)
- **Pacing (interactive):** a calm **prep phase** to set up, then you stay **hands-on during the wave** — placing and upgrading towers live as enemies attack. This is the fun, interactive version and it's the locked decision.
- **Map:** a single fixed path with tower slots for the first version. Maze-building and multi-path maps come later.
- **Where the deckbuilding lives:** mostly *between* runs (which cards are in your deck), plus a hand drawn each prep phase. Complex in-run card management is intentionally kept light for v1.
- **Players:** single-player for v1. (Local co-op is a possible later addition; real-time online multiplayer is out of scope.)

## Theme (open — swap anytime, doesn't affect the build)
Placeholder: arcane wardens defending a **Wellspring** from waves of a spreading **Blight** — flexible enough for many tower and enemy types, and easily reskinned. Theme is not a blocker; pick or change it whenever.

## First version ("done") — the milestone
A deployable build, openable on a Mac or iPhone via the GitHub Pages link, playable end to end:
- **1 map** (single path) with a core to defend and a lose condition.
- **~5–6 tower cards** with distinct behaviors (e.g. single-target, splash, slow, long-range, cheap-but-weak).
- **~3–4 enemy types** with escalating stats across **~10 waves**, ending in a clear win.
- The full **prep → wave → resolve** loop with **live in-wave placing/upgrading** and an in-run **currency economy** (earn per wave/kill, spend to place and upgrade).
- A **minimal between-run unlock** (even 1–2 unlockable cards) to prove the meta-progression loop.
- Placeholder art and audio are fine. The bar is that the loop is **fun and stable**, not that it's pretty.

## Explicitly OUT of the first version (parked)
Multiple maps, large card pools, maze/free-path building, online or local multiplayer, monetization, accounts or data collection, and polished art. These belong to later milestones or future cycles.

## Post-v1 additions (developer-approved, beyond the frozen v1)
v1 is complete. The developer has explicitly approved these additions *beyond*
the frozen v1 scope above; they are being built as post-v1 features and noted
here so the brief stays honest:
- **Call the wave early for a bonus** — an opt-in prep-phase currency bonus for
  starting waves promptly (does not change the no-clock prep).
- **Per-tower targeting priority** — each tower can be set to First / Last /
  Strong / Close, changed live by selecting the tower.

## Constraints (from the developer profile)
Beginner developer; agents do the building. Web game in HTML5 + JavaScript on GitHub Pages, tested on Mac + iPhone. Phaser 3 if the real-time action warrants it; plain HTML/CSS/JavaScript is fine if simpler. ~12–15 hrs/week. General-audience content. No monetization now (keep it addable later). **Original theme and assets only — no branded or trademarked content.**

## Open design decisions to resolve early in the build (prototype, then freeze here)
- **Card flow:** are unplayed cards kept across waves or refreshed each prep phase? Are played cards spent for the run or reusable? Prototype whichever is most fun and simplest.
- **Currency:** earned per kill, per wave, or both? Starting amount and tower costs.
- **Upgrade model:** linear tower levels vs. branching upgrades.
- **Difficulty curve:** exact wave count and scaling for the milestone map.
