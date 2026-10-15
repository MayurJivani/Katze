# How it works

## The pieces

```
apps/server/src/services/game.js   the rules, as a pure state machine
apps/server/src/index.js           Express + ws relay, rooms in memory
apps/web/src/App.jsx               the whole client UI
apps/web/src/lib/useRoom.js        one socket per tab, reconnects itself
apps/web/src/Icons.jsx             the small drawn glyphs
apps/web/src/TileStrip.jsx         the homepage's tiles, from the same factory
apps/web/src/three/Table3D.jsx     the table, as actual objects
apps/web/src/three/catArt.js       the plate and cat art, drawn to canvas
```

## The rules live in one file, and it never touches the network

`game.js` exports functions that take a room object, mutate it, and throw on an illegal move. It
reads no clock, opens no socket, and knows nothing about who is connected. That is what makes the
rules testable without a server: `game.test.js` plays whole hands by calling the same functions the
relay calls, including the paths that are awkward to reach by hand (a player eliminated on their
last box, a mid-hand disconnect).

The throw message is written to be shown to the player who caused it, which is why the relay can
forward `err.message` straight back to one socket without a translation layer.

## A face-down box is not in the payload

The obvious way to build this leaks the game. If the server broadcasts one state object and the
client hides the other players' cards, then anybody with devtools wins every round.

So `projectState(room, viewerId)` builds a different object per viewer: other players' boxes are a
count (`stackCount`), their hands are a count, and the card identities are simply absent. Only the
viewer's own `stack` and `hand` carry values. The relay calls it once per socket rather than once
per room, which is the small cost that makes the bluffing real. One of the tests asserts that a
serialized projection of another player's shelf contains no card identity at all.

## Bidding, and the one rule that makes bluffing cost something

The bid ceiling is the number of boxes actually on the table, which guarantees a challenge can
always be completed. The order of opening is the part that matters: the bidder turns every box over by hand, one at a
time, and their own shelf has to be empty before they may touch anyone else. Nothing opens itself,
because the moment a bluffer turns over their own dead cat in front of everyone is the moment the
bid was made for.

A failed challenger loses one box at random. The printed rules let the owner of the revealed skull
pick the card blind; the random discard is the common house simplification and is marked with a
`shortcut:` comment in the code, along with what it would take to upgrade.

The discard happens *after* the table is collected, not before. That ordering was a real bug: at the
moment a challenge fails, every one of the challenger's boxes is on the table, so a discard taken
from their hand takes nothing and the player survives on zero cards. The test for elimination is
what caught it.

## What happens when a phone sleeps

`useRoom` holds one socket per tab and rejoins with a `playerId` kept in `localStorage`, so a phone
that sleeps mid-hand comes back to its own seat with its own hand. The relay keeps a disconnected
player's seat for five minutes, then folds them so one closed tab cannot freeze a table forever. The
host can also remove a player, which collects the table and redeals the round, because a seat
vanishing mid-hand makes the round wrong for everyone.

Rooms are memory only and die with the process. Nothing here is worth a database: a table that
outlives the evening is not a feature anyone asked for.

## The table is real objects, and all of it is procedural

Every mesh is made in code: a cylinder for a coaster, a slab for a mat, a plane for the felt. The
art on them is drawn to a canvas at runtime and used as a texture. Nothing is imported, nothing is
reconstructed from an image, and there is no licence to track. Six house palettes (marmalade,
violet, lagoon, fern, ember, midnight) are keyed to the seat index, so a player's cat looks the
same on every client, and live and dead cats are drawn from one shared head so the tiles are twins
until one is opened.

Budget at a full six-seat table is about 30 meshes, 3 lights and 14 textures. The camera is not
hand-placed: it measures the table's footprint and fits it, because two seats and six seats are
different boxes and a phone is a different window onto both. One early bug worth remembering: the
measurement ran before the world matrices updated, so it measured local space with every seat piled
at the origin, and the camera dived into the table.

The one piece of motion is a tile turning over. Only newly opened tiles animate, tracked by how many
each player had face up on the previous render, so a state update does not replay every flip.

## Two house rules the printed game does not have

**A bid has to reach past your own shelf.** Your own boxes open in full whatever you bid, and you
know what is in them, so bidding your own pile or less is a free fish: bury one live cat, bid one,
collect. The floor is your own pile plus one, which makes every challenge cost a guess about
somebody else's shelf. The server computes it per viewer (`yourMinBid`) because it depends on how
many boxes that player has down.

**A bid of every box on the table goes straight to the reveal.** Nobody can raise past the whole
table, so asking three people to tap pass only delays the part they are waiting for.

## Teaching it without words

The tutorial is the game, not a diagram of it: eight steps, each one a state object in exactly the
shape the relay sends, fed to the same table component a real game uses. There is no special
rendering path, so the flips, the fan and the tumble a new player watches are the ones they will
play with. It paces itself and any tap moves it on.

The homepage is the same trick: four closed boxes, three live cats and one dead one, shuffled. Open
one and find out. Find the dead one and everything reshuffles, which is the whole game in a sentence
nobody has to read.

## The table is the control surface

Your hand is on the table as one token per box you hold, always drawn so the camera framing does not
jump when your turn arrives. Tap a token to put it down; tap a neighbour's pile to open it. Anything
clickable rises under the pointer, and nothing else in the scene moves on hover, so the lift means
"this one".

The buttons that used to do those jobs are still in the DOM and still focusable, just not drawn:
`button.reach` clips them to a pixel and restores them on `:focus-visible`, so a keyboard or screen
reader has the same game a pointer does. That rule has to sit last in the stylesheet, since the
component rules it hides are single-class selectors too.

Boxes open one at a time (each flip waits `index * 0.55s`), because a shelf of four opening at once
is a blur. The opened row spreads as wide as the mat allows and fans past that, so boxes never
intersect: four of them cannot fit side by side on one mat at this size.

## The reveal stays on the table

A successful challenge used to collect the table in the same tick it resolved, which meant nobody
ever saw the cats they had just bet on. The server now keeps the reveal as a snapshot
(`room.lastReveal`) and the table shows it until somebody puts down the first box of the next round.
It is only ever cards that were already turned face up, so it leaks nothing.

## The homepage shows the real thing

The landing view is not a mockup of the game: the tiles on it come out of the same `catArt` factory
the table renders, drawn at load and handed to `<img>` tags with real alt text. There was never a
reason to photograph or fake a product that draws itself.

Phone layout decides the order: headline, then the art, then the form, because the art is the pitch
and the form is the ask. Desktop moves the art into a second column beside both. Every control
clears 44px, inputs are 16px so iOS does not zoom on focus, and the page respects the safe-area
insets on a notched phone.

## The look

Tokens, type and controls are lifted from DLE Club and its games, down to the variable names, so
this reads as part of that family: dark page, cream as the one bright surface, Bricolage Grotesque,
pill controls with an inset bottom lip, rings drawn with inset shadows rather than drop shadows. The
cream discs are also simply what the board game looks like on a table.

Two colours carry meaning and nothing else: red is the dead cat, green is a bid that came off. The
four glyphs (live cat, dead cat, closed box, fish) are drawn in one stroke weight rather than
borrowed from an emoji font, and live and dead share one head path, which is the joke: until the box
is open the two cats are the same cat.
