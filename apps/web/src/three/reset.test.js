import assert from "node:assert/strict"
import test from "node:test"
import * as G from "../../../server/src/services/game.js"
import { faceUpOn } from "./layout.js"

// Ada bids both boxes on the table and opens her own live cat, then Bo's dead one.
test("a round that ends on the dead cat leaves an empty table and full hands", () => {
  const room = G.createRoom("TEST")
  G.addPlayer(room, "a", "Ada")
  G.addPlayer(room, "b", "Bo")
  G.startGame(room, "a")
  G.place(room, "a", "cat")
  G.place(room, "b", "dead")
  G.bid(room, "a", 2)
  G.reveal(room, "a", "a")
  G.reveal(room, "a", "b")

  const state = G.projectState(room, "a")
  assert.equal(state.phase, "place")
  // While the result is held the two opened boxes are still on show.
  assert.deepEqual(faceUpOn(state, "a"), ["cat"])
  assert.deepEqual(faceUpOn(state, "b"), ["dead"])

  // Once the table lets go of it, nothing is left on any mat.
  const cleared = { ...state, lastReveal: null }
  for (const p of cleared.seats) {
    assert.deepEqual(faceUpOn(cleared, p.id), [])
    assert.equal(p.stackCount, 0)
  }
  // Every box went home: Bo keeps all four, Ada is down the one she lost.
  assert.equal(cleared.seats.find((p) => p.id === "b").handCount, 4)
  assert.equal(cleared.seats.find((p) => p.id === "a").handCount, 3)
})
