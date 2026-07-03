// AUTO-GENERATED from data/balance.json by tools/gen_balance.py.
// Do NOT edit by hand — edit data/balance.json and re-run the generator.
window.BALANCE = {
  "_note": "Single source of truth for DIFFICULTY & ECONOMY numbers. tools/balance_sim.py reads this file directly; the game reads it via the generated balance.data.js (run tools/gen_balance.py after editing). Art (colors/shapes/blurbs) and level geometry (path, slots) live in main.js, not here. Rule: if the balance sim needs a number to compute win-rate, it belongs in this file \u2014 including per-tower upgrade deltas ('up').",
  "target_win_rate": [
    0.45,
    0.6
  ],
  "economy": {
    "startCurrency": 150,
    "startLives": 20,
    "earnPerWave": 40,
    "upgradeCost": [
      0,
      70,
      100
    ]
  },
  "enemyTypes": {
    "mote": {
      "hpMul": 1.0,
      "speedMul": 1.0,
      "reward": 5
    },
    "runner": {
      "hpMul": 0.6,
      "speedMul": 1.7,
      "reward": 5
    },
    "brute": {
      "hpMul": 2.6,
      "speedMul": 0.7,
      "reward": 9
    },
    "swarm": {
      "hpMul": 0.28,
      "speedMul": 1.2,
      "reward": 2
    }
  },
  "towers": {
    "arrow": {
      "cost": 50,
      "range": 130,
      "damage": 30,
      "cooldown": 0.75,
      "behavior": "single",
      "up": {
        "damage": 16,
        "range": 14,
        "cooldownMul": 0.86
      }
    },
    "cannon": {
      "cost": 85,
      "range": 118,
      "damage": 24,
      "cooldown": 1.3,
      "behavior": "splash",
      "splash": 46,
      "up": {
        "damage": 15,
        "splash": 10,
        "cooldownMul": 0.9
      }
    },
    "frost": {
      "cost": 70,
      "range": 120,
      "damage": 10,
      "cooldown": 0.8,
      "behavior": "slow",
      "slowFactor": 0.5,
      "slowDur": 1.2,
      "up": {
        "damage": 6,
        "slowFactorAdd": -0.08,
        "range": 12
      }
    },
    "sniper": {
      "cost": 95,
      "range": 235,
      "damage": 70,
      "cooldown": 1.85,
      "behavior": "single",
      "up": {
        "damage": 45,
        "range": 26,
        "cooldownMul": 0.88
      }
    },
    "zap": {
      "cost": 35,
      "range": 96,
      "damage": 12,
      "cooldown": 0.32,
      "behavior": "single",
      "up": {
        "damage": 7,
        "range": 8,
        "cooldownMul": 0.85
      }
    }
  },
  "waves": [
    {
      "hp": 75,
      "speed": 50,
      "interval": 1.0,
      "comp": [
        [
          "mote",
          7
        ]
      ]
    },
    {
      "hp": 90,
      "speed": 53,
      "interval": 0.95,
      "comp": [
        [
          "mote",
          6
        ],
        [
          "runner",
          4
        ]
      ]
    },
    {
      "hp": 110,
      "speed": 55,
      "interval": 0.9,
      "comp": [
        [
          "mote",
          7
        ],
        [
          "runner",
          5
        ],
        [
          "swarm",
          4
        ]
      ]
    },
    {
      "hp": 135,
      "speed": 57,
      "interval": 0.85,
      "comp": [
        [
          "mote",
          8
        ],
        [
          "swarm",
          9
        ],
        [
          "runner",
          4
        ]
      ]
    },
    {
      "hp": 160,
      "speed": 59,
      "interval": 0.8,
      "comp": [
        [
          "mote",
          8
        ],
        [
          "runner",
          6
        ],
        [
          "brute",
          2
        ]
      ]
    },
    {
      "hp": 190,
      "speed": 61,
      "interval": 0.76,
      "comp": [
        [
          "swarm",
          14
        ],
        [
          "runner",
          6
        ],
        [
          "brute",
          2
        ]
      ]
    },
    {
      "hp": 220,
      "speed": 63,
      "interval": 0.72,
      "comp": [
        [
          "mote",
          9
        ],
        [
          "brute",
          3
        ],
        [
          "runner",
          7
        ]
      ]
    },
    {
      "hp": 255,
      "speed": 65,
      "interval": 0.68,
      "comp": [
        [
          "runner",
          10
        ],
        [
          "brute",
          3
        ],
        [
          "swarm",
          9
        ]
      ]
    },
    {
      "hp": 295,
      "speed": 67,
      "interval": 0.63,
      "comp": [
        [
          "mote",
          11
        ],
        [
          "swarm",
          12
        ],
        [
          "brute",
          4
        ]
      ]
    },
    {
      "hp": 340,
      "speed": 69,
      "interval": 0.56,
      "comp": [
        [
          "brute",
          6
        ],
        [
          "runner",
          12
        ],
        [
          "mote",
          9
        ]
      ]
    }
  ]
};
