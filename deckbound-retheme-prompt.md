# Deckbound Re-theme: "Hungry Customers vs. Runaway Food"

## Before you do anything

1. Read `PROJECT.md` and `GAME_BRIEF.md` at the repo root, per the standing session rules. All agent roles (Developer, QA, Game Designer, Researcher, Compliance), the working loop (Issue → plan → branch → small PR → report → stop), and every guardrail in PROJECT.md **stay exactly as they are**. This task changes the game's theme and one map — not how we work.
2. Read `CHANGELOG.md` top to bottom so you know what's actually built (full v1 loop, 5 towers, 4 enemies, upgrades, Essence meta-progression, data-driven balance + map in `data/balance.json`, `tools/gen_balance.py`, `tools/balance_sim.py`).
3. Note the authorization: GAME_BRIEF.md's Theme section explicitly says the theme is open and swappable anytime. This task exercises that clause. Nothing else in the frozen brief changes — genre, pillars, core loop, pacing, and milestone scope are untouched.

## The new theme (this replaces the arcane wardens / Wellspring / Blight placeholder)

**Core relationship:** hungry restaurant customers (the towers) vs. runaway food (the enemies).
**One-line pitch for the theme:** the customers are the towers, and dinner is trying to get away.
**Map 1 fiction:** an **American diner** with a **conveyor belt**. Food comes out of the **kitchen** (spawn) and rides the belt toward the **trash chute** (the core). Customers are seated at tables along the belt (the tower slots) and **eat** food as it passes (attacks = bites/chomps). Any dish that reaches the trash chute is **wasted** — lives are the amount of food wasted before the restaurant's Health Rating hits zero and the inspector shuts you down.
**Franchise structure rule (record in the backbone doc):** each map is a different restaurant type, and **the restaurant type determines the enemy roster**. Map 1 is the American diner, so all Map 1 enemies are American diner food, scaled by HP: low-HP starters (chicken nugget, fries) up to high-HP entrées (burger, steak). Future restaurants introduce their own rosters (e.g., a pizzeria debuts the splitter enemy; a seafood place debuts an armored lobster). One restaurant per map — do not mix cuisines on Map 1.
**Tone:** general-audience, Saturday-morning-cartoon. Food is cute and panicky (googly eyes, little legs); customers are charming gluttons. The "violence" is dining — keep it comedic, never gross.
**Original content only** — no real brands, chains, mascots, or trademarked food characters, per the existing compliance guardrail.

## Naming map (display layer)

Rename in UI text, HUD labels, card names, hub/shop text, end screens, and code comments. Where a themed name is needed, use these:

| Current | New display name | Fiction |
|---|---|---|
| Core / Wellspring | Trash Chute | Dishes reaching it are wasted |
| Lives | Health Rating | Wasted food lowers it; 0 = shutdown |
| Currency (in-run) | Tips ($) | Eaten food pays |
| Essence (meta) | Golden Forks | Earned per run, spent in the hub |
| Enemies / Blight | Dishes / Runaway Food | |
| Arrow tower | **The Regular** | Steady single-target fork-stabs |
| Cannon tower | **Big Appetite** | Inhales everything in a radius (splash) |
| Frost tower | **The Photographer** | Food freezes to pose for the shot (slow) |
| Sniper tower | **Chopstick Sensei** | Plucks one dish from across the room (long range) |
| Zap tower | **The Kids' Table** | Cheap, fast, tiny bites |
| Mote enemy | **Chicken Nugget** | Basic starter; low HP, waddles along the belt |
| Runner enemy | **The Slider** | Fast, frail — a small burger that slides down the belt (sliders are literally fast little burgers) |
| Brute enemy | **Tough Steak** | Slow, high HP — well-done and hard to chew through |
| Swarm enemy | **Fry Swarm** | Tiny, many, low HP each |
| Upgrade levels 1→2→3 | **Appetizer → Entrée → Dessert** | Same 3-level system, renamed |
| Deck | **Regulars roster** | Cards = customers you've recruited |
| Drawing a hand | **Tonight's walk-ins** | |
| Placing a card | **Seating a customer** | |
| Sniper unlock in shop | **"Reserve Chopstick Sensei's seat"** | |
| Perk: +50 currency | **Cash float** | |
| Perk: +3 lives | **Forgiving inspector** | |

Enemy HP progression must read on sight: Nugget and Fries = low-HP early food, Slider = mid, Tough Steak = the big one. This is a display mapping onto the existing four archetypes — HP values themselves do not change.

## Hard invariants (do not violate)

- **Do NOT rename internal IDs** in `data/balance.json`, localStorage keys, or code identifiers (`arrow`, `cannon`, `frost`, `sniper`, `zap`, `mote`, `runner`, `brute`, `swarm`, essence keys, unlock keys) in the reskin phases. Renaming IDs breaks existing localStorage saves and `tools/balance_sim.py`. Display names only. (An ID migration can be proposed later as its own issue with a save-migration plan.)
- **Do NOT change any balance numbers.** The current config reads BALANCED (~60% for the reference strategy). After every phase, run `tools/balance_sim.py` and confirm the result is unchanged. If a change accidentally moves it, that's a bug.
- **Do NOT add dependencies** without asking. All art stays canvas-drawn; all audio stays Web Audio, generated in code.
- The game must remain playable by double-clicking `index.html` (keep the `gen_balance.py` → `balance.data.js` flow; re-run the generator if you touch the JSON).
- Keep the iPhone landscape/portrait canvas fixes in `style.css` intact — test at the viewport sizes listed in the changelog if you touch layout.
- Follow the PR loop: each phase below is its own Issue + branch + small PR with plain-language testing steps and a CHANGELOG entry. Never merge yourself.

## Phased plan (one PR each, in order)

### Phase 0 — Docs (Game Designer hat)
- Update the **Theme** section of `GAME_BRIEF.md` with the theme above (keep it as short as the current placeholder; note it replaces the placeholder under the brief's own "swap anytime" clause).
- Move the arcane wardens / Wellspring / Blight theme text into `docs/ideas-parked.md` (parked, not deleted).
- Add `docs/FRANCHISE_BACKBONE.md`: one page capturing the core relationship ("customers are the towers, dinner is trying to get away"), the through-line ("every game is about eating the food before it goes to waste"), the cast table above with one personality line each, the threat definition (runaway dishes; eaten = revenue, wasted = the loss condition), the core verb (**CHOMP**), and tone rules. Note that future games in other genres reuse these primitives; that's context, not scope — do not build anything beyond this TD game.
- Update `README.md`'s one-liner to mention the theme.

### Phase 1 — Text & label reskin (Developer hat)
- All player-facing strings in `main.js` and `index.html`: HUD labels (Health Rating, Tips, Wave → "Course"? keep "Wave" if "Course" collides with the upgrade names — your call, propose in the PR), tower/enemy display names, upgrade level names (Appetizer/Entrée/Dessert), hub and shop text, win/lose/end screens ("Service complete!" / "Shut down by the health inspector"), button labels ("Start Wave" → "Send Out the Food" or similar).
- `data/balance.json`: if display-name fields exist, update them; if names are hardcoded in `main.js`, add display-name fields to the JSON and read them (keeps future reskins data-driven). IDs unchanged.
- Verify: sim result unchanged; a full 10-wave run plays identically; localStorage unlocks from a pre-change save still work.

### Phase 2 — Art reskin (Developer hat)
Canvas-drawn, original, cheap shapes with one readable identity feature each — same discipline as the current "ornamental detail" tower art:
- **Enemies:** Chicken Nugget (golden lumpy blob, googly eyes, tiny legs), The Slider (small round burger seen side-on — bun/patty/bun stripes — with motion lines), Tough Steak (wide dark-brown slab, grill marks, thick outline so it reads as the big one), Fry Swarm (cluster of thin yellow rectangles in a red carton-ish grouping). Size should echo HP: Nugget and fries small, Slider medium, Steak visibly the largest. Keep silhouettes distinct at small size and clearly distinct from each other in color.
- **Towers:** seated-customer glyphs at tables — The Regular (fork raised), Big Appetite (wide open mouth), The Photographer (camera + flash burst on attack), Chopstick Sensei (chopsticks + glasses glint), Kids' Table (small cluster, party hat). Upgrade levels add visible props (napkin tucked in → bib → chef's-kiss sparkle, or similar) — reuse the existing grow/glow/pips system.
- **Core:** trash chute / bin art replacing the Wellspring; the existing flash + screen shake on a leak stays (now it's a dish clattering into the trash).
- **HUD icons:** lives icon → a plate or star-rating glyph; currency icon → a tip coin/dollar glyph. Canvas-drawn like the current ones.
- **Kill juice:** the particle burst on kill becomes a **CHOMP** — crumb particles + a brief bite-mark/star pop; the "+currency" popup becomes "+$ tip". Keep the non-lethal white spark (now a fork *tink*).
- Verify: all 5 towers and 4 enemies readable and distinct at iPhone size; sim unchanged.

### Phase 3 — Map 1: the conveyor belt (Developer hat)
- Edit `data/balance.json` `map.path` / `map.slots` so the path reads as a conveyor line through a restaurant: spawn at a **kitchen door** on one side, winding past table slots, ending at the **trash chute**. Keep total path length and slot count in the same ballpark as the current map so balance holds — confirm with the sim (it marches by arc-length on the real path, so it will catch drift).
- Draw the path as a **belt**: dark band with moving hatch/segment lines animating in the travel direction (the fixed-timestep loop makes this trivial), kitchen doorway art at spawn, trash chute at the end. Background: **American diner** styling — checkerboard floor, simple booth/table shapes under the slots, maybe a counter along one edge. Keep it low-contrast so towers/enemies pop.
- Verify: 10-wave run on the new map; sim reads BALANCED (45–60%); if it drifts, adjust path geometry (not balance numbers) and re-check.

### Phase 4 — Audio reskin (Developer hat)
- Web Audio only, generated in code, as now: attack sounds become bite/chomp variants per tower (keep the per-type distinction and randomization), kill = satisfying crunch/gulp, leak = clatter + sad trombone-ish descending blip, upgrade = "order up!" ding (bell-like). Keep the mute toggle and first-tap unlock.

### Phase 5 — File follow-up Issues (Game Designer hat — file only, do not build)
- **Map 2: the Pizzeria + Pizza Supreme (splitter enemy):** the second restaurant introduces the pizzeria roster, headlined by the franchise's first NEW mechanic — Pizza Supreme dies into 2–4 Slice children with split HP (needs spawn-on-death support, its own balance pass, and a sim update). Restaurant-per-map = roster-per-map is the expansion pattern going forward.
- **Future restaurant concepts (park in `docs/ideas-parked.md`):** seafood shack (armored Lobster Deluxe as its tank), drive-thru (short, fast single lane), buffet (multi-lane). Do not build; just record.
- **Optional ID migration** (internal names → themed names) with a localStorage save-migration step, if we ever want it.

## Definition of done (per PROJECT.md, plus)

Each phase: game runs end-to-end on Mac + iPhone sizes, sim result unchanged (or explained), CHANGELOG entry written, PR open with testing steps, and you stop for review. After Phase 4 the entire game should present as the restaurant theme with zero references to Wellspring/Blight anywhere player-facing, and zero gameplay/balance changes.

