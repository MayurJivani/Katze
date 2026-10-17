import assert from "node:assert/strict"
import test from "node:test"
import { FLIP_END, flipProgress, openedRow } from "./layout.js"

const MAT = 4.1
const R = 0.88

test("a row of opened boxes always fits the mat it sits on", () => {
  for (let count = 1; count <= 4; count++) {
    const { gap } = openedRow({ count, mat: MAT, radius: R })
    const span = (count - 1) * gap + R * 2
    assert.ok(span <= MAT, `${count} boxes span ${span.toFixed(2)}, mat is ${MAT}`)
  }
})

test("boxes that cannot sit side by side are fanned instead of intersecting", () => {
  // Two fit with clear air between them, so nothing is stacked.
  const two = openedRow({ count: 2, mat: MAT, radius: R })
  assert.equal(two.fanned, false)
  assert.ok(two.gap >= R * 2, "two boxes should not overlap at all")

  // Three and four have to overlap, and must say so, or they intersect.
  for (const count of [3, 4]) {
    assert.equal(openedRow({ count, mat: MAT, radius: R }).fanned, true)
  }
})

test("a box in the air resumes its flip instead of restarting or snapping", () => {
  const t0 = 1000

  // Never seen turning: it was opened before we were looking, so it is just up.
  assert.equal(flipProgress(undefined, t0), FLIP_END)

  // Opened this instant: the very start of the turn.
  assert.equal(flipProgress(t0, t0), 0)

  // Half a second in, a rebuild has to hand back a middle of the animation,
  // not zero (restart) and not the end (snap).
  const mid = flipProgress(t0, t0 + 500)
  assert.ok(mid > 0 && mid < FLIP_END, `expected mid-flip, got ${mid}`)

  // Long finished, so it stays put.
  assert.ok(flipProgress(t0, t0 + 5000) >= FLIP_END)
})
