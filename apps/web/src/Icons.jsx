/**
 * The whole game is four glyphs, so they are drawn rather than borrowed.
 *
 * Live and dead share one cat head, built from the same arcs in the same
 * order. Only the eyes and mouth differ, which is the joke: until the box is
 * open the two are the same cat. One stroke weight (1.75) across the set, all
 * strokes currentColor so a card face inherits its own state colour.
 */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
}

const CAT_HEAD = "M4.6 9.3 4.1 4.6l3.9 2.5a9.6 9.6 0 0 1 8 0l3.9-2.5-.5 4.7a7.4 7.4 0 0 1 1 3.6c0 4.1-3.8 7-7.9 7h-.6c-4.1 0-8-2.9-8-7a7.4 7.4 0 0 1 1-3.6Z"

export function LiveCat({ size = 24 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d={CAT_HEAD} />
      <path d="M9 12.4v.9M15 12.4v.9" />
      <path d="M10.8 16.3a1.7 1.7 0 0 0 2.4 0" />
      <path d="M3.3 14.6h2.4M18.3 14.6h2.4" />
    </svg>
  )
}

export function DeadCat({ size = 24 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d={CAT_HEAD} />
      <path d="m8.1 11.7 1.8 1.9m0-1.9-1.8 1.9M14.1 11.7l1.8 1.9m0-1.9-1.8 1.9" />
      <path d="M10.6 16.6h2.8" />
      <path d="M3.3 14.6h2.4M18.3 14.6h2.4" />
    </svg>
  )
}

/**
 * One fish is one point. Two fish takes the table.
 *
 * Drawn to survive at 18px in a score row, so the body is one closed curve and
 * the tail is part of it. Anything finer turned to mush at that size.
 */
export function Fish({ size = 24, filled = false }) {
  return (
    <svg {...base} width={size} height={size} fill={filled ? "currentColor" : "none"}>
      <path d="M14 5.6c3.9 1.3 6.6 4.1 7.4 6.4-.8 2.3-3.5 5.1-7.4 6.4-4.6 1.5-8.2-.6-9.7-2.6l-2.4 2.6.9-6.4-.9-6.4 2.4 2.6c1.5-2 5.1-4.1 9.7-2.6Z" />
      <circle cx="16.2" cy="10.4" r="0.95" fill={filled ? "#17120a" : "currentColor"} stroke="none" />
    </svg>
  )
}
