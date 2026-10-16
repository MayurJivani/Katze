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
