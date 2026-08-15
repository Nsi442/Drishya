import { useState, useMemo } from 'react'
import { useAuth, useUI, useToast } from '../../store/hooks.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { DETENTION_AMBER_MIN, DETENTION_RED_MIN } from '../../lib/constants.js'
import { formatRelative } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx'
import Tabs, { TabPanel, SegmentedControl } from '../../components/ui/Tabs.jsx'
import Button, { IconButton } from '../../components/ui/Button.jsx'
import Input, { Textarea } from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import { Switch } from '../../components/ui/Checkbox.jsx'
import Table from '../../components/ui/Table.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import Modal from '../../components/ui/Modal.jsx'
import { PageHeader, Callout, DataPoint } from '../../components/ui/Misc.jsx'

const TABS = [
  { value: 'profile', label: 'FC profile', icon: 'building' },
  { value: 'docks', label: 'Dock configuration', icon: 'dock' },
  { value: 'hours', label: 'Operating hours', icon: 'clock' },
  { value: 'sla', label: 'SLA thresholds', icon: 'gauge' },
  { value: 'users', label: 'Users', icon: 'users' },
  { value: 'rules', label: 'Notification rules', icon: 'bell' },
]

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function FCSettings() {
  useDocumentTitle('Settings')
  const { user, patchUser } = useAuth()
  const ui = useUI()
  const toast = useToast()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const [tab, setTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [editingDock, setEditingDock] = useState(null)

  const fc = useMemo(() => db.fulfilmentCentres.find((f) => f.id === fcId), [fcId])
  const [docks, setDocks] = useState(() => db.docks.filter((d) => d.fcId === fcId))

  const [profile, setProfile] = useState({
    name: fc?.name ?? '',
    code: fcId.toUpperCase().replace('FC-', 'FC'),
    address: 'Survey 44/2, Kalyan–Bhiwandi Road, Bhiwandi 421302, Maharashtra',
    contact: 'inbound@fcbhiwandi.example',
    phone: '+91 99300 22114',
  })

  const [hours, setHours] = useState(() =>
    WEEKDAYS.map((day) => ({ day, open: day === 'Sunday' ? '' : '06:00', close: day === 'Sunday' ? '' : day === 'Saturday' ? '18:00' : '22:00', closed: day === 'Sunday' })),
  )

  const [sla, setSla] = useState({
    lateAfterMin: '15',
    detentionAmber: String(DETENTION_AMBER_MIN),
    detentionRed: String(DETENTION_RED_MIN),
    unloadTargetMin: '45',
    autoRelease: true,
    autoReleaseAfterMin: '45',
    requireASN: true,
    blockOnDocMismatch: true,
  })

  const [rules, setRules] = useState({
    lateArrival: true,
    docMismatch: true,
    detention: true,
    unscheduled: true,
    shortage: true,
    dailyDigest: false,
  })

  const save = async (label) => {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 420))
    if (label === 'profile') patchUser({ orgName: profile.name })
    setSaving(false)
    toast.success(`${label === 'profile' ? 'Centre profile' : label} saved`)
  }

  const dockColumns = [
    { key: 'name', header: 'Dock', width: 120, render: (r) => <span className="fw-600 c-strong">{r.name}</span> },
    {
      key: 'type',
      header: 'Type',
      width: 140,
      render: (r) => <Badge tone={r.type === 'container' ? 'violet' : 'neutral'} size="sm">{r.type}</Badge>,
    },
    { key: 'maxVehicleLengthFt', header: 'Max vehicle', width: 130, align: 'right', render: (r) => `${r.maxVehicleLengthFt} ft` },
    {
      key: 'active',
      header: 'In service',
      width: 130,
      render: (r) => (
        <Switch
          id={`dock-${r.id}`}
          checked={r.active}
          onChange={(v) => {
            setDocks((prev) => prev.map((d) => (d.id === r.id ? { ...d, active: v } : d)))
            toast.info(`${r.name} marked ${v ? 'in service' : 'out of service'}`, {
              description: v ? undefined : 'Existing bookings on this bay need moving.',
            })
          }}
          label={r.active ? 'Yes' : 'No'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 70,
      render: (r) => <IconButton icon="edit" label={`Edit ${r.name}`} onClick={() => setEditingDock(r)} />,
    },
  ]

  const userColumns = [
    {
      key: 'name',
      header: 'Member',
      width: 230,
      render: (r) => (
        <span className="row gap-10">
          <Avatar name={r.name} size="sm" />
          <span className="stack">
            <span className="fw-600 c-strong">{r.name}</span>
            <span className="t-xs c-muted">{r.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', width: 150, render: (r) => <Badge tone="neutral">{r.role}</Badge> },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: (r) => (
        <Badge tone={r.status === 'active' ? 'success' : r.status === 'invited' ? 'warn' : 'neutral'}>
          <span className="status-dot" aria-hidden="true" />
          {r.status}
        </Badge>
      ),
    },
    { key: 'lastActive', header: 'Last active', width: 150, render: (r) => <span className="t-sm c-muted">{r.lastActive ? formatRelative(r.lastActive) : 'Never'}</span> },
  ]

  const ruleRows = [
    { key: 'lateArrival', label: 'Late arrival predicted', desc: `Raised when a vehicle is predicted more than ${sla.lateAfterMin} minutes past its slot.` },
    { key: 'docMismatch', label: 'Document mismatch', desc: 'Raised the moment validation fails against the booking.' },
    { key: 'detention', label: 'Detention threshold crossed', desc: `Raised at ${sla.detentionAmber} minutes on site.` },
    { key: 'unscheduled', label: 'Unscheduled arrival', desc: 'A vehicle turning up without a confirmed dock booking.' },
    { key: 'shortage', label: 'Quantity shortage at receiving', desc: 'Raised automatically when the count is short against the ASN.' },
    { key: 'dailyDigest', label: 'Daily inbound digest', desc: 'One summary each morning at 06:00.' },
  ]

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="How this fulfilment centre runs its docks, its hours and its rules." />

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Settings sections" className="mb-24" />

      <TabPanel value="profile" active={tab}>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card>
            <CardHeader title="Centre profile" subtitle="What vendors see when they book into this site." />
            <CardBody className="stack gap-16">
              <div className="grid grid-2">
                <Input label="Centre name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
                <Input label="Centre code" value={profile.code} onChange={(e) => setProfile({ ...profile, code: e.target.value.toUpperCase() })} className="mono" />
              </div>
              <Textarea label="Address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} rows={3} />
              <div className="grid grid-2">
                <Input label="Inbound contact" type="email" value={profile.contact} onChange={(e) => setProfile({ ...profile, contact: e.target.value })} leadIcon="mail" />
                <Input label="Gate telephone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} leadIcon="phone" />
              </div>
            </CardBody>
            <CardFooter>
              <span className="t-sm c-muted">Shared with every vendor in the cluster.</span>
              <Button variant="primary" loading={saving} onClick={() => save('profile')}>
                Save profile
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader title="Appearance" />
            <CardBody className="stack gap-16">
              <div>
                <p className="field-label mb-8">Theme</p>
                <SegmentedControl
                  label="Theme"
                  value={ui.theme}
                  onChange={(v) => ui.set({ theme: v })}
                  options={[
                    { value: 'light', label: 'Light', icon: 'sun' },
                    { value: 'dark', label: 'Dark', icon: 'moon' },
                  ]}
                />
              </div>
              <Switch
                id="fc-live"
                label="Live updates"
                description="The arrival board refreshes itself every few seconds."
                checked={ui.liveEnabled}
                onChange={(v) => ui.set({ liveEnabled: v })}
              />
              <DataPoint label="Docks configured" value={docks.length} />
              <DataPoint label="Vendors delivering here" value={db.vendors.length} />
            </CardBody>
          </Card>
        </div>
      </TabPanel>

      <TabPanel value="docks" active={tab}>
        <Card>
          <CardHeader
            title="Dock configuration"
            subtitle={`${docks.filter((d) => d.active).length} of ${docks.length} bays in service`}
            actions={
              <Button variant="primary" size="sm" icon="plus" onClick={() => toast.info('Adding docks is not wired up in this build')}>
                Add a dock
              </Button>
            }
          />
          <CardBody flush>
            <Table columns={dockColumns} rows={docks} caption="Docks at this fulfilment centre" variant="compact" />
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel value="hours" active={tab}>
        <Card>
          <CardHeader title="Operating hours" subtitle="Vendors cannot request a slot outside these windows." />
          <CardBody className="stack gap-12">
            {hours.map((row, i) => (
              <div key={row.day} className="row gap-16 between wrap list-row">
                <span className="fw-600 c-strong" style={{ minWidth: 110 }}>
                  {row.day}
                </span>

                <Switch
                  id={`open-${row.day}`}
                  checked={!row.closed}
                  onChange={(v) => setHours((prev) => prev.map((h, idx) => (idx === i ? { ...h, closed: !v } : h)))}
                  label={row.closed ? 'Closed' : 'Open'}
                />

                {!row.closed ? (
                  <div className="row gap-8">
                    <Input label={null} type="time" value={row.open} onChange={(e) => setHours((prev) => prev.map((h, idx) => (idx === i ? { ...h, open: e.target.value } : h)))} aria-label={`${row.day} opening time`} />
                    <span className="c-muted">to</span>
                    <Input label={null} type="time" value={row.close} onChange={(e) => setHours((prev) => prev.map((h, idx) => (idx === i ? { ...h, close: e.target.value } : h)))} aria-label={`${row.day} closing time`} />
                  </div>
                ) : (
                  <span className="t-sm c-muted">No inbound accepted</span>
                )}
              </div>
            ))}
          </CardBody>
          <CardFooter>
            <span className="t-sm c-muted">Changing these does not move bookings that already exist.</span>
            <Button variant="primary" loading={saving} onClick={() => save('Operating hours')}>
              Save hours
            </Button>
          </CardFooter>
        </Card>
      </TabPanel>

      <TabPanel value="sla" active={tab}>
        <div className="stack gap-16">
          <Callout tone="info" title="These thresholds drive the whole product">
            Every "late" badge, every detention timer and every automatic exception is measured against the numbers on
            this page.
          </Callout>

          <Card>
            <CardHeader title="Arrival and detention" />
            <CardBody className="stack gap-16">
              <div className="grid grid-2">
                <Select
                  label="Treat an arrival as late after"
                  value={sla.lateAfterMin}
                  onChange={(e) => setSla({ ...sla, lateAfterMin: e.target.value })}
                  options={[
                    { value: '0', label: 'Any minute past the slot' },
                    { value: '15', label: '15 minutes' },
                    { value: '30', label: '30 minutes' },
                    { value: '60', label: '1 hour' },
                  ]}
                />
                <Input label="Target unload time" type="number" value={sla.unloadTargetMin} onChange={(e) => setSla({ ...sla, unloadTargetMin: e.target.value })} hint="minutes at the bay" />
                <Input label="Detention warning at" type="number" value={sla.detentionAmber} onChange={(e) => setSla({ ...sla, detentionAmber: e.target.value })} hint="minutes on site — the timer turns amber" />
                <Input label="Detention charged at" type="number" value={sla.detentionRed} onChange={(e) => setSla({ ...sla, detentionRed: e.target.value })} hint="minutes on site — the timer turns red" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Slot policy" subtitle="What the platform does on this site's behalf" />
            <CardBody className="stack gap-16">
              <Switch
                id="auto-release"
                label="Release a slot when its vehicle is predicted to miss it"
                description="The freed window is offered to other vendors in the cluster instead of standing empty. This is the capability a single vendor cannot build alone."
                checked={sla.autoRelease}
                onChange={(v) => setSla({ ...sla, autoRelease: v })}
              />

              {sla.autoRelease ? (
                <Input
                  label="Release after the vehicle is predicted this late"
                  type="number"
                  value={sla.autoReleaseAfterMin}
                  onChange={(e) => setSla({ ...sla, autoReleaseAfterMin: e.target.value })}
                  hint="minutes"
                />
              ) : null}

              <Switch
                id="require-asn"
                label="Require an advance shipping notice"
                description="Consignments without an ASN cannot request a dock slot."
                checked={sla.requireASN}
                onChange={(v) => setSla({ ...sla, requireASN: v })}
              />

              <Switch
                id="block-doc"
                label="Block gate-in on a document mismatch"
                description="A vehicle whose paperwork fails validation is held at the gate rather than sent to a bay."
                checked={sla.blockOnDocMismatch}
                onChange={(v) => setSla({ ...sla, blockOnDocMismatch: v })}
              />
            </CardBody>
            <CardFooter>
              <span className="t-sm c-muted">Applies to every vendor delivering into this centre.</span>
              <Button variant="primary" loading={saving} onClick={() => save('SLA thresholds')}>
                Save thresholds
              </Button>
            </CardFooter>
          </Card>
        </div>
      </TabPanel>

      <TabPanel value="users" active={tab}>
        <Card>
          <CardHeader
            title="Users"
            subtitle={`${db.orgUsers.length} members with access to this centre`}
            actions={
              <Button variant="primary" size="sm" icon="plus" onClick={() => toast.info('Invitations are not wired up in this build')}>
                Invite
              </Button>
            }
          />
          <CardBody flush>
            <Table columns={userColumns} rows={db.orgUsers} caption="Fulfilment centre users" variant="compact" />
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel value="rules" active={tab}>
        <Card>
          <CardHeader title="Notification rules" subtitle="Which events raise an exception and tell the inbound desk." />
          <CardBody className="stack gap-16">
            {ruleRows.map((rule) => (
              <div key={rule.key} className="row between gap-16 list-row">
                <div className="grow">
                  <p className="fw-600 c-strong t-md">{rule.label}</p>
                  <p className="t-sm c-muted">{rule.desc}</p>
                </div>
                <Switch id={`rule-${rule.key}`} checked={rules[rule.key]} onChange={(v) => setRules({ ...rules, [rule.key]: v })} />
              </div>
            ))}
          </CardBody>
          <CardFooter>
            <span className="t-sm c-muted">Turning a rule off stops the exception being raised at all.</span>
            <Button variant="primary" loading={saving} onClick={() => save('Notification rules')}>
              Save rules
            </Button>
          </CardFooter>
        </Card>
      </TabPanel>

      <Modal
        open={Boolean(editingDock)}
        onClose={() => setEditingDock(null)}
        title={editingDock ? `Edit ${editingDock.name}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingDock(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setDocks((prev) => prev.map((d) => (d.id === editingDock.id ? editingDock : d)))
                toast.success(`${editingDock.name} updated`)
                setEditingDock(null)
              }}
            >
              Save dock
            </Button>
          </>
        }
      >
        {editingDock ? (
          <div className="stack gap-16">
            <Input label="Dock name" value={editingDock.name} onChange={(e) => setEditingDock({ ...editingDock, name: e.target.value })} required />
            <Select
              label="Type"
              value={editingDock.type}
              onChange={(e) => setEditingDock({ ...editingDock, type: e.target.value })}
              options={[
                { value: 'standard', label: 'Standard — trucks' },
                { value: 'container', label: 'Container — 40 ft capable' },
              ]}
            />
            <Input
              label="Maximum vehicle length"
              type="number"
              value={editingDock.maxVehicleLengthFt}
              onChange={(e) => setEditingDock({ ...editingDock, maxVehicleLengthFt: Number(e.target.value) })}
              hint="feet"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
