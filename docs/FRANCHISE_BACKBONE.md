# Franchise Backbone — "Hungry Customers vs. Runaway Food"

The one-page through-line for the theme. This is the fiction the whole game hangs
on; the mechanics never change to fit it. (For the frozen gameplay spec, see
`GAME_BRIEF.md`; for the full re-theme plan, see `deckbound-retheme-prompt.md`.)

## Core relationship

**The customers are the towers, and dinner is trying to get away.** Hungry
diners sit at their tables and eat the food as it passes; the food would very much
rather not be eaten.

## The through-line

**Every game is about eating the food before it goes to waste.** Food that gets
eaten pays (revenue); food that escapes is wasted (the loss). One verb sits under
all of it: **CHOMP.**

## The threat

Runaway dishes ride the conveyor belt from the kitchen toward the trash chute.
- A customer that **eats** a dish turns it into **revenue** (Tips).
- A dish that **escapes** to the trash chute is **wasted** — it lowers the
  restaurant's **Health Rating**. Health Rating at zero = the inspector shuts you
  down (the lose condition).

So: **eaten = revenue, wasted = the loss.**

## The cast (Map 1 — the American diner)

Display names for the existing five towers and four enemies. These are a display
layer only — the internal IDs (`arrow`, `mote`, …), stats, and balance do not
change.

### Customers (towers)

| Display name | Role | Internal ID | Personality |
|---|---|---|---|
| **The Regular** | Steady single-target | `arrow` | The dependable everyday diner — reliable fork-stabs, never flashy. |
| **Big Appetite** | Splash / AoE | `cannon` | Never met a platter they couldn't inhale in one radius-clearing gulp. |
| **The Photographer** | Slow | `frost` | Makes every dish freeze and pose for the shot before it's eaten. |
| **Chopstick Sensei** | Long range | `sniper` | Zen master who plucks the farthest morsel from across the room with a single flick. |
| **The Kids' Table** | Cheap / fast / weak | `zap` | A rowdy cluster of kids grabbing fistfuls — fast, cheap, tiny bites. |

### Runaway food (enemies)

Enemy size reads as HP: nugget and fries are small, the slider is mid, the steak
is visibly the biggest.

| Display name | Role | Internal ID | Personality |
|---|---|---|---|
| **Chicken Nugget** | Basic starter, low HP | `mote` | A panicky little golden lump waddling along on tiny legs. |
| **The Slider** | Fast, frail | `runner` | A greased-up little burger that slides down the belt — here and gone. |
| **Tough Steak** | Slow, high HP | `brute` | The big, stubborn, well-done slab that refuses to be chewed through. |
| **Fry Swarm** | Tiny, many, low HP each | `swarm` | A carton of fries scattering in every direction at once. |

## Franchise structure rule

**Each map is a different restaurant, and the restaurant type determines the
enemy roster.** Map 1 is the American diner, so every Map 1 enemy is diner food
scaled by HP (nuggets/fries up to burgers/steaks). Future restaurants bring their
own rosters — e.g. a pizzeria debuts the splitter enemy, a seafood place debuts an
armored lobster. **One restaurant per map; don't mix cuisines on a single map.**

## Tone rules

- **General-audience, Saturday-morning-cartoon.** Food is cute and panicky
  (googly eyes, little legs); customers are charming gluttons.
- **The "violence" is dining** — keep it comedic, never gross.
- **Original content only** — no real brands, chains, mascots, or trademarked food
  characters.

## Scope note (context, not a to-do)

Future games in other genres could reuse these primitives — customers-vs-food,
eat-before-it's-wasted, the CHOMP verb. That is background for the franchise's
direction, **not** scope: do not build anything beyond this tower-defense game.
