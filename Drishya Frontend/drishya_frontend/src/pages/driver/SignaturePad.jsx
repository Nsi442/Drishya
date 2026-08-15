import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react'
import Button from '../../components/ui/Button.jsx'
import './driver.css'

// Canvas signature capture. Pointer events cover finger, stylus and mouse from
// one code path, and the backing store is scaled for the device pixel ratio so
// the stroke is not soft on a phone.
const SignaturePad = forwardRef(function SignaturePad({ onChange, label = 'Signature' }, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const [signed, setSigned] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      // Preserve what has been drawn across a resize (orientation change).
      const snapshot = signed ? canvas.toDataURL() : null

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-strong').trim() || '#111'

      if (snapshot) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = snapshot
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pointFrom = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pointFrom(e)
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const point = pointFrom(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    last.current = point
    if (!signed) {
      setSigned(true)
      onChange?.(true)
    }
  }

  const end = (e) => {
    if (!drawing.current) return
    drawing.current = false
    try {
      canvasRef.current.releasePointerCapture(e.pointerId)
    } catch {
      // The pointer may already have been released by the browser.
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSigned(false)
    onChange?.(false)
  }

  useImperativeHandle(ref, () => ({
    clear,
    isSigned: () => signed,
    toDataURL: () => (signed ? canvasRef.current.toDataURL('image/png') : null),
  }))

  return (
    <div className="field">
      <div className="row between">
        <span className="field-label">{label}</span>
        {signed ? (
          <Button variant="link" onClick={clear} type="button">
            Clear
          </Button>
        ) : null}
      </div>

      <div className={`sigpad ${signed ? 'is-signed' : ''}`}>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Signature capture area — sign with a finger or a stylus"
          role="img"
        />
        {!signed ? <span className="sigpad-hint">Sign here</span> : null}
      </div>
    </div>
  )
})

export default SignaturePad
