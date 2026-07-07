# Blue-Plate Special Art Style Guide

> **What this is:** the written-down taste of the project, mined from every
> shipped art decision (CHANGELOG, `docs/FRANCHISE_BACKBONE.md`, and the code
> itself). Agents **self-check against this BEFORE requesting art review** —
> the goal is one review round per art pass, not one per asset. The developer
> ratifies changes to this file; when a new call gets made in review, append it
> to the Decision Log at the bottom so it never gets re-litigated.
>
> Companion tool: `tools/dev/harness.html?mode=sheet` renders every unit and
> state onto one contact-sheet canvas — screenshot that for every art PR.

## The style in one line

Saturday-morning-cartoon diner: **charming glutton customers** eating
**panicky, faceless runaway food** — comedic dining, never gross, drawn as
cheap smooth canvas vectors.

## Hard rules (never break)

- **Original content only.** No real brands, chains, mascots, trade dress, or
  trademarked food characters. (Compliance guardrail, `PROJECT.md` §6.)
- **Canvas-drawn vector art only.** No image files, no sprite sheets, no fonts
  beyond `system-ui`. Cheap shapes: circles, capsules, `roundRect`, quadratic
  curves. The art is smooth/anti-aliased — never re-add
  `image-rendering: pixelated` (removed 2026-07-04, PR #47).
- **General audience; the "violence" is dining.** Kills produce a bite-flash
  and **crumbs, not carnage**. Panic is comedic (little legs, speed lines),
  never distressing.
- **Art never changes gameplay.** Colors/shapes/poses live in `src/art.js`
  (scene/UI drawing in `src/render.js`); anything the balance sim needs lives
  in `data/balance.json`. An art PR that moves a number is a bug.

## The identity system (why every unit reads at a glance)

1. **Signature color is the ID.** Each customer's outfit color is their
   at-a-glance identity — skin (`SKIN #f4c48c`) and outline (`MDARK #0b0e14`)
   are shared so the color stays the differentiator. Don't reassign these
   without flagging it:

   | Customer | id | Color | Identity feature |
   |---|---|---|---|
   | The Regular | `arrow` | `#6ea8fe` blue | raised fork, neat hair, hint of belly |
   | Big Appetite | `cannon` | `#ff9d5c` orange | huge open mouth + held plate; mouth snaps shut on the lunge-chomp |
   | The Photographer | `frost` | `#7fe0ff` cyan | beret + chest-held camera; flash pops on fire |
   | The Milkshake Slurper | `sniper` | `#c8a8ff` purple | soda-jerk paper cap + cradled shake + candy-stripe straw |
   | The Kids' Table | `zap` | `#ffe08a` yellow | a huddle of three party-hat kids, arms up |
   | The Short-Order Cook | `cook` | `#e8574e` griddle red | white toque + **red apron**, stands behind a flat-top griddle, flipping with a spatula (a station, not a seated diner) |
   | The Competitive Eater | `eater` | `#8cc152` contest green | lean, seated at a contest table with a **water cup + stack of cleared plates**, open mouth mid-bite |
   | The Pitmaster | `pit` | `#a06a3a` hickory brown | BBQ cap + basting mop behind a **long offset smoker** (chimney puffing; wide shallow station) |
   | The Ranch Fountain | `ranch` | `#f2e8cf` buttermilk cream | a **three-tier fountain cascading ranch** with a tiny awed superfan beside it (tall prop, small footprint) |
   | The Sample Lady | `sample` | `#ff8fb5` sample-cart pink | hairnet + pink vest behind a **demo cart of toothpick-flagged samples**, one held out |

   | Food | id | Color / edge | radius | Identity feature |
   |---|---|---|---|---|
   | Hot Dog | `mote` | `#dca85c` / `#8a5a22` | 12 | bun + sausage + mustard zigzag, tiny legs |
   | The Slider | `runner` | `#e3a95c` / `#7c4a1e` | 9 | stacked side-on burger leaning into speed lines |
   | Tough Steak | `brute` | `#7c3b2c` / `#3e1a12` | 17 | seared slab, grill cross-hatch, cream fat-cap, heavy outline |
   | Fry Swarm | `swarm` | `#f2ca3c` / `#a37e17` | 7 | red carton with fries poking out |

2. **One identity feature each.** A unit earns exactly one signature prop/trait
   (fork, mouth, camera, straw, party hats…). Adding a second strong feature
   dilutes the read — put extra flavor in the fx/upgrade states instead.

3. **Silhouette-first; size = HP.** Every unit must be tellable apart by
   outline alone at true size. Food radii deliberately echo HP
   (steak 17 > hot dog 12 > slider 9 > fries 7) — never resize a food for
   looks without flagging the HP-read consequence.

4. **Foods are FACELESS.** Food-forward, no eyes/faces — panic reads through
   legs, speed lines, and scattering, not expressions. (Supersedes the "googly
   eyes" phrase still in `FRANCHISE_BACKBONE.md`'s tone rules — see Decision
   Log.) Customers DO have faces: catchlight eyes, rosy cheeks, cartoon
   proportions (big head, small body).

## Technique (how it's drawn)

- **Shared helpers, always:** `drawFace` (eyes/cheeks/grin), `drawLimb`
  (dark-underlay capsule limbs), `fillCircle`, `roundRect`, `drawSpark4`.
  New characters compose these; don't hand-roll variants.
- **Everything scales off `r`.** All coordinates are multiples of the unit's
  radius so art survives size changes. No absolute pixel offsets inside a unit.
- **Outline discipline:** `MDARK #0b0e14` outline on every filled shape;
  limbs are a dark underlay stroke + colored top stroke.
- **Grounding:** foods get a soft shadow ellipse under them; customers sit on
  the booth pads the background draws.
- **Palette anchors** (from `COLOR` in `src/data.js`): bg `#10131a`, ink
  `#e8ecf3`, muted `#8b94a7`, gold `#ffe08a`, good `#7dff9b`, bad `#ff6b6b`,
  essence `#c9a6ff`. New colors are allowed but call them out in the PR.

## State language (what each game state looks like)

- **Damage = ONE growing bite** at a fixed per-food spot (`BITE_SPOTS`):
  appears past ¾ HP, grows past ½ HP, bright cut-edge highlight. Never
  multiple bite holes. **Exception:** Fry Swarm loses fries (5→3→1) instead.
- **Hurt flash** = body fill goes white for a beat (props/legs keep color).
- **Freeze (Photographer)** = a *snapshot pose*: overexposed white tint +
  camera-viewfinder corner brackets. **Explicitly no ice, no frost.**
- **Slow** = thin cyan ring around the dish.
- **Upgrades (paths):** each tower has two exclusive upgrade paths, two tiers
  each. Tier 1 = napkin bib; tier 2 = chef's-kiss sparkle (`drawSpark4`); plus
  the existing grow/glow/pips. The committed path also drives per-tower art (the
  Regular's Carving Station fork; Big Appetite's One Big Bite maw vs Speed Eater
  crumbs) — `drawCustomer` opts carry `path` + `tier`.
- **Kill** = CHOMP: bite-flash pop + crumb spray + "+$N tip" popup.

## Attack visual language

Attacks act **on the belt** wherever possible — instant, physical, food-scale:
Big Appetite lunges in and his own mouth chomps; the Kids' Table's sleeve-cuffed
hands reach in and clench; the Slurper's straw stays attached and drains.
Only two things travel: the Regular's thrown fork and the Photographer's flash
orb. Prefer extending this language over inventing new projectiles.

## The readability bar (what "done" must pass)

Render `tools/dev/harness.html?mode=sheet` and check:

- Each changed unit reads at **true size** (foods at their real 7–17px radius
  on the belt strip; customers at toolbar r=8).
- Silhouettes stay distinct from each other.
- The identity feature is still the dominant read; signature color unchanged
  (or the change is flagged in the PR).
- Damage/hurt/freeze/upgrade states don't destroy the identity read.

## Pre-PR checklist (agent runs this alone, before requesting review)

1. Contact sheet rendered, screenshotted, attached to the PR.
2. Checked `docs/art-refs/` for developer references relevant to this pass.
3. Every bullet in "The readability bar" verified on the sheet.
4. Any new color, silhouette change, or identity-feature change is called out
   in the PR body — not left for the developer to spot.
5. Tone check: still cute/comedic; nothing gross; nothing brand-like.
6. If a new taste decision got made, it's appended to the Decision Log below.
7. Batch the whole pass: ONE sheet, ONE review request — never per-asset pings.

## Decision Log (append-only, dated — settled calls; don't re-litigate)

- **2026-07-02** — Kept **"Wave"** (not "Course") for the wave counter: "Course"
  collides with the Appetizer/Entrée/Dessert upgrade names.
- **2026-07-04** (upgrade rework, Issue #54) — **course names
  (Appetizer/Entrée/Dessert) retired**; upgrades are now two named paths × two
  tiers, art escalating per committed path (see "Upgrades (paths)" above). The
  "Wave" call above stands — it never collided with a path name.
- **2026-07-03** (art deep-dive, PR #43) — **Foods are faceless** and
  food-forward; silhouette + panic-motion carry the character. **Developer
  confirmed 2026-07-04:** `FRANCHISE_BACKBONE.md`'s tone rules aligned and the
  unused `drawGooglyEyes()` removed from `main.js`, both in PR #51.
- **2026-07-03** (combat rework, PR #45) — **Freeze = snapshot, not ice.**
  White pop + viewfinder brackets; no icicles, no frost aura on the freeze
  itself (the slow keeps its thin cyan ring).
- **2026-07-03** — **One growing bite** at a fixed spot per food, not multiple
  bites; Fry Swarm loses fries 5→3→1 instead of a bite hole.
- **2026-07-03** — Attacks happen **on the belt** (lunge-chomp, grab-hands,
  attached straw); only the fork and flash orb travel as projectiles.
- **2026-07-03** — Radii kept through the reskin because **size = HP** is a
  gameplay read, not a style choice.
- **2026-07-04** (PR #47) — Canvas scales **smoothly**; the art is vector, not
  pixel art. Never reintroduce `image-rendering: pixelated`.
- **2026-07-04** (free placement, Issue #65) — **Obstacles are furniture, not
  actors.** The diner props (jukebox, counter island, dessert case, booth
  bank, mop bucket) draw dimmer than units — muted accents (diner red
  `#7e3634`, steel `#8f99ab`, wood `#5c4030`, hazard yellow `#c9a337`), MDARK
  outlines, a shared grounding shadow — and scale off their balance.json rect.
  They block tower **placement only**; this game has no line-of-sight, so
  props never affect shots or enemies. Booth pads now draw under **placed**
  towers (the table appears when the customer sits down), not at fixed seats.
- **2026-07-05** (UI & icon pass, Issue #71) — **Chrome speaks one card
  language.** HUD/toolbar/hub-deck/panel all reuse the same vocabulary:
  vector-only icons (never glyphs) — a **rating-star placard** for the Health
  Rating (lives), a **coin** for Tips (one mark at HUD size and shrunk onto
  chips), a **vector padlock** for locked; costs always render as an inset
  **Tips-coin cost chip** (gold affordable / red not). Deck cards read
  portrait-on-top → name → cost chip, with three unmistakable states —
  selected (color frame + top accent bar, stays crisp even when unaffordable),
  hover (lifted border), unaffordable (dimmed + red cost). Chrome surface
  colors are **named `COLOR` entries** (`ctrlBg/ctrlSel/ctrlLine/ctrlLineHi/
  chip/hudBg/unitShadow`) so the coming diner remaster re-points chrome in one
  place; this pass sets **structure/legibility, not a new palette**. Seated
  customers get a soft grounding shadow to lift them off the floor — mascot
  identities themselves were **not** redrawn.
- **2026-07-05** (Blue-Plate Special, Issue #73) — **Map theme is per-map;
  props are palette-driven.** The ratified mockup (`docs/art-refs/blue-plate-
  special-1a.png`) is the 50s-retro reference: cream `#F2E6C6` / navy `#3B4552`
  floor, teal `#2FB4A6` wall frame, red `#E8473F` / yellow `#FFC64B` / silver
  `#C6CCD5` / mint `#BFE3E0` accents. Three new **data-driven, default-OFF**
  theme capabilities let a map opt in without touching others: a `wallFrame`
  (drawn in the bounds margin, costs no floor), belt `chevrons`, and
  `coreStyle:"dishReturn"` (a kitchen-wall slot + "← DISH RETURN" placard vs the
  diner's chute). **Belt surface stays dark even with silver rails** — the foods
  were designed to pop on a dark belt (verified mid-wave). Shared props
  (jukebox/booths/dessert) take an optional `theme.props` palette that
  **defaults to the diner's exact colors**, so the diner stays byte-identical
  (SHA-256-proven) while Blue-Plate recolors; new props (kitchen structure,
  register, counter+stools, prep) are their own kinds. The kitchen is an
  obstacle *structure* here (not the diner's swing-door), entrance dressing
  (OPEN sign + windows) lives in the right margin.
- **2026-07-05** (Mobile-first UI restructure, Issue #79) — **Chrome lives OFF
  the board; the board is a viewport-transformed layer.** The presentation canvas
  is **900×450** = an 800×450 **board** (the sacred engine/sim coordinate space,
  `VIEW`) offset right by a **100px tower rail** (`ctx.translate(BOARD.x, 0)`;
  input maps the inverse). Layout conventions set here: the deck is a **left rail**
  (vertical cards, pause+mute stacked on top), the tower panel is a **right
  slide-in sheet** (not a floating popover) with a **2×2 targeting grid** and
  full-width path/Sell rows, and the retired bottom toolbar's band becomes a
  board **apron** for the tower blurb + Send/Call-Wave button. This is a
  **landscape-only** presentation (portrait out of scope). Touch-target rule
  (the phone acceptance bar): **every interactive rect ≥44 CSS px** in its
  smaller dimension at ~844×390 (design rects are sized ≥53px since scale ≈0.84).
  New chrome surfaces are **named `COLOR` entries** (`railBg`/`sheetBg`/
  `sheetScrim`), consistent with the #71 named-chrome discipline — **structure,
  not a new palette**; mascot art is **unchanged** (presentation-only).
- **2026-07-06** (Roster Growth 1) — **Silhouette diversification is ratified.**
  New customers need NOT be another seated-in-a-circle figure. The **Short-Order
  Cook** (`cook`) is a **station with a person** — a cook standing behind a
  flat-top griddle — sized within the same readability bar (fits the booth pad,
  reads at r=17). The **Competitive Eater** (`eater`) stays seated but **varies the
  table dressing** (a contest table with a water cup + a stack of cleared plates
  instead of the Slurper's shake). Two new signature colors joined the palette:
  **griddle red `#e8574e`** (cook) and **contest green `#8cc152`** (eater), both
  chosen clear of the existing five; signature color stays the dominant read (the
  cook's red apron carries it over the white chef's whites). Tier markers keep the
  house convention — a napkin/side-towel at tier 1, a `drawSpark4` chef's-kiss at
  tier 2. The rail became **scrollable** here (the roster outgrew its 5 slots); the
  scroll is chrome, not art (structure only).
- **2026-07-06** (Roster Growth 2) — **Status effects get their own state
  language, one cue per source kind:** smoke = little gray curls rising off the
  dish; ranch coating = a creamy arc + drips (deliberately NOT the cyan slow
  ring — that stays the Photographer's after-slow); the amp mark = a gold
  toothpick sample-flag planted on top. A **plain stun** (the Sample Lady's) is
  a pause with NO overexposure/brackets — the snapshot language remains the
  Photographer's identity (`freezePlain` flag). Three new signature colors:
  **hickory brown `#a06a3a`** (pit), **buttermilk cream `#f2e8cf`** (ranch —
  flagged: it sits near the Blue-Plate floor cream, but cards live on the dark
  rail and the fountain reads by silhouette), **sample-cart pink `#ff8fb5`**
  (sample). Silhouette diversification continues per the RG1 ruling: a wide
  shallow station (smoker), a TALL prop-with-tiny-person (fountain), and a cart
  station; each keeps ONE identity feature and the shared face/limb helpers.
- **2026-07-07** (10-tower chrome polish, Issue #94) — **Names never truncate; the
  deck wraps.** New helper `fitWrappedName` shrinks the font (then wraps to 2 lines)
  so a tower NAME always renders in full rather than ellipsize — used by the rail
  cards, the hub deck cards, and the upgrade-sheet header. The hub "Your regulars"
  deck **wraps to a 2-row grid** (headroom for ~12 towers) and its cards now reuse
  the SAME `drawDeckCard` renderer as the rail (one card language, per the #71
  ruling); the roomy per-card blurb moved to a **tap-to-open details modal** that
  also lists both upgrade paths' tier descriptions. Upgrade **descriptions** are
  display strings in `data/balance.json` (describe behavior, not values, so they
  never stale). The prep **tutorial hint** gained a backing pill and sits below the
  HUD bar so it never collides with the HUD chips. Display-only: no mascot art, no
  numbers, no mechanics changed.
- **2026-07-07** (Tower Rework, Issue #103) — **The syrup is AMBER, and zones
  get minimal state language.** The Ranch Fountain became **The Syrup Slinger**
  (mechanics PR; display rename, id `ranch` frozen): its signature color moved
  from buttermilk cream `#f2e8cf` to **maple amber `#d98a2e`** — the cascading
  liquid IS the identity, and cream "syrup" read as a lie. Amber sits between
  pit's hickory brown and zap's pale gold; checked apart on the contact sheet;
  the fountain silhouette + superfan are unchanged. New state cues, same tier
  as the smoke curls: the **syrup coat** re-uses the coating-arc-and-drips cue
  in amber (the old ranch cream cue retired with the kit); a **syrup puddle**
  is a flat amber ellipse with a sheen streak, fading out at end-of-life; the
  **ambient smoke aura** is a faint slow-dashed gray ring + two drifting curls
  at the aura's radius. The gold toothpick flag now also marks a VALUE TAG
  (worth-more-on-death) — a tag and a damage amp share the flag. The Sample
  Lady attacks nothing (pure support): her held-out sample bobs gently
  (elapsed-driven) so the sampling survives as pure flavor. The juice layer
  stayed VETOED — no bespoke rings, no new chrome; every cue above is the
  existing status-cue idiom recolored or minimally extended.
- **2026-07-07** (Menu + rename, Issue #96) — **The wordmark is an enamel diner
  sign and the menu speaks its palette.** `drawWordmark` (art.js) is the one
  source for the Blue-Plate Special mark: cream enamel board, navy rim, teal
  neon edge-glow, the blue-plate-with-fork badge, "SPECIAL" reversed out of a
  red ribbon, mustard star sparks — all vector, all scaled off the sign width,
  system font only. The map-theme accents are promoted to NAMED chrome colors
  (`COLOR.signRed/signTeal/signYellow/signCream/signNavy`) — menu screens use
  THESE, never new literals. Menu conventions set here: warm enamel buttons
  with cream borders (`drawDinerButton`), a navy checker backdrop, Back always
  top-left, scrollable pages reuse the rail's drag/wheel pattern with a cream
  scroll thumb. The in-run board chrome is deliberately untouched — the menu is
  the colorful "street front", the diner floor stays low-contrast so gameplay
  reads.
