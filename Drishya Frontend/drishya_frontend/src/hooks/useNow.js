import { useState, useEffect } from 'react'

// A ticking clock as React state.
//
// Reading Date.now() while rendering makes a component impure: two renders with
// identical props produce different output, and nothing tells React to redraw
// when the minute rolls over. Anything that shows elapsed time — a detention
// timer, "arriving in 12 min", the now-line on the dock gantt — reads the
// timestamp from here instead, so the clock advances on screen and the render
// stays a pure function of its inputs.
export default function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
