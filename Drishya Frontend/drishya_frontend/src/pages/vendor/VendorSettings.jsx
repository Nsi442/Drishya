import { useState } from 'react'
import { useAuth, useUI, useToast } from '../../store/hooks.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { updateProfile } from '../../services/authService.js'
import { setFailureRate, getFailureRate } from '../../services/client.js'
import { formatDateTime, formatRelative } from '../../lib/format.js'
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
import Icon from '../../components/ui/Icon.jsx'
import { PageHeader, Callout, DataPoint } from '../../components/ui/Misc.jsx'

const TABS = [
  { value: 'profile', label: 'Profile', icon: 'user' },
  { value: 'organisation', label: 'Organisation', icon: 'building' },
  { value: 'users', label: 'Users & roles', icon: 'users' },
  { value: 'notifications', label: 'Notifications', icon: 'bell' },
  { value: 'integrations', label: 'Integrations', icon: 'layers' },
  { value: 'api', label: 'API keys', icon: 'key' },
]

export default function VendorSettings() {
  useDocumentTitle('Settings')
  const { user, patchUser } = useAuth()
  const ui = useUI()
  const toast = useToast()

  const [tab, setTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(() => getFailureRate() > 0)

  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    title: user?.title ?? '',
  })

  const [org, setOrg] = useState({
    name: user?.orgName ?? '',
    gstin: '27AABCU9603R1ZM',
    address: 'Plot 14, MIDC Bhosari, Pune 411026, Maharashtra',
    contact: 'dispatch@anandauto.example',
    defaultFc: db.fulfilmentCentres[0].id,
    slaMinutes: '30',
  })

  const onSaveProfile = async (e) => {
    e.preventDefault()
    const next = {}
    if (!profile.name.trim()) next.name = 'Your name cannot be blank'
    if (!profile.email.trim()) next.email = 'An email address is required'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      await updateProfile(profile)
      patchUser(profile)
      toast.success('Profile saved')
    } catch (err) {
      toast.error('Could not save', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const onSaveOrg = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile({ orgName: org.name })
      patchUser({ orgName: org.name })
      toast.success('Organisation details saved')
    } catch (err) {
      toast.error('Could not save', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

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
    {
      key: 'actions',
      header: '',
      width: 80,
      render: (r) => (
        <span className="row gap-2">
          <IconButton icon="edit" label={`Edit ${r.name}`} onClick={() => toast.info('Member editing is not wired up in this build')} />
          <IconButton icon="trash" label={`Remove ${r.name}`} onClick={() => toast.warn(`${r.name} would be removed`, { description: 'Not wired up in this build.' })} />
        </span>
      ),
    },
  ]

  const notificationRows = [
    { key: 'delayEmail', label: 'Delay predicted — email', desc: 'When a shipment is predicted to miss its promised slot.' },
    { key: 'delayPush', label: 'Delay predicted — in-app', desc: 'A toast and an entry in the notification drawer.' },
    { key: 'documentEmail', label: 'Document problem — email', desc: 'A mismatch or an e-way bill expiring before its slot.' },
    { key: 'documentPush', label: 'Document problem — in-app', desc: 'Raised the moment validation fails.' },
    { key: 'arrivalPush', label: 'Gate arrival — in-app', desc: 'When a vehicle reaches the fulfilment centre gate.' },
    { key: 'dailyDigest', label: 'Daily digest', desc: 'One summary each morning at 07:00.' },
    { key: 'quietHours', label: 'Quiet hours', desc: 'Hold non-critical notifications between 21:00 and 07:00.' },
  ]

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Your account, your organisation and how Drishya connects to the rest of your systems." />

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Settings sections" className="mb-24" />

      <TabPanel value="profile" active={tab}>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card>
            <CardHeader title="Your profile" subtitle="How you appear to colleagues and to the fulfilment centres you deliver into." />
            <CardBody>
              <form id="profile-form" onSubmit={onSaveProfile} className="stack gap-16">
                <div className="row gap-16">
                  <Avatar name={profile.name} initials={user?.initials} size="xl" />
                  <div className="stack gap-4">
                    <p className="fw-600 c-strong t-lg">{profile.name}</p>
                    <p className="t-sm c-muted">{profile.title}</p>
                    <Button variant="secondary" size="sm" icon="upload" onClick={() => toast.info('Avatar upload is not wired up in this build')}>
                      Change photo
                    </Button>
                  </div>
                </div>

                <hr className="divider" />

                <div className="grid grid-2">
                  <Input label="Full name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} error={errors.name} required />
                  <Input label="Job title" value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
                  <Input label="Email address" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} error={errors.email} required leadIcon="mail" />
                  <Input label="Mobile number" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} leadIcon="phone" />
                </div>
              </form>
            </CardBody>
            <CardFooter>
              <span className="t-sm c-muted">Changes apply immediately across the platform.</span>
              <Button type="submit" form="profile-form" variant="primary" loading={saving}>
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
                id="live-updates"
                label="Live updates"
                description="Positions, ETAs and alerts refresh every few seconds. Pauses automatically when the tab is hidden."
                checked={ui.liveEnabled}
                onChange={(v) => ui.set({ liveEnabled: v })}
              />

              <Switch
                id="collapse-sidebar"
                label="Collapse the sidebar by default"
                description="More room for wide tables on smaller screens."
                checked={ui.sidebarCollapsed}
                onChange={(v) => ui.set({ sidebarCollapsed: v })}
              />
            </CardBody>
          </Card>
        </div>
      </TabPanel>

      <TabPanel value="organisation" active={tab}>
        <Card>
          <CardHeader title="Organisation" subtitle="Used on your paperwork and shared with every fulfilment centre you deliver into." />
          <CardBody>
            <form id="org-form" onSubmit={onSaveOrg} className="stack gap-16">
              <div className="grid grid-2">
                <Input label="Registered name" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} required />
                <Input label="GSTIN" value={org.gstin} onChange={(e) => setOrg({ ...org, gstin: e.target.value.toUpperCase() })} className="mono" hint="Checked against every invoice before gate-in." />
              </div>

              <Textarea label="Registered address" value={org.address} onChange={(e) => setOrg({ ...org, address: e.target.value })} rows={3} />

              <div className="grid grid-2">
                <Input label="Dispatch contact" type="email" value={org.contact} onChange={(e) => setOrg({ ...org, contact: e.target.value })} leadIcon="mail" />
                <Select
                  label="Default fulfilment centre"
                  value={org.defaultFc}
                  onChange={(e) => setOrg({ ...org, defaultFc: e.target.value })}
                  options={db.fulfilmentCentres.map((fc) => ({ value: fc.id, label: `${fc.name} — ${fc.city}` }))}
                  hint="Pre-selected when you create a shipment."
                />
              </div>

              <Select
                label="Treat a shipment as late after"
                value={org.slaMinutes}
                onChange={(e) => setOrg({ ...org, slaMinutes: e.target.value })}
                options={[
                  { value: '15', label: '15 minutes past the slot' },
                  { value: '30', label: '30 minutes past the slot' },
                  { value: '60', label: '1 hour past the slot' },
                ]}
                hint="Drives the on-time figure on your dashboard and analytics."
              />
            </form>
          </CardBody>
          <CardFooter>
            <span className="t-sm c-muted">Cluster members can see your on-time and document accuracy scores.</span>
            <Button type="submit" form="org-form" variant="primary" loading={saving}>
              Save organisation
            </Button>
          </CardFooter>
        </Card>
      </TabPanel>

      <TabPanel value="users" active={tab}>
        <Card>
          <CardHeader
            title="Users & roles"
            subtitle={`${db.orgUsers.length} members`}
            actions={
              <Button variant="primary" size="sm" icon="plus" onClick={() => toast.info('Invitations are not wired up in this build')}>
                Invite a member
              </Button>
            }
          />
          <CardBody flush>
            <Table columns={userColumns} rows={db.orgUsers} caption="Organisation members and their roles" variant="compact" />
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel value="notifications" active={tab}>
        <Card>
          <CardHeader title="Notification preferences" subtitle="Critical alerts are always delivered in-app, whatever is set here." />
          <CardBody>
            <div className="stack gap-16">
              {notificationRows.map((row) => (
                <div key={row.key} className="row between gap-16 list-row">
                  <div className="grow">
                    <p className="fw-600 c-strong t-md">{row.label}</p>
                    <p className="t-sm c-muted">{row.desc}</p>
                  </div>
                  <Switch id={`notif-${row.key}`} checked={ui.notifications[row.key]} onChange={(v) => ui.setNotificationPref({ [row.key]: v })} />
                </div>
              ))}
            </div>
          </CardBody>
          <CardFooter>
            <span className="t-sm c-muted">Preferences apply to your account only.</span>
            <Button variant="primary" onClick={() => toast.success('Notification preferences saved')}>
              Save preferences
            </Button>
          </CardFooter>
        </Card>
      </TabPanel>

      <TabPanel value="integrations" active={tab}>
        <div className="stack gap-16">
          <Callout tone="info" title="How integrations work here">
            This build ships with a local mock data layer rather than live connections. The switches below describe what
            each integration would pull, and the failure simulator lets you see how every screen behaves when a request
            fails.
          </Callout>

          <div className="grid grid-auto">
            {db.integrations.map((integration) => (
              <Card key={integration.id} padded>
                <div className="row between gap-8 mb-8">
                  <div className="row gap-10">
                    <span className="doc-icon" style={{ width: 34, height: 34 }}>
                      <Icon name="layers" size={17} />
                    </span>
                    <div>
                      <p className="fw-600 c-strong">{integration.name}</p>
                      <p className="t-xs c-muted">{integration.category}</p>
                    </div>
                  </div>
                  <Badge tone={integration.connected ? 'success' : 'neutral'}>
                    <span className="status-dot" aria-hidden="true" />
                    {integration.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                </div>

                <p className="t-sm c-muted mb-12">{integration.detail}</p>

                <div className="row between gap-8">
                  <span className="t-xs c-subtle">{integration.lastSync ? `Synced ${formatRelative(integration.lastSync)}` : 'Never synced'}</span>
                  <Button variant="secondary" size="sm" onClick={() => toast.info(`${integration.name} — not wired up in this build`)}>
                    {integration.connected ? 'Configure' : 'Connect'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Failure simulator" subtitle="Force the mock services to reject so the error states on every page can be demonstrated." />
            <CardBody>
              <Switch
                id="failure-sim"
                label="Fail roughly one request in three"
                description="Every list, chart and form will start showing its error state with a working retry."
                checked={failure}
                onChange={(v) => {
                  setFailure(v)
                  setFailureRate(v ? 0.34 : 0)
                  toast.warn(v ? 'Requests will now fail intermittently' : 'Requests restored to normal')
                }}
              />
            </CardBody>
          </Card>
        </div>
      </TabPanel>

      <TabPanel value="api" active={tab}>
        <Card>
          <CardHeader
            title="API keys"
            subtitle="Display only — key creation is not part of this build."
            actions={
              <Button variant="secondary" size="sm" icon="plus" disabled>
                Create a key
              </Button>
            }
          />
          <CardBody className="stack gap-16">
            <Callout tone="warn" title="Keys are shown once">
              A full key is displayed only at the moment it is created. What you see below is the prefix, which is all
              that is stored afterwards.
            </Callout>

            {db.apiKeys.map((key) => (
              <div key={key.id} className="row between gap-16 list-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="fw-600 c-strong t-md">{key.label}</p>
                  <p className="mono t-sm c-muted">{key.prefix}••••••••••••••••••••</p>
                  <div className="row gap-6 wrap mt-4">
                    {key.scopes.map((scope) => (
                      <Badge key={scope} tone="neutral" size="sm" square>
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="stack gap-4 shrink-0" style={{ textAlign: 'right' }}>
                  <DataPoint label="Created" value={formatDateTime(key.createdAt)} />
                  <span className="t-xs c-subtle">{key.lastUsed ? `Last used ${formatRelative(key.lastUsed)}` : 'Never used'}</span>
                </div>

                <IconButton icon="trash" label={`Revoke ${key.label}`} onClick={() => toast.warn('Key revocation is not wired up in this build')} />
              </div>
            ))}
          </CardBody>
        </Card>
      </TabPanel>
    </div>
  )
}
