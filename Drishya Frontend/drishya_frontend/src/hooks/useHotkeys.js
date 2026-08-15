// Global keyboard shortcuts. Bindings are declared as 'mod+k' / '?' / 'g d'
// and ignored while the user is typing into a field.

import { useEffect, useLayoutEffect, useRef } from 'react'

function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function describe(e) {
  const parts = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey && e.key.length > 1) parts.push('shift')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

export default function useHotkeys(bindings, { enabled = true } = {}) {
  // Latest-ref, written in a layout effect so render stays free of side effects.
  const ref = useRef(bindings)
  useLayoutEffect(() => {
    ref.current = bindings
  })

  useEffect(() => {
    if (!enabled) return undefined

    // Supports two-key sequences like "g" then "s" for go-to-shipments.
    let pending = null
    let pendingTimer = null

    const onKeyDown = (e) => {
      const combo = describe(e)
      const map = ref.current

      // Escape and mod-combos still work inside a text field; bare letters do not.
      const typing = isTypingTarget(e.target)
      if (typing && !combo.startsWith('mod') && e.key !== 'Escape') return

      if (pending) {
        const seq = `${pending} ${e.key.toLowerCase()}`
        clearTimeout(pendingTimer)
        pending = null
        if (map[seq]) {
          e.preventDefault()
          map[seq](e)
          return
        }
      }

      if (map[combo]) {
        e.preventDefault()
        map[combo](e)
        return
      }

      // Start a sequence if any binding begins with this key.
      const startsSequence = Object.keys(map).some((k) => k.includes(' ') && k.startsWith(`${e.key.toLowerCase()} `))
      if (startsSequence && !typing) {
        pending = e.key.toLowerCase()
        pendingTimer = setTimeout(() => {
          pending = null
        }, 900)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      clearTimeout(pendingTimer)
    }
  }, [enabled])
}
