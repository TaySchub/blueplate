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
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/GameStudio
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser. Press `Control + C` in
Terminal to stop the server.

---

## Part 2 — Connect this folder to GitHub (one time)

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
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/GameStudio

git config --global user.name  "Your Name"
git config --global user.email "you@example.com"

git init
git branch -M main
git add .
git commit -m "Initial commit: skeleton, docs, and Studio Feed workflow"

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
