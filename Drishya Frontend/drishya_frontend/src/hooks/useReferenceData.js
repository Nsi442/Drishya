import { useSyncExternalStore } from 'react'
import { subscribeReferenceData, refDataVersion } from '../services/referenceData.js'

/**
 * A value that changes when reference data finishes loading.
 *
 * Reference data is a module singleton mutated in place, so that fill is not a
 * React state change and nothing re-renders for it. A component that reads
 * `refData.docks` directly during render self-corrects on the next render;
 * one that reads it inside a `useMemo` does not, because the memo's own
 * dependencies (an fcId, a form field) have not changed. It keeps the empty
 * array it captured on first render for the life of the mount.
 *
 * Put this in the dependency array of any memo that derives from refData:
 *
 *   const refVersion = useReferenceData()
 *   const docks = useMemo(() => db.docks.filter(...), [fcId, refVersion])
 *
 * useSyncExternalStore rather than an effect and a piece of state: the load
 * can complete before the subscription is set up, and this is the API that
 * closes that gap by re-reading the snapshot on subscribe.
 */
export default function useReferenceData() {
  return useSyncExternalStore(subscribeReferenceData, refDataVersion, refDataVersion)
}
