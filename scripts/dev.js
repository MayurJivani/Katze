/**
 * Relay and web dev server together, both on 0.0.0.0. A game needs a phone in
 * every hand, and a localhost-only dev server cannot be reached by any of them.
 */
import { spawn } from "node:child_process"
import { networkInterfaces } from "node:os"

const children = []

function run(label, colour, args, cwd) {
  const child = spawn("npm", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
  const tag = `\x1b[${colour}m[${label}]\x1b[0m `
  const pipe = (stream, to) => {
    let buf = ""
    stream.on("data", (chunk) => {
      buf += chunk.toString()
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) to.write(tag + line + "\n")
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on("exit", (code) => {
    if (code) {
      console.error(`${tag}exited with ${code}`)
      shutdown(code)
    }
  })
  children.push(child)
}

function shutdown(code = 0) {
  for (const c of children) if (!c.killed) c.kill("SIGTERM")
  process.exit(code)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

run("relay", "35", ["run", "dev", "--workspace", "apps/server"])
run("web", "33", ["run", "dev", "--workspace", "apps/web", "--", "--host"])

const ip = Object.values(networkInterfaces())
  .flat()
  .find((a) => a && a.family === "IPv4" && !a.internal)?.address

setTimeout(() => {
  console.log(`\n\x1b[36m  Katze ready\x1b[0m  http://${ip ?? "localhost"}:5178\n`)
}, 1500).unref()
