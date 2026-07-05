#!/usr/bin/env python3
"""
Deckbound balance simulator — deterministic difficulty gauge.

Purpose in the agent system:
  The Designer edits difficulty/economy numbers in data/balance.json. Before a
  change is accepted, THIS script runs headless, plays N games with a scripted
  reference strategy, and reports win-rate + waves survived. That win-rate is
  ground-truth signal about difficulty — better than asking a model "is this
  balanced?".

What it models (and what it doesn't):
  - It reads the SAME data/balance.json the game reads (via balance.data.js), so
    the sim and game can never disagree about tunables: tower stats, enemy
    types, the 10-wave table, and the economy.
  - It simulates the real combat in the game's units — pixels and seconds — on a
    1-D lane: enemies spawn per wave.interval, march at wave.speed * speedMul,
    towers target the frontmost enemy in range and fire every cooldown for
    `damage` (splash hits all within splash px; slow reduces speed). Kills pay
    the enemy's reward; enemies reaching the lane's end cost a life.
  - The MAP (path polyline + tower slot positions) is read from balance.json
    too, so the sim plays the SAME map the game does: enemies march the real path
    by arc-length and towers fire from the real 2-D slot positions using 2-D
    range. Redesign the map in balance.json and the sim tracks it automatically.
    It's still a directional difficulty gauge for a fixed reference strategy, not
    a per-frame replica.
  - The reference strategy builds its board over the early waves, then spends
    spare currency upgrading towers (cheapest next tier first, two tiers deep),
    mirroring how the game actually plays. Each tower commits to ONE fixed upgrade
    path (SIM_PATHS) and applies its tier deltas; tower stats AND those deltas come
    from balance.json.

Run from the repo root:
  python3 tools/balance_sim.py                 # reads data/balance.json
  python3 tools/balance_sim.py --sims 500      # more sims = tighter estimate
  python3 tools/balance_sim.py --config path/to/other.json
"""

from __future__ import annotations
import argparse
import json
import math
import random
from statistics import median

TARGET_WIN_RATE = (0.50, 0.60)   # fallback only; data/balance.json's target_win_rate wins
DT = 1.0 / 30.0             # simulation timestep in seconds

# Reference build strategies (which tower goes in each slot, in build order).
# Only the base-unlocked towers (no sniper, which needs an Essence unlock).
# "reference board" is calibrated so the shipped, balanced config reads ~mid-band
# — it's the gauge the Designer watches. "over-built" shows an over-invested full
# board trivializing the run (TOO EASY), demonstrating the verdict.
STRATEGIES = {
    "reference board":  ["arrow", "cannon", "frost", "arrow"],
    "over-built board": ["arrow", "cannon", "arrow", "frost", "zap", "arrow"],
}


def load_config(path: str) -> dict:
    with open(path) as f:
        cfg = json.load(f)
    cfg.pop("_note", None)
    for key in ("economy", "enemyTypes", "towers", "waveGen", "maps"):
        if key not in cfg:
            raise SystemExit(f"balance config missing '{key}': {path}")
    return cfg


def wave_type_weights(n: int, unlock: dict) -> dict:
    return {
        "mote": max(0.15, 1.0 - 0.05 * n),
        "runner": 0.7 if n >= unlock["runner"] else 0,
        "swarm": (0.4 + 0.02 * n) if n >= unlock["swarm"] else 0,
        "brute": (0.2 + 0.03 * n) if n >= unlock["brute"] else 0,
    }


def make_wave(n: int, cfg: dict) -> dict:
    """Generate wave n from waveGen — mirrors src/engine.js makeWave() (parity-checked in CI via tools/check_parity.py). Deterministic."""
    wg = cfg["waveGen"]
    hp = round(wg["hpBase"] * wg["hpGrowth"] ** n)
    speed = min(wg["speedMax"], wg["speedBase"] + wg["speedStep"] * n)
    interval = max(wg["intervalMin"], wg["intervalBase"] - wg["intervalStep"] * n)
    count = wg["baseCount"] + round(wg["countStep"] * n)
    w = wave_type_weights(n, wg["typeUnlock"])
    active = [k for k in w if w[k] > 0]
    total_w = sum(w[k] for k in active)
    comp = [[k, max(1, round((w[k] / total_w) * count))] for k in active]
    return {"hp": hp, "speed": speed, "interval": interval, "comp": comp}


def get_map(cfg: dict, map_id: str | None = None) -> dict:
    """Pick a map from the maps[] list: by id, else the first (the default).
    Mirrors the engine's loadMap fallback so the report-only gauge and the game
    agree on which map is being played."""
    maps = cfg["maps"]
    if map_id:
        for m in maps:
            if m["id"] == map_id:
                return m
    return maps[0]


def build_path(m: dict) -> dict:
    """Precompute the path polyline + segment lengths from a map. Total length
    is the enemy travel distance (the game's PATH_LENGTH)."""
    pts = [(p["x"], p["y"]) for p in m["path"]]
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
           for i in range(len(pts) - 1)]
    return {"pts": pts, "seg": seg, "total": sum(seg)}


def point_at(path: dict, dist: float) -> tuple[float, float]:
    """2-D position at arc-length `dist` along the path — mirrors src/engine.js
    pointAtDistance()."""
    if dist <= 0:
        return path["pts"][0]
    rem = dist
    for i, seglen in enumerate(path["seg"]):
        if rem <= seglen:
            t = rem / seglen if seglen else 0.0
            a, b = path["pts"][i], path["pts"][i + 1]
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        rem -= seglen
    return path["pts"][-1]


def build_spawn_queue(wave: dict, rng: random.Random) -> list[str]:
    q = []
    for kind, count in wave["comp"]:
        q.extend([kind] * count)
    rng.shuffle(q)
    return q


def simulate_wave(towers: list[dict], wave: dict, cfg: dict, rng: random.Random,
                  path: dict) -> tuple[int, int]:
    """Play one wave on the real map. Enemies march the path by arc-length;
    towers fire from their 2-D slot positions using 2-D range. Mirrors the
    game's spawn/target/move loop. Return (leaked, currency_earned)."""
    enemy_types = cfg["enemyTypes"]
    queue = build_spawn_queue(wave, rng)
    enemies: list[dict] = []
    spawn_timer = 0.0
    leaked = 0
    earned = 0
    for t in towers:
        t["cd"] = 0.0

    t_elapsed = 0.0
    max_time = 120.0  # safety bound in seconds
    while (queue or enemies) and t_elapsed < max_time:
        t_elapsed += DT

        # spawn
        spawn_timer -= DT
        if queue and spawn_timer <= 0:
            spawn_timer = wave["interval"]
            kind = queue.pop(0)
            et = enemy_types[kind]
            # small per-enemy hp jitter so runs vary — turns win-rate into a
            # smooth gauge instead of a 0%/100% cliff.
            hp = wave["hp"] * et["hpMul"] * rng.uniform(0.85, 1.15)
            enemies.append({
                "kind": kind, "dist": 0.0, "x": 0.0, "y": 0.0, "hp": hp,
                "speed": wave["speed"] * et["speedMul"],
                "reward": et["reward"], "slow_timer": 0.0, "slow_factor": 1.0,
                "freeze_timer": 0.0,
            })

        # cache each enemy's 2-D position for this tick
        for e in enemies:
            e["x"], e["y"] = point_at(path, e["dist"])

        # towers fire
        for t in towers:
            t["cd"] -= DT
            if t["cd"] > 0:
                continue
            in_range = [e for e in enemies
                        if math.hypot(e["x"] - t["x"], e["y"] - t["y"]) <= t["range"]]
            if not in_range:
                continue
            target = max(in_range, key=lambda e: e["dist"])  # frontmost on path
            t["cd"] = t["cooldown"]
            if t["behavior"] == "splash":
                for e in enemies:
                    if math.hypot(e["x"] - target["x"], e["y"] - target["y"]) <= t.get("splash", 0):
                        e["hp"] -= t["damage"]
            elif t["behavior"] == "multi":
                # maxTargets hands spread across the frontmost dishes; spare hands pile
                # onto the same dish when fewer are in range (mirrors updateTowers).
                front = sorted(in_range, key=lambda e: -e["dist"])
                for i in range(t.get("maxTargets", 1)):
                    front[i % len(front)]["hp"] -= t["damage"]
            else:
                target["hp"] -= t["damage"]
                if t["behavior"] == "slow":
                    target["slow_timer"] = t.get("slowDur", 0.0)
                    target["slow_factor"] = min(target["slow_factor"], t.get("slowFactor", 1.0))
                elif t["behavior"] == "freeze":
                    fd = t.get("freezeDur", 0.0)
                    target["freeze_timer"] = max(target["freeze_timer"], fd)
                    target["slow_timer"] = max(target["slow_timer"], fd + t.get("slowDur", 0.0))
                    target["slow_factor"] = min(target["slow_factor"], t.get("slowFactor", 1.0))

        # resolve deaths
        survivors = []
        for e in enemies:
            if e["hp"] <= 0:
                earned += e["reward"]
            else:
                survivors.append(e)
        enemies = survivors

        # move along the path
        still_on = []
        for e in enemies:
            speed = e["speed"]
            if e["freeze_timer"] > 0:
                e["freeze_timer"] -= DT
                speed = 0.0
            elif e["slow_timer"] > 0:
                speed *= e["slow_factor"]
            if e["slow_timer"] > 0:
                e["slow_timer"] -= DT
                if e["slow_timer"] <= 0:
                    e["slow_factor"] = 1.0
            e["dist"] += speed * DT
            if e["dist"] >= path["total"]:
                leaked += 1
            else:
                still_on.append(e)
        enemies = still_on

    leaked += len(enemies)  # anything left at the time bound counts as leaked
    return leaked, earned


MAX_LEVEL = 3  # base + two path tiers (the game's tower buys 2 tiers of one path)

# Each tower has two upgrade PATHS; buying a tier of one locks the other out for
# that placed tower (see src/engine.js). The reference strategy commits each tower
# to ONE fixed path and buys its two tiers in order. These are the pure-stat paths
# per tower, so the 1-D difficulty gauge stays faithful — the signature paths carry
# mechanics (pierce, knockback, double-freeze, ...) the gauge can't model, and are
# the real balance pass's job (Issue #54, PR 5).
SIM_PATHS = {
    "arrow": "carvingStation",
    "cannon": "oneBigBite",
    "frost": "longExposure",
    "sniper": "extraSlurp",
    "zap": "teenageTable",
}


def make_tower(kind: str, x: float, y: float, cfg: dict) -> dict:
    spec = cfg["towers"][kind]
    path = SIM_PATHS.get(kind) or next(iter(spec["upgrades"]))
    return {"kind": kind, "x": x, "y": y, "cd": 0.0, "level": 1,
            "range": spec["range"], "damage": spec["damage"],
            "cooldown": spec["cooldown"], "behavior": spec["behavior"],
            "splash": spec.get("splash", 0), "slowDur": spec.get("slowDur", 0.0),
            "slowFactor": spec.get("slowFactor", 1.0), "freezeDur": spec.get("freezeDur", 0.0),
            "maxTargets": spec.get("maxTargets", 1),
            "tiers": spec["upgrades"][path]["tiers"]}


def apply_upgrade(t: dict) -> None:
    """Apply the next tier's deltas — mirrors src/engine.js applyUpgradeDeltas().
    Level 1 buys tier index 0; level 2 buys tier index 1. Non-numeric keys ('cost',
    'pierce') are ignored — the gauge can't model the signature mechanics."""
    d = t["tiers"][t["level"] - 1]
    t["level"] += 1
    if "damage" in d:
        t["damage"] += d["damage"]
    if "range" in d:
        t["range"] += d["range"]
    if "cooldownMul" in d:
        t["cooldown"] *= d["cooldownMul"]
    if "splash" in d:
        t["splash"] += d["splash"]
    if "slowFactorAdd" in d:
        t["slowFactor"] = max(0.2, t["slowFactor"] + d["slowFactorAdd"])
    if "freezeDurAdd" in d:
        t["freezeDur"] += d["freezeDurAdd"]
    if "slowDurAdd" in d:
        t["slowDur"] += d["slowDurAdd"]


def next_tier_cost(t: dict) -> float:
    """Cost of the next tier this tower would buy on its committed path."""
    return t["tiers"][t["level"] - 1]["cost"]


def buy_upgrades(towers: list[dict], currency: float) -> float:
    """Spend spare currency upgrading towers, cheapest next tier first."""
    while True:
        candidates = [t for t in towers if t["level"] < MAX_LEVEL]
        if not candidates:
            break
        t = min(candidates, key=next_tier_cost)
        cost = next_tier_cost(t)
        if currency < cost:
            break
        currency -= cost
        apply_upgrade(t)
    return currency


def play_game(build: list[str], cfg: dict, seed: int, early_bonus: float = 0.0,
              max_waves: int | None = None, map_id: str | None = None) -> tuple[bool, int]:
    """Play a run with an economy-limited build-then-upgrade strategy.
    early_bonus models a player who calls every wave early for the max bonus
    (the sim can't represent the prep-time cost, so this is a free-income upper
    bound on the aggressive line — the steady reference uses early_bonus=0).
    max_waves overrides waveGen.waveCount (used for endless survival testing)."""
    rng = random.Random(seed)
    econ = cfg["economy"]
    # Free placement: the game has no fixed slots anymore; the sims keep
    # building at the map's simAnchors (the former slot coordinates, in order) so
    # the gauge stays layout-stable. Maps live in maps[]; default = the first.
    m = get_map(cfg, map_id)
    anchors = m["simAnchors"]
    path = build_path(m)
    currency = econ["startCurrency"]
    lives = econ["startLives"]
    towers: list[dict] = []
    next_slot = 0

    total_waves = max_waves if max_waves is not None else cfg["waveGen"]["waveCount"]
    for wi in range(total_waves):
        wave = make_wave(wi, cfg)
        # prep: build at the next sim anchors we can afford, in build order
        while next_slot < len(anchors) and next_slot < len(build):
            kind = build[next_slot]
            cost = cfg["towers"][kind]["cost"]
            if currency < cost:
                break
            currency -= cost
            towers.append(make_tower(kind, anchors[next_slot]["x"], anchors[next_slot]["y"], cfg))
            next_slot += 1
        # spend spare currency upgrading existing towers
        currency = buy_upgrades(towers, currency)

        leaked, earned = simulate_wave(towers, wave, cfg, rng, path)
        currency += earned + econ["earnPerWave"] + early_bonus
        lives -= leaked
        if lives <= 0:
            return False, wi
    return True, total_waves


def evaluate(build: list[str], cfg: dict, sims: int, base_seed: int, early_bonus: float = 0.0) -> dict:
    wins = 0
    survived = []
    for i in range(sims):
        won, w = play_game(build, cfg, seed=base_seed + i, early_bonus=early_bonus)
        wins += 1 if won else 0
        survived.append(w)
    return {"win_rate": wins / sims, "median_waves": median(survived), "sims": sims}


def verdict(win_rate: float, band: tuple) -> str:
    lo, hi = band
    if win_rate > hi:
        return "TOO EASY  -> nerf the player's option / buff enemies"
    if win_rate < lo:
        return "TOO HARD  -> buff the player's option / ease enemies"
    return "BALANCED  -> within target band"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=400)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--config", default="data/balance.json")
    ap.add_argument("--check", action="store_true",
                    help="CI gate: evaluate ONLY the reference board and exit "
                         "non-zero if its win-rate is outside the target band")
    args = ap.parse_args()
    cfg = load_config(args.config)
    band = tuple(cfg.get("target_win_rate", TARGET_WIN_RATE))

    print(f"Config: {args.config}")
    print(f"Target win-rate band: {band[0]:.0%}-{band[1]:.0%}")
    print(f"Sims per strategy: {args.sims}\n")

    # --check: the pass/fail gate for CI. Reference board only (the band gauge;
    # the other strategies are informational), fixed seed, exit code = verdict.
    if args.check:
        build = STRATEGIES["reference board"]
        r = evaluate(build, cfg, args.sims, args.seed)
        ok = band[0] <= r["win_rate"] <= band[1]
        print(f"reference board  [{', '.join(build)}]")
        print(f"  win rate     : {r['win_rate']:.1%}")
        print(f"  median waves : {r['median_waves']}")
        print(f"  verdict      : {verdict(r['win_rate'], band)}")
        print(f"\nCHECK {'PASSED' if ok else 'FAILED'}: reference win-rate "
              f"{r['win_rate']:.1%} {'inside' if ok else 'OUTSIDE'} "
              f"{band[0]:.0%}-{band[1]:.0%}"
              + ("" if ok else " — retune data/balance.json before merging"))
        raise SystemExit(0 if ok else 1)

    for name, build in STRATEGIES.items():
        r = evaluate(build, cfg, args.sims, args.seed)
        print(f"{name}  [{', '.join(build)}]")
        print(f"  win rate     : {r['win_rate']:.1%}")
        print(f"  median waves : {r['median_waves']}")
        print(f"  verdict      : {verdict(r['win_rate'], band)}\n")

    # If the map defines a "call the wave early" bonus, show its effect on the
    # reference board (an upper bound — the sim can't charge the prep-time cost).
    early = cfg["economy"].get("earlyCallBonus", 0)
    if early:
        ref = STRATEGIES["reference board"]
        r = evaluate(ref, cfg, args.sims, args.seed, early_bonus=early)
        print(f"reference + call early (+{early}/wave)  [{', '.join(ref)}]")
        print(f"  win rate     : {r['win_rate']:.1%}")
        print(f"  median waves : {r['median_waves']}")
        print(f"  note         : upper bound; steady reference above is the band gauge\n")

    # Endless groundwork: how far the reference gets when the run doesn't stop at
    # waveCount. Difficulty signal for endless mode is MEDIAN WAVES SURVIVED (not
    # win-rate) — it should be neither trivial (never dies) nor brutal.
    ref = STRATEGIES["reference board"]
    cap = 40
    survived = sorted(play_game(ref, cfg, seed=args.seed + i, max_waves=cap)[1]
                      for i in range(min(args.sims, 200)))
    print(f"endless survival (reference, cap {cap})")
    print(f"  median waves : {median(survived)}")
    print(f"  note         : endless uses this, not win-rate; cap {cap} hit means 'survives indefinitely'\n")


if __name__ == "__main__":
    main()
