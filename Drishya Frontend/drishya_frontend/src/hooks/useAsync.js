// Every page loads through this, so loading / empty / error behave identically
// everywhere and no screen invents its own spinner logic.

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'

export default function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, status: immediate ? 'loading' : 'idle', error: null })

  // The "latest ref" pattern. Assigned in a layout effect rather than during
  // render — writing a ref while rendering is a side effect, and layout effects
  // still run before the passive effect below fires `run`.
  const fnRef = useRef(fn)
  useLayoutEffect(() => {
    fnRef.current = fn
  })

  // Guards against a slow first request resolving after a fast second one and
  // overwriting it — the classic filter-typing race.
  const requestId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const id = ++requestId.current
    // A FIRST load and a BACKGROUND REFRESH are not the same state, and
    // conflating them emptied the screen on a timer.
    //
    // Receiving and Yard re-run on every live tick, which is every five
    // seconds. Both render `isLoading ? <SkeletonCards/> : <the page>`, so
    // every five seconds the whole page — queue, detail panel and the
    // part-filled goods-receipt form inside it — was replaced by grey blocks
    // and then rebuilt. The form holds its counted cartons, damaged count and
    // note in local state, so a receiving clerk lost whatever they had typed
    // every five seconds. It reads as the page refreshing on its own.
    //
    // So: 'loading' means there is nothing to show yet. Once there is data,
    // a re-run is 'refreshing' and the caller keeps rendering what it has.
    setState((prev) => ({
      data: prev.data,
      status: prev.data == null ? 'loading' : 'refreshing',
      error: null,
    }))
    try {
      const data = await fnRef.current()
      if (!mounted.current || id !== requestId.current) return undefined
      setState({ data, status: 'ready', error: null })
      return data
    } catch (error) {
      if (!mounted.current || id !== requestId.current) return undefined
      setState({ data: null, status: 'error', error })
      return undefined
    }
  }, [])

  useEffect(() => {
    // Fetching is exactly what an effect is for: React state is being
    // synchronised with an external system. `run` does set a "loading" flag
    // before awaiting, which the rule counts as a synchronous setState — that
    // flag is the entire point of a loading state, so it stays.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (immediate) run()
    // The caller decides what invalidates the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return {
    data: state.data,
    error: state.error,
    status: state.status,
    // "I have nothing to show" — the only case that warrants a skeleton.
    isLoading: state.status === 'loading',
    // "I have something to show and am checking for newer." Nothing is
    // required to render for this; it exists so a caller that wants a quiet
    // indicator can have one without going back to blanking the page.
    isRefreshing: state.status === 'refreshing',
    isError: state.status === 'error',
    isReady: state.status === 'ready' || state.status === 'refreshing',
    reload: run,
    setData: (updater) =>
      setState((prev) => ({ ...prev, data: typeof updater === 'function' ? updater(prev.data) : updater })),
  }
}
