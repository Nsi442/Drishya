// The driver app assumes patchy signal. Anything the driver submits is queued
// optimistically and drained when the connection returns, so a proof of
// delivery captured in a dead spot is never lost and never blocks the screen.

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'

export default function useOfflineQueue() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [queue, setQueue] = useState([])
  const [syncing, setSyncing] = useState(false)
  const queueRef = useRef(queue)
  useLayoutEffect(() => {
    queueRef.current = queue
  })

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const enqueue = useCallback((item) => {
    const record = { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, queuedAt: Date.now(), ...item }
    setQueue((prev) => [...prev, record])
    return record
  }, [])

  const drain = useCallback(async () => {
    if (!queueRef.current.length) return
    setSyncing(true)
    // Walk the queue in order — a POD must not overtake the gate-in that
    // precedes it.
    for (const item of queueRef.current) {
      try {
        await item.run?.()
        setQueue((prev) => prev.filter((q) => q.id !== item.id))
      } catch {
        break // leave the rest queued; try again on the next connection event
      }
    }
    setSyncing(false)
  }, [])

  useEffect(() => {
    if (online && queue.length && !syncing) drain()
  }, [online, queue.length, syncing, drain])

  return {
    online,
    setOnline, // the driver shell exposes a manual toggle for demonstration
    queue,
    pending: queue.length,
    syncing,
    enqueue,
    drain,
  }
}
