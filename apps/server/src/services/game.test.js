import assert from "node:assert/strict"
import test from "node:test"
import * as G from "./game.js"

const table = (names = ["Mittens", "Tuna", "Biscuit"]) => {
  const room = G.createRoom("TEST")
  names.forEach((n, i) => G.addPlayer(room, `p${i}`, n))
  G.startGame(room, "p0")
  return room
}

const turnId = (room) => room.seats[room.turn].id
const held = (p) => p.cat + p.dead + p.stack.length + p.up.length
/** Put boxes down in turn order until everyone still in has one, which opens bidding. */
const openBidding = (room, card = "cat") => {
  while (!room.seats.filter((p) => !p.out).every((p) => p.stack.length > 0)) {
    G.place(room, turnId(room), card)
  }
}

test("a hand starts with three live cats and one dead one", () => {
  const room = table()
  for (const p of room.seats) assert.deepEqual([p.cat, p.dead], [3, 1])
})

test("bidding is closed until every player has put a box down", () => {
  const room = table()
  assert.throws(() => G.bid(room, "p0", 1), /before the bidding opens/)
  G.place(room, "p0", "cat")
  assert.throws(() => G.bid(room, "p1", 1), /before the bidding opens/)
  openBidding(room) // p1 and p2 put theirs down, turn comes back to p0
  assert.equal(turnId(room), "p0")
  assert.doesNotThrow(() => G.bid(room, "p0", 2))
})

test("a bid cannot exceed the boxes actually on the table", () => {
  const room = table()
  openBidding(room)
  assert.throws(() => G.bid(room, "p0", 4), /Only 3 boxes/)
})

test("out of turn and under the standing bid are both refused", () => {
  const room = table()
  openBidding(room)
  G.bid(room, "p0", 2)
  assert.throws(() => G.bid(room, "p0", 3), /Not your turn/)
  assert.throws(() => G.bid(room, "p1", 2), /at least 3/)
  assert.throws(() => G.pass(room, "p2"), /Not your turn/)
})

test("a bid has to reach past your own shelf", () => {
  const room = table()
  for (const id of ["p0", "p1", "p2"]) G.place(room, id, "cat")
  G.place(room, "p0", "cat") // p0 now has two of their own buried
  G.place(room, "p1", "cat")
  G.place(room, "p2", "cat")

  // Two of the six boxes are p0's own and open regardless, so two is free.
  assert.throws(() => G.bid(room, "p0", 2), /at least 3/)
  assert.doesNotThrow(() => G.bid(room, "p0", 3))
})

test("a bid of every box on the table goes straight to the reveal", () => {
  const room = table()
  openBidding(room, "cat")
  G.bid(room, "p0", 3) // three boxes down, three bid: nobody can raise

  assert.equal(room.phase, "reveal")
  assert.deepEqual(
    room.seats.filter((p) => p.passed).map((p) => p.id),
    [],
    "nobody should have had to tap pass",
  )
  assert.match(room.log.join(" "), /Nobody can raise/)
})

test("opening only live cats earns a fish, and two fish takes the game", () => {
  const room = table()
  for (const target of [1, 2]) {
    openBidding(room, "cat")
    G.bid(room, turnId(room), 2)
    G.pass(room, turnId(room))
    G.pass(room, turnId(room))
    assert.equal(room.phase, "reveal")
    // Own shelf opened itself; one more box off a neighbour closes the bid of 2.
    G.reveal(room, room.bidderId, room.seats.find((p) => p.id !== room.bidderId).id)
    assert.equal(room.seats[0].points, target)
  }
  assert.equal(room.phase, "over")
  assert.equal(room.winnerId, "p0")
})

test("the bidder's own shelf is opened in full before anyone else is touched", () => {
  const room = table()
  for (let round = 0; round < 2; round++) for (const id of ["p0", "p1", "p2"]) G.place(room, id, "cat")
  G.bid(room, "p0", 3) // two on their own mat, so one card has to come off a neighbour
  G.pass(room, "p1")
  G.pass(room, "p2")
  assert.equal(room.seats[0].stack.length, 0)
  assert.equal(room.seats[0].up.length, 2)
  // Nobody else was exposed by the server.
  assert.deepEqual(room.seats.slice(1).map((p) => p.up.length), [0, 0])
})

test("opening the dead cat costs the bidder a box for good", () => {
  const room = table()
  G.place(room, "p0", "dead")
  G.place(room, "p1", "cat")
  G.place(room, "p2", "cat")
  G.bid(room, "p0", 2)
  G.pass(room, "p1")
  G.pass(room, "p2")
  // p0's own dead cat surfaces the moment their shelf opens, so the bid dies there.
  assert.equal(held(room.seats[0]), 3)
  assert.equal(room.seats[0].points, 0)
  assert.equal(room.phase, "place")
  // Everyone else got their card back untouched.
  assert.deepEqual(room.seats.slice(1).map(held), [4, 4])
})

test("a player who runs out of boxes is out, and the last one left wins", () => {
  const room = table(["Mittens", "Tuna"])
  // Down to one box, so the random discard has only one box to take.
  Object.assign(room.seats[0], { cat: 0, dead: 1 })
  G.place(room, "p0", "dead")
  G.place(room, "p1", "cat")
  // Both boxes bid, so the reveal starts without anyone passing.
  G.bid(room, "p0", 2)
  assert.equal(room.seats[0].out, true)
  assert.equal(room.phase, "over")
  assert.equal(room.winnerId, "p1")
})

test("nobody is told what is inside a box on a shelf that is not theirs", () => {
  const room = table()
  G.place(room, "p0", "dead")
  const seen = G.projectState(room, "p1").seats
  assert.equal(seen[0].stack, null)
  assert.equal(seen[0].stackCount, 1)
  assert.equal(seen[0].hand, null)
  // Your own mat and hand are yours to see.
  assert.deepEqual(G.projectState(room, "p0").seats[0].stack, ["dead"])
  assert.deepEqual(G.projectState(room, "p0").seats[0].hand, { cat: 3, dead: 0 })
  // Nothing about that seat carries a card identity to another player.
  assert.equal(JSON.stringify(seen[0]).includes("dead"), false)
})

test("a player leaving mid hand folds instead of freezing the table", () => {
  const room = table()
  openBidding(room)
  G.removePlayer(room, "p1")
  assert.equal(room.seats[1].out, true)
  assert.equal(room.seats[room.turn].out, false)
  assert.doesNotThrow(() => G.place(room, turnId(room), "cat"))
})

test("what was turned over stays on the table until the next round starts", () => {
  const room = table()
  openBidding(room, "cat")
  G.bid(room, "p0", 2)
  G.pass(room, "p1")
  G.pass(room, "p2")
  G.reveal(room, "p0", "p1")

  // Round is over and the shelves are collected, but the reveal is still there.
  assert.equal(room.phase, "place")
  assert.deepEqual(room.seats[0].up, [])
  const shown = G.projectState(room, "p1").lastReveal
  assert.equal(shown.outcome, "fish")
  assert.equal(shown.seats.flatMap((s) => s.up).length, 2)

  // And the first box of the next round clears it.
  G.place(room, turnId(room), "cat")
  assert.equal(room.lastReveal, null)
})
