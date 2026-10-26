import { useEffect, useRef } from "react"
import * as THREE from "three"
import { house, matFace, tileBack, tileFace } from "./catArt"
import { FLIP_END, FLIP_RATE, faceUpOn, flipProgress, openedRow } from "./layout"

/*
 * The table, as actual objects.
 *
 * Every mesh here is procedural: a cylinder for a tile, a rounded slab for a
 * mat, a plane for the felt. The only authored content is the canvas art in
 * catArt.js, used as texture. Budget at a full six-player table is roughly 30
 * meshes, 3 lights and 14 textures, which holds 60fps on a phone.
 *
 * The scene is driven by the same redacted state the DOM gets, so it cannot
 * render a face-down tile's face: that value is not in the payload.
 */

// A tile is a coaster, not a coin. The mat is sized around it: a closed pile
// at the back left, a row of opened tiles across the front, all on the plate.
const TILE_R = 0.88
const TILE_H = 0.14
const MAT = 4.1

// A cylinder's cap maps the top of its texture to +x, which lays every cat on
// its side. A quarter turn puts the top of the art at the far edge of the tile.
const tileGeo = new THREE.CylinderGeometry(TILE_R, TILE_R, TILE_H, 48).rotateY(Math.PI / 2)
const matGeo = new THREE.BoxGeometry(MAT, 0.06, MAT)

// Reduced motion: boxes land face up without the toss, and nothing pulses.
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/**
 * Seats sit on a shallow arc with the viewer nearest the camera. Mats stay
 * axis-aligned rather than rotated to face their player: a mat turned away
 * from the camera means a name nobody can read, and reading the table is the
 * whole job of this view.
 */
function seatPositions(count) {
  if (count === 1) return [{ x: 0, z: 0 }]
  const out = []
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      out.push({ x: 0, z: 2.75 })
      continue
    }
    const others = count - 1
    const t = others === 1 ? 0.5 : (i - 1) / (others - 1)
    const spread = others <= 2 ? 5.0 : 4.6 * others
    out.push({
      x: (t - 0.5) * spread,
      z: -2.05 + Math.abs(t - 0.5) * 1.5,
    })
  }
  return out
}

export default function Table3D({ state, onOpen, canOpen, onPlace, canPlace, yourTurn, alarm }) {
  const host = useRef(null)
  const api = useRef(null)
  const latest = useRef({ state, onOpen, canOpen, onPlace, canPlace })
  latest.current = { state, onOpen, canOpen, onPlace, canPlace }
  /** When each opened box started turning over, so a rebuild resumes it. */
  const flips = useRef(new Map())
  /** The last reveal already played out, so a rebuild does not replay it. */
  const played = useRef(null)
  /** Meshes that answer the pointer, and which one it is on. */
  const liftable = useRef([])
  const hovered = useRef(null)

  // Scene, lights and loop: built once, never torn down by a state change.
  useEffect(() => {
    const el = host.current
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
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)

    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x17202f, roughness: 0.95 }),
    )
    felt.rotation.x = -Math.PI / 2
    felt.receiveShadow = true
    scene.add(felt)

    // One lamp over the table, plus enough ambient to keep the art readable.
    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x0b0d12, 1.5))
    const lamp = new THREE.DirectionalLight(0xfff2d8, 2.1)
    lamp.position.set(2.5, 7, 3)
    lamp.castShadow = true
    lamp.shadow.mapSize.set(1024, 1024)
    lamp.shadow.camera.top = 8
    lamp.shadow.camera.bottom = -8
    lamp.shadow.camera.left = -10
    lamp.shadow.camera.right = 10
    lamp.shadow.bias = -0.0015
    scene.add(lamp)

    const group = new THREE.Group()
    scene.add(group)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    /*
     * What the pointer is actually over. A token in your hand wins over the
     * shelf it is sitting in front of, because the token is the smaller and
     * more deliberate target.
     */
    const pick = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const { canOpen, canPlace } = latest.current
      for (const hit of raycaster.intersectObjects(group.children, true)) {
        let o = hit.object
        while (o && !o.userData.handCard && !o.userData.ownerId) o = o.parent
        if (!o) continue
        if (o.userData.handCard) {
          if (canPlace?.(o.userData.handCard)) return { kind: "place", card: o.userData.handCard, mesh: o }
          continue
        }
        if (canOpen?.(o.userData.ownerId)) return { kind: "open", id: o.userData.ownerId, mesh: o }
      }
      return null
    }

    const onClick = (e) => {
      const target = pick(e)
      if (!target) return
      const { onOpen, onPlace } = latest.current
      if (target.kind === "place") onPlace?.(target.card)
      else onOpen?.(target.id)
    }
    const onMove = (e) => {
      const target = pick(e)
      renderer.domElement.style.cursor = target ? "pointer" : "default"
      hovered.current = target?.mesh ?? null
    }
    const onLeave = () => {
      hovered.current = null
    }
    renderer.domElement.addEventListener("pointerleave", onLeave)
    renderer.domElement.addEventListener("click", onClick)
    renderer.domElement.addEventListener("pointermove", onMove)

    /*
     * Frame the table by measuring it, not by guessing: two seats and six
     * seats are very different boxes, and a phone is a different window onto
     * both. Hand-tuned camera numbers were wrong for every case but one.
     */
    const fit = { center: new THREE.Vector3(), halfW: 4, halfD: 4 }
    const ELEV = 0.8
    const applyCamera = () => {
      const vFov = (camera.fov * Math.PI) / 180
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
      // A table is flat and wide, so width and depth need different sums: depth
      // foreshortens by sin(elevation), width does not. Treating the footprint
      // as a sphere (the obvious version) parked the camera about 40% too far.
      const needW = fit.halfW / Math.tan(hFov / 2)
      const needD = (fit.halfD * Math.sin(ELEV)) / Math.tan(vFov / 2)
      const dist = Math.max(needW, needD) * 1.34
      camera.position.set(
        fit.center.x,
        Math.sin(ELEV) * dist,
        fit.center.z + Math.cos(ELEV) * dist,
      )
      camera.lookAt(fit.center)
      camera.updateProjectionMatrix()
    }

    const resize = () => {
      const w = el.clientWidth
      const h = Math.max(280, Math.min(540, Math.round(w * 0.66)))
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      applyCamera()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const clock = new THREE.Clock()
    let raf
    const calm = still()
    const tick = () => {
      // Schedule first: one updater that throws must not freeze the table.
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05)
      group.traverse((o) => o.userData.update?.(dt))
      // Anything clickable rises under the pointer. Nothing else in the scene
      // moves on hover, so the lift reads as "this one".
      for (const m of liftable.current) {
        const beat = m.userData.handCard && !calm ? Math.sin(clock.elapsedTime * 2.4) * 0.06 + 0.06 : 0
        const want = m.userData.restY + beat + (hovered.current === m ? 0.34 : 0)
        m.position.y += (want - m.position.y) * Math.min(1, dt * 14)
      }
      renderer.render(scene, camera)
    }
    tick()

    const measure = () => {
      // World matrices are stale right after a rebuild, and a Box3 built from
      // stale matrices measures local space: every seat stacked at the origin.
      group.updateMatrixWorld(true)
      // Measure the pieces only. The turn halo pulses wider than the table and
      // would quietly push the camera back every time it was drawn.
      const box = new THREE.Box3()
      group.traverse((o) => {
        if (o.isMesh && !o.userData.noFit) box.expandByObject(o)
      })
      if (box.isEmpty()) return
      const size = box.getSize(new THREE.Vector3())
      box.getCenter(fit.center)
      fit.center.y = 0
      fit.halfW = Math.max(1.8, size.x / 2)
      fit.halfD = Math.max(1.8, size.z / 2)
      applyCamera()
    }

    api.current = { scene, group, renderer, textures: new Map(), measure }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("click", onClick)
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("pointerleave", onLeave)
      for (const t of api.current.textures.values()) t.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      api.current = null
    }
  }, [])

  // Rebuild the table whenever the hand changes. Six seats of tiles is cheap
  // enough that diffing meshes would cost more code than it saves frames.
  useEffect(() => {
    const ctx = api.current
    if (!ctx || !state) return
    const { group, textures } = ctx

    const tex = (key, make) => {
      let t = textures.get(key)
      if (!t) {
        t = texture(make())
        textures.set(key, t)
      }
      return t
    }

    for (const child of [...group.children]) {
      group.remove(child)
      child.traverse?.((o) => {
        if (o.geometry && o.geometry !== tileGeo && o.geometry !== matGeo) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
      })
    }

    const areas = new Map()
    const calm = still()
    /*
     * The two things worth watching, played once each. A rebuild happens on
     * every state change, so both are keyed to the reveal they belong to.
     */
    const revealKey = state.lastReveal ? JSON.stringify(state.lastReveal) : null
    const fresh = revealKey && revealKey !== played.current
    played.current = revealKey
    // Nothing face up and no result held: a new round, so the flip clocks go.
    if (!state.seats.some((p) => p.up.length) && !state.lastReveal) flips.current.clear()
    liftable.current = []
    hovered.current = null
    const seats = state.seats
    const mine = Math.max(0, seats.findIndex((p) => p.id === state.you))
    const order = seats.map((_, i) => seats[(mine + i) % seats.length])
    const spots = seatPositions(order.length)

    order.forEach((p, i) => {
      const seat = seats.indexOf(p)
      const h = house(seat)
      const spot = spots[i]
      const area = new THREE.Group()
      area.position.set(spot.x, 0, spot.z)
      area.userData.ownerId = p.id
      areas.set(p.id, area)
      group.add(area)

      const matTex = tex(`mat:${p.id}:${p.name}:${p.points}`, () =>
        matFace(seat, { name: p.name, points: p.points, pointsToWin: state.pointsToWin }),
      )
      const matMats = [
        new THREE.MeshStandardMaterial({ color: h.ring, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.62 }),
        new THREE.MeshStandardMaterial({ color: h.ring, roughness: 0.8 }),
      ]
      const mat = new THREE.Mesh(matGeo, [matMats[0], matMats[0], matMats[1], matMats[0], matMats[0], matMats[0]])
      mat.position.set(0, 0.04, 0)
      mat.receiveShadow = true
      mat.castShadow = true
      if (p.out) matMats.forEach((m) => ((m.transparent = true), (m.opacity = 0.35)))
      area.add(mat)

      // Live highlight: whose turn it is, and who can be opened next.
      const ringColor = latest.current.canOpen?.(p.id) ? 0xff6a5a : state.turnId === p.id ? 0xfaf2dd : null
      if (ringColor) {
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(MAT * 0.455, MAT * 0.5, 80),
          new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
        )
        halo.rotation.x = -Math.PI / 2
        halo.position.set(0, 0.095, 0)
        halo.userData.noFit = true
        area.add(halo)
        let t = 0
        halo.userData.update = (dt) => {
          t += dt
          if (!calm) halo.material.opacity = 0.55 + Math.sin(t * 3.4) * 0.3
        }
      }

      const back = tex(`back:${seat}`, () => tileBack(seat))
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x241c12, roughness: 0.9 })

      const makeTile = (topCanvasKey, topMake, progress, dead) => {
        const top = tex(topCanvasKey, topMake)
        const tile = new THREE.Mesh(tileGeo, [
          sideMat,
          new THREE.MeshStandardMaterial({ map: top, roughness: 0.55 }),
          new THREE.MeshStandardMaterial({ map: back, roughness: 0.55 }),
        ])
        tile.castShadow = true
        tile.receiveShadow = true
        if (progress < FLIP_END) {
          /*
           * The moment the whole game turns on, so it gets weight: the box
           * lifts off the shelf, turns over in the air, drops back, and then
           * settles. A dead cat keeps shaking for a beat after it lands, which
           * is the cue nobody needs explained.
           *
           * It starts from however far along the flip already is, because the
           * scene is rebuilt from scratch on every state push and a box must
           * not restart or snap just because somebody else did something.
           */
          const restY = 0.08 + TILE_H / 2
          let t = progress
          tile.userData.update = (dt) => {
            t = Math.min(FLIP_END, t + dt * FLIP_RATE)
            const e = 1 - Math.pow(1 - Math.min(1, t), 3)
            // Over the near edge, not sideways: turning about z lands the face
            // upside down relative to how the back was lying.
            tile.rotation.x = Math.PI * (1 - e)
            tile.position.y = restY + Math.sin(Math.min(1, t) * Math.PI) * 0.85
            if (t > 1) {
              const after = t - 1
              const decay = Math.max(0, 1 - after / 0.6)
              if (dead) {
                tile.position.x = tile.userData.restX + Math.sin(after * 48) * 0.05 * decay
                tile.rotation.y = Math.sin(after * 40) * 0.09 * decay
              } else {
                const pop = 1 + Math.sin(after * 10) * 0.05 * decay
                tile.scale.set(pop, 1, pop)
              }
            }
          }
        }
        if (tile.userData.update) tile.userData.update(0)
        return tile
      }

      // Between rounds the table is empty, so the last reveal stays on it: the
      // cats everyone just bet on, still face up, until somebody plays again.
      const faceUp = faceUpOn(state, p.id)

      // Face up, laid out left to right in the order they were opened.
      faceUp.forEach((card, k) => {
        const dead = card === "dead"
        const key = `${p.id}:${k}`
        // The box that settles the round arrives already collected into the
        // result, so it starts its flip from there or it would never turn.
        if ((p.up.length || fresh) && !flips.current.has(key)) flips.current.set(key, performance.now())
        const progress = calm ? FLIP_END : flipProgress(flips.current.get(key), performance.now())
        const tile = makeTile(`face:${seat}:${dead}`, () => tileFace(seat, { dead }), progress, dead)

        /*
         * Four boxes this size cannot sit side by side on one mat, so the row
         * spreads as wide as the mat allows and fans past that: each box then
         * rests on the one before instead of intersecting it.
         */
        const { gap, fanned: stacked } = openedRow({ count: faceUp.length, mat: MAT, radius: TILE_R })
        const spread = (faceUp.length - 1) / 2
        tile.position.set(
          (k - spread) * gap,
          0.08 + TILE_H / 2 + (stacked ? k * TILE_H * 0.5 : 0),
          0.78,
        )
        if (stacked) tile.rotation.y = k * 0.14
        // The shake reads this, and an unset rest position writes NaN into the
        // transform, which makes the box disappear instead of wobble.
        tile.userData.restX = tile.position.x
        area.add(tile)
      })

      // Face down, stacked, because only the top one can be opened.
      const closed = p.stack ?? Array.from({ length: p.stackCount }, () => null)
      closed.forEach((card, k) => {
        const tile = new THREE.Mesh(tileGeo, [
          sideMat,
          new THREE.MeshStandardMaterial({ map: back, roughness: 0.55 }),
          new THREE.MeshStandardMaterial({ map: back, roughness: 0.55 }),
        ])
        // Face down means face down, including yours. You are the only one who
        // knows what is under there, and remembering it is the game.
        tile.castShadow = true
        // A real pile: each box sits squarely on the one below, turned a little.
        tile.position.set(0, 0.08 + TILE_H / 2 + k * (TILE_H + 0.012), -0.78)
        tile.rotation.y = k * 0.13
        area.add(tile)
      })

      if (!faceUp.length && !closed.length) {
        const ghost = new THREE.Mesh(
          new THREE.RingGeometry(TILE_R * 0.88, TILE_R, 48),
          new THREE.MeshBasicMaterial({ color: 0xfaf2dd, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
        )
        ghost.rotation.x = -Math.PI / 2
        ghost.position.set(0, 0.086, -0.78)
        area.add(ghost)
      }
    })

    /*
     * Your hand, face up on the table in front of you, one token per box you
     * still hold. It is always drawn, dimmed when you cannot act, so the frame
     * does not jump every time your turn comes round and so you can always see
     * what you are holding without reading a number.
     */
    const you = seats.find((p) => p.id === state.you)
    const mySeat = seats.indexOf(you)
    if (you && !you.out && you.hand && areas.has(you.id)) {
      const hand = [
        ...Array(you.hand.cat).fill("cat"),
        ...Array(you.hand.dead).fill("dead"),
      ]
      const back = tex(`back:${mySeat}`, () => tileBack(mySeat))
      hand.forEach((card, i) => {
        const dead = card === "dead"
        const live = latest.current.canPlace?.(card)
        const mats = [
          new THREE.MeshStandardMaterial({ color: 0x241c12, roughness: 0.9, transparent: true, opacity: live ? 1 : 0.5 }),
          new THREE.MeshStandardMaterial({
            map: tex(`face:${mySeat}:${dead}`, () => tileFace(mySeat, { dead })),
            roughness: 0.55,
            transparent: true,
            opacity: live ? 1 : 0.5,
          }),
          new THREE.MeshStandardMaterial({ map: back, roughness: 0.55, transparent: true, opacity: live ? 1 : 0.5 }),
        ]
        const token = new THREE.Mesh(tileGeo, mats)
        token.castShadow = true
        token.position.set((i - (hand.length - 1) / 2) * (TILE_R * 2.2), TILE_H / 2 + 0.02, 3.5)
        token.userData.handCard = card
        token.userData.restY = token.position.y
        if (live) liftable.current.push(token)
        areas.get(you.id).add(token)
      })
    }

    ctx.measure()
    if (!fresh || calm) return

    const lost = state.lastReveal.lost
    if (lost && areas.has(lost.id)) {
      // The box leaves the table rather than blinking out of existence.
      const seat = seats.findIndex((p) => p.id === lost.id)
      const dead = lost.card === "dead"
      const mats = [
        new THREE.MeshStandardMaterial({ color: 0x241c12, roughness: 0.9, transparent: true }),
        new THREE.MeshStandardMaterial({ map: tex(`face:${seat}:${dead}`, () => tileFace(seat, { dead })), roughness: 0.55, transparent: true }),
        new THREE.MeshStandardMaterial({ map: tex(`back:${seat}`, () => tileBack(seat)), roughness: 0.55, transparent: true }),
      ]
      const gone = new THREE.Mesh(tileGeo, mats)
      gone.position.set(0.2, 0.08 + TILE_H / 2, -0.95)
      areas.get(lost.id).add(gone)
      let t = 0
      gone.userData.update = (dt) => {
        t += dt
        const e = Math.min(1, t / 1.5)
        gone.position.y = 0.15 + e * 2.6
        gone.position.z = -0.95 - e * 1.4
        gone.rotation.x = e * 3.4
        gone.rotation.z = e * 1.6
        const fade = 1 - Math.pow(e, 2)
        for (const m of mats) m.opacity = fade
        if (e >= 1) gone.visible = false
      }
    }

    if (state.lastReveal.outcome === "fish" && areas.has(state.lastReveal.by)) {
      // A made bid: one ring off the shelf that pulled it off.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(MAT * 0.17, MAT * 0.195, 72),
        new THREE.MeshBasicMaterial({ color: 0xfaf2dd, transparent: true, side: THREE.DoubleSide }),
      )
      ring.rotation.x = -Math.PI / 2
      // Under the boxes: a ring drawn over them reads as a rendering fault.
      ring.position.set(0, 0.075, 0.78)
      ring.userData.noFit = true
      areas.get(state.lastReveal.by).add(ring)
      let t = 0
      ring.userData.update = (dt) => {
        t += dt
        const e = Math.min(1, t / 1.1)
        const scale = 0.5 + e * 1.3
        ring.scale.set(scale, scale, scale)
        ring.material.opacity = 0.5 * (1 - e)
        if (e >= 1) ring.visible = false
      }
    }
  }, [state])

  return (
    <div
      className={`table3d${yourTurn ? " mine" : ""}${alarm ? " alarm" : ""}`}
      ref={host}
      aria-hidden="true"
    />
  )
}
