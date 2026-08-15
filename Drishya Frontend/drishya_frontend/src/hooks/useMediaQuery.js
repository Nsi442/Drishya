import { useSyncExternalStore, useCallback } from 'react'

// useSyncExternalStore is the right tool here: matchMedia is an external store,
// and subscribing through this API keeps the value consistent across concurrent
// renders without an effect that writes state on mount.
export default function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  // No DOM on the server, so nothing matches.
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
