# Kickoff templates — one per proven PR shape

> **How to use (planner):** pick the template matching the work's shape, fill
> the `{BLANKS}`, splice in the STANDARD HEADER and STANDARD CLOSE below where
> the template says so, and post the result as the first comment on the issue.
> The developer pastes it into a fresh builder chat. If the work fits no
> template, it's a pattern-setting FIRST — write it long-form, scope it
> tightly, flag a checkpoint (`docs/CHECKPOINT.md`), and mint a template from
> it afterward (#67→#68 and #90→#91 are how the existing shapes were born).
> Every invariant below is baked into the templates so the planner fills
> blanks instead of remembering rules (Issue #101).

The shapes: `content-beside-the-gate.md` · `gate-moving-content.md` ·
`tuning-numbers-only.md` · `display-chrome.md` · `audio-pass.md` ·
`staged-mechanic-tuning.md`. The parallel-run clause (below) composes with any
of them.

## STANDARD HEADER (splice into every kickoff)

```
{DAY PR: "Build {TITLE} for Blue-Plate Special" / OVERNIGHT: "OVERNIGHT
AUTONOMOUS SESSION — Blue-Plate Special: {TITLE}. You are Claude running
unattended at high effort."} (repo ~/dev/blueplate,
github.com/TaySchub/blueplate). Read first, in order: AGENTS.md, CLAUDE.md
(repo map + code landmarks + definition of verified), PROJECT.md{OVERNIGHT:
", AUTONOMY.md — it governs: default to the next step, never merge, park with
the exact blocker if stuck"}{+ domain docs: docs/BALANCE_PHILOSOPHY.md for
anything touching numbers, docs/ART_STYLE.md for anything drawn,
docs/FRANCHISE_BACKBONE.md for tone}. Work in a FRESH isolated git worktree
off up-to-date origin/main (house pattern); branch {BRANCH} BEFORE any edit.
Exactly ONE PR — build, open, post the link on this issue, stop.

HARD PREREQUISITE (verify before any edit): {PREREQ — e.g. "PR #N merged;
confirm <observable fact in the repo>"}. If not true, STOP and comment here.

CONTENT GUARDRAIL (any kickoff that adds player-facing content — towers,
dishes, maps, names, copy): general-audience cartoon tone, ORIGINAL
ARCHETYPES ONLY — never brands, chains, celebrities, or trademarks. Research
sources inspire behaviors; they never enter the game. (GAME_BRIEF law;
carried verbatim by every content kickoff #88→#98.)
```

## STANDARD CLOSE (splice into every kickoff)

```
VERIFY, DOCUMENT, DELIVER — the definition of verified (CLAUDE.md) in full:
zero console errors on a served load; gate + smoke quotes per this kickoff's
invariant; all behavior tests green {UNEDITED unless this kickoff adds
tests}; maplint green; gen_balance run (stamps in sync); screenshots
committed under docs/pr-assets/{TOPIC}/ and embedded via raw URLs; ≥44 CSS px
touch-target audit if any interactive rect moved. PR body: {SHAPE-SPECIFIC
TABLES}, testing steps in plain language, and a CHANGELOG.md entry{STAGED:
" per stage"}. GAME_BRIEF.md: {usually "no edits"; else quote the exact
pre-authorized string swap}.

MERGE-NOTE RIDER: if another PR lands first, this branch needs the trivial
index.html-stamps rebase — resolve by re-running python3 tools/gen_balance.py
(established pattern), then force-with-lease.

Merging is the developer's gate. Review tier (docs/CHECKPOINT.md):
{TIER — "no checkpoint: CI + the developer's screenshot round" / "Fable-style
checkpoint before merge" / "checkpoint + the developer runs /code-review
ultra <PR#> on the open PR"}. If the repo contradicts this kickoff, STOP and
comment here. A documented near-miss beats an overfit hack.
```

## The parallel-run file-contract clause (compose when two chats run at once)

Two builders may run concurrently ONLY with disjoint file sets, declared in
BOTH kickoffs (#79/#80 precedent — render/data/main-except-FX-block vs
audio.js+FX-block; #98/#101 — game files vs docs):

```
PARALLEL-RUN FILE CONTRACT: a second chat is concurrently building {OTHER PR}.
You own: {FILE LIST}. You must not touch: {OTHER'S FILES}. Shared-but-
regenerated: index.html stamps + CHANGELOG.md — whichever PR merges second
rebases and re-runs gen_balance.py (only the stamps and CHANGELOG should
conflict; anything else conflicting means the contract was broken — stop and
report, don't resolve silently). Work in your own isolated worktree — the
shared checkout's state is not yours (the #80 incident: a parallel chat
switched the shared tree's branch under uncommitted work).
```

Notes for the planner: main.js splits at the FX-wiring block (audio's seam);
engine.js call-site-only additions can be shared IF one side adds no-op hooks
only. When in doubt, sequence instead of parallelizing — the two-PR overnight
(#84+#85) builds sequentially in ONE chat, both branches from origin/main,
never stacked (AUTONOMY.md, the PR #44 rule).
