// AUTO-GENERATED from data/balance.json by tools/gen_balance.py.
// Do NOT edit by hand — edit data/balance.json and re-run the generator.
window.BALANCE = {
  "_note": "Single source of truth for DIFFICULTY, ECONOMY, and MAP GEOMETRY. The game reads it via the generated balance.data.js (run tools/gen_balance.py after editing); the difficulty gauge (node tools/sim.mjs) reads this file directly. Only pure art (colors/shapes) stays in main.js; tower/enemy display names + blurbs live here too, so a theme reskin is JSON-only. Rule: if the difficulty gauge needs a number to compute win-rate, it belongs in this file \u2014 including each tower's per-path upgrade deltas ('upgrades'), the maps (maps[] \u2014 each with theme + path + free-placement rules + obstacles + simAnchors), and the wave generator (waveGen). Maps are content: maps[0] is the default; each map's 'theme' block holds every surface color/label the renderer draws (floor, belt, booth pads, kitchen, trash chute), so a diner reskin is literally JSON-only and per-kind prop art stays in src/art.js. 'tuned:true' marks a map whose difficulty is calibrated (node tools/sim.mjs --check enforces the band on it); future maps ship tuned:false until tuned. Placement: towers go anywhere inside placement.bounds that is > pathBuffer off the belt centerline, >= towerSpacing from other towers, and outside every obstacle rect; simAnchors are the OLD slot coordinates the headless sims still build at, in build order, so the difficulty gauge stays layout-stable \u2014 never reorder them. Upgrades: 2 named paths per tower, each with 2 tiers { cost, ...deltas }; buying a tier of one path locks the other for that placed tower. Difficulty is tuned against the REAL-ENGINE sim (node tools/sim.mjs --check), the CI gate as of Issue #54 PR 5 and the ONLY gauge since the economy overhaul retired the Python second-opinion model. Runs are ENDLESS (Issue #75): there is no win wave \u2014 the sim gauge's 'win' is reaching WAVE 30, and --check enforces target_win_rate on survival@30 for every tuned map. Costs/deltas are per tower and per tier (signatures are tier 2).",
  "target_win_rate": [
    0.5,
    0.6
  ],
  "economy": {
    "startCurrency": 800,
    "startLives": 20,
    "earnPerWave": 170,
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
      "retired": true,
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
      "bounty": 15
    },
    "runner": {
      "name": "The Slider",
      "hpMul": 0.6,
      "speedMul": 1.7,
      "bounty": 10
    },
    "brute": {
      "name": "Tough Steak",
      "hpMul": 2.6,
      "speedMul": 0.7,
      "bounty": 35
    },
    "swarm": {
      "name": "Fry Swarm",
      "hpMul": 0.28,
      "speedMul": 1.2,
      "bounty": 5
    }
  },
  "towers": {
    "arrow": {
      "name": "The Regular",
      "blurb": "Steady single-target fork-stabs",
      "cost": 250,
      "range": 130,
      "damage": 30,
      "cooldown": 0.75,
      "behavior": "single",
      "upgrades": {
        "forkFrenzy": {
          "name": "Fork Frenzy",
          "tiers": [
            {
              "cost": 300,
              "cooldownMul": 0.83
            },
            {
              "cost": 500,
              "pierce": true,
              "damage": 20,
              "range": 14
            }
          ]
        },
        "carvingStation": {
          "name": "Carving Station",
          "tiers": [
            {
              "cost": 250,
              "damage": 28,
              "range": 14
            },
            {
              "cost": 450,
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
      "cost": 400,
      "range": 104,
      "damage": 100,
      "cooldown": 2.8,
      "behavior": "single",
      "upgrades": {
        "speedEater": {
          "name": "Speed Eater",
          "tiers": [
            {
              "cost": 300,
              "cooldownMul": 0.72
            },
            {
              "cost": 700,
              "cooldownMul": 0.7,
              "crumbRadius": 44,
              "crumbDamage": 48
            }
          ]
        },
        "oneBigBite": {
          "name": "One Big Bite",
          "tiers": [
            {
              "cost": 300,
              "damage": 62,
              "range": 8
            },
            {
              "cost": 600,
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
      "cost": 300,
      "range": 120,
      "damage": 6,
      "cooldown": 1.1,
      "behavior": "freeze",
      "freezeDur": 0.91,
      "slowFactor": 0.62,
      "slowDur": 3.0,
      "upgrades": {
        "longExposure": {
          "name": "Long Exposure",
          "tiers": [
            {
              "cost": 250,
              "freezeDurAdd": 0.29,
              "damage": 3,
              "range": 12
            },
            {
              "cost": 500,
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
              "cost": 300,
              "range": 20
            },
            {
              "cost": 600,
              "range": 10,
              "freezeTargets": 2
            }
          ]
        }
      }
    },
    "sniper": {
      "name": "The Milkshake Slurper",
      "blurb": "Slurps a dish super-fast for tiny bites \u2014 watch its HP drain (small-med range)",
      "cost": 500,
      "range": 135,
      "damage": 7,
      "cooldown": 0.16,
      "behavior": "single",
      "upgrades": {
        "extraSlurp": {
          "name": "Extra Slurp",
          "tiers": [
            {
              "cost": 300,
              "damage": 5,
              "range": 8
            },
            {
              "cost": 550,
              "damage": 4,
              "range": 8
            }
          ]
        },
        "sillyStraw": {
          "name": "Silly Straw",
          "tiers": [
            {
              "cost": 300,
              "range": 5
            },
            {
              "cost": 550,
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
      "cost": 150,
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
              "cost": 150,
              "cooldownMul": 0.78
            },
            {
              "cost": 300,
              "cooldownMul": 0.85,
              "maxTargetsAdd": 1,
              "damage": 4
            }
          ]
        },
        "teenageTable": {
          "name": "Teenage Table",
          "tiers": [
            {
              "cost": 150,
              "damage": 8,
              "range": 8
            },
            {
              "cost": 200,
              "damage": 8,
              "range": 8
            }
          ]
        }
      }
    },
    "cook": {
      "name": "The Short-Order Cook",
      "blurb": "Sears the 2 nearest dishes on a hot griddle \u2014 fast multi-hits (mid range)",
      "cost": 350,
      "range": 110,
      "damage": 15,
      "cooldown": 0.6,
      "behavior": "multi",
      "maxTargets": 2,
      "upgrades": {
        "slingingHash": {
          "name": "Slinging Hash",
          "tiers": [
            {
              "cost": 250,
              "cooldownMul": 0.8
            },
            {
              "cost": 550,
              "maxTargetsAdd": 1,
              "damage": 5
            }
          ]
        },
        "seasonedGriddle": {
          "name": "Seasoned Griddle",
          "tiers": [
            {
              "cost": 250,
              "damage": 8
            },
            {
              "cost": 500,
              "damage": 6,
              "knockbackBase": 55,
              "knockbackSizeRef": 12,
              "knockbackChance": 0.3
            }
          ]
        }
      }
    },
    "eater": {
      "name": "The Competitive Eater",
      "blurb": "Locks one dish and devours it \u2014 consecutive kills ramp bite speed (combo)",
      "cost": 450,
      "range": 130,
      "damage": 15,
      "cooldown": 0.36,
      "behavior": "single",
      "comboCap": 4,
      "comboRamp": 0.25,
      "upgrades": {
        "waterDunk": {
          "name": "Water Dunk",
          "tiers": [
            {
              "cost": 300,
              "cooldownMul": 0.95
            },
            {
              "cost": 550,
              "solomonSplit": true,
              "damage": 6
            }
          ]
        },
        "recordPace": {
          "name": "Record Pace",
          "tiers": [
            {
              "cost": 300,
              "comboCapAdd": 3,
              "cooldownMul": 0.78
            },
            {
              "cost": 550,
              "comboCapAdd": 2,
              "mustardBonus": 45
            }
          ]
        }
      }
    },
    "pit": {
      "name": "The Pitmaster",
      "blurb": "Locks one dish in low-and-slow smoke \u2014 a stacking burn that ramps (long range)",
      "cost": 300,
      "range": 150,
      "damage": 0,
      "cooldown": 0.9,
      "behavior": "single",
      "smokeDps": 10,
      "smokeDuration": 4,
      "smokeStacks": 5,
      "upgrades": {
        "theStall": {
          "name": "The Stall",
          "tiers": [
            {
              "cost": 250,
              "cooldownMul": 0.6
            },
            {
              "cost": 550,
              "burntEnds": 3
            }
          ]
        },
        "competitionRub": {
          "name": "Competition Rub",
          "tiers": [
            {
              "cost": 250,
              "smokeStacksAdd": 2,
              "cooldownMul": 0.8
            },
            {
              "cost": 550,
              "probeThreshold": 0.15
            }
          ]
        }
      }
    },
    "ranch": {
      "name": "The Ranch Fountain",
      "blurb": "Cascading ranch coats every dish in a cone \u2014 stacking slow + a light drizzle of damage",
      "cost": 300,
      "range": 120,
      "damage": 0,
      "cooldown": 0.8,
      "behavior": "single",
      "coneHalfDeg": 45,
      "ranchDps": 4,
      "ranchDuration": 3,
      "ranchStacks": 5,
      "slowPerStack": 0.1,
      "slowFloor": 0.45,
      "upgrades": {
        "extraDressing": {
          "name": "Extra Dressing",
          "tiers": [
            {
              "cost": 250,
              "slowPerStackAdd": 0.04
            },
            {
              "cost": 550,
              "dpsPerStackAdd": 1
            }
          ]
        },
        "widerNozzle": {
          "name": "Wider Nozzle",
          "tiers": [
            {
              "cost": 250,
              "coneHalfAdd": 12,
              "range": 25
            },
            {
              "cost": 600,
              "kegPeriod": 4
            }
          ]
        }
      }
    },
    "sample": {
      "name": "The Sample Lady",
      "blurb": "Offers a free sample: a brief stop + a mark that makes EVERY customer hit harder",
      "cost": 150,
      "range": 100,
      "damage": 4,
      "cooldown": 1.4,
      "behavior": "single",
      "stunDur": 0.35,
      "ampMul": 1.25,
      "ampDur": 4,
      "upgrades": {
        "costcoSaturday": {
          "name": "Costco Saturday",
          "tiers": [
            {
              "cost": 150,
              "cooldownMul": 0.5
            },
            {
              "cost": 250,
              "cooldownMul": 0.8,
              "lossLeader": 15
            }
          ]
        },
        "hardSell": {
          "name": "Hard Sell",
          "tiers": [
            {
              "cost": 150,
              "ampMulAdd": 0.12
            },
            {
              "cost": 300,
              "bulkTargets": 3,
              "bulkRadius": 60
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
    "typeWeights": {
      "mote": {
        "base": 1.0,
        "perWave": -0.05,
        "min": 0.15
      },
      "runner": {
        "base": 0.7,
        "perWave": 0
      },
      "swarm": {
        "base": 0.4,
        "perWave": 0.02
      },
      "brute": {
        "base": 0.2,
        "perWave": 0.03
      }
    },
    "endless": false
  }
};
