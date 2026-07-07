# Blue-Plate Special Balance Philosophy

> **What this is:** the north star for every tuning PR — the income model, the
> tower ROLE MAP, and the pricing/bounty rubric (v2, supersedes PR #87's rubric).
> Written for Issue #92, grounded in research on how the best modern tower
> defenses structure income and keep every tower purposeful. The developer
> ratifies changes to this file. Numbers live in `data/balance.json` and in
> tuning-PR tables; this file holds the *claims and rules* those numbers must
> satisfy. If a future PR can't meet a rule here, it argues with this file in
> its body — it doesn't quietly ignore it.
>
> House gauge: `node tools/sim.mjs --check` (real engine, endless survival —
> the "win" is REACHING wave 30 on the tuned map, band 50–60%). Probe
> conventions are defined at the bottom so every future pass measures the same
> way. Research informs design only — no brands or borrowed content enter the
> game itself.

## 1. How the best TDs pay the player (and what Blue-Plate Special adopts)

### The field

**Bloons TD 6** — the genre's modern reference — runs a *dual stream*: money
per pop (per kill) plus a flat end-of-round bonus (`$100 + n` for round `n`).
Per-pop is the dominant share and scales with the wave's size automatically;
the round bonus is the guaranteed floor. Late freeplay *decays* the per-pop
rate in brackets ($1 → $0.50 after r50 → … → $0.02 past r120) because enemy
counts grow super-linearly and flat per-pop would explode the economy over a
100+ round horizon. BTD6 also sells *dedicated* economy (Banana Farm: spend on
income instead of defense) and *hybrid* income-with-defense (Merchantman-style
upgrades). Its PvP sibling **Battles 2** goes further and makes income an
active axis: "eco" drips on a clock and moves with what you choose to send.

**Kingdom Rush** — authored-level classic — pays a starting stack plus
per-kill gold scaled to the enemy's strength, *even on leaks* (you lose lives,
never income), plus an opt-in early-call bonus. A few spawned trash enemies
pay zero to close grinding exploits.

**Defense Grid** — the cautionary tale — paid *interest on banked resources*.
It rewarded efficient play so hard that strong players swam in money while
weak players drowned, and the sequel removed it. Compounding returns on
"already winning" is the death-spiral shape, in either direction.

**Dungeon Warfare 2** — the diversity-pricer — escalates the price of each
trap *copy* past the fifth, pushing mixed builds through the price tag rather
than through role design alone.

### What Blue-Plate Special adopts (and rejects), against our constraints

Our constraints: **endless** runs gauged at survive@30 (a 30–40 wave horizon,
not BTD6's 120+), free placement with no tower cap, a scripted deterministic
gauge, and the ratified **no-death-spiral guardrail** from the economy
overhaul (#87).

- **KEEP the BTD6-shaped dual stream** — size-scaled per-kill bounties + a
  flat per-wave floor. It's already ours (#87) and it's the right shape: the
  bounty share grows with the waves (a strong board funds its own growth,
  which is pillar 3, "always progressing"), while the flat floor is the
  recovery hatch.
- **NO per-kill decay brackets.** BTD6 needs them for a 120-round horizon;
  our gauge horizon is 30–40 waves and runs end in defeat, not in economy
  overflow. Linear size-scaled bounties stay. (The scripted reference banking
  Tips after its 10 anchors max out is a known artifact of the *scripted*
  player, not a player-economy problem — a real player has free placement and
  no cap.)
- **NO leak-pay** (Kingdom Rush pays leaks; we don't). Blue-Plate Special's guardrail
  is the *flat floor* instead: a fully-fumbled wave still pays enough to seat
  the cheapest customer. Paying leaks on top would mute the "kills are tips"
  fantasy — the diner theme wants eating to be the payday.
- **NO interest, NO dedicated economy tower.** Defense Grid's lesson: banked-
  money compounding amplifies skill gaps into spirals. And a pure Banana-Farm
  seat in a 10-tower roster would displace a combat role while its "skip it
  and the game's easier / take it and snowball" swing fights the survive@30
  band. The only income enhancer we allow is the *hybrid* form (income riding
  a combat tower — the Sample Lady's Loss Leader marks, the Eater's Mustard
  Belt), hard-bounded as small flat bonuses per kill.
- **NO copy-price escalation** (Dungeon Warfare's lever). Mixed builds should
  win because roles are real (this file's §2), not because the register
  punishes repeats. The spam probe (below) is the check that this stays true.

**The income-mix rule:** across a full reference run, flat-floor income stays
in the **30–45%** band of total income (it opened at 39% in #87). Under ~30%
the floor stops covering recovery; over ~45% kills stop mattering and every
wave feels salary-paid. Per-wave, the floor (`earnPerWave`) must cover at
least the cheapest seat in the roster — that is the no-death-spiral line.

## 2. The role map — every seat earns its slot

The developer's bar: *"in a good tower defense game, all towers have a
purpose and do different things."* The genre literature says the same thing
with teeth: every option needs "a scenario that it is *best* at" — an option
strictly dominated by another at the same price is dead weight that only
looks like variety. Blue-Plate Special's version: **each tower has ONE named role, ONE
measurable best-at claim, and a probe that checks it.** Two towers may
overlap in what they *can* do, never in what they're *best* at.

Bands (rubric §3): cheap **150** · mid **250–350** · premium **400–500**.

| Tower | Role | Band | When you buy it | Measurably best at (the probe) |
|---|---|---|---|---|
| **Kids' Table** (`zap`) | **The Opener** — cheap multi-grab wall | 150 | Wave 1, and any time a lane needs *bodies now* | Board-holding per Tip in the opening: best equal-spend solo median waves of the roster (equal-spend fingerprint) |
| **Sample Lady** (`sample`) | **The Force Multiplier** — amp support | 150 | You have hitters; make them all hit harder | Marginal survival added per 100 Tips when joining an established board (slot-9 marginal, Δ/100 Tips) |
| **The Regular** (`arrow`) | **The Workhorse** — reliable single-target | 250 | Always reasonable; the yardstick every specialist is priced against | Self-sufficiency: the only mid-band tower whose mono-board holds the full gate (solo fingerprint survival@30) |
| **Photographer** (`frost`) | **The Stopper** — single-target hard CC | 300 | A priority dish MUST NOT reach the return slot | Irreplaceability on the reference: swapping its seats to any same-band tower reads lower (frost-slots replacement probe) |
| **Short-Order Cook** (`cook`) | **The Line Cook** — sustained multi-target | 350 | Mixed pairs keep arriving; you need steady spread damage | Mid-band sustained multi throughput: out-streams every ≤350 seat on the kill-stream micro |
| **Pitmaster** (`pit`) | **The Tank Melter** — ramping anti-heavy DOT | 300 | Steaks and future heavies shrug off pecks | The heavy that rides past dies anyway: most damage into a crossing wave-15 steak, absolute AND per Tip (crossing micro); the roster's longest reach (150) |
| **Ranch Fountain** (`ranch`) | **The Crowd Brake** — wide stacking slow | 300 | The belt is a conga line; buy the whole crowd time | Crowd time bought: most slow-seconds applied across a pack per Tip (slow-integral micro on 8 dishes) |
| **Big Appetite** (`cannon`) | **The Burst Anchor** — huge single bites | 400 | Spaced mid/heavy dishes; delete one per chomp | The biggest single hit in the game (data), and best burst-per-Tip on a fresh mid dish (TTK micro, one-bite thresholds quoted) |
| **Competitive Eater** (`eater`) | **The Closer** — kill-fed ramping devourer | 450 | A fed lane late-game; rewards greedy placement | Peak throughput when fed: best steady-state kill-stream rate in the roster once ramped (kill-stream micro at combo cap) |
| **Milkshake Slurper** (`sniper`) | **The Finisher** — premium always-on drain | 500 (Essence-gated) | The no-conditions carry seat | Highest *unconditional* sustained single-target DPS (data + solo fingerprint; the Eater beats it only while combo-fed, and the Pitmaster only given ramp time on a heavy) |

**Niche fences (the overlaps we police):**
- `eater` vs `sniper`: conditional peak vs unconditional steadiness. If the
  Eater's *unfed* throughput matches the Slurper's, the Slurper is dead —
  the Eater's base must stay clearly below, its fed peak clearly above.
- `cook` vs `zap`: the Cook is not "a better Kids' Table"; zap wins the
  opening per Tip (more seats per Tip = more coverage), cook wins sustained
  mid-band throughput. Equal-spend probes, not vibes.
- `ranch` vs `frost`: wide-and-soft vs single-and-hard. Frost's freeze is the
  only hard stop; ranch must never fully stop anything (slow floor stays > 0),
  and frost must never out-slow ranch across a *crowd*.
- `pit` vs `cannon`: the ramp vs the burst. Cannon right-sizes a dish NOW;
  pit is cheaper damage into big HP *given time*. If pit ever wins the
  fresh-dish burst probe something is mispriced.
- `sample` amp is the only ALL-damage multiplier; it stays multiplicative-once
  (non-stacking, strongest-wins — engine rule, frozen).

**Domination rule:** no tower may read ≥ a same-band peer on EVERY quoted
probe (matrix, solo, marginal, and its peer's best-at probe). Ties break
toward the cheaper or older tower being allowed to win the *generalist*
reads and the specialist winning its own claim by a real margin.

## 3. Pricing + bounty rubric v2 (supersedes #87's)

**Bands.** cheap ≈ **150** (openers/support: low ceiling, high per-Tip early
value) · mid ≈ **250–350** (the workhorse + the specialists) · premium ≈
**400–500** (burst anchors, ramp carries, Essence-gated premium sustained).
A tower's band comes from its ROLE (when-you-buy story), then its exact price
from probe parity within the band.

**The power-budget line.** Within a band, towers buy comparable *total*
value in different shapes; a specialist pays for its niche edge with
off-niche weakness, never with strict inferiority. Concretely, on the
slot-9 marginal probe: no tower under ~60% of its band's best Δ/100 Tips,
and every tower #1 on its own best-at probe.

**Tiers (deltas are now a tunable magnitude, PR #78/#92 precedent).**
- t1 ≈ 0.8–1.2× base cost (the commit price ≈ one mid-game wave of income,
  so upgrading vs seating stays a live decision every wave).
- t2 ≈ 1.6–2.3× its t1 (the event purchase).
- A tier's stat delta and its cost move TOGETHER: a tier that probes weak
  gets its magnitude raised or its cost cut — prefer the smallest change
  that preserves the upgrade's feel; identity (signature counts/behaviors)
  never moves — that's design, not tuning.
- Signature t2s that *multiply crowds* (extra targets, AoE splash, double-CC)
  price +50–100 over their stat sibling — the all-signature damping knob.
- The all-signature stack premium (every in-build tower on its signature
  path) stays ≤ ~+12 pts over the all-stat reference: shave the *compounding*
  overlaps (CC durations, amp windows, AoE radii), never a signature's count
  or its identity.

**Bounties.** `bounty ≈ 15 × hpMul`, rounded to a 5, floor 5, then tuned
against the gate (the Steak's −5 precedent). A heavy pays ~its HP share;
income ramps with threat automatically. Zero-bounty dishes are allowed only
as designed anti-grind spawns (none yet). Bonus-Tip mechanics (Loss Leader,
Mustard Belt) stay small flat per-kill amounts — never %-of-bounty, never
stacking — so the income mix stays governed by §1.

**Round numbers.** Player-facing prices in multiples of 50; bounties in
multiples of 5. The gauge lives on damage cliffs (±2 damage has swung the
gate 15–20 pts) — map a cliff before committing to it, and confirm any
edge-value across three seed bases (1/1000/5000), never one.

**The cliff list (constants carrying institutional weight — never move
casually; PR #93 + its checkpoint):** frost base `slowDur` is pinned at
exactly **3.0** (±anything scatters the three seed bases across ~14 pts —
probed and restored); Birthday Party t2 damage sits on an integer cliff
(4→3 swung the all-signature read −12.5); Fork Frenzy t2 damage quantizes
on pierce breakpoints (20→19 read −8.5). When a lever like these is the
"obvious" knob, the cost damper is usually the cliff-free alternative
(the #93 all-signature fix shipped on two +50 cost dampers for this reason).

## 4. Probe conventions (so every pass measures the same thing)

Reference build (FROZEN, the gauge): `arrow,cannon,frost,arrow,zap,cannon,
frost,arrow,zap,cannon` at the tuned map's simAnchors, stat paths
(`SIM_PATHS`). CI config: seed 1, 200 sims — and a tuning PR must land the
exact CI config **≥52%** (2 pts inside the floor; the #78 floor-margin
incident, made a standing bar in #86/#87). Confirm reads at seeds
1/1000/5000 ×200 and seed 1 ×1000.

- **Path matrix (20 paths):** towers in the reference measure by *type-wide
  path swap* (`--paths t=sig`, the #78 convention); towers outside it measure
  by *slot-9 swap-in* (replace the 10th build entry — the marginal seat,
  anchor (620,258)) on each path. Within-tower sibling |Δ| ≤ 8 pts.

  **RETIRED (the #93 checkpoint ruling): the cross-roster ≤12 spread bar on
  single-slot swap-ins.** The medium is position-confounded — the same tower
  read 32.4% or 87.6% depending on WHICH slot it swapped into, and a
  deliberately role-differentiated roster will always spread wide on a
  "generalist value in one board position" ruler. Meeting it would have meant
  flattening the roles the rest of #93 sharpened; both documented follow-up
  options (nerfing the reference's CC / making specialists better
  generalists) were DECLINED. The standing cross-roster parity instruments
  are: sibling |Δ| ≤ 8, the role-claim benches + no-domination rule (§2), and
  the band bar on slot-9 marginal Δ/100 Tips (§3's power-budget line).
- **Solo fingerprint:** `--build X×10` on the designated path. Fingerprints
  must stay *differentiated* (support reads near 0 by design; a workhorse
  holds the gate) — a flat row of 55s would mean the roster collapsed into
  one tower with ten hats.
- **Equal-spend fingerprint:** `--build X×⌊1500/cost⌋` — the opener probe.
- **Slot-9 marginal:** survival@30(ref-minus-slot-9 + X) − survival@30(ref-
  minus-slot-9), quoted as Δ and Δ/100 Tips of full designated-path spend.
- **Spam probe:** 10× each cheapest-band tower reads at/below the reference
  (width must not beat composition).
- **Micro benches** (engine-direct, deterministic): steak TTK, fresh-dish
  burst TTK, kill-stream rate (fed lane), crowd slow-integral. These ground
  the role claims macro probes can't isolate.
- **Report boards:** `modern-mix`, `support-stack`, `dot-board` print in
  every `--check` (report-only, never gate) so roster compositions stay
  visible to CI readers.
- **Engagement bars** (#87, held by every future pass): 3–5 towers by wave
  3 · a purchase roughly every wave through the midgame (no gap > ~3 waves
  through w25 on the reference script) · first tier-2 ~w5–8 · median wave
  25–40s · run-to-30 ≤ ~16 sim-min · recoverability floor per §1.

## Sources (research trail, 2026-07-06)

- BTD6 income structure and decay brackets: [Bloons Wiki — Money](https://bloons.fandom.com/wiki/Money), [topper64 BTD6 income calculator](https://topper64.co.uk/nk/btd6/income); farm opportunity cost: [Bloons Wiki — Income Farming (BTD6)](https://bloons.fandom.com/wiki/Income_Farming_(BTD6)).
- Battles 2 eco-as-a-decision: [Bloons Wiki — Eco (BTDB2)](https://bloons.fandom.com/wiki/Eco_(BTDB2)).
- Kingdom Rush gold, strength-scaled bounties, leak-pay, early-call: [Kingdom Rush Wiki — Gold](https://kingdomrushtd.fandom.com/wiki/Gold), [— Upgrades](https://kingdomrushtd.fandom.com/wiki/Upgrades).
- Defense Grid interest and its removal in DG2: [Steam guide — How to Defense Grid](https://steamcommunity.com/sharedfiles/filedetails/?id=218777908), [DG2 discussion — interest removed](https://steamcommunity.com/app/221540/discussions/0/613937306584744683/).
- Dungeon Warfare 2 copy-price escalation: [DW2 Wiki — Traps](https://dungeon-warfare-2.fandom.com/wiki/Traps), [TouchArcade review](https://toucharcade.com/2019/04/10/dungeon-warfare-2-review/).
- Role orthodoxy — "a scenario each tower is best at", dominated-option rot, lock-and-key warning: [Fortress of Doors — Optimizing Tower Defense for FOCUS and THINKING](https://www.fortressofdoors.com/optimizing-tower-defense-for-focus-and-thinking-defenders-quest/); cost-curve/power-budget framing: [Game Balance Concepts — Level 3: Transitive Mechanics and Cost Curves](https://gamebalanceconcepts.wordpress.com/2010/07/21/level-3-transitive-mechanics-and-cost-curves/); archetype taxonomy: [Design the Game — Tower Defense Design Guide](https://www.designthegame.com/learning/tutorial/tower-defense-design-guide), [Stardock — What Makes A Good Tower Defense Game?](https://www.stardock.com/games/article/495008/siege-of-centauri-dev-journal-what-makes-a-good-tower-defense-game).
