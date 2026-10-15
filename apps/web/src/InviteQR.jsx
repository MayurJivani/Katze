import { useEffect, useState } from "react"
import QRCode from "qrcode"

/**
 * The invite link as a square anyone at the table can point a phone at.
 *
 * Drawn in the page's own colours rather than black on white, because a stark
 * white tile in the middle of a dark lobby reads as a broken image.
 */
export default function InviteQR({ url, size = 180 }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#faf2ddff", light: "#0e1117ff" },
    })
      .then((d) => live && setSrc(d))
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [url, size])

  if (!src) return null
  return (
    <figure className="invite">
      <img src={src} width={size} height={size} alt={`QR code for the invite link, ${url}`} />
      <figcaption>Point a camera here to join</figcaption>
    </figure>
  )
}
