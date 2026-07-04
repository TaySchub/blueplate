# Setup & Launch (beginner-friendly)

This guide has two parts:

1. **Run the game on your own computer** (no accounts needed).
2. **Put it on GitHub** so the Studio Feed + deploy can work.

You only do the GitHub part once. I (your AI studio) built all the files;
because my sandbox can't reach GitHub or type into your Terminal, **you run the
GitHub commands** — they're copy-paste and I explain each one. You'll sign in
through your browser, so **your password is never typed into a command**.

---

## Part 1 — Run it locally (30 seconds)

The simplest way: find `index.html` in this folder and **double-click it**. It
opens in your browser and the "Deckbound" game loads (hub screen → Start Run).

If double-clicking ever misbehaves, run a tiny local web server instead. Open
the **Terminal** app and paste:

```bash
cd path/to/deckbound   # this folder — tip: type "cd " then drag it from Finder into Terminal
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser. Press `Control + C` in
Terminal to stop the server.

---

## Part 2 — Connect this folder to GitHub (one time)

> **Already done?** If your `deckbound` repo is already on GitHub (it is, if
> you're reading this there), this one-time setup is complete — skip to Part 4 to
> work on the game. This section is kept as a record of how it was wired up.

### Step 2a — Install the GitHub CLI (`gh`)

`gh` is GitHub's official command-line tool. It handles sign-in through your
browser so you never paste a password. Install it with Homebrew:

```bash
brew install gh
```

(No Homebrew? Get it at <https://brew.sh> first, or download `gh` from
<https://cli.github.com>.)

### Step 2b — Sign in (browser, no password in the terminal)

```bash
gh auth login
```

Answer the prompts: choose **GitHub.com**, protocol **HTTPS**, and
**"Login with a web browser."** `gh` shows you a **one-time code** and opens
`https://github.com/login/device`. Type the code in your browser, approve, done.
Your password stays between you and GitHub.

### Step 2c — Push this folder to your (empty) `deckbound` repo

You already made an empty `deckbound` repo, so we just link this folder to it
and push. Run these from inside this folder. (The first two lines set who your
commits show as — use your own name/email.)

```bash
cd path/to/deckbound   # this folder (the one with index.html)

git config --global user.name  "Your Name"
git config --global user.email "you@example.com"

git init
git branch -M main
git add .
git commit -m "Initial commit: game, docs, and Studio Feed workflow"

# This line auto-fills your GitHub username from your gh login, so you don't
# have to type it. It links this folder to your empty deckbound repo and pushes.
git remote add origin "https://github.com/$(gh api user --jq .login)/deckbound.git"
git push -u origin main
```

> If `git push` complains the remote already has commits (e.g. a README was
> auto-added), run `git pull --rebase origin main` once, then `git push` again.

### Step 2d — Create the backlog Issues (one command)

I wrote a script that creates all 14 backlog Issues with the right labels:

```bash
bash tools/create-issues.sh
```

### Step 2e — Add the Slack webhook secret (makes the feed post)

The Studio Feed workflow reads a secret called `SLACK_WEBHOOK_URL`. Create an
"Incoming Webhook" URL in Slack for your `#studio-feed` channel
(<https://api.slack.com/messaging/webhooks>), then store it as a repo secret:

```bash
gh secret set SLACK_WEBHOOK_URL
```

Paste the webhook URL when asked. (Until this is set, the workflow still runs
but the Slack post step just won't deliver — that's fine for now.)

---

## Part 3 — Deploy (only when you say go)

Deploying = making the game live on the web via **GitHub Pages**. Per your
rules, **I won't enable this** — you flip the switch. When you're ready:

Repo on GitHub → **Settings → Pages** → under "Build and deployment",
**Source: Deploy from a branch**, **Branch: `main`, folder `/ (root)`** → Save.
After a minute your game is at `https://YOUR-USERNAME.github.io/deckbound/`,
openable on your Mac and iPhone.

That's Task 2. We'll pause here for your OK before touching any of it.

---

## Part 4 — Tuning the game & editing maps

All the game's numbers **and** the map live in one file: `data/balance.json` —
tower stats, enemy types, the wave generator (`waveGen`, 20 waves by default),
the economy (starting money/lives), and
the map (`path` + tower `slots`). To change the game:

1. Edit a value in `data/balance.json` — e.g. an enemy's `hpMul`, a tower's
   `damage`, or a point in `map.path` to reshape the track.
2. Run the generator so the game picks it up:
   ```bash
   python3 tools/gen_balance.py
   ```
3. Refresh the game in your browser. Done.

**Why the extra step?** When you double-click `index.html`, the browser blocks
it from reading the JSON directly (a security rule for local files), so
`gen_balance.py` copies the numbers into `balance.data.js`, which the game
loads. It also stamps a small cache-busting version onto `index.html`'s script
tags (`src/engine.js?v=…` etc.) so a fresh deploy shows up for players instead of GitHub
Pages' ~10-minute cached copy. So run `gen_balance.py` before deploying after
**any** code change (including the `src/*.js` modules), and commit `balance.data.js` +
`index.html` together.

> Instant testing tip: GitHub Pages still caches the page itself for ~10 min, so
> right after a deploy, open the site in a **private/incognito tab** to see the
> new build immediately.

**Check difficulty without playing 100 games:**

```bash
python3 tools/balance_sim.py
```

It plays the game headlessly and reports a win-rate — aim for the
`target_win_rate` band (50–60%) set in the same file. Colors, shapes, and art
aren't in `balance.json`; those live in `src/art.js` (and `style.css` for the page
around the game).
