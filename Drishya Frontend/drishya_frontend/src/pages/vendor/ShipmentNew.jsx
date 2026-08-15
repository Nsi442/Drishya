import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useToast } from '../../store/hooks.js'
import { ACTIONS } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useAsync from '../../hooks/useAsync.js'
import { createShipment } from '../../services/shipmentService.js'
import { checkConflict } from '../../services/appointmentService.js'
import { COMMODITIES } from '../../lib/constants.js'
import { formatCurrency, formatNumber } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input, { Textarea } from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import DatePicker from '../../components/ui/DatePicker.jsx'
import FileDrop from '../../components/ui/FileDrop.jsx'
import Checkbox from '../../components/ui/Checkbox.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { PageHeader, Callout, DataPoint } from '../../components/ui/Misc.jsx'

const STEPS = [
  { key: 'consignment', label: 'Consignment', icon: 'package' },
  { key: 'route', label: 'Pickup & destination', icon: 'pin' },
  { key: 'carrier', label: 'Carrier & vehicle', icon: 'truck' },
  { key: 'documents', label: 'Documents', icon: 'file' },
  { key: 'slot', label: 'Dock slot', icon: 'calendar' },
  { key: 'review', label: 'Review', icon: 'checkCircle' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function ShipmentNew() {
  useDocumentTitle('Create a shipment')
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const toast = useToast()

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [files, setFiles] = useState([])

  const [form, setForm] = useState({
    reference: '',
    commodity: COMMODITIES[0],
    cartons: '',
    weightKg: '',
    valueInr: '',
    priority: 'normal',
    notes: '',
    vendorId: db.vendors[0].id,
    pickupDate: todayISO(),
    pickupTime: '09:00',
    fcId: db.fulfilmentCentres[0].id,
    carrier: db.carriers[0].name,
    vehicleId: '',
    driverId: '',
    sealNumber: '',
    invoiceNo: '',
    ewayBillNo: '',
    slotDate: todayISO(),
    slotTime: '14:00',
    dockId: '',
    slotNote: '',
    confirm: false,
  })

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const vehicles = useMemo(() => db.vehicles.filter((v) => v.carrier === form.carrier), [form.carrier])
  const docks = useMemo(() => db.docks.filter((d) => d.fcId === form.fcId), [form.fcId])
  const fc = db.fulfilmentCentres.find((f) => f.id === form.fcId)
  const vendor = db.vendors.find((v) => v.id === form.vendorId)
  const vehicle = db.vehicles.find((v) => v.id === form.vehicleId)
  const driver = db.drivers.find((d) => d.id === form.driverId)

  const slotStart = useMemo(() => new Date(`${form.slotDate}T${form.slotTime}:00`), [form.slotDate, form.slotTime])
  // The clash check is a request now, so it is fetched rather than computed.
  // The API repeats the same check on the write — two vendors can be booking
  // the same bay at the same moment, and only the server sees both.
  const conflictQuery = useAsync(
    () => (form.dockId ? checkConflict(form.dockId, slotStart, 60) : Promise.resolve(null)),
    [form.dockId, slotStart.getTime()],
  )
  const conflict = conflictQuery.data

  const validate = (index) => {
    const next = {}
    if (index === 0) {
      if (!form.cartons || Number(form.cartons) <= 0) next.cartons = 'Enter how many cartons are going out'
      if (!form.weightKg || Number(form.weightKg) <= 0) next.weightKg = 'Enter the gross weight in kilograms'
      if (form.valueInr && Number(form.valueInr) < 0) next.valueInr = 'Value cannot be negative'
    }
    if (index === 1) {
      if (!form.pickupDate) next.pickupDate = 'Choose a pickup date'
      if (!form.fcId) next.fcId = 'Choose the destination fulfilment centre'
      const pickup = new Date(`${form.pickupDate}T${form.pickupTime}:00`)
      if (pickup.getTime() < Date.now() - 3600000) next.pickupDate = 'Pickup cannot be in the past'
    }
    if (index === 2) {
      if (!form.vehicleId) next.vehicleId = 'Assign a vehicle'
      if (!form.driverId) next.driverId = 'Assign a driver'
    }
    if (index === 3) {
      if (!form.invoiceNo.trim()) next.invoiceNo = 'The tax invoice number is required before gate-in'
      if (!form.ewayBillNo.trim()) next.ewayBillNo = 'The e-way bill number is required before gate-in'
      else if (!/^\d{10,15}$/.test(form.ewayBillNo.trim())) next.ewayBillNo = 'An e-way bill number is 12 digits'
    }
    if (index === 4) {
      if (!form.dockId) next.dockId = 'Choose which dock to request'
      if (conflict) next.dockId = `That window clashes with ${conflict.vendorName}. Pick another slot or dock.`
      if (slotStart.getTime() < Date.now()) next.slotTime = 'The slot must be in the future'
    }
    if (index === 5 && !form.confirm) next.confirm = 'Confirm the details are correct before booking'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const goNext = () => {
    if (!validate(step)) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const onSubmit = async () => {
    if (!validate(5)) return
    setSubmitting(true)
    try {
      const created = await createShipment({
        ...form,
        cartons: Number(form.cartons),
        weightKg: Number(form.weightKg),
        valueInr: Number(form.valueInr) || 0,
        pickupAt: new Date(`${form.pickupDate}T${form.pickupTime}:00`).toISOString(),
        slotStart: slotStart.toISOString(),
        documents: [
          { type: 'invoice', number: form.invoiceNo },
          { type: 'eway', number: form.ewayBillNo },
          ...files.map((f) => ({ type: 'lr', number: f.name, sizeKb: Math.round((f.size ?? 240000) / 1024) })),
        ],
      })
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: created })
      toast.success(`${created.id} booked`, {
        description: `Dock slot requested at ${fc.name}. You will be told the moment it is confirmed.`,
        to: `/vendor/shipments/${created.id}`,
        actionLabel: 'Open shipment',
      })
      navigate(`/vendor/shipments/${created.id}`)
    } catch (err) {
      toast.error('Could not create the shipment', { description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Create a shipment"
        subtitle="Six steps. Everything here is checked against the fulfilment centre's rules before the vehicle leaves."
        actions={
          <Button variant="ghost" to="/vendor/shipments" icon="x">
            Discard
          </Button>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card>
          <CardHeader
            title={STEPS[step].label}
            subtitle={`Step ${step + 1} of ${STEPS.length}`}
            actions={
              <div className="row gap-4">
                {STEPS.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    className="icon-btn"
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    aria-label={`${s.label}${i < step ? ' — completed' : i === step ? ' — current step' : ' — not reached'}`}
                    aria-current={i === step ? 'step' : undefined}
                    style={{
                      width: 26,
                      height: 26,
                      background: i === step ? 'var(--accent)' : i < step ? 'var(--accent-soft)' : 'var(--surface-sunken)',
                      color: i === step ? 'var(--text-on-accent)' : i < step ? 'var(--accent-text)' : 'var(--text-subtle)',
                    }}
                  >
                    {i < step ? <Icon name="check" size={13} /> : <span className="t-xs fw-700">{i + 1}</span>}
                  </button>
                ))}
              </div>
            }
          />

          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (step === STEPS.length - 1) onSubmit()
                else goNext()
              }}
              noValidate
              className="stack gap-16"
              id="shipment-form"
            >
              {step === 0 ? (
                <>
                  <Input label="Your reference" value={form.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="PO-712456" hint="Your own purchase order or dispatch number. Left blank, we generate one." className="mono" />
                  <Select label="Commodity" value={form.commodity} onChange={(e) => set({ commodity: e.target.value })} options={COMMODITIES} required />
                  <div className="grid grid-3">
                    <Input label="Cartons" type="number" min="1" value={form.cartons} onChange={(e) => set({ cartons: e.target.value })} error={errors.cartons} required placeholder="120" />
                    <Input label="Gross weight" type="number" min="1" value={form.weightKg} onChange={(e) => set({ weightKg: e.target.value })} error={errors.weightKg} required placeholder="1450" hint="kg" />
                    <Input label="Declared value" type="number" min="0" value={form.valueInr} onChange={(e) => set({ valueInr: e.target.value })} error={errors.valueInr} placeholder="284000" hint="₹" />
                  </div>
                  <Select
                    label="Priority"
                    value={form.priority}
                    onChange={(e) => set({ priority: e.target.value })}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'high', label: 'High — flag to the fulfilment centre' },
                    ]}
                    hint="High priority consignments are highlighted on the arrival board."
                  />
                  <Textarea label="Handling notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Tail-lift required — no forklift access on this vehicle." rows={3} />
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <Select label="Pickup from" value={form.vendorId} onChange={(e) => set({ vendorId: e.target.value })} options={db.vendors.map((v) => ({ value: v.id, label: `${v.name} — ${v.city}` }))} required />
                  <div className="grid grid-2">
                    <DatePicker label="Pickup date" value={form.pickupDate} onChange={(v) => set({ pickupDate: v })} min={todayISO()} error={errors.pickupDate} required />
                    <Input label="Pickup time" type="time" value={form.pickupTime} onChange={(e) => set({ pickupTime: e.target.value })} required />
                  </div>
                  <Select label="Destination fulfilment centre" value={form.fcId} onChange={(e) => set({ fcId: e.target.value, dockId: '' })} options={db.fulfilmentCentres.map((f) => ({ value: f.id, label: `${f.name} — ${f.city}` }))} error={errors.fcId} required />
                  <Callout tone="info" title="Lane">
                    {vendor.city} → {fc.city}. Recent consignments on this lane have averaged{' '}
                    {Math.round(
                      db.shipments.filter((s) => s.lane === `${vendor.city} → ${fc.city}`).reduce((sum, s) => sum + s.distanceKm, 0) /
                        Math.max(1, db.shipments.filter((s) => s.lane === `${vendor.city} → ${fc.city}`).length),
                    ) || '—'}{' '}
                    km.
                  </Callout>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Select label="Carrier" value={form.carrier} onChange={(e) => set({ carrier: e.target.value, vehicleId: '' })} options={db.carriers.map((c) => ({ value: c.name, label: `${c.name} — ${c.onTimePct}% on time` }))} required />
                  <Select
                    label="Vehicle"
                    value={form.vehicleId}
                    onChange={(e) => set({ vehicleId: e.target.value })}
                    placeholder="Choose a vehicle"
                    options={vehicles.map((v) => ({ value: v.id, label: `${v.regNumber} — ${v.type} (${v.capacityKg} kg)` }))}
                    error={errors.vehicleId}
                    required
                  />
                  {vehicle && form.weightKg && Number(form.weightKg) > vehicle.capacityKg ? (
                    <Callout tone="warn" title="Over capacity">
                      {formatNumber(Number(form.weightKg))} kg exceeds the {formatNumber(vehicle.capacityKg)} kg rating of this vehicle. Split the load or pick a larger one.
                    </Callout>
                  ) : null}
                  <Select
                    label="Driver"
                    value={form.driverId}
                    onChange={(e) => set({ driverId: e.target.value })}
                    placeholder="Choose a driver"
                    options={db.drivers.filter((d) => d.available).map((d) => ({ value: d.id, label: `${d.name} — ${d.rating}★, ${d.tripsCompleted} trips` }))}
                    error={errors.driverId}
                    required
                    hint="Only drivers currently marked available are listed."
                  />
                  <Input label="Seal number" value={form.sealNumber} onChange={(e) => set({ sealNumber: e.target.value })} placeholder="SL-482910" className="mono" hint="Applied at loading and verified at the gate. Left blank, one is issued." />
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <div className="grid grid-2">
                    <Input label="Tax invoice number" value={form.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} error={errors.invoiceNo} required placeholder="INV/26-27/4288" className="mono" />
                    <Input label="E-way bill number" value={form.ewayBillNo} onChange={(e) => set({ ewayBillNo: e.target.value })} error={errors.ewayBillNo} required placeholder="371234567890" className="mono" hint="12 digits" />
                  </div>
                  <FileDrop label="Supporting documents" files={files} onChange={setFiles} hint="LR copy, packing list, GST declaration. Validated against the invoice before gate-in." />
                  <Callout tone="info" title="What gets checked">
                    E-way bill validity against the requested dock slot, consignee GSTIN against {fc.name}, and the
                    carton count against the advance shipping notice. Anything that fails is flagged here, not at the gate.
                  </Callout>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <div className="grid grid-2">
                    <DatePicker label="Requested slot date" value={form.slotDate} onChange={(v) => set({ slotDate: v })} min={todayISO()} required />
                    <Input label="Slot start" type="time" value={form.slotTime} onChange={(e) => set({ slotTime: e.target.value })} error={errors.slotTime} required hint="One-hour window" />
                  </div>
                  <Select
                    label="Preferred dock"
                    value={form.dockId}
                    onChange={(e) => set({ dockId: e.target.value })}
                    placeholder="Choose a dock"
                    options={docks.map((d) => ({ value: d.id, label: `${d.name} — ${d.type}, up to ${d.maxVehicleLengthFt} ft` }))}
                    error={errors.dockId}
                    required
                  />
                  {conflict ? (
                    <Callout tone="warn" title="That window is already taken">
                      {conflict.vendorName} holds {new Date(conflict.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} on this dock. Choose another time or dock — the request will be rejected otherwise.
                    </Callout>
                  ) : form.dockId ? (
                    <Callout tone="success" title="That window is free">
                      No clash on {docks.find((d) => d.id === form.dockId)?.name}. The fulfilment centre still has to confirm the booking.
                    </Callout>
                  ) : null}
                  <Textarea label="Note to the fulfilment centre" value={form.slotNote} onChange={(e) => set({ slotNote: e.target.value })} rows={3} placeholder="Driver will need a tail-lift; no forklift on this vehicle." />
                </>
              ) : null}

              {step === 5 ? (
                <div className="stack gap-16">
                  <div className="grid grid-2">
                    <DataPoint label="Reference" value={form.reference || 'Auto-generated'} />
                    <DataPoint label="Commodity" value={form.commodity} />
                    <DataPoint label="Cartons" value={formatNumber(Number(form.cartons))} />
                    <DataPoint label="Gross weight" value={`${formatNumber(Number(form.weightKg))} kg`} />
                    <DataPoint label="Declared value" value={form.valueInr ? formatCurrency(Number(form.valueInr)) : '—'} />
                    <DataPoint label="Priority" value={form.priority === 'high' ? 'High' : 'Normal'} />
                  </div>
                  <hr className="divider" />
                  <div className="grid grid-2">
                    <DataPoint label="Pickup" value={`${vendor.name}, ${vendor.city}`} />
                    <DataPoint label="Destination" value={`${fc.name}, ${fc.city}`} />
                    <DataPoint label="Vehicle" value={vehicle ? `${vehicle.regNumber} — ${vehicle.type}` : '—'} />
                    <DataPoint label="Driver" value={driver?.name ?? '—'} />
                    <DataPoint label="Invoice" value={form.invoiceNo} mono />
                    <DataPoint label="E-way bill" value={form.ewayBillNo} mono />
                    <DataPoint label="Requested slot" value={slotStart.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />
                    <DataPoint label="Dock" value={docks.find((d) => d.id === form.dockId)?.name ?? '—'} />
                  </div>

                  <div>
                    <Checkbox
                      label="These details are correct"
                      description="The invoice and e-way bill will be validated against this consignment immediately."
                      checked={form.confirm}
                      onChange={(v) => set({ confirm: v })}
                    />
                    {errors.confirm ? (
                      <span className="field-error mt-4">
                        <Icon name="alertCircle" size={13} />
                        {errors.confirm}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </form>
          </CardBody>

          <CardFooter>
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting} icon="arrowLeft">
              Back
            </Button>
            <Button type="submit" form="shipment-form" variant="primary" loading={submitting} iconRight={step === STEPS.length - 1 ? undefined : 'arrowRight'}>
              {step === STEPS.length - 1 ? (submitting ? 'Booking…' : 'Book shipment') : 'Continue'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader title="Summary" subtitle="Updates as you fill the form" />
          <CardBody className="stack gap-12">
            <DataPoint label="Lane" value={`${vendor.city} → ${fc.city}`} />
            <DataPoint label="Cartons" value={form.cartons ? formatNumber(Number(form.cartons)) : '—'} />
            <DataPoint label="Weight" value={form.weightKg ? `${formatNumber(Number(form.weightKg))} kg` : '—'} />
            <DataPoint label="Carrier" value={form.carrier} />
            <DataPoint label="Vehicle" value={vehicle?.regNumber ?? 'Not assigned'} mono />
            <DataPoint label="Driver" value={driver?.name ?? 'Not assigned'} />
            <hr className="divider" />
            <DataPoint label="Documents attached" value={`${(form.invoiceNo ? 1 : 0) + (form.ewayBillNo ? 1 : 0) + files.length}`} />
            <DataPoint label="Requested slot" value={form.dockId ? slotStart.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not requested'} />

            <Callout tone="neutral" icon="info">
              A booked shipment stays editable until the driver marks it loaded. After that, changes have to go through
              the fulfilment centre.
            </Callout>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
