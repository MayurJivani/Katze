/**
 * Tile art, drawn to a canvas and used as a texture.
 *
 * Classified per the hybrid-asset rule: the discs and mats are procedural
 * geometry, and their faces are generated 2D media. No image-to-3D anywhere,
 * nothing imported, no licence to track. Everything here is deterministic from
 * the seat index, so a given player's cat is the same cat on every client.
 *
 * Provenance: procedural 2D, authored in this file.
 */

/** Six houses, one per seat. Colours follow the printed set's folk-art plates. */
export const HOUSES = [
  { key: "marmalade", ring: "#b4511f", field: "#f4d9b0", trim: "#ffd79a", fur: "#e2893c", fur2: "#f6c48a", eye: "#2f7d4f", pattern: "tabby" },
  { key: "violet", ring: "#4b2a6e", field: "#e9ddf4", trim: "#d9bbf2", fur: "#241f2b", fur2: "#3b3444", eye: "#f2c14e", pattern: "solid" },
  { key: "lagoon", ring: "#1b6a7a", field: "#e4f3f4", trim: "#9fe3e6", fur: "#f7f3ea", fur2: "#d9cfc0", eye: "#3aa7d9", pattern: "siamese" },
  { key: "fern", ring: "#2f6b33", field: "#e7f1dd", trim: "#b7dfa3", fur: "#9aa0a2", fur2: "#cfd4d5", eye: "#8fbf4a", pattern: "tabby" },
  { key: "ember", ring: "#9d2420", field: "#fae6d6", trim: "#f7b377", fur: "#f6efe4", fur2: "#e0813a", eye: "#2f7d4f", pattern: "calico" },
  { key: "midnight", ring: "#1f2b55", field: "#dfe4f5", trim: "#9aabe0", fur: "#15161c", fur2: "#262a36", eye: "#e9d04a", pattern: "solid" },
]

export const house = (seat) => HOUSES[seat % HOUSES.length]

const TAU = Math.PI * 2

function disc(ctx, x, y, r, fill) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = fill
  ctx.fill()
}

/** Five-petal bloom, the motif that runs around every plate in the printed set. */
function bloom(ctx, x, y, r, petal, center) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2
    disc(ctx, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.46, petal)
  }
  disc(ctx, x, y, r * 0.38, center)
}

/** The ornate border: a painted band, blooms at the quarters, dots between. */
function border(ctx, c, R, h) {
  disc(ctx, c, c, R, h.ring)

  ctx.save()
  ctx.strokeStyle = h.trim
  ctx.lineWidth = R * 0.018
  ctx.beginPath()
  ctx.arc(c, c, R * 0.94, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c, c, R * 0.7, 0, TAU)
  ctx.stroke()
  ctx.restore()

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    const x = c + Math.cos(a) * R * 0.82
    const y = c + Math.sin(a) * R * 0.82
    if (i % 3 === 0) bloom(ctx, x, y, R * 0.085, "#fdf6e6", h.trim)
    else {
      disc(ctx, x, y, R * 0.022, h.trim)
      disc(ctx, x + Math.cos(a + 0.26) * R * 0.05, y + Math.sin(a + 0.26) * R * 0.05, R * 0.012, "#fdf6e6")
      disc(ctx, x - Math.cos(a + 0.26) * R * 0.05, y - Math.sin(a + 0.26) * R * 0.05, R * 0.012, "#fdf6e6")
    }
  }

  disc(ctx, c, c, R * 0.66, h.field)
}

function ear(ctx, x, y, w, hgt, dir, fur, inner) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + dir * w * 0.1, y - hgt, x + dir * w, y - hgt * 0.22)
  ctx.closePath()
  ctx.fillStyle = fur
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + dir * w * 0.22, y - hgt * 0.06)
  ctx.quadraticCurveTo(x + dir * w * 0.26, y - hgt * 0.62, x + dir * w * 0.72, y - hgt * 0.26)
  ctx.closePath()
  ctx.fillStyle = inner
  ctx.fill()
}

/** Coat markings. The head shape is shared, so only the paint changes. */
function coat(ctx, c, r, h) {
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(c, c + r * 0.05, r * 0.94, r * 0.86, 0, 0, TAU)
  ctx.clip()

  if (h.pattern === "tabby") {
    ctx.fillStyle = h.fur2
    for (let i = -2; i <= 2; i++) {
      ctx.save()
      ctx.translate(c + i * r * 0.3, c - r * 0.55)
      ctx.rotate(i * 0.16)
      ctx.fillRect(-r * 0.055, 0, r * 0.11, r * 0.5)
      ctx.restore()
    }
    ctx.beginPath()
    ctx.ellipse(c, c + r * 0.42, r * 0.56, r * 0.42, 0, 0, TAU)
    ctx.fillStyle = h.fur2
    ctx.fill()
  }

  if (h.pattern === "calico") {
    ctx.fillStyle = h.fur2
    ctx.beginPath()
    ctx.ellipse(c - r * 0.52, c - r * 0.3, r * 0.5, r * 0.56, -0.3, 0, TAU)
    ctx.fill()
    ctx.fillStyle = "#2a2320"
    ctx.beginPath()
    ctx.ellipse(c + r * 0.56, c - r * 0.22, r * 0.42, r * 0.5, 0.3, 0, TAU)
    ctx.fill()
  }

  if (h.pattern === "siamese") {
    ctx.fillStyle = h.fur2
    ctx.beginPath()
    ctx.ellipse(c, c + r * 0.5, r * 0.5, r * 0.4, 0, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

function face(ctx, c, r, h, { dead }) {
  const eyeY = c - r * 0.08
  const eyeX = r * 0.38

  ear(ctx, c - r * 0.78, c - r * 0.42, r * 0.62, r * 0.66, 1, h.fur, h.trim)
  ear(ctx, c + r * 0.78, c - r * 0.42, r * 0.62, r * 0.66, -1, h.fur, h.trim)

  ctx.beginPath()
  ctx.ellipse(c, c + r * 0.05, r * 0.94, r * 0.86, 0, 0, TAU)
  ctx.fillStyle = dead ? "#f7f2e6" : h.fur
  ctx.fill()

  if (!dead) coat(ctx, c, r, h)

  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  if (dead) {
    // Crossed eyes and a lolling tongue: the one tile nobody wants to turn up.
    ctx.strokeStyle = "#20160f"
    ctx.lineWidth = r * 0.1
    for (const sx of [-1, 1]) {
      const x = c + sx * eyeX
      ctx.beginPath()
      ctx.moveTo(x - r * 0.17, eyeY - r * 0.17)
      ctx.lineTo(x + r * 0.17, eyeY + r * 0.17)
      ctx.moveTo(x + r * 0.17, eyeY - r * 0.17)
      ctx.lineTo(x - r * 0.17, eyeY + r * 0.17)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(c, c + r * 0.42, r * 0.3, 0, Math.PI)
    ctx.fillStyle = "#20160f"
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(c, c + r * 0.66, r * 0.15, r * 0.19, 0, 0, TAU)
    ctx.fillStyle = "#e36a74"
    ctx.fill()
    // Fangs, so the tile reads as dead even at thumbnail size.
    ctx.fillStyle = "#fdfaf2"
    ctx.beginPath()
    ctx.moveTo(c - r * 0.2, c + r * 0.42)
    ctx.lineTo(c - r * 0.08, c + r * 0.42)
    ctx.lineTo(c - r * 0.14, c + r * 0.58)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(c + r * 0.2, c + r * 0.42)
    ctx.lineTo(c + r * 0.08, c + r * 0.42)
    ctx.lineTo(c + r * 0.14, c + r * 0.58)
    ctx.closePath()
    ctx.fill()
    return
  }

  for (const sx of [-1, 1]) {
    const x = c + sx * eyeX
    ctx.beginPath()
    ctx.ellipse(x, eyeY, r * 0.19, r * 0.22, 0, 0, TAU)
    ctx.fillStyle = "#fdfaf2"
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x, eyeY, r * 0.14, r * 0.18, 0, 0, TAU)
    ctx.fillStyle = h.eye
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x, eyeY, r * 0.05, r * 0.16, 0, 0, TAU)
    ctx.fillStyle = "#17120a"
    ctx.fill()
    disc(ctx, x - r * 0.06, eyeY - r * 0.08, r * 0.045, "#fdfaf2")
  }

  ctx.beginPath()
  ctx.moveTo(c - r * 0.1, c + r * 0.26)
  ctx.lineTo(c + r * 0.1, c + r * 0.26)
  ctx.lineTo(c, c + r * 0.38)
  ctx.closePath()
  ctx.fillStyle = "#d9737f"
  ctx.fill()

  ctx.strokeStyle = "#20160f"
  ctx.lineWidth = r * 0.045
  ctx.beginPath()
  ctx.moveTo(c, c + r * 0.38)
  ctx.quadraticCurveTo(c - r * 0.16, c + r * 0.52, c - r * 0.26, c + r * 0.4)
  ctx.moveTo(c, c + r * 0.38)
  ctx.quadraticCurveTo(c + r * 0.16, c + r * 0.52, c + r * 0.26, c + r * 0.4)
  ctx.stroke()

  ctx.lineWidth = r * 0.03
  ctx.globalAlpha = 0.75
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = c + r * 0.26 + (i - 1) * r * 0.13
      ctx.beginPath()
      ctx.moveTo(c + sx * r * 0.34, y)
      ctx.lineTo(c + sx * r * 0.92, y + (i - 1) * r * 0.1)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

function canvas(size) {
  const el = document.createElement("canvas")
  el.width = size
  el.height = size
  return el
}

/** Face of a tile: ornate plate plus one cat, alive or not. */
export function tileFace(seat, { dead = false, size = 512 } = {}) {
  const h = house(seat)
  const el = canvas(size)
  const ctx = el.getContext("2d")
  const c = size / 2
  border(ctx, c, c, dead ? { ...h, ring: "#8e1f1a", trim: "#f0a37a" } : h)
  face(ctx, c, size * 0.2, h, { dead })
  return el
}

/** Back of a tile: the same plate with no cat, so no tile leaks what it holds. */
export function tileBack(seat, { size = 512 } = {}) {
  const h = house(seat)
  const el = canvas(size)
  const ctx = el.getContext("2d")
  const c = size / 2
  border(ctx, c, c, h)
  const r = size * 0.2
  for (let ring = 0; ring < 2; ring++) {
    const rr = r * (0.7 + ring * 0.55)
    const n = 6 + ring * 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ring * 0.3
      bloom(ctx, c + Math.cos(a) * rr, c + Math.sin(a) * rr, r * (ring ? 0.12 : 0.16), h.trim, "#fdf6e6")
    }
  }
  disc(ctx, c, c, r * 0.3, h.ring)
  disc(ctx, c, c, r * 0.18, h.trim)
  return el
}

/**
 * A player's mat: the square plate their tiles sit on, carrying their name and
 * their fish. Drawn once per name/score change, not per frame.
 */
export function matFace(seat, { name = "", points = 0, pointsToWin = 2, size = 512 } = {}) {
  const h = house(seat)
  const el = canvas(size)
  const ctx = el.getContext("2d")
  const c = size / 2

  ctx.fillStyle = "#15110c"
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = h.ring
  ctx.fillRect(size * 0.03, size * 0.03, size * 0.94, size * 0.94)

  ctx.strokeStyle = h.trim
  ctx.lineWidth = size * 0.009
  ctx.strokeRect(size * 0.07, size * 0.07, size * 0.86, size * 0.86)
  for (const [x, y] of [
    [0.13, 0.13],
    [0.87, 0.13],
    [0.13, 0.87],
    [0.87, 0.87],
  ]) {
    bloom(ctx, size * x, size * y, size * 0.035, "#fdf6e6", h.trim)
  }

  ctx.fillStyle = "#fdf6e6"
  ctx.font = `800 ${Math.round(size * 0.1)}px "Bricolage Grotesque Variable", system-ui, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  // Near edge of the mat once it is on the table: the tiles sit behind it.
  ctx.fillText(name.slice(0, 12).toUpperCase(), c, size * 0.86)

  // Fish earned, along the far edge where nothing is ever stacked.
  const gap = size * 0.1
  const startX = c - ((pointsToWin - 1) * gap) / 2
  for (let i = 0; i < pointsToWin; i++) {
    const x = startX + i * gap
    disc(ctx, x, size * 0.17, size * 0.038, i < points ? h.trim : "rgba(253,246,230,0.22)")
  }
  return el
}
