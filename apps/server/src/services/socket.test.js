// Boots the real relay: the failure this guards against is in the process, not a module.
import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { WebSocket } from "ws"

const PORT = 20000 + Math.floor(Math.random() * 20000)

test("an oversized socket frame closes that socket, not the server", async (t) => {
  const entry = fileURLToPath(new URL("../index.js", import.meta.url))
  const relay = spawn(process.execPath, [entry], { env: { ...process.env, RELAY_PORT: String(PORT) }, stdio: "ignore" })
  t.after(() => relay.kill())
  const base = `http://127.0.0.1:${PORT}`
  for (let i = 0; i < 60; i++) {
    if (await fetch(base + "/").then(() => true, () => false)) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { origin: base } })
  ws.on("error", () => {})
  await new Promise((r) => { ws.on("open", () => ws.send("x".repeat(2_000_000))); ws.on("close", r) })
  assert.equal(relay.exitCode, null)
  assert.ok(await fetch(base + "/").then(() => true, () => false))
})
