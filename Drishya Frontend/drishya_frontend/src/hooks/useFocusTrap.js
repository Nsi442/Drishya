// Keeps Tab inside an open modal or drawer, restores focus to whatever opened
// it, and closes on Escape. Every overlay in the app uses this — it is the
// difference between a dialog and a div that looks like one.

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function useFocusTrap(active, onClose) {
  const containerRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!active) return undefined

    previouslyFocused.current = document.activeElement
    const container = containerRef.current
    if (!container) return undefined

    // Focus the first useful control, or the container itself if there is none.
    const focusables = () => [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    const first = focusables()[0]
    if (first) first.focus()
    else container.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusables()
      if (!items.length) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    // Stop the page behind the overlay from scrolling under it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [active, onClose])

  return containerRef
}
