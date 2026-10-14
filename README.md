# Katze

Multiplayer [Skull](https://en.wikipedia.org/wiki/Skull_(game)), themed as Schrodinger's cat. Four
closed boxes each: three hold a live cat, one holds a dead one, and nobody finds out which is which
until a box is opened. Put a box down, lie about it, then bet how many boxes you can open before
someone finds the dead cat. Two fish wins the table.

[![live](https://img.shields.io/badge/live-katze.futile.studio-faf2dd)](https://katze.futile.studio)
![stack](https://img.shields.io/badge/stack-React%2019%20·%20Vite%20·%20three.js%20·%20Express%205%20·%20ws-0e1117)
![last commit](https://img.shields.io/github/last-commit/MayurJivani/Katze?color=0e1117)

## Run it

```bash
npm install && npm run dev
```

The web app comes up on `http://localhost:5178` and the relay on `:4331`. Open a table, send anyone
else the link, and play on a phone each. Two to six players.

Each player gets a painted mat and a set of coasters in their own house colours, rendered as real
objects on a table. Click a neighbour's pile to open a box when you hold the bid.

```bash
npm test
```

Eleven checks over the rules engine: bidding gates, the bid ceiling, the own-shelf-first reveal
order, the discard, elimination, the reveal that stays on the table between rounds, and that no
player is ever told what is inside another player's box.

## Deploy

```bash
./deploy/deploy.sh
```

One entry point, no arguments, safe to run twice. The box keeps its own checkout at `~/apps/Katze`,
so a deploy is a fast-forward plus a container rebuild. The site block installs itself into
`/etc/caddy/conf.d` and only reloads Caddy when it actually changed.

## Shape

Relay shape, the one described in [GUIDELINES.md](../GUIDELINES.md): an npm workspace with a React
SPA (`apps/web`) and one Express + `ws` process (`apps/server`) that holds every room in memory. The
relay is the referee. Clients send intent and render what comes back, and the state each socket
receives is redacted for that player, so a face-down box is not in the payload at all.

[HOW-IT-WORKS.md](HOW-IT-WORKS.md) covers the rules engine, the redaction, and what happens when a
phone goes to sleep mid-hand.
