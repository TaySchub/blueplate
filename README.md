# Deckbound

A tower-defense deckbuilder themed **hungry customers vs. runaway food**: seat
restaurant customers (your tower cards) along a diner conveyor belt and eat the
dishes trying to escape to the trash chute — surviving escalating waves, then
collecting and upgrading new customers between runs.

- **What it is / the vision:** see [`GAME_BRIEF.md`](GAME_BRIEF.md) (the frozen spec).
- **How we work / the rules:** see [`PROJECT.md`](PROJECT.md).
- **How to run and deploy it (beginner-friendly):** see [`SETUP-AND-LAUNCH.md`](SETUP-AND-LAUNCH.md).
- **What changed and when:** see [`CHANGELOG.md`](CHANGELOG.md).

## Run it locally

Open `index.html` in a web browser — that's it for now. (Double-click the file,
or see `SETUP-AND-LAUNCH.md` for a tiny local web server if you prefer.)

## Status

**v1 shipped; post-v1 in progress** — live at <https://tayschub.github.io/deckbound/>:
the full prep→wave→resolve loop with 5 customer towers (each with its own
attack identity), 4 runaway foods, **20 generated waves** (win by surviving
them all), tower upgrades, per-tower targeting, a call-the-wave-early bonus,
an optional endless mode, and between-run meta-progression. The live backlog
is GitHub Issues (next up: the tower-upgrades rework, pinned there).

## Tech

Plain HTML5 + CSS + JavaScript, hosted on GitHub Pages, playable in a browser
on Mac and iPhone. We may add [Phaser 3](https://phaser.io/) later if the
real-time action needs it. Original assets only — no branded content.

---
<sub>🤖 Automated contribution | Issue: [#98](https://github.com/TaySchub/blueplate/issues/98)</sub>
