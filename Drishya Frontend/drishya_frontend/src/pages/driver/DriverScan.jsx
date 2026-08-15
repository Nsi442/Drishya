import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useToast } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Input from '../../components/ui/Input.jsx'
import { SegmentedControl } from '../../components/ui/Tabs.jsx'
import { StatusPill } from '../../components/ui/Badge.jsx'
import { Callout } from '../../components/ui/Misc.jsx'
import './driver.css'

// There is no camera decoding in this build — the viewport is a real UI with a
// working manual fallback, which is the path drivers use in bad light anyway.
export default function DriverScan() {
  useDocumentTitle('Scan')
  const navigate = useNavigate()
  const toast = useToast()
  const state = useAppState()

  const [mode, setMode] = useState('camera')
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)

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

  // Simulated capture — resolves to a real shipment so the flow is complete.
  const simulateScan = () => {
    setScanning(true)
    setError(null)
    setTimeout(() => {
      setScanning(false)
      const target = recent[0]
      if (!target) {
        setError('No active consignment to scan against.')
        return
      }
      toast.success('Barcode read', { description: `Seal ${target.sealNumber}` })
      navigate(`/driver/trip/${target.id}`)
    }, 1400)
  }

  return (
    <div className="stack gap-16">
      <SegmentedControl
        label="Scan mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'camera', label: 'Camera', icon: 'camera' },
          { value: 'manual', label: 'Type it in', icon: 'edit' },
        ]}
      />

      {mode === 'camera' ? (
        <>
          <div className="scanner">
            <div className="scanner-frame">
              <span className="scanner-corner tl" />
              <span className="scanner-corner tr" />
              <span className="scanner-corner bl" />
              <span className="scanner-corner br" />
              {scanning ? <span className="scanner-line" /> : null}
            </div>
            <p className="scanner-caption">{scanning ? 'Reading…' : 'Line the barcode up inside the frame'}</p>
          </div>

          <Button variant="primary" size="xl" block icon="scan" onClick={simulateScan} loading={scanning} className="advance-btn">
            {scanning ? 'Reading barcode…' : 'Capture'}
          </Button>

          <Callout tone="neutral" icon="info">
            Camera decoding is not wired up in this build. Capture resolves against your active consignment so the rest
            of the flow can be walked through, and typing the number in always works.
          </Callout>
        </>
      ) : (
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
      )}

      {recent.length ? (
        <Card>
          <CardHeader title="Your active consignments" subtitle="Tap one instead of scanning" />
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
