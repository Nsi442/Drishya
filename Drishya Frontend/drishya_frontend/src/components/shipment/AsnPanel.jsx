import { useState } from 'react'
import { trips as tripService } from '../../services/index.js'
import { Button, Card, CardBody, CardHeader, Input } from '../ui/index.js'
import './shipment.css'

/**
 * The advance shipping notice, validated before the vehicle is allowed to leave.
 *
 * The point of this panel is the timing. Every field here could be checked at
 * the fulfilment centre gate instead — and that is exactly what happens today,
 * four hours down the road, with the vehicle turned away and the error surfacing
 * weeks later as a chargeback on a payment statement. Checking it at the origin
 * warehouse costs a re-count and a re-print.
 *
 * So the failures are rendered in full, per field, with what was expected and
 * what was submitted. A red "invalid" banner would be technically accurate and
 * practically useless.
 */
export default function AsnPanel({ shipment, onValidated }) {
  const [form, setForm] = useState(() => ({
    poReference: shipment.reference ?? '',
    declaredCartons: shipment.cartons ?? '',
    declaredWeightKg: shipment.weightKg ?? '',
    invoiceNumber: shipment.invoiceNo ?? '',
    ewayBillNumber: shipment.ewayBillNo ?? '',
    sealNumber: shipment.sealNumber ?? '',
    ewayBillExpiresAt: '',
  }))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function payload() {
    return {
      poReference: form.poReference.trim(),
      declaredCartons: form.declaredCartons === '' ? null : Number(form.declaredCartons),
      declaredWeightKg: form.declaredWeightKg === '' ? null : Number(form.declaredWeightKg),
      invoiceNumber: form.invoiceNumber.trim(),
      ewayBillNumber: form.ewayBillNumber.trim(),
      sealNumber: form.sealNumber.trim(),
      // The picker gives a local datetime; the API takes epoch millis like
      // every other timestamp in this system.
      ewayBillExpiresAt: form.ewayBillExpiresAt
        ? new Date(form.ewayBillExpiresAt).getTime()
        : null,
      lines: null,
    }
  }

  async function run(mode) {
    setBusy(mode)
    setError(null)
    try {
      const call = mode === 'submit' ? tripService.submitAsn : tripService.checkAsn
      const res = await call(shipment.id, payload())
      setResult(res)
      // Only a real submission changes anything, so only that refreshes the
      // page around it.
      if (mode === 'submit' && onValidated) onValidated(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const blocking = (result?.failures ?? []).filter((f) => f.severity === 'BLOCKING')
  const advisory = (result?.failures ?? []).filter((f) => f.severity === 'ADVISORY')

  return (
    <Card>
      <CardHeader
        title="Advance shipping notice"
        subtitle="Checked before dispatch, so a paperwork error costs a re-print rather than a refused delivery."
      />
      <CardBody>
        <div className="asn-grid">
          {/* Input wraps Field itself and wires label-to-input via useId, so the
              label goes here rather than on an outer Field. Nesting the two
              produced an outer <label htmlFor> pointing at an id no input had —
              the fields were unlabelled for a screen reader, and clicking a
              label focused nothing. */}
          <Input label="Purchase order" hint="As booked, e.g. PO-123456"
                 value={form.poReference} onChange={set('poReference')} />
          <Input label="Cartons" type="number"
                 value={form.declaredCartons} onChange={set('declaredCartons')} />
          <Input label="Weight (kg)" type="number"
                 value={form.declaredWeightKg} onChange={set('declaredWeightKg')} />
          <Input label="Tax invoice"
                 value={form.invoiceNumber} onChange={set('invoiceNumber')} />
          <Input label="E-way bill" hint="12 digits"
                 value={form.ewayBillNumber} onChange={set('ewayBillNumber')} />
          <Input label="Seal number"
                 value={form.sealNumber} onChange={set('sealNumber')} />
          <Input label="E-way bill expires" type="datetime-local"
                 hint="Checked against predicted arrival, not departure"
                 value={form.ewayBillExpiresAt} onChange={set('ewayBillExpiresAt')} />
      </div>

      <div className="asn-actions">
        <Button variant="secondary" loading={busy === 'check'} onClick={() => run('check')}>
          Check without submitting
        </Button>
        <Button variant="primary" loading={busy === 'submit'} onClick={() => run('submit')}>
          Submit notice
        </Button>
      </div>

      {error && <p className="asn-error">{error}</p>}

      {result && (
        <div className="asn-result">
          <p className={result.dispatchAllowed ? 'asn-verdict ok' : 'asn-verdict blocked'}>
            {result.dispatchAllowed
              ? `Cleared for dispatch. ${result.checksRun} checks passed.`
              : `Dispatch blocked — ${blocking.length} ${
                  blocking.length === 1 ? 'issue' : 'issues'
                } to resolve before this consignment can leave.`}
          </p>

          {/* Blocking first, then advisory. A vendor scanning this needs to know
              what stops the vehicle before what merely concerns it. */}
          {blocking.length > 0 && <FailureList failures={blocking} tone="blocked" />}
          {advisory.length > 0 && (
            <>
              <p className="asn-subhead">Worth checking, but not blocking</p>
              <FailureList failures={advisory} tone="advisory" />
            </>
          )}
        </div>
        )}
      </CardBody>
    </Card>
  )
}

/**
 * Expected and actual side by side.
 *
 * The comparison is the useful part: "carton count does not match" sends a
 * vendor to go and look something up, whereas "expected 305, you sent 50" is
 * immediately actionable.
 */
function FailureList({ failures, tone }) {
  return (
    <ul className={`asn-failures ${tone}`}>
      {failures.map((f) => (
        <li key={`${f.code}-${f.field}`}>
          <span className="asn-field">{f.field}</span>
          <span className="asn-message">{f.message}</span>
          <span className="asn-compare">
            expected <code>{f.expected}</code> · submitted <code>{f.actual}</code>
          </span>
        </li>
      ))}
    </ul>
  )
}
