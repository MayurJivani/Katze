import { useEffect, useMemo, useState } from "react"
import { useRoom } from "./lib/useRoom"
import { DeadCat, Fish, LiveCat } from "./Icons"
import Table3D from "./three/Table3D"
import TileStrip from "./TileStrip"
import InviteQR from "./InviteQR"

const store = {
  get name() {
    return localStorage.getItem("katze:name") ?? ""
  },
  set name(v) {
    localStorage.setItem("katze:name", v)
  },
  get playerId() {
    let id = localStorage.getItem("katze:id")
    if (!id) {
      id = `p_${crypto.randomUUID().slice(0, 12)}`
      localStorage.setItem("katze:id", id)
    }
    return id
  },
}

export default function App() {
  const [join, setJoin] = useState(null)
  const [error, setError] = useState(null)
  const { state, connected, identity, send } = useRoom({ join, onError: setError })

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4500)
    return () => clearTimeout(t)
  }, [error])

  // Keep the code in the URL so a reload rejoins and the link is shareable.
  useEffect(() => {
    if (identity?.code) history.replaceState(null, "", `?code=${identity.code}`)
  }, [identity?.code])

  return (
    <div className="app">
      <Header code={identity?.code} connected={connected} joined={!!join} />
      {error && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}
      {!state ? (
        <Home onJoin={setJoin} waiting={!!join && !connected} />
      ) : state.phase === "lobby" ? (
        <Lobby state={state} send={send} />
      ) : (
        <Table state={state} send={send} />
      )}
      <Rules />
    </div>
  )
}

function Header({ code, connected, joined }) {
  const [copied, setCopied] = useState(false)
  const share = () => {
    navigator.clipboard?.writeText(`${location.origin}?code=${code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <header className="header">
      <h1>
        Kat<span>ze</span>
      </h1>
      {code && (
        <button className="code" onClick={share}>
          {code} <small>{copied ? "link copied" : "copy invite link"}</small>
        </button>
      )}
      {joined && (
        <span className={`wire ${connected ? "on" : "off"}`}>{connected ? "live" : "reconnecting"}</span>
      )}
    </header>
  )
}

function Home({ onJoin, waiting }) {
  const fromLink = new URLSearchParams(location.search).get("code") ?? ""
  const [name, setName] = useState(store.name)
  const [code, setCode] = useState(fromLink)
  const [joining, setJoining] = useState(!!fromLink)

  const go = (create) => {
    const clean = name.trim().slice(0, 16)
    if (!clean) return
    store.name = clean
    onJoin({ name: clean, playerId: store.playerId, code: code.trim().toUpperCase(), create })
  }
  const submit = (e) => {
    e.preventDefault()
    go(!joining)
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h2>Three live cats. One dead one.</h2>
          <p className="lede">
            Four closed boxes each. Put one down, lie about it, then bet how many you can open
            before someone finds the dead cat.
          </p>
        </div>
        <TileStrip />
        <form className="start" onSubmit={submit}>
          <label>
            Your name
            <input
            value={name}
            maxLength={16}
            placeholder="Mittens"
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            />
          </label>
          {joining && (
            <label>
            Table code
            <input
              value={code}
              maxLength={8}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoFocus={!fromLink}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            </label>
          )}
          <div className="row">
            <button
            className="primary"
            type="submit"
            disabled={!name.trim() || waiting || (joining && !code.trim())}
            >
            {joining ? "Join the table" : "Open a table"}
            </button>
            <button type="button" onClick={() => setJoining((v) => !v)} disabled={waiting}>
            {joining ? "Start my own instead" : "I have a code"}
            </button>
          </div>
          {waiting && <p className="muted">Looking for that table…</p>}
        </form>
      </section>

      <p className="facts">
        <span>2 to 6 players</span>
        <span>one phone each</span>
        <span>no account, no install</span>
      </p>
    </>
  )
}

function Lobby({ state, send }) {
  const host = state.you === state.hostId
  const short = state.seats.length < 2
  return (
    <section className="panel">
      <h2>At the table</h2>
      <ul className="seats">
        {state.seats.map((p) => (
          <li key={p.id}>
            <span>
              {p.name}
              {p.id === state.you && " (you)"}
            </span>
            {p.id === state.hostId && <em>host</em>}
            {host && p.id !== state.you && (
              <button className="tiny" onClick={() => send("kick", { targetId: p.id })}>
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <InviteQR url={`${location.origin}?code=${state.code}`} />
      {host ? (
        <button className="primary" disabled={short} onClick={() => send("start")}>
          {short ? "Waiting for one more player" : "Deal the boxes"}
        </button>
      ) : (
        <p className="muted">Waiting for the host to deal, or point a camera at the code above.</p>
      )}
    </section>
  )
}

function Table({ state, send }) {
  const me = state.seats.find((p) => p.id === state.you)
  const yourTurn = state.turnId === state.you
  const opening = state.phase === "reveal" && state.bidderId === state.you
  const openable = (id) =>
    opening && id !== state.you && !!state.seats.find((p) => p.id === id && !p.out && p.stackCount > 0)

  return (
    <>
      <Banner state={state} yourTurn={yourTurn} opening={opening} />
      <Table3D state={state} canOpen={openable} onOpen={(id) => send("reveal", { targetId: id })} />
      <div className="shelves">
        {state.seats.map((p) => (
          <Shelf key={p.id} p={p} state={state} canOpen={openable(p.id)} onOpen={() => send("reveal", { targetId: p.id })} />
        ))}
      </div>
      {state.phase === "over" ? (
        state.you === state.hostId && (
          <button className="primary" onClick={() => send("start")}>
            Deal again
          </button>
        )
      ) : (
        <Controls state={state} me={me} yourTurn={yourTurn} send={send} />
      )}
      <Log lines={state.log} />
    </>
  )
}

function Banner({ state, yourTurn, opening }) {
  const turn = state.seats.find((p) => p.id === state.turnId)
  const winner = state.seats.find((p) => p.id === state.winnerId)
  const bidder = state.seats.find((p) => p.id === state.bidderId)

  const opened = state.seats.flatMap((p) => p.up)
  const hitDead = opened.includes("dead")
  const last = state.lastReveal

  let line
  let tone = state.phase
  if (state.phase === "over") line = winner ? `${winner.name} wins the table` : "Game over"
  else if (state.phase === "reveal" && hitDead) line = "The dead cat"
  else if (opening) line = `${opened.length} of ${state.bid} alive. Pick a neighbour's box`
  else if (state.phase === "reveal") line = `${turn?.name} is opening boxes`
  else if (last) {
    // Between rounds the last result is the most useful thing on screen.
    const by = state.seats.find((p) => p.id === last.by)
    tone = last.outcome === "dead" ? "reveal" : "won"
    line =
      last.outcome === "dead"
        ? `${by?.name} found the dead cat and lost a box`
        : `All alive. ${by?.name} took a fish`
  } else if (yourTurn && state.phase === "bid") line = `Beat ${state.bid} or pass`
  else if (yourTurn) line = "Put a box down, or open the bidding"
  else line = `${turn?.name ?? "Someone"} is ${state.phase === "bid" ? "bidding" : "choosing a box"}`

  return (
    <div className={`banner ${tone}`} role="status" aria-live="polite">
      <strong>{line}</strong>
      {state.bid > 0 && state.phase !== "over" && !last && (
        <span>
          bid {state.bid} by {bidder?.name}
        </span>
      )}
    </div>
  )
}

function Shelf({ p, state, canOpen, onOpen }) {
  const you = p.id === state.you
  const classes = ["shelf", you && "you", p.out && "out", state.turnId === p.id && "turn", canOpen && "target"]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={classes}>
      <div className="shelf-head">
        <span className="who">
          {p.name}
          {you && " (you)"}
        </span>
        <span className="pips" aria-label={`${p.points} of ${state.pointsToWin} fish`}>
          {Array.from({ length: state.pointsToWin }, (_, i) => (
            <i key={i} className={i < p.points ? "pip won" : "pip"}>
              <Fish size={19} filled={i < p.points} />
            </i>
          ))}
        </span>
      </div>

      <p className="tally">
        <span>{p.out ? "out of the game" : `${p.handCount} in hand`}</span>
        <span>{p.stackCount} closed</span>
        {p.up.length > 0 && (
          <span className={p.up.includes("dead") ? "bad" : "good"}>
            {p.up.length} open{p.up.includes("dead") ? ", dead cat" : ""}
          </span>
        )}
      </p>

      <div className="shelf-foot">
        {p.id === state.bidderId && <em>bid {state.bid}</em>}
        {p.passed && state.phase === "bid" && <em className="pale">passed</em>}
        {!p.connected && !p.out && <em className="pale">away</em>}
        {canOpen && (
          <button className="tiny open" onClick={onOpen}>
            open a box
          </button>
        )}
      </div>
    </div>
  )
}

function Controls({ state, me, yourTurn, send }) {
  const canPlace = yourTurn && state.phase === "place" && me && me.handCount > 0
  const canBid = yourTurn && (state.phase === "bid" || (state.phase === "place" && state.biddingOpen))
  // The server decides the floor: it is your own pile plus one, so a bid always
  // has to reach past boxes you already know the contents of.
  const floor = state.yourMinBid ?? state.bid + 1
  const [amount, setAmount] = useState(floor)
  const clamped = useMemo(() => Math.min(Math.max(amount, floor), state.maxBid), [amount, floor, state.maxBid])

  useEffect(() => setAmount(floor), [floor])

  if (!me || me.out) return <p className="muted center">You are out. Stay and watch how it ends.</p>
  if (state.phase === "reveal") return null

  return (
    <section className="controls">
      <div className="hand">
        <button
          className="hand-btn live"
          disabled={!canPlace || me.hand.cat < 1}
          onClick={() => send("place", { card: "cat" })}
        >
          <LiveCat size={22} /> put down a live cat <span className="count">{me.hand.cat}</span>
        </button>
        <button
          className="hand-btn dead"
          disabled={!canPlace || me.hand.dead < 1}
          onClick={() => send("place", { card: "dead" })}
        >
          <DeadCat size={22} /> put down the dead cat <span className="count">{me.hand.dead}</span>
        </button>
      </div>
      <div className="bidbar">
        <button className="step" aria-label="lower the bid" disabled={!canBid || clamped <= floor} onClick={() => setAmount(clamped - 1)}>
          −
        </button>
        <output aria-label="your bid">{state.maxBid >= floor ? clamped : floor}</output>
        <button className="step" aria-label="raise the bid" disabled={!canBid || clamped >= state.maxBid} onClick={() => setAmount(clamped + 1)}>
          +
        </button>
        <button className="primary" disabled={!canBid || state.maxBid < floor} onClick={() => send("bid", { amount: clamped })}>
          Bid {state.maxBid >= floor ? clamped : ""}
        </button>
        <button disabled={!yourTurn || state.phase !== "bid" || state.bidderId === state.you} onClick={() => send("pass")}>
          Pass
        </button>
      </div>
    </section>
  )
}

function Log({ lines }) {
  return (
    <ol className="log" aria-live="polite">
      {[...lines].reverse().map((line, i) => (
        <li key={`${i}-${line}`}>{line}</li>
      ))}
    </ol>
  )
}

function Rules() {
  return (
    <details className="rules">
      <summary>How it goes</summary>
      <ol>
        <li>Everyone puts one box down face down, then takes turns adding more or opening the bidding.</li>
        <li>A bid says: I can open that many boxes without finding the dead cat.</li>
        <li>Raise or pass. The last player still bidding has to do the opening.</li>
        <li>Your own shelf opens first, all of it, then one box at a time off anyone else.</li>
        <li>All live cats and you take a fish. Two fish wins the table.</li>
        <li>The dead cat and you lose a box for good. Out of boxes, out of the game.</li>
      </ol>
    </details>
  )
}
