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
    setState((prev) => ({ data: prev.data, status: 'loading', error: null }))
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
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    isReady: state.status === 'ready',
    reload: run,
    setData: (updater) =>
      setState((prev) => ({ ...prev, data: typeof updater === 'function' ? updater(prev.data) : updater })),
  }
}
