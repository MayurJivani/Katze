/**
 * Where opened boxes sit on a mat.
 *
 * Boxes this size cannot sit side by side once there are three of them, so the
 * row spreads as wide as the mat allows and fans past that: each box then rests
 * on the one before rather than intersecting it. Pulled out of the scene so the
 * arithmetic can be checked without a GPU, which is the bug that shipped twice.
 */
export function openedRow({ count, mat, radius }) {
  const room = mat - radius * 2 - 0.4
  const gap = count > 1 ? Math.min(radius * 2.15, room / (count - 1)) : 0
  return { gap, fanned: gap > 0 && gap < radius * 2 }
}

// A flip runs at FLIP_RATE per second: 1 is landed, the rest is the settle.
export const FLIP_RATE = 1.9
export const FLIP_END = 1.6

/**
 * How far through its flip an opened box is.
 *
 * The scene is thrown away and rebuilt on every state push, so a box in the air
 * has to be able to pick up where it was. A box with no start time was opened
 * before this client was looking and is simply face up.
 */
export function flipProgress(startedAt, now) {
  return startedAt === undefined ? FLIP_END : ((now - startedAt) / 1000) * FLIP_RATE
}

/**
 * The opened boxes drawn on one player's mat.
 *
 * Mid-reveal that is whatever is face up. Between rounds the server has already
 * collected everything back into the hands, so the result it holds is shown
 * instead, and once the table lets go of that result the mat is empty.
 */
export function faceUpOn(state, id) {
  const p = state.seats.find((x) => x.id === id)
  if (p?.up.length) return p.up
  return state.lastReveal?.seats.find((x) => x.id === id)?.up ?? []
}
