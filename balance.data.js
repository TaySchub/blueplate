// AUTO-GENERATED from data/balance.json by tools/gen_balance.py.
// Do NOT edit by hand — edit data/balance.json and re-run the generator.
window.BALANCE = {
  "_note": "Single source of truth for DIFFICULTY, ECONOMY, and MAP GEOMETRY. tools/balance_sim.py reads this file directly; the game reads it via the generated balance.data.js (run tools/gen_balance.py after editing). Only pure art (colors/shapes) stays in main.js; tower/enemy display names + blurbs live here too, so a theme reskin is JSON-only. Rule: if the balance sim needs a number to compute win-rate, it belongs in this file \u2014 including each tower's per-path upgrade deltas ('upgrades'), the maps (maps[] \u2014 each with theme + path + free-placement rules + obstacles + simAnchors), and the wave generator (waveGen). Maps are content: maps[0] is the default; each map's 'theme' block holds every surface color/label the renderer draws (floor, belt, booth pads, kitchen, trash chute), so a diner reskin is literally JSON-only and per-kind prop art stays in src/art.js. 'tuned:true' marks a map whose difficulty is calibrated (node tools/sim.mjs --check enforces the band on it); future maps ship tuned:false until tuned. Placement: towers go anywhere inside placement.bounds that is > pathBuffer off the belt centerline, >= towerSpacing from other towers, and outside every obstacle rect; simAnchors are the OLD slot coordinates the headless sims still build at, in build order, so the difficulty gauge stays layout-stable \u2014 never reorder them. Upgrades: 2 named paths per tower, each with 2 tiers { cost, ...deltas }; buying a tier of one path locks the other for that placed tower. Difficulty is now tuned against the REAL-ENGINE sim (node tools/sim.mjs --check), the CI gate as of Issue #54 PR 5; tools/balance_sim.py is a report-only second opinion. Runs are ENDLESS (Issue #75): there is no win wave \u2014 the sim gauge's 'win' is reaching WAVE 30, and --check enforces target_win_rate on survival@30 for every tuned map. Costs/deltas are per tower and per tier (signatures are tier 2).",
  "target_win_rate": [
    0.5,
    0.6
  ],
  "economy": {
    "startCurrency": 150,
    "startLives": 20,
    "earnPerWave": 40,
    "earlyCallBonus": 18,
    "earlyCallWindow": 8,
    "sellRefund": 0.7
  },
  "maps": [
    {
      "id": "blueplate",
      "name": "Blue-Plate Special",
      "tuned": true,
      "theme": {
        "floor": {
          "bg": "#F2E6C6",
          "tile": "#3B4552",
          "tileSize": 45
        },
        "wallFrame": {
          "color": "#2FB4A6",
          "thickness": 6
        },
        "belt": {
          "shadow": "#181d24",
          "shadowWidth": 46,
          "metal": "#C6CCD5",
          "metalWidth": 40,
          "surface": "#2a323d",
          "surfaceWidth": 34,
          "slat": "rgba(255,255,255,0.12)",
          "slatWidth": 4,
          "slatSpacing": 26,
          "slatHalf": 15,
          "slatSpeed": 42,
          "chevrons": "#F2E6C6"
        },
        "boothPad": {
          "fill": "#e3d5b0",
          "stroke": "#c7b078"
        },
        "coreStyle": "dishReturn",
        "dishReturn": {
          "slot": "#2a323d",
          "labelBg": "#20262f",
          "accent": "#2FB4A6",
          "label": "DISH RETURN"
        },
        "entrance": {
          "door": "#BFE3E0",
          "frame": "#C6CCD5",
          "sign": "#E8473F",
          "glass": "#cfe9e6"
        },
        "props": {
          "boothRed": "#E8473F",
          "boothTable": "#e3d5b0",
          "boothSeam": "#f7cabf",
          "jukeboxTop": "#E8473F",
          "jukeboxAccent": "#FFC64B",
          "jukeboxBody": "#8a5a3a",
          "jukeboxBase": "#2FB4A6",
          "dessertGlass": "#BFE3E0",
          "dessertBase": "#8a5a3a",
          "silver": "#C6CCD5",
          "wood": "#8a5a3a",
          "red": "#E8473F",
          "yellow": "#FFC64B",
          "teal": "#2FB4A6",
          "navy": "#3B4552"
        }
      },
      "path": [
        {
          "x": 30,
          "y": 115
        },
        {
          "x": 748,
          "y": 115
        },
        {
          "x": 748,
          "y": 305
        },
        {
          "x": 372,
          "y": 305
        },
        {
          "x": 372,
          "y": 210
        },
        {
          "x": 95,
          "y": 210
        }
      ],
      "coreRadius": 22,
      "placement": {
        "pathBuffer": 40,
        "towerSpacing": 40,
        "bounds": {
          "x0": 16,
          "y0": 16,
          "x1": 784,
          "y1": 382
        }
      },
      "obstacles": [
        {
          "x": 16,
          "y": 66,
          "w": 40,
          "h": 236,
          "kind": "kitchen"
        },
        {
          "x": 140,
          "y": 34,
          "w": 62,
          "h": 40,
          "kind": "booths"
        },
        {
          "x": 359,
          "y": 34,
          "w": 62,
          "h": 40,
          "kind": "booths"
        },
        {
          "x": 572,
          "y": 34,
          "w": 62,
          "h": 40,
          "kind": "booths"
        },
        {
          "x": 473,
          "y": 326,
          "w": 62,
          "h": 40,
          "kind": "booths"
        },
        {
          "x": 660,
          "y": 326,
          "w": 62,
          "h": 40,
          "kind": "booths"
        },
        {
          "x": 436,
          "y": 142,
          "w": 99,
          "h": 42,
          "kind": "dessert"
        },
        {
          "x": 610,
          "y": 140,
          "w": 70,
          "h": 92,
          "kind": "jukebox"
        },
        {
          "x": 475,
          "y": 236,
          "w": 101,
          "h": 38,
          "kind": "register"
        },
        {
          "x": 80,
          "y": 250,
          "w": 130,
          "h": 34,
          "kind": "counterStools"
        },
        {
          "x": 246,
          "y": 250,
          "w": 66,
          "h": 34,
          "kind": "prep"
        }
      ],
      "simAnchors": [
        {
          "x": 455,
          "y": 210
        },
        {
          "x": 560,
          "y": 210
        },
        {
          "x": 250,
          "y": 162
        },
        {
          "x": 180,
          "y": 330
        },
        {
          "x": 320,
          "y": 162
        },
        {
          "x": 705,
          "y": 210
        },
        {
          "x": 110,
          "y": 330
        },
        {
          "x": 280,
          "y": 330
        },
        {
          "x": 415,
          "y": 250
        },
        {
          "x": 620,
          "y": 258
        }
      ]
    },
    {
      "id": "diner",
      "name": "The American Diner",
      "tuned": false,
      "theme": {
        "floor": {
          "bg": "#10131a",
          "tile": "#141a24",
          "tileSize": 45
        },
        "belt": {
          "shadow": "#0e1118",
          "shadowWidth": 46,
          "metal": "#333c4b",
          "metalWidth": 40,
          "surface": "#232a35",
          "surfaceWidth": 34,
          "slat": "rgba(255,255,255,0.07)",
          "slatWidth": 4,
          "slatSpacing": 26,
          "slatHalf": 15,
          "slatSpeed": 42
        },
        "boothPad": {
          "fill": "#1b222d",
          "stroke": "#262f3d"
        },
        "kitchen": {
          "interior": "#0b0e14",
          "door": "#2c3543",
          "doorEdge": "#3f4a5c",
          "frame": "#4a5568",
          "label": "KITCHEN"
        },
        "chute": {
          "body": "#2b3346",
          "bodyHurt": "#5a2626",
          "lid": "#3a465e",
          "ridge": "rgba(255,255,255,0.10)",
          "label": "TRASH"
        }
      },
      "path": [
        {
          "x": -30,
          "y": 70
        },
        {
          "x": 60,
          "y": 70
        },
        {
          "x": 60,
          "y": 350
        },
        {
          "x": 200,
          "y": 350
        },
        {
          "x": 200,
          "y": 70
        },
        {
          "x": 340,
          "y": 70
        },
        {
          "x": 340,
          "y": 350
        },
        {
          "x": 480,
          "y": 350
        },
        {
          "x": 480,
          "y": 70
        },
        {
          "x": 620,
          "y": 70
        },
        {
          "x": 620,
          "y": 350
        },
        {
          "x": 740,
          "y": 350
        },
        {
          "x": 740,
          "y": 210
        }
      ],
      "coreRadius": 24,
      "placement": {
        "pathBuffer": 40,
        "towerSpacing": 40,
        "bounds": {
          "x0": 16,
          "y0": 16,
          "x1": 784,
          "y1": 382
        }
      },
      "obstacles": [
        {
          "x": 100,
          "y": 40,
          "w": 52,
          "h": 54,
          "kind": "mopbucket"
        },
        {
          "x": 240,
          "y": 316,
          "w": 60,
          "h": 62,
          "kind": "jukebox"
        },
        {
          "x": 370,
          "y": 176,
          "w": 80,
          "h": 88,
          "kind": "counter"
        },
        {
          "x": 650,
          "y": 176,
          "w": 60,
          "h": 88,
          "kind": "booths"
        },
        {
          "x": 660,
          "y": 44,
          "w": 100,
          "h": 70,
          "kind": "dessert"
        }
      ],
      "simAnchors": [
        {
          "x": 130,
          "y": 150
        },
        {
          "x": 130,
          "y": 290
        },
        {
          "x": 270,
          "y": 150
        },
        {
          "x": 270,
          "y": 290
        },
        {
          "x": 410,
          "y": 150
        },
        {
          "x": 410,
          "y": 290
        },
        {
          "x": 550,
          "y": 150
        },
        {
          "x": 550,
          "y": 290
        },
        {
          "x": 680,
          "y": 150
        },
        {
          "x": 680,
          "y": 290
        }
      ]
    }
  ],
  "enemyTypes": {
    "mote": {
      "name": "Hot Dog",
      "hpMul": 1.0,
      "speedMul": 1.0,
      "reward": 5
    },
    "runner": {
      "name": "The Slider",
      "hpMul": 0.6,
      "speedMul": 1.7,
      "reward": 5
    },
    "brute": {
      "name": "Tough Steak",
      "hpMul": 2.6,
      "speedMul": 0.7,
      "reward": 9
    },
    "swarm": {
      "name": "Fry Swarm",
      "hpMul": 0.28,
      "speedMul": 1.2,
      "reward": 2
    }
  },
  "towers": {
    "arrow": {
      "name": "The Regular",
      "blurb": "Steady single-target fork-stabs",
      "cost": 50,
      "range": 130,
      "damage": 30,
      "cooldown": 0.75,
      "behavior": "single",
      "upgrades": {
        "forkFrenzy": {
          "name": "Fork Frenzy",
          "tiers": [
            {
              "cost": 70,
              "cooldownMul": 0.6
            },
            {
              "cost": 120,
              "pierce": true,
              "damage": 18,
              "range": 14
            }
          ]
        },
        "carvingStation": {
          "name": "Carving Station",
          "tiers": [
            {
              "cost": 55,
              "damage": 28,
              "range": 14
            },
            {
              "cost": 95,
              "damage": 28,
              "range": 14
            }
          ]
        }
      }
    },
    "cannon": {
      "name": "Big Appetite",
      "blurb": "Grabs one dish and takes a huge, slow bite (single-target)",
      "cost": 85,
      "range": 104,
      "damage": 90,
      "cooldown": 2.8,
      "behavior": "single",
      "upgrades": {
        "speedEater": {
          "name": "Speed Eater",
          "tiers": [
            {
              "cost": 70,
              "cooldownMul": 0.72
            },
            {
              "cost": 120,
              "cooldownMul": 0.7,
              "crumbRadius": 50,
              "crumbDamage": 42
            }
          ]
        },
        "oneBigBite": {
          "name": "One Big Bite",
          "tiers": [
            {
              "cost": 70,
              "damage": 62,
              "range": 8
            },
            {
              "cost": 120,
              "damage": 62,
              "range": 8,
              "knockbackBase": 100,
              "knockbackSizeRef": 12
            }
          ]
        }
      }
    },
    "frost": {
      "name": "The Photographer",
      "blurb": "Flash makes a dish pose (1s freeze), then it's slowed ~3s (very low dmg)",
      "cost": 70,
      "range": 120,
      "damage": 6,
      "cooldown": 1.1,
      "behavior": "freeze",
      "freezeDur": 1.0,
      "slowFactor": 0.62,
      "slowDur": 3.0,
      "upgrades": {
        "longExposure": {
          "name": "Long Exposure",
          "tiers": [
            {
              "cost": 60,
              "freezeDurAdd": 0.2,
              "damage": 3,
              "range": 12
            },
            {
              "cost": 105,
              "freezeDurAdd": 0.2,
              "damage": 3,
              "range": 12,
              "slowDurAdd": 1.0,
              "slowFactorAdd": -0.05
            }
          ]
        },
        "paparazzi": {
          "name": "Paparazzi",
          "tiers": [
            {
              "cost": 70,
              "range": 20
            },
            {
              "cost": 120,
              "range": 12,
              "freezeTargets": 2
            }
          ]
        }
      }
    },
    "sniper": {
      "name": "The Milkshake Slurper",
      "blurb": "Slurps a dish super-fast for tiny bites \u2014 watch its HP drain (small-med range)",
      "cost": 95,
      "range": 150,
      "damage": 7,
      "cooldown": 0.14,
      "behavior": "single",
      "upgrades": {
        "extraSlurp": {
          "name": "Extra Slurp",
          "tiers": [
            {
              "cost": 70,
              "damage": 5,
              "range": 15
            },
            {
              "cost": 115,
              "damage": 4,
              "range": 15
            }
          ]
        },
        "sillyStraw": {
          "name": "Silly Straw",
          "tiers": [
            {
              "cost": 70,
              "range": 20
            },
            {
              "cost": 115,
              "range": 10,
              "drainTargets": 2,
              "damage": 2
            }
          ]
        }
      }
    },
    "zap": {
      "name": "The Kids' Table",
      "blurb": "Three kids grab up to 3 dishes at once \u2014 small fast bites",
      "cost": 35,
      "range": 96,
      "damage": 9,
      "cooldown": 0.5,
      "behavior": "multi",
      "maxTargets": 3,
      "upgrades": {
        "birthdayParty": {
          "name": "Birthday Party",
          "tiers": [
            {
              "cost": 45,
              "cooldownMul": 0.78
            },
            {
              "cost": 85,
              "cooldownMul": 0.85,
              "maxTargetsAdd": 1,
              "damage": 5
            }
          ]
        },
        "teenageTable": {
          "name": "Teenage Table",
          "tiers": [
            {
              "cost": 45,
              "damage": 8,
              "range": 8
            },
            {
              "cost": 85,
              "damage": 8,
              "range": 8
            }
          ]
        }
      }
    }
  },
  "waveGen": {
    "waveCount": 20,
    "hpBase": 70,
    "hpGrowth": 1.105,
    "speedBase": 50,
    "speedStep": 1.4,
    "speedMax": 82,
    "intervalBase": 1.0,
    "intervalStep": 0.02,
    "intervalMin": 0.5,
    "baseCount": 6,
    "countStep": 0.6,
    "typeUnlock": {
      "mote": 0,
      "runner": 1,
      "swarm": 2,
      "brute": 4
    },
    "endless": false
  }
};
