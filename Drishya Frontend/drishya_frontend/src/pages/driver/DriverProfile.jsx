import { useMemo, useState } from 'react'
import { useAppState, useAuth, useUI, useToast } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import { useDriverQueue } from '../../components/layout/driverContext.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { setDriverAvailability } from '../../services/fleetService.js'
import { formatDate, formatNumber } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { Switch } from '../../components/ui/Checkbox.jsx'
import { SegmentedControl } from '../../components/ui/Tabs.jsx'
import { ConfirmModal } from '../../components/ui/Modal.jsx'
import { DataPoint, Callout } from '../../components/ui/Misc.jsx'
import './driver.css'

// The driver shell is bilingual. Only the shell strings are switched — the
// consignment data itself stays as it was entered.
const STRINGS = {
  en: {
    availability: 'Available for new trips',
    availabilityDesc: 'Dispatch can assign you a load while this is on.',
    language: 'Language',
    licence: 'Licence',
    vehicle: 'Assigned vehicle',
    record: 'Your record',
    sync: 'Pending sync',
    signOut: 'Sign out',
    theme: 'Appearance',
  },
  hi: {
    availability: 'नई ट्रिप के लिए उपलब्ध',
    availabilityDesc: 'यह चालू रहने पर डिस्पैच आपको लोड दे सकता है।',
    language: 'भाषा',
    licence: 'लाइसेंस',
    vehicle: 'निर्धारित वाहन',
    record: 'आपका रिकॉर्ड',
    sync: 'सिंक बाकी',
    signOut: 'साइन आउट',
    theme: 'रंग-रूप',
  },
}

const DAY = 86400000

export default function DriverProfile() {
  useDocumentTitle('Profile')
  const state = useAppState()
  const { user, logout } = useAuth()
  const ui = useUI()
  const toast = useToast()
  const queue = useDriverQueue()

  const [confirmOut, setConfirmOut] = useState(false)

  // Licence countdown reads a clock held in state, not Date.now() at render.
  const now = useNow(600000)
  const t = STRINGS[ui.language] ?? STRINGS.en

  const driver = useMemo(() => db.drivers.find((d) => d.id === (user?.driverId ?? 'driver-1')), [user])
  const [available, setAvailable] = useState(driver?.available ?? true)

  const shipments = selectShipments(state)
  const record = useMemo(() => {
    const mine = shipments.filter((s) => s.driverId === driver?.id)
    const delivered = mine.filter((s) => s.status === 'delivered')
    const onTime = delivered.filter((s) => s.delayMin <= 15)
    return {
      delivered: delivered.length,
      onTimePct: delivered.length ? Math.round((onTime.length / delivered.length) * 100) : 0,
      km: delivered.reduce((sum, s) => sum + s.distanceKm, 0),
    }
  }, [shipments, driver])

  const vehicle = useMemo(() => db.vehicles.find((v) => v.id === driver?.vehicleId), [driver])
  const licenceDays = driver ? Math.round((new Date(driver.licenceExpiry).getTime() - now) / DAY) : 0

  const onToggleAvailability = async (next) => {
    setAvailable(next)
    try {
      await setDriverAvailability(driver.id, next)
      toast.info(next ? 'You are available for new trips' : 'You are marked unavailable')
    } catch (err) {
      setAvailable(!next)
      toast.error('Could not update', { description: err.message })
    }
  }

  if (!driver) {
    return <Callout tone="danger">No driver record is linked to this account.</Callout>
  }

  return (
    <div className="stack gap-16">
      <Card padded>
        <div className="row gap-14">
          <Avatar name={driver.name} size="xl" />
          <div className="grow" style={{ minWidth: 0 }}>
            <p className="t-lg fw-600 c-strong">{driver.name}</p>
            <p className="t-sm c-muted">{user?.orgName}</p>
            <div className="row gap-6 mt-4">
              <Badge tone="warn" size="sm" icon="star">
                {driver.rating.toFixed(1)}
              </Badge>
              <Badge tone="neutral" size="sm">
                {formatNumber(driver.tripsCompleted)} trips
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <Switch
            id="driver-available"
            label={t.availability}
            description={t.availabilityDesc}
            checked={available}
            onChange={onToggleAvailability}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={t.record} />
        <CardBody>
          <div className="grid grid-3 gap-12">
            <DataPoint label="Delivered" value={formatNumber(record.delivered)} />
            <DataPoint label="On time" value={`${record.onTimePct}%`} />
            <DataPoint label="Distance" value={`${formatNumber(record.km)} km`} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t.licence} />
        <CardBody className="stack gap-12">
          <div className="grid grid-2 gap-12">
            <DataPoint label="Number" value={`MH-14 ${driver.id.replace('driver-', '20260')}`} mono />
            <DataPoint label="Expires" value={formatDate(driver.licenceExpiry)} />
          </div>

          {licenceDays < 90 ? (
            <Callout tone="warn" title="Renewal due">
              Your licence expires in {licenceDays} days. Dispatch cannot assign you trips past that date.
            </Callout>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t.vehicle} />
        <CardBody>
          <div className="grid grid-2 gap-12">
            <DataPoint label="Registration" value={vehicle?.regNumber ?? '—'} mono />
            <DataPoint label="Type" value={vehicle?.type ?? '—'} />
            <DataPoint label="Capacity" value={vehicle ? `${formatNumber(vehicle.capacityKg)} kg` : '—'} />
            <DataPoint label="Carrier" value={vehicle?.carrier ?? '—'} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t.language} />
        <CardBody className="stack gap-16">
          <SegmentedControl
            label={t.language}
            value={ui.language}
            onChange={(v) => {
              ui.set({ language: v })
              toast.info(v === 'hi' ? 'भाषा हिंदी में बदल दी गई' : 'Language set to English')
            }}
            options={[
              { value: 'en', label: 'English' },
              { value: 'hi', label: 'हिंदी' },
            ]}
          />

          <div>
            <p className="field-label mb-8">{t.theme}</p>
            <SegmentedControl
              label={t.theme}
              value={ui.theme}
              onChange={(v) => ui.set({ theme: v })}
              options={[
                { value: 'light', label: 'Light', icon: 'sun' },
                { value: 'dark', label: 'Dark', icon: 'moon' },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t.sync} />
        <CardBody className="stack gap-12">
          <div className="row between gap-8">
            <span className="row gap-8 t-md">
              <Icon name={queue.online ? 'wifi' : 'wifiOff'} size={16} className={queue.online ? 'c-success' : 'c-warn'} />
              {queue.online ? 'Online' : 'Offline'}
            </span>
            <Badge tone={queue.pending ? 'warn' : 'success'}>
              {queue.pending ? `${queue.pending} waiting` : 'Everything synced'}
            </Badge>
          </div>

          {queue.pending ? (
            <>
              <ul className="stack gap-6">
                {queue.queue.map((item) => (
                  <li key={item.id} className="row gap-8 t-sm c-muted">
                    <Icon name="clock" size={13} />
                    {item.label}
                  </li>
                ))}
              </ul>
              <Button variant="secondary" block icon="refresh" onClick={queue.drain} loading={queue.syncing} disabled={!queue.online}>
                Sync now
              </Button>
            </>
          ) : null}
        </CardBody>
      </Card>

      <Button variant="danger-soft" size="lg" block icon="logout" onClick={() => setConfirmOut(true)}>
        {t.signOut}
      </Button>

      <ConfirmModal
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={logout}
        tone="danger"
        confirmLabel={t.signOut}
        title="Sign out?"
        description={
          queue.pending
            ? `You have ${queue.pending} captures waiting to sync. Signing out now will lose them.`
            : 'You will need to sign in again to see your trips.'
        }
      />
    </div>
  )
}
