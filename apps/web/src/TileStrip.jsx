import { useMemo } from "react"
import { HOUSES, tileFace } from "./three/catArt"

/**
 * The homepage's one image, and it is the real thing: the same art factory the
 * table renders, drawn at load. Nothing here is a mockup of the product.
 */
const CAST = [
  { seat: 0, dead: false, alt: "A marmalade tabby on a painted plate" },
  { seat: 2, dead: false, alt: "A cream point cat on a painted plate" },
  { seat: 4, dead: true, alt: "The dead cat: crossed eyes and a lolling tongue" },
  { seat: 1, dead: false, alt: "A black cat on a painted plate" },
  { seat: 3, dead: false, alt: "A grey tabby on a painted plate" },
]

export default function TileStrip() {
  const tiles = useMemo(
    () => CAST.map((t) => ({ ...t, src: tileFace(t.seat, { dead: t.dead, size: 384 }).toDataURL() })),
    [],
  )

  return (
    <div className="tile-strip">
      {tiles.map((t, i) => (
        <img
          key={t.seat + String(t.dead)}
          src={t.src}
          alt={t.alt}
          width={128}
          height={128}
          className={t.dead ? "plate dead" : "plate"}
          style={{ "--i": i, "--house": HOUSES[t.seat].ring }}
        />
      ))}
    </div>
  )
}
