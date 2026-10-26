import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRoom } from "./lib/useRoom"
import { DeadCat, Fish, LiveCat } from "./Icons"
import Table3D from "./three/Table3D"
import InviteQR from "./InviteQR"
import HomeScene from "./three/HomeScene"
import Tutorial from "./Tutorial"

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
  const [teaching, setTeaching] = useState(false)
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
      {teaching ? (
        <Tutorial onDone={() => setTeaching(false)} />
      ) : !state ? (
        <Home onJoin={setJoin} waiting={!!join && !connected} onLearn={() => setTeaching(true)} />
      ) : state.phase === "lobby" ? (
        <Lobby state={state} send={send} onLearn={() => setTeaching(true)} />
      ) : (
        <Table state={state} send={send} />
      )}
      {!teaching && <Rules />}
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

function Home({ onJoin, waiting, onLearn }) {
  const [found, setFound] = useState(null)
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
          <p className="lede" aria-live="polite">
            {found === "win"
              ? "Three for three, and you never touched the dead one. Do that against people who are lying to you."
              : found === "cat"
                ? "Alive. The next one might not be."
                : found === "dead"
                  ? "That one was dead. Everything shuffles, and nobody knows again."
                  : "Four closed boxes. Open one and find out, then do it with friends and lie about it."}
          </p>
        </div>
        <HomeScene onReveal={setFound} />
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
            <button type="button" onClick={onLearn} disabled={waiting}>
              How to play
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

function Lobby({ state, send, onLearn }) {
  const host = state.you === state.hostId
  const short = state.seats.length < 2
  return (
    <>
      <Table3D state={state} canOpen={() => false} canPlace={() => false} />
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
      <div className="row">
        {host && (
          <button className="primary" disabled={short} onClick={() => send("start")}>
            {short ? "Waiting for one more player" : "Deal the boxes"}
          </button>
        )}
        <button onClick={onLearn}>First time? Watch how it plays</button>
      </div>
      {!host && <p className="muted">Waiting for the host to deal, or point a camera at the code.</p>}
      </section>
    </>
  )
}

const RESULT_HOLD_MS = 6500

function Table({ state, send }) {
  const [holding, setHolding] = useState(true)
  // Keyed by content: every state push parses a fresh object, and restarting
  // the hold on each one left the last round's boxes on the table for good.
  const result = state.lastReveal && JSON.stringify(state.lastReveal)
  useEffect(() => {
    if (!result) return
    setHolding(true)
    const t = setTimeout(() => setHolding(false), RESULT_HOLD_MS)
    return () => clearTimeout(t)
  }, [result])
  // Everything downstream sees a table that has already been cleared. Memoised
  // because the table rebuilds its whole scene whenever this object changes,
  // and a fresh one per render would cut every flip off mid-air.
  const shown = useMemo(
    () => (holding ? state : { ...state, lastReveal: null }),
    [state, holding],
  )

  const me = state.seats.find((p) => p.id === state.you)
  const yourTurn = state.turnId === state.you
  const opening = state.phase === "reveal" && state.bidderId === state.you
  /*
   * You turn every box over yourself, your own shelf first. While you still
   * have one closed, yours is the only pile that answers a tap.
   */
  const mineClosed = (me?.stackCount ?? 0) > 0
  const openable = (id) => {
    if (!opening) return false
    const p = state.seats.find((x) => x.id === id)
    if (!p || p.out || p.stackCount < 1) return false
    return mineClosed ? id === state.you : id !== state.you
  }

  return (
    <>
      <Banner state={shown} opening={opening} />
      <Table3D
        state={shown}
        yourTurn={yourTurn}
        alarm={
          shown.seats.some((p) => p.up.includes("dead")) || shown.lastReveal?.outcome === "dead"
        }
        canOpen={openable}
        onOpen={(id) => send("reveal", { targetId: id })}
        canPlace={(card) =>
          yourTurn && state.phase === "place" && (me?.hand?.[card] ?? 0) > 0
        }
        onPlace={(card) => send("place", { card })}
      />
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

/**
 * What the table is doing, in one line, and the one thing that explains it:
 * why it happened or what comes next. Everyone reads the same story; only the
 * turn line changes to "you".
 */
function narrate(state, opening) {
  const name = (id) => (id === state.you ? "You" : (state.seats.find((p) => p.id === id)?.name ?? "Someone"))
  const me = state.seats.find((p) => p.id === state.you)
  const turn = state.turnId
  const yours = turn === state.you
  const bidder = name(state.bidderId)
  const opened = state.seats.flatMap((p) => p.up).length
  const last = state.lastReveal

  if (state.phase === "over") {
    const w = state.seats.find((p) => p.id === state.winnerId)
    if (!w) return { tone: "over", line: "Game over", detail: "Nobody is left holding cats." }
    return {
      tone: "over",
      line: `${name(w.id)} ${w.id === state.you ? "win" : "wins"} the table`,
      detail:
        w.points >= state.pointsToWin
          ? `${state.pointsToWin} fish, and the game.`
          : "Last one still holding cats.",
    }
  }

  if (last) {
    const by = name(last.by)
    const next = `${name(turn)} ${yours ? "lead" : "leads"} the next round.`
    if (last.outcome === "fish") {
      const pts = state.seats.find((p) => p.id === last.by)?.points ?? 0
      return {
        tone: "won",
        line: `All alive. ${by} ${last.by === state.you ? "take" : "takes"} a fish`,
        detail: `${pts} of ${state.pointsToWin} fish. ${next}`,
        clock: true,
      }
    }
    const owner = last.seats.find((x) => x.up.includes("dead"))?.id
    const own = owner === last.by ? " own" : ""
    const whose = owner === state.you ? `your${own}` : own ? "their own" : `${name(owner)}'s`
    const loser = state.seats.find((p) => p.id === last.lost?.id)
    const cost = !last.lost
      ? ""
      : last.lost.id === state.you
        ? `You lose ${last.lost.card === "dead" ? "your dead cat" : "a live cat"} for good. `
        : `${loser?.name} loses a box for good. `
    const out = loser?.out ? `${name(loser.id)} ${loser.id === state.you ? "are" : "is"} out of cats. ` : ""
    return {
      tone: "dead",
      line: `${by} found the dead cat`,
      detail: `It was in ${whose} box. ${cost}${out}${next}`,
      clock: true,
    }
  }

  if (state.phase === "reveal") {
    const left = state.bid - opened
    if (opening) {
      return {
        tone: "reveal",
        line: `${opened} of ${state.bid} alive`,
        detail:
          me?.stackCount > 0
            ? "Open your own boxes first, top of the pile down."
            : `${left} more. Pick a box on someone else's shelf.`,
      }
    }
    return {
      tone: "reveal",
      line: `${bidder} ${state.bidderId === state.you ? "are" : "is"} opening boxes`,
      detail: `${opened} of ${state.bid} alive so far. One dead cat and the bid is lost.`,
    }
  }

  if (state.phase === "bid") {
    return yours
      ? { tone: "turn", line: `Beat ${state.bid} or pass`, detail: `${bidder} says ${state.bid} boxes open without a dead cat.` }
      : {
          tone: "bid",
          line: `${name(turn)} is deciding: raise or pass`,
          detail: `${bidder} ${state.bidderId === state.you ? "hold" : "holds"} the bid at ${state.bid}.`,
        }
  }

  // Placing. A table with nothing on it is a round that has just begun.
  const fresh = state.seats.every((p) => p.out || p.stackCount === 0)
  if (fresh) {
    return {
      tone: "turn",
      line: "New round",
      detail: `Every box is back in its owner's hand. ${yours ? "You put" : `${name(turn)} puts`} the first one down.`,
    }
  }
  if (yours) {
    return {
      tone: "turn",
      line: "Your turn",
      detail: state.biddingOpen
        ? "Put another box down, or open the bidding."
        : "Put a box down. Bidding opens once every shelf has one.",
    }
  }
  return {
    tone: "place",
    line: `${name(turn)} is choosing a box`,
    detail: state.biddingOpen ? "They can add another, or open the bidding." : "Bidding opens once every shelf has one.",
  }
}

// Old line leaves fast and up, new one arrives from below: the table moved on.
// Reduced motion keeps the crossfade, which carries the news, and drops the travel.
const enter = { opacity: 0, y: 14, filter: "blur(4px)" }
const settled = { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } }
const leave = { opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.18, ease: "easeIn" } }
const fade = { opacity: 0, transition: { duration: 0.2 } }
const visible = { opacity: 1, transition: { duration: 0.2 } }

function Banner({ state, opening }) {
  const calm = useReducedMotion()
  const { tone, line, detail, clock } = narrate(state, opening)
  return (
    <div className={`banner ${tone}`} role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={line} className="banner-copy" initial={calm ? fade : enter} animate={calm ? visible : settled} exit={calm ? fade : leave}>
          <strong>{line}</strong>
          <p>{detail}</p>
        </motion.div>
      </AnimatePresence>
      {clock && <i className="banner-clock" style={{ animationDuration: `${RESULT_HOLD_MS}ms` }} aria-hidden="true" />}
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
          <button className="tiny open reach" onClick={onOpen}>
            Open a box on {p.name}'s shelf
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
  const prompt = canPlace
    ? "Tap a box in your hand to put it down"
    : state.phase === "bid" && yourTurn
      ? "Beat the bid or pass"
      : null

  return (
    <section className="controls">
      <div className="hand">
        <button
          className="hand-btn live reach"
          disabled={!canPlace || me.hand.cat < 1}
          onClick={() => send("place", { card: "cat" })}
        >
          <LiveCat size={22} /> Put down a live cat <span className="count">{me.hand.cat}</span>
        </button>
        <button
          className="hand-btn dead reach"
          disabled={!canPlace || me.hand.dead < 1}
          onClick={() => send("place", { card: "dead" })}
        >
          <DeadCat size={22} /> Put down the dead cat <span className="count">{me.hand.dead}</span>
        </button>
      </div>
      {prompt && <p className="prompt">{prompt}</p>}
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
    <details className="log-box">
      <summary>Table log</summary>
      <ol className="log">
        {[...lines].reverse().map((line, i) => (
          <li key={`${i}-${line}`}>{line}</li>
        ))}
      </ol>
    </details>
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
        <li>You open the boxes by hand, one at a time: your own shelf first, then anyone else's.</li>
        <li>All live cats and you take a fish. Two fish wins the table.</li>
        <li>The dead cat and one of your cats is gone for good. Out of cats, out of the game.</li>
      </ol>
    </details>
  )
}
