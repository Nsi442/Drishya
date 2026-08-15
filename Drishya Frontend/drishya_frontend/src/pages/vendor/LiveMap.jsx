import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { ACTIVE_STATUSES, SHIPMENT_STATUS } from '../../lib/constants.js'
import { formatNumber } from '../../lib/format.js'
import ShipmentMap from '../../components/map/ShipmentMap.jsx'
import { ShipmentRow } from '../../components/shipment/ShipmentParts.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import Button from '../../components/ui/Button.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { LiveIndicator } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import { refData as db } from '../../services/referenceData.js'

// The control tower: one map, one list, kept in sync. Selecting in either
// focuses the other.
export default function LiveMap() {
  useDocumentTitle('Control tower')
  const state = useAppState()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [fcId, setFcId] = useState('all')
  const [delayedOnly, setDelayedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const all = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const shipments = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all
      .filter((s) => {
        if (!s.position) return false
        if (status === 'active' && !ACTIVE_STATUSES.includes(s.status)) return false
        if (status !== 'all' && status !== 'active' && s.status !== status) return false
        if (fcId !== 'all' && s.fcId !== fcId) return false
        if (delayedOnly && s.delayMin <= 15) return false
        if (q && !`${s.id} ${s.lane} ${s.vehicleReg} ${s.driverName} ${s.fcName}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => b.delayMin - a.delayMin)
  }, [all, search, status, fcId, delayedOnly])

  const delayed = shipments.filter((s) => s.delayMin > 15).length
  const hasFilters = search || status !== 'active' || fcId !== 'all' || delayedOnly

  const reset = () => {
    setSearch('')
    setStatus('active')
    setFcId('all')
    setDelayedOnly(false)
  }

  return (
    <div className="tower">
      <aside className="tower-panel" aria-label="Shipments on the map">
        <div className="stack gap-8 pad-tight panel-head">
          <div className="row between gap-8">
            <h1 className="t-lg fw-600 c-strong">Control tower</h1>
            <LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} />
          </div>

          <p className="t-sm c-muted">
            {formatNumber(shipments.length)} on the map
            {delayed ? ` · ${delayed} running late` : ''}
          </p>

          <SearchInput value={search} onChange={setSearch} placeholder="Filter by ID, lane, vehicle…" label="Filter shipments" />

          <div className="row gap-6 wrap">
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'all', label: 'All' },
                ...Object.entries(SHIPMENT_STATUS)
                  .filter(([key]) => key !== 'cancelled')
                  .map(([value, meta]) => ({ value, label: meta.label })),
              ]}
            />
            <FilterSelect
              label="Destination"
              value={fcId}
              onChange={setFcId}
              options={[{ value: 'all', label: 'All centres' }, ...db.fulfilmentCentres.map((fc) => ({ value: fc.id, label: fc.city }))]}
            />
            <Button variant={delayedOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setDelayedOnly((d) => !d)} aria-pressed={delayedOnly}>
              Late
            </Button>
          </div>
        </div>

        <div className="tower-list">
          {loading ? (
            <div className="stack gap-8 pad-tight">
              <SkeletonCards count={7} height={62} />
            </div>
          ) : shipments.length === 0 ? (
            <EmptyState
              icon="map"
              title="Nothing matches"
              description={hasFilters ? 'No shipments on the map fit these filters.' : 'No shipments are currently being tracked.'}
              actionLabel={hasFilters ? 'Clear filters' : undefined}
              onAction={reset}
            />
          ) : (
            shipments.map((s) => (
              <ShipmentRow
                key={s.id}
                shipment={s}
                active={s.id === selectedId}
                onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
              />
            ))
          )}
        </div>

        {selectedId ? (
          <div className="pad-tight panel-foot">
            <Button variant="primary" block onClick={() => navigate(`/vendor/shipments/${selectedId}`)} iconRight="arrowRight">
              Open {selectedId}
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="tower-map">
        <ShipmentMap
          shipments={shipments}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showRoutes="selected"
          cluster
          height="100%"
          fitKey={`${status}-${fcId}-${delayedOnly}-${shipments.length}`}
        />
      </div>
    </div>
  )
}
