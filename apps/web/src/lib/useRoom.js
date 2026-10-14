import { useCallback, useEffect, useRef, useState } from "react"

const PING_EVERY_MS = 5_000
const SILENCE_LIMIT_MS = 15_000

const wsUrl = () =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`

/**
 * One socket per tab. Reconnects and rejoins on its own: a phone that sleeps
 * mid-hand has to come back to its seat without anyone walking over to it.
 */
export function useRoom({ join, onError }) {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(false)
  const [identity, setIdentity] = useState(null)

  const wsRef = useRef(null)
  const joinRef = useRef(join)
  joinRef.current = join
  const errRef = useRef(onError)
  errRef.current = onError

  useEffect(() => {
    if (!join) return
    let closed = false
    let retry = null
    let ping = null
    let attempt = 0
    let lastSeen = Date.now()

    const connect = () => {
      if (closed) return
      const ws = new WebSocket(wsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        attempt = 0
        lastSeen = Date.now()
        setConnected(true)
        ws.send(JSON.stringify({ type: "join", ...joinRef.current }))
        clearInterval(ping)
        ping = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return
          if (Date.now() - lastSeen > SILENCE_LIMIT_MS) return ws.close()
          ws.send(JSON.stringify({ type: "ping" }))
        }, PING_EVERY_MS)
      }

      ws.onmessage = (e) => {
        lastSeen = Date.now()
        let msg
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }
        if (msg.type === "state") return setState(msg.state)
        if (msg.type === "joined") return setIdentity({ playerId: msg.playerId, code: msg.code })
        if (msg.type === "error") return errRef.current?.(msg.message)
      }

      ws.onerror = () => ws.close()
      ws.onclose = () => {
        clearInterval(ping)
        setConnected(false)
        if (closed) return
        clearTimeout(retry)
        retry = setTimeout(connect, attempt === 0 ? 150 : Math.min(400 * 2 ** attempt, 4000))
        attempt++
      }
    }

    const wake = () => {
      const w = wsRef.current
      if (!closed && (!w || w.readyState === WebSocket.CLOSED)) {
        attempt = 0
        connect()
      }
    }
    window.addEventListener("online", wake)
    window.addEventListener("pageshow", wake)
    document.addEventListener("visibilitychange", wake)

    connect()
    return () => {
      closed = true
      clearInterval(ping)
      clearTimeout(retry)
      window.removeEventListener("online", wake)
      window.removeEventListener("pageshow", wake)
      document.removeEventListener("visibilitychange", wake)
      const w = wsRef.current
      if (w) {
        w.onclose = null
        w.close()
      }
    }
  }, [!!join])

  const send = useCallback((type, payload = {}) => {
    const w = wsRef.current
    if (w?.readyState === WebSocket.OPEN) w.send(JSON.stringify({ type, ...payload }))
  }, [])

  return { state, connected, identity, send }
}
