import { useEffect, useRef } from "react"
import * as THREE from "three"
import { tileBack, tileFace } from "./catArt"

/**
 * The homepage, as the game's own joke: four closed boxes, three with a live
 * cat and one with a dead one, and no way to know which is which until you open
 * it. Opening the dead one shuffles them all back and starts over.
 *
 * Same art and same procedural geometry as the table. The hero image of this
 * product is the product.
 */

const R = 1
const H = 0.16
const geo = new THREE.CylinderGeometry(R, R, H, 48)
const SEATS = [0, 2, 4, 1]

export default function HomeScene({ onReveal }) {
  const host = useRef(null)
  const report = useRef(onReveal)
  report.current = onReveal

  useEffect(() => {
    const el = host.current
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    /*
     * No WebGL means an old device, a blocklisted GPU or acceleration switched
     * off, not a reason to show nobody a blank page. Bail out and let the flat
     * controls, which are otherwise hidden behind the table, come back.
     */
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      document.documentElement.dataset.flat = "true"
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)
    camera.position.set(0, 5.4, 4.6)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x0b0d12, 1.7))
    const lamp = new THREE.DirectionalLight(0xfff2d8, 2)
    lamp.position.set(2, 6, 3)
    scene.add(lamp)

    const texture = (canvas) => {
      const t = new THREE.CanvasTexture(canvas)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    }

    const group = new THREE.Group()
    scene.add(group)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hovered = null
    let lives = 0
    let cheer = 0
    const boxes = []

    /** Three live cats and one dead one, in an order nobody is told. */
    const deal = () => {
      for (const b of boxes) group.remove(b)
      boxes.length = 0
      const cards = ["cat", "cat", "cat", "dead"]
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[cards[i], cards[j]] = [cards[j], cards[i]]
      }
      lives = 0
      cheer = 0
      cards.forEach((card, i) => {
        const seat = SEATS[i]
        const dead = card === "dead"
        const box = new THREE.Mesh(geo, [
          new THREE.MeshStandardMaterial({ color: 0x241c12, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ map: texture(tileFace(seat, { dead, size: 384 })), roughness: 0.55 }),
          new THREE.MeshStandardMaterial({ map: texture(tileBack(seat, { size: 384 })), roughness: 0.55 }),
        ])
        box.position.set((i - 1.5) * 2.3, H / 2, 0)
        box.rotation.z = Math.PI // face down
        box.userData = { card, restY: H / 2, open: false, spin: 0, drop: i * 0.1 }
        boxes.push(box)
        group.add(box)
      })
    }
    deal()

    const pick = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(boxes, false)[0]
      return hit?.object ?? null
    }

    const onMove = (e) => {
      const b = pick(e)
      hovered = b && !b.userData.open ? b : null
      renderer.domElement.style.cursor = hovered ? "pointer" : "default"
    }
    const onClick = (e) => {
      const b = pick(e)
      if (!b || b.userData.open) return
      b.userData.open = true
      b.userData.spin = 0.0001

      if (b.userData.card === "dead") {
        report.current?.("dead")
        // Find the dead one and the whole thing resets, which is the game.
        setTimeout(() => deal(), 1600)
        return
      }

      lives += 1
      // All three live cats and the dead one never touched: the boxes take a
      // bow, which is the only trophy a homepage needs.
      if (lives === 3) {
        report.current?.("win")
        cheer = 0.0001
        setTimeout(() => deal(), 2400)
      } else {
        report.current?.("cat")
      }
    }
    renderer.domElement.addEventListener("pointermove", onMove)
    renderer.domElement.addEventListener("click", onClick)

    const resize = () => {
      const w = el.clientWidth
      const h = Math.max(160, Math.round(w * 0.42))
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const clock = new THREE.Clock()
    let raf
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime
      if (cheer) cheer = Math.min(1, cheer + dt / 1.1)
      for (const b of boxes) {
        const d = b.userData
        if (d.spin) {
          d.spin = Math.min(1, d.spin + dt * 2.2)
          const e = 1 - Math.pow(1 - d.spin, 3)
          b.rotation.z = Math.PI * (1 - e)
          b.position.y = d.restY + Math.sin(e * Math.PI) * 0.9
        } else if (!reduced) {
          // A closed box breathes, so it reads as something to touch.
          const lift = hovered === b ? 0.42 : 0
          const idle = Math.sin(t * 1.6 + d.drop * 10) * 0.05
          b.position.y += (d.restY + lift + idle - b.position.y) * Math.min(1, dt * 10)
        }
        if (cheer && !reduced) {
          // A wave along the row, the closed dead one included: it lost.
          const hop = Math.max(0, Math.sin((cheer - d.drop * 0.5) * Math.PI))
          b.position.y = d.restY + hop * 1.1
          b.rotation.y = hop * Math.PI * 2
        }
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("click", onClick)
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="home-scene" ref={host} aria-hidden="true" />
}
