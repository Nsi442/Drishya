import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon.jsx'
import { StatusPill } from '../ui/Badge.jsx'
import { useAppState, useAuth, useUI } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import { navFor, EXTRA_DESTINATIONS } from './navConfig.js'
import { refData as db } from '../../services/referenceData.js'
import './layout.css'

const MAX_PER_GROUP = 5

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()
  const state = useAppState()
  const { user } = useAuth()
  const ui = useUI()

  const shipments = selectShipments(state)

  // The palette is remounted by its parent each time it opens (see the `key` in
  // PortalShell), so query and selection start clean without an effect that
  // resets them. All that is left to do on mount is take focus.
  useEffect(() => {
    if (!open) return
    // Focus after the portal has painted, or the caret lands nowhere.
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const role = user?.role ?? 'vendor_admin'

    const pages = [...navFor(role).filter((n) => n.to), ...(EXTRA_DESTINATIONS[role] ?? [])]
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .slice(0, MAX_PER_GROUP)
      .map((p) => ({ id: `page-${p.to}`, kind: 'page', icon: p.icon, label: p.label, sub: p.to, to: p.to }))

    const shipmentHits = !q
      ? []
      : shipments
          .filter((s) => `${s.id} ${s.reference} ${s.vendorName} ${s.lane} ${s.invoiceNo}`.toLowerCase().includes(q))
          .slice(0, MAX_PER_GROUP)
          .map((s) => ({
            id: `ship-${s.id}`,
            kind: 'shipment',
            icon: 'truck',
            label: s.id,
            sub: `${s.lane} · ${s.vendorName}`,
            status: s.status,
            to: role === 'fc' ? `/fc/inbound/${s.id}` : role === 'driver' ? `/driver/trip/${s.id}` : `/vendor/shipments/${s.id}`,
          }))

    const vehicleHits = !q
      ? []
      : db.vehicles
          .filter((v) => `${v.regNumber} ${v.type} ${v.carrier}`.toLowerCase().includes(q))
          .slice(0, 3)
          .map((v) => {
            const trip = shipments.find((s) => s.vehicleId === v.id && s.status !== 'delivered' && s.status !== 'cancelled')
            return {
              id: `veh-${v.id}`,
              kind: 'vehicle',
              icon: 'package',
              label: v.regNumber,
              sub: `${v.type} · ${v.carrier}`,
              to: trip
                ? role === 'fc'
                  ? `/fc/inbound/${trip.id}`
                  : `/vendor/shipments/${trip.id}`
                : role === 'fc'
                  ? '/fc/inbound'
                  : '/vendor/carriers',
            }
          })

    const vendorHits =
      !q || role === 'driver'
        ? []
        : db.vendors
            .filter((v) => v.name.toLowerCase().includes(q))
            .slice(0, 3)
            .map((v) => ({
              id: `vendor-${v.id}`,
              kind: 'vendor',
              icon: 'users',
              label: v.name,
              sub: `${v.city} · ${v.onTimePct}% on time`,
              to: role === 'fc' ? `/fc/vendors` : `/vendor/shipments?vendor=${v.id}`,
            }))

    const actions = [
      {
        id: 'action-theme',
        kind: 'action',
        icon: ui.theme === 'dark' ? 'sun' : 'moon',
        label: ui.theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme',
        run: ui.toggleTheme,
      },
      {
        id: 'action-live',
        kind: 'action',
        icon: ui.liveEnabled ? 'pause' : 'play',
        label: ui.liveEnabled ? 'Pause live updates' : 'Resume live updates',
        run: () => ui.set({ liveEnabled: !ui.liveEnabled }),
      },
      {
        id: 'action-shortcuts',
        kind: 'action',
        icon: 'command',
        label: 'Show keyboard shortcuts',
        run: () => ui.set({ shortcutsOpen: true }),
      },
    ].filter((a) => !q || a.label.toLowerCase().includes(q))

    return [
      { label: 'Shipments', items: shipmentHits },
      { label: 'Vehicles', items: vehicleHits },
      { label: 'Vendors', items: vendorHits },
      { label: 'Go to', items: pages },
      { label: 'Actions', items: actions.slice(0, MAX_PER_GROUP) },
    ].filter((g) => g.items.length)
  }, [query, shipments, user, ui])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  // Typing resets the highlight — done in the change handler rather than an
  // effect, because it is a consequence of the user's action, not of state
  // needing to be synchronised with something outside React.
  const onQueryChange = (next) => {
    setQuery(next)
    setActive(0)
  }

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector('.palette-item.is-active')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const choose = (item) => {
    if (!item) return
    if (item.run) item.run()
    else if (item.to) navigate(item.to)
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % Math.max(flat.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + flat.length) % Math.max(flat.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(flat[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  let index = -1

  return createPortal(
    <div
      className="palette-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="palette-input-row">
          <Icon name="search" size={17} className="c-subtle" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search a shipment ID, vehicle, vendor or page…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={flat[active]?.id}
            aria-autocomplete="list"
          />
          <kbd>Esc</kbd>
        </div>

        <div className="palette-results" id="palette-results" role="listbox" ref={listRef} aria-label="Results">
          {flat.length === 0 ? (
            <p className="c-muted t-md" style={{ padding: '22px 14px', textAlign: 'center' }}>
              Nothing matches “{query}”.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="palette-group">{group.label}</p>
                {group.items.map((item) => {
                  index += 1
                  const i = index
                  return (
                    <button
                      key={item.id}
                      id={item.id}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={`palette-item ${i === active ? 'is-active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(item)}
                    >
                      <span className="palette-item-icon">
                        <Icon name={item.icon} size={14} />
                      </span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="row gap-8">
                          <span className={item.kind === 'shipment' || item.kind === 'vehicle' ? 'mono fw-600' : 'fw-500'}>{item.label}</span>
                          {item.status ? <StatusPill status={item.status} size="sm" /> : null}
                        </span>
                        {item.sub ? <span className="palette-item-sub truncate">{item.sub}</span> : null}
                      </span>
                      <Icon name="arrowRight" size={13} className="c-subtle" />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
