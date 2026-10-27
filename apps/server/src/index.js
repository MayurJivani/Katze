/**
 * Katze relay.
 *
 *   GET /healthz   liveness
 *   WS  /ws        room-scoped game, one socket per player
 *   *              the built web app, in production
 *
 * The relay is the referee: clients send intent and render whatever comes
 * back. Nothing a client sends is trusted, and nobody is ever told what is
 * under a face-down card (see projectState).
 */
import { createServer } from "node:http"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"
import { randomBytes, randomInt } from "node:crypto"
import { WebSocketServer } from "ws"
import * as G from "./services/game.js"

// Its own variable, not PORT: a parent process (dev harness, Docker compose)
// that exports PORT for the web server must not drag the relay onto that port.
const PORT = Number(process.env.RELAY_PORT ?? 4331)
const here = path.dirname(fileURLToPath(import.meta.url))
const WEB_DIST = path.resolve(here, "../../web/dist")

const app = express()
app.disable("x-powered-by")
app.use((_req, res, next) => {
  res.set({
    "Content-Security-Policy":
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
      "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  })
  next()
})
app.get("/healthz", (_req, res) => res.json({ ok: true, rooms: rooms.size }))
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST))
  app.use((_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")))
}

const server = createServer(app)

// ── Rooms ────────────────────────────────────────────────────────────────────

/** @type {Map<string, { room: any, sockets: Map<WebSocket, { playerId: string }> }>} */
const rooms = new Map()

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const EMPTY_ROOM_TTL_MS = 10 * 60_000
const GRACE_MS = 5 * 60_000

function newCode() {
  for (let i = 0; i < 50; i++) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(32)]).join("")
    if (!rooms.has(code)) return code
  }
  return `C${Date.now().toString(36).toUpperCase().slice(-3)}`
}

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload))
}

/** Every socket gets its own projection, a shared one would leak hands. */
function broadcast(entry) {
  for (const [ws, meta] of entry.sockets) {
    send(ws, { type: "state", state: G.projectState(entry.room, meta.playerId) })
  }
}

function sweep(code) {
  const entry = rooms.get(code)
  if (!entry || entry.sockets.size) return
  setTimeout(() => {
    const e = rooms.get(code)
    if (e && !e.sockets.size) rooms.delete(code)
  }, EMPTY_ROOM_TTL_MS).unref?.()
}

// ── Sockets ──────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 })

wss.on("connection", (ws) => {
  // ws reports an oversized or malformed frame as an 'error' event and closes the socket itself; unheard, that event crashes the process.
  ws.on("error", () => {})
  const meta = { code: null, playerId: null, windowStart: Date.now(), windowCount: 0 }
  ws.isAlive = true
  ws.on("pong", () => (ws.isAlive = true))

  ws.on("message", (raw) => {
    // Fixed window per socket: plenty for play, too little to walk the 4-letter
    // room code space or flood a table with broadcasts.
    const now = Date.now()
    if (now - meta.windowStart > 10_000) Object.assign(meta, { windowStart: now, windowCount: 0 })
    if (++meta.windowCount > 60) return ws.close(1008, "Too many messages")
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return
    if (msg.type === "ping") return send(ws, { type: "pong" })
    if (msg.type === "join") return handleJoin(ws, meta, msg)

    const entry = meta.code ? rooms.get(meta.code) : null
    if (!entry || !meta.playerId) return
    handleAction(entry, meta, ws, msg)
  })

  ws.on("close", () => {
    const entry = meta.code ? rooms.get(meta.code) : null
    if (!entry) return
    entry.sockets.delete(ws)

    const player = entry.room.seats.find((p) => p.id === meta.playerId)
    if (player && ![...entry.sockets.values()].some((m) => m.playerId === meta.playerId)) {
      player.connected = false
      clearTimeout(player.expire)
      // A phone that sleeps mid-hand gets its seat back; a closed tab does not.
      player.expire = setTimeout(() => {
        const e = rooms.get(meta.code)
        const p = e?.room.seats.find((x) => x.id === meta.playerId)
        if (p && !p.connected) {
          G.removePlayer(e.room, meta.playerId)
          broadcast(e)
        }
        sweep(meta.code)
      }, GRACE_MS)
      player.expire.unref?.()
    }
    broadcast(entry)
    sweep(meta.code)
  })
})

function handleJoin(ws, meta, msg) {
  const name = String(msg.name ?? "").trim().slice(0, 16) || "Cat"
  const wanted = String(msg.code ?? "").trim().toUpperCase().slice(0, 8)
  // What the client sends is a secret it keeps to get its seat back. Every seat id
  // is broadcast to the table (reveal and kick target them), so the seat is keyed
  // by a one-way hash of the secret: joining with an id seen on the table hashes
  // to a different seat instead of taking over someone's hand.
  const secret = String(msg.playerId ?? "").slice(0, 40) || randomBytes(16).toString("hex")
  const playerId = G.seatId(secret)

  let entry = wanted ? rooms.get(wanted) : null
  if (!entry && msg.create) {
    const code = newCode()
    entry = { room: G.createRoom(code), sockets: new Map() }
    rooms.set(code, entry)
  }
  if (!entry) return send(ws, { type: "error", message: "No table with that code." })

  const room = entry.room
  let player = room.seats.find((p) => p.id === playerId)
  if (player) {
    clearTimeout(player.expire)
    player.connected = true
  } else {
    const taken = new Set(room.seats.map((p) => p.name))
    let unique = name
    for (let n = 2; taken.has(unique); n++) unique = `${name} ${n}`
    try {
      player = G.addPlayer(room, playerId, unique)
    } catch (err) {
      return send(ws, { type: "error", message: err.message })
    }
  }

  meta.code = room.code
  meta.playerId = player.id
  entry.sockets.set(ws, meta)
  send(ws, { type: "joined", playerId: player.id, code: room.code })
  broadcast(entry)
}

const ACTIONS = {
  start: (room, id) => G.startGame(room, id),
  place: (room, id, msg) => G.place(room, id, String(msg.card ?? "")),
  bid: (room, id, msg) => G.bid(room, id, msg.amount),
  pass: (room, id) => G.pass(room, id),
  reveal: (room, id, msg) => G.reveal(room, id, String(msg.targetId ?? "")),
  kick: (room, id, msg) => G.kick(room, id, String(msg.targetId ?? "")),
}

function handleAction(entry, meta, ws, msg) {
  const action = ACTIONS[msg.type]
  if (!action) return
  try {
    action(entry.room, meta.playerId, msg)
  } catch (err) {
    return send(ws, { type: "error", message: err.message })
  }
  broadcast(entry)
}

const liveness = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, 30_000)
liveness.unref?.()

process.on("uncaughtException", (err) => console.error("[katze] uncaught:", err))
process.on("unhandledRejection", (err) => console.error("[katze] rejection:", err))

server.listen(PORT, "0.0.0.0", () => console.log(`[katze] relay on :${PORT}`))
