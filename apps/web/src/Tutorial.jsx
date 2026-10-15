import { useEffect, useMemo, useRef, useState } from "react"
import Table3D from "./three/Table3D"

/**
 * How to play, shown rather than written.
 *
 * Every step is a state object in exactly the shape the server sends, fed to
 * the same table the real game uses. Nothing here is a special rendering path:
 * if the table can draw it in the tutorial, it can draw it in a game, and the
 * flip, fan and tumble animations are the ones players will actually see.
 */

const SEATS = ["You", "Tuna", "Biscuit"]

const seat = (i, over) => ({
  id: `t${i}`,
  name: SEATS[i],
  connected: true,
  out: false,
  passed: false,
  points: 0,
  handCount: 4,
  stackCount: 0,
  up: [],
  hand: i === 0 ? { cat: 3, dead: 1 } : null,
  stack: i === 0 ? [] : null,
  ...over,
})

/** One frame of the lesson: a caption and the table that goes with it. */
const STEPS = [
  {
    caption: "Four boxes each. Three hold a live cat. One holds the dead one.",
    aside: "Yours are the row in front of you.",
    seats: [seat(0), seat(1), seat(2)],
    phase: "place",
    turn: 0,
  },
  {
    caption: "Put one down. Nobody sees which box you chose, not even later.",
    aside: "Tap a box in your hand to play it.",
    seats: [
      seat(0, { handCount: 3, stackCount: 1, hand: { cat: 2, dead: 1 }, stack: ["cat"] }),
      seat(1),
      seat(2),
    ],
    phase: "place",
    turn: 1,
  },
  {
    caption: "Everyone puts one down. Now anyone can open the bidding.",
    seats: [
      seat(0, { handCount: 3, stackCount: 1, hand: { cat: 2, dead: 1 }, stack: ["cat"] }),
      seat(1, { handCount: 3, stackCount: 1 }),
      seat(2, { handCount: 3, stackCount: 1 }),
    ],
    phase: "place",
    turn: 0,
  },
  {
    caption: "A bid says: I can open that many boxes without finding the dead cat.",
    aside: "The floor is your own pile plus one, so a bid always reaches past boxes you already know.",
    seats: [
      seat(0, { handCount: 3, stackCount: 1, hand: { cat: 2, dead: 1 }, stack: ["cat"] }),
      seat(1, { handCount: 3, stackCount: 1 }),
      seat(2, { handCount: 3, stackCount: 1, passed: true }),
    ],
    phase: "bid",
    turn: 1,
    bid: 2,
    bidder: 0,
  },
  {
    caption: "Win the bidding and you open the boxes yourself, one at a time, your own first.",
    seats: [
      seat(0, { handCount: 3, stackCount: 0, hand: { cat: 2, dead: 1 }, stack: [], up: ["cat"] }),
      seat(1, { handCount: 3, stackCount: 1, passed: true }),
      seat(2, { handCount: 3, stackCount: 1, passed: true }),
    ],
    phase: "reveal",
    turn: 0,
    bid: 2,
    bidder: 0,
  },
  {
    caption: "Your own shelf empty, you move on to anyone else. Tap a pile to open its top box.",
    seats: [
      seat(0, { handCount: 3, stackCount: 0, hand: { cat: 2, dead: 1 }, stack: [], up: ["cat"] }),
      seat(1, { handCount: 3, stackCount: 0, up: ["cat"] }),
      seat(2, { handCount: 3, stackCount: 1, passed: true }),
    ],
    phase: "reveal",
    turn: 0,
    bid: 2,
    bidder: 0,
  },
  {
    caption: "All alive, so the bid is made. That is one fish. Two fish wins the table.",
    seats: [
      seat(0, { handCount: 4, stackCount: 0, points: 1, hand: { cat: 3, dead: 1 }, stack: [] }),
      seat(1, { handCount: 4, stackCount: 0 }),
      seat(2, { handCount: 4, stackCount: 0 }),
    ],
    phase: "place",
    turn: 0,
    lastReveal: { by: "t0", outcome: "fish", seats: [{ id: "t0", up: ["cat"] }, { id: "t1", up: ["cat"] }], lost: null },
  },
  {
    caption: "Find the dead cat instead and one of your cats is gone for good.",
    aside: "Out of cats, out of the game. Last one still holding cats wins too.",
    seats: [
      seat(0, { handCount: 3, stackCount: 0, points: 1, hand: { cat: 2, dead: 1 }, stack: [] }),
      seat(1, { handCount: 4, stackCount: 0 }),
      seat(2, { handCount: 4, stackCount: 0 }),
    ],
    phase: "place",
    turn: 0,
    lastReveal: {
      by: "t0",
      outcome: "dead",
      seats: [{ id: "t0", up: ["cat"] }, { id: "t2", up: ["dead"] }],
      lost: { id: "t0", card: "cat" },
    },
  },
]

/** Build the exact payload shape the relay sends, so the table sees no difference. */
function frame(step) {
  return {
    code: "DEMO",
    phase: step.phase,
    bid: step.bid ?? 0,
    bidderId: step.bidder != null ? `t${step.bidder}` : null,
    hostId: "t0",
    winnerId: null,
    lastReveal: step.lastReveal ?? null,
    turnId: `t${step.turn}`,
    maxBid: 3,
    biddingOpen: true,
    pointsToWin: 2,
    yourMinBid: 2,
    log: [],
    you: "t0",
    seats: step.seats,
    serverNow: Date.now(),
  }
}

export default function Tutorial({ onDone }) {
  const [i, setI] = useState(0)
  const timer = useRef(null)
  const step = STEPS[i]
  const state = useMemo(() => frame(step), [step])
  const last = i === STEPS.length - 1

  // Paced, but never a cage: any tap moves it on, and the timer restarts with
  // the step so a manual advance does not get chased by the old one.
  useEffect(() => {
    clearTimeout(timer.current)
    if (last) return
    timer.current = setTimeout(() => setI((n) => Math.min(n + 1, STEPS.length - 1)), 5200)
    return () => clearTimeout(timer.current)
  }, [i, last])

  const next = () => (last ? onDone() : setI((n) => n + 1))

  return (
    <section className="tutorial">
      <Table3D state={state} canOpen={() => false} canPlace={() => false} />
      <div className="lesson">
        <p className="caption">{step.caption}</p>
        {step.aside && <p className="muted">{step.aside}</p>}
        <div className="row">
          <button className="primary" onClick={next}>
            {last ? "Got it, deal me in" : "Next"}
          </button>
          <button onClick={onDone}>Skip</button>
        </div>
        <ol className="ticks" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          {STEPS.map((_, k) => (
            <li key={k} className={k <= i ? "on" : ""} />
          ))}
        </ol>
      </div>
    </section>
  )
}
