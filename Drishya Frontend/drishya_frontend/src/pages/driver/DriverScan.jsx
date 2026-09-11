import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useToast } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Input from '../../components/ui/Input.jsx'
import { StatusPill } from '../../components/ui/Badge.jsx'
import './driver.css'

// Entering the number, or tapping a consignment. No camera.
//
// The camera mode was a viewfinder that decoded nothing, and its own caption
// said so. Manual entry is the path drivers use in bad light anyway, and it is
// the one that actually worked.
export default function DriverScan() {
  useDocumentTitle('Scan')
  const navigate = useNavigate()
  const toast = useToast()
  const state = useAppState()

  const [code, setCode] = useState('')
  const [error, setError] = useState(null)

  const shipments = selectShipments(state)
  const recent = useMemo(() => shipments.filter((s) => s.status !== 'delivered' && s.status !== 'cancelled').slice(0, 4), [shipments])

  const resolve = (value) => {
    const q = value.trim().toUpperCase()
    if (!q) {
      setError('Enter a consignment or seal number')
      return
    }
    const hit = shipments.find(
      (s) => s.id.toUpperCase() === q || s.sealNumber.toUpperCase() === q || s.reference.toUpperCase() === q,
    )
    if (!hit) {
      setError(`Nothing matches "${value}". Check the number and try again.`)
      return
    }
    setError(null)
    toast.success(`Found ${hit.id}`, { description: hit.lane })
    navigate(`/driver/trip/${hit.id}`)
  }

  // No camera mode. There was a viewfinder with corner brackets, a sweeping
  // scan line and a Capture button that decoded nothing — it waited 1.4s and
  // opened whichever consignment happened to be first, with a caption
  // admitting as much. A control that mimes a capability is worse than its
  // absence: it is the one thing on this screen a person would try first.
  //
  // What remains does work: type or paste the number, or tap a consignment.

  return (
    <div className="stack gap-16">
      <Card>
        <CardHeader title="Enter the number" subtitle="Consignment ID, seal number or purchase order" />
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              resolve(code)
            }}
            className="stack gap-16"
            noValidate
          >
            <Input
              label="Number"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
              error={error}
              placeholder="SHP-24001 or SL-482910"
              className="mono"
              size="lg"
              leadIcon="search"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
            />
            <Button type="submit" variant="primary" size="lg" block>
              Find consignment
            </Button>
          </form>
        </CardBody>
      </Card>

      {recent.length ? (
        <Card>
          <CardHeader title="Your active consignments" subtitle="Tap one to open it" />
          <CardBody className="stack gap-8">
            {recent.map((s) => (
              <button key={s.id} type="button" className="doc-tile" onClick={() => navigate(`/driver/trip/${s.id}`)}>
                <span className="doc-icon">
                  <Icon name="package" size={16} />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="row between gap-8">
                    <span className="mono fw-600 c-strong">{s.id}</span>
                    <StatusPill status={s.status} size="sm" />
                  </span>
                  <span className="t-sm c-muted truncate" style={{ display: 'block' }}>
                    Seal {s.sealNumber} · {s.lane}
                  </span>
                </span>
                <Icon name="chevronRight" size={16} className="c-subtle" />
              </button>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
