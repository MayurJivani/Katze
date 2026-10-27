import { createHash } from "node:crypto"

/**
 * Skull, themed as Schrodinger's cat. Pure rules over one room object.
 *
 * Every export mutates the room and throws on an illegal move. The relay is
 * the only caller, so the throw message is safe to show the player who tried
 * it. Nothing in here reads the clock or the network.
 *
 * Each player holds 4 closed boxes: 3 hold a live cat, 1 holds a dead one.
 * Nobody knows which box is which until it is opened, including the player who
 * put it down, who is lying about it either way. Players stack boxes face down
 * on their own shelf, then one of them bids how many boxes can be opened
 * without finding the dead cat. Highest bidder opens them by hand, one at a
 * time, their own shelf first and then any other. All alive and the bid
 * is made, which earns a fish. The dead cat and one of their cats is gone for
 * good. Two fish wins, and so does being the last player still holding cats.
 */

export const PHASE = { LOBBY: "lobby", PLACE: "place", BID: "bid", REVEAL: "reveal", OVER: "over" }
export const WINNING_POINTS = 2
export const MAX_SEATS = 6
export const MIN_SEATS = 2

const LIVE = "cat"
const DEAD = "dead"
const CARDS = [LIVE, DEAD]
const START_HAND = { cat: 3, dead: 1 }
const LOG_KEEP = 12

const bad = (message) => {
  throw new Error(message)
}

/** The public seat id for a client's secret: one-way, so a seat id seen on the table is useless as a secret. */
export function seatId(secret) {
  return `p_${createHash("sha256").update(String(secret)).digest("hex").slice(0, 16)}`
}

export function createRoom(code) {
  return {
    code,
    phase: PHASE.LOBBY,
    seats: [],
    hostId: null,
    turn: 0,
    bid: 0,
    bidderId: null,
    winnerId: null,
    lastReveal: null,
    log: [],
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

const seat = (room, id) => room.seats.find((p) => p.id === id) ?? null
const inHand = (p) => p.cat + p.dead
const onMat = (p) => p.stack.length + p.up.length
const owned = (p) => inHand(p) + onMat(p)
const living = (room) => room.seats.filter((p) => !p.out)
const current = (room) => room.seats[room.turn] ?? null

/** Total boxes still closed on every shelf, the ceiling on any bid. */
const onTable = (room) => living(room).reduce((n, p) => n + p.stack.length, 0)

/**
 * The lowest bid this player may make.
 *
 * Your own shelf opens in full whatever you bid, so a bid that does not reach
 * past it never touches anyone else: bury one live cat, bid one, collect a free
 * fish. Requiring one more than your own pile makes every challenge cost a
 * guess about somebody else's shelf, which is the entire game.
 */
const bidFloor = (room, p) => Math.max(room.bid + 1, p.stack.length + 1)

/** Bidding opens only once every player still in the game has put a box down. */
const biddingOpen = (room) => living(room).every((p) => p.stack.length > 0)

function note(room, line) {
  room.log.push(line)
  if (room.log.length > LOG_KEEP) room.log.splice(0, room.log.length - LOG_KEEP)
}

function nextSeat(room, from, skipPassed = false) {
  for (let i = 1; i <= room.seats.length; i++) {
    const j = (from + i) % room.seats.length
    const p = room.seats[j]
    if (p.out) continue
    if (skipPassed && p.passed) continue
    return j
  }
  return from
}

const seatIndex = (room, id) => room.seats.findIndex((p) => p.id === id)

// ── Seating ──────────────────────────────────────────────────────────────────

export function addPlayer(room, id, name) {
  if (room.phase !== PHASE.LOBBY && room.phase !== PHASE.OVER) bad("That game is already under way.")
  if (room.seats.length >= MAX_SEATS) bad("That table is full.")
  const p = {
    id,
    name,
    connected: true,
    out: false,
    passed: false,
    points: 0,
    cat: START_HAND.cat,
    dead: START_HAND.dead,
    stack: [],
    up: [],
  }
  room.seats.push(p)
  if (!room.hostId) room.hostId = id
  note(room, `${name} sat down`)
  return p
}

export function removePlayer(room, id) {
  const p = seat(room, id)
  if (!p) return
  if (room.phase === PHASE.LOBBY || room.phase === PHASE.OVER) {
    room.seats = room.seats.filter((x) => x.id !== id)
    if (room.hostId === id) room.hostId = room.seats[0]?.id ?? null
    room.turn = 0
    note(room, `${p.name} left`)
    return
  }
  // Mid-game: fold them, so one closed tab can't freeze the table.
  if (!p.out) foldOut(room, p, "left the table")
}

/** Host drops a player who is not coming back. */
export function kick(room, byId, targetId) {
  if (byId !== room.hostId) bad("Only the host can remove a player.")
  if (byId === targetId) bad("You cannot remove yourself.")
  if (!seat(room, targetId)) bad("No such player.")
  const mid = room.phase === PHASE.PLACE || room.phase === PHASE.BID || room.phase === PHASE.REVEAL
  const starterId = mid ? (current(room)?.id ?? null) : null
  removePlayer(room, targetId)
  // Mid-hand the table is now wrong for everyone, so deal the round again.
  if (mid) afterRoundEnd(room, starterId)
}

// ── Round flow ───────────────────────────────────────────────────────────────

export function startGame(room, byId) {
  if (byId !== room.hostId) bad("Only the host can start the game.")
  if (room.phase !== PHASE.LOBBY && room.phase !== PHASE.OVER) bad("The game is already running.")
  if (room.seats.length < MIN_SEATS) bad(`Needs at least ${MIN_SEATS} players.`)

  for (const p of room.seats) {
    p.out = false
    p.passed = false
    p.points = 0
    p.cat = START_HAND.cat
    p.dead = START_HAND.dead
    p.stack = []
    p.up = []
  }
  room.winnerId = null
  room.lastReveal = null
  room.bid = 0
  room.bidderId = null
  room.turn = 0
  room.phase = PHASE.PLACE
  room.log = []
  note(room, "New game, everyone puts a box down")
}

export function place(room, id, card) {
  if (room.phase !== PHASE.PLACE) bad("Not the placing phase.")
  const p = current(room)
  if (!p || p.id !== id) bad("Not your turn.")
  if (!CARDS.includes(card)) bad("Unknown card.")
  if (p[card] < 1) bad("You have none of those left.")

  // The first box of a new round clears the last one's reveal from the table.
  room.lastReveal = null
  p[card] -= 1
  p.stack.push(card)
  note(room, `${p.name} puts a box down`)
  room.turn = nextSeat(room, room.turn)
}

export function bid(room, id, amount) {
  if (room.phase !== PHASE.PLACE && room.phase !== PHASE.BID) bad("Not a bidding phase.")
  const p = current(room)
  if (!p || p.id !== id) bad("Not your turn.")
  if (room.phase === PHASE.PLACE && !biddingOpen(room) && inHand(p) > 0) {
    bad("Everyone puts a box down before the bidding opens.")
  }
  const n = Number(amount)
  const floor = bidFloor(room, p)
  const ceiling = onTable(room)
  if (!Number.isInteger(n)) bad("Bid a whole number.")
  if (n < floor) bad(`Bid at least ${floor}: your own shelf opens anyway.`)
  if (n > ceiling) bad(`Only ${ceiling} boxes are on the table.`)

  room.bid = n
  room.bidderId = id
  note(room, `${p.name} bids ${n}`)

  if (room.phase === PHASE.PLACE) {
    room.phase = PHASE.BID
    for (const x of room.seats) x.passed = false
  }
  // Nobody can raise past every box on the table, so do not make the others
  // tap pass to say what the table already says.
  if (n === ceiling) {
    note(room, "Nobody can raise that")
    return beginReveal(room)
  }
  if (living(room).every((x) => x.passed || x.id === id)) return beginReveal(room)
  room.turn = nextSeat(room, room.turn, true)
}

export function pass(room, id) {
  if (room.phase !== PHASE.BID) bad("Nothing to pass on yet.")
  const p = current(room)
  if (!p || p.id !== id) bad("Not your turn.")
  if (id === room.bidderId) bad("You hold the bid.")

  p.passed = true
  note(room, `${p.name} passes`)
  if (living(room).every((x) => x.passed || x.id === room.bidderId)) return beginReveal(room)
  room.turn = nextSeat(room, room.turn, true)
}

function beginReveal(room) {
  room.phase = PHASE.REVEAL
  room.turn = seatIndex(room, room.bidderId)
  const p = seat(room, room.bidderId)
  note(room, `${p.name} must open ${room.bid}`)
  // Nothing opens itself. The challenger turns every box over by hand, their
  // own first, which is where a bluff is paid for in front of everyone.
}

export function reveal(room, id, targetId) {
  if (room.phase !== PHASE.REVEAL) bad("Nothing to open.")
  if (id !== room.bidderId) bad("Only the bidder opens boxes.")
  const me = seat(room, id)
  // Your own shelf is emptied first, one box at a time, before you may touch
  // anyone else's.
  if (me.stack.length && targetId !== id) bad("Open your own boxes first.")
  const t = seat(room, targetId)
  if (!t || t.out) bad("No such player.")
  if (!t.stack.length) bad("Nothing left on that shelf.")

  t.up.push(t.stack.pop())
  settle(room)
}

/** Decide the challenge if it can be decided yet. */
function settle(room) {
  const flipped = room.seats.flatMap((p) => p.up)
  const challenger = seat(room, room.bidderId)

  if (flipped.includes(DEAD)) {
    note(room, `The dead cat. ${challenger.name} loses one for good`)
    return afterRoundEnd(room, challenger.id, challenger.id)
  }
  if (flipped.length >= room.bid) {
    challenger.points += 1
    note(room, `All alive. ${challenger.name} takes a fish (${challenger.points}/${WINNING_POINTS})`)
    if (challenger.points >= WINNING_POINTS) {
      room.winnerId = challenger.id
      room.phase = PHASE.OVER
      note(room, `${challenger.name} wins the table`)
      return
    }
    return afterRoundEnd(room, null)
  }
}

const label = (card) => (card === DEAD ? "the dead cat" : "a live cat")

/**
 * A failed challenger loses one card at random.
 *
 * shortcut: the printed rule lets the owner of the revealed skull pick the card
 * blind; random is the common house simplification. Upgrade only if someone
 * asks for the pick-a-card interaction, which needs its own turn state.
 */
function burnCard(p) {
  const pool = [...Array(p.cat).fill(LIVE), ...Array(p.dead).fill(DEAD)]
  const card = pool[Math.floor(Math.random() * pool.length)]
  if (card) p[card] -= 1
  return card ?? null
}

function foldOut(room, p, why) {
  p.out = true
  p.cat = 0
  p.dead = 0
  p.stack = []
  p.up = []
  note(room, `${p.name} is out (${why})`)
}

/**
 * Collect the table, settle eliminations, and open the next placing round.
 * `starterId` is whoever should lead it (the challenger), skipped if they went out.
 * `loserId` lost the challenge and discards one card, which can only happen
 * after the table is collected: their cards are all face up until then.
 */
function afterRoundEnd(room, starterId, loserId = null) {
  if (room.phase === PHASE.OVER) return

  // Keep what was turned over on the table until somebody starts the next
  // round. Collecting it in the same tick meant nobody ever saw the cats they
  // had just bet on, which is the only moment in the game worth watching.
  const shown = room.seats.filter((p) => p.up.length).map((p) => ({ id: p.id, up: [...p.up] }))
  const reveal = shown.length ? { by: room.bidderId, outcome: loserId ? "dead" : "fish", seats: shown } : null

  for (const p of room.seats) {
    if (p.out) continue
    for (const card of [...p.stack, ...p.up]) p[card] += 1
    p.stack = []
    p.up = []
    p.passed = false
  }

  const loser = loserId ? seat(room, loserId) : null
  let lost = null
  if (loser && !loser.out) {
    const burnt = burnCard(loser)
    if (burnt) {
      lost = { id: loser.id, card: burnt }
      note(room, `${loser.name} gives up ${label(burnt)}`)
    }
  }

  for (const p of room.seats) {
    if (!p.out && owned(p) === 0) foldOut(room, p, "no cats left")
  }

  room.lastReveal = reveal && { ...reveal, lost }

  const left = living(room)
  if (left.length === 1 && room.seats.length >= MIN_SEATS) {
    room.winnerId = left[0].id
    room.phase = PHASE.OVER
    note(room, `${left[0].name} is the last one with boxes`)
    return
  }
  if (left.length === 0) {
    room.phase = PHASE.OVER
    return
  }

  room.bid = 0
  room.bidderId = null
  room.phase = PHASE.PLACE
  const at = seatIndex(room, starterId)
  const from = at >= 0 ? at : 0
  room.turn = room.seats[from] && !room.seats[from].out ? from : nextSeat(room, from)
  note(room, `${room.seats[room.turn].name} leads the next round`)
}

// ── Projection ───────────────────────────────────────────────────────────────

/** What one viewer is allowed to know. Hands and face-down cards stay hidden. */
export function projectState(room, viewerId) {
  const turnPlayer = current(room)
  return {
    code: room.code,
    phase: room.phase,
    bid: room.bid,
    bidderId: room.bidderId,
    hostId: room.hostId,
    winnerId: room.winnerId,
    lastReveal: room.lastReveal,
    turnId: room.phase === PHASE.LOBBY || room.phase === PHASE.OVER ? null : (turnPlayer?.id ?? null),
    maxBid: onTable(room),
    yourMinBid: (() => {
      const you = seat(room, viewerId)
      return you && !you.out ? bidFloor(room, you) : room.bid + 1
    })(),
    biddingOpen: biddingOpen(room),
    pointsToWin: WINNING_POINTS,
    log: [...room.log],
    you: viewerId,
    seats: room.seats.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      out: p.out,
      passed: p.passed,
      points: p.points,
      handCount: inHand(p),
      stackCount: p.stack.length,
      up: [...p.up],
      // Your own cards only: everyone knows what they laid down.
      hand: p.id === viewerId ? { cat: p.cat, dead: p.dead } : null,
      stack: p.id === viewerId ? [...p.stack] : null,
    })),
    serverNow: Date.now(),
  }
}
