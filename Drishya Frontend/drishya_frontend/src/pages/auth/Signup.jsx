import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell.jsx'
import Input, { PasswordInput } from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import Button from '../../components/ui/Button.jsx'
import Checkbox from '../../components/ui/Checkbox.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { Callout } from '../../components/ui/Misc.jsx'
import { useDispatch } from '../../store/hooks.js'
import { ACTIONS } from '../../store/reducer.js'
import { signup } from '../../services/authService.js'
import { isValidEmail, passwordStrength } from '../../lib/validators.js'
import { ROLE_HOME, SIGNUP_FC_OPTIONS } from '../../lib/constants.js'

import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import './auth.css'

const STEPS = ['Account', 'Organisation type', 'Details', 'Done']

const ORG_TYPES = [
  { value: 'vendor', icon: 'package', title: 'Vendor', desc: 'You dispatch goods into marketplace fulfilment centres.' },
  { value: 'carrier', icon: 'truck', title: 'Carrier or driver', desc: 'You move consignments on behalf of vendors.' },
  { value: 'fulfilment_centre', icon: 'dock', title: 'Fulfilment centre', desc: 'You receive inbound goods and run the docks.' },
]

function Stepper({ step }) {
  return (
    <div className="stepper" role="list" aria-label="Registration progress">
      {STEPS.map((label, i) => (
        <div key={label} className="stepper-step" role="listitem" style={{ flex: i === STEPS.length - 1 ? '0 0 auto' : 1 }}>
          <span className={`stepper-step ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`} style={{ flex: '0 0 auto' }}>
            <span className="stepper-dot">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="stepper-label hide-sm">{label}</span>
          </span>
          {i < STEPS.length - 1 ? <span className={`stepper-line ${i < step ? 'is-done' : ''}`} /> : null}
        </div>
      ))}
    </div>
  )
}

export default function Signup() {
  useDocumentTitle('Create an account')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    orgType: '',
    orgName: '',
    gstin: '',
    city: '',
    fcId: SIGNUP_FC_OPTIONS[0].id,
    monthlyShipments: '50-200',
    terms: false,
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)

  const dispatch = useDispatch()
  const navigate = useNavigate()

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const strength = passwordStrength(form.password)

  const validateStep = () => {
    const next = {}
    if (step === 0) {
      if (!form.name.trim()) next.name = 'Enter your full name'
      if (!form.email.trim()) next.email = 'Enter your work email address'
      else if (!isValidEmail(form.email)) next.email = 'That does not look like a valid email address'
      if (!form.password) next.password = 'Choose a password'
      else if (form.password.length < 8) next.password = 'Use at least 8 characters'
      else if (strength.score < 2) next.password = 'Add a number or a capital letter to strengthen this'
    }
    if (step === 1 && !form.orgType) next.orgType = 'Choose the type that describes your organisation'
    if (step === 2) {
      if (!form.orgName.trim()) next.orgName = 'Enter your registered organisation name'
      if (!form.city.trim()) next.city = 'Enter the city you operate from'
      if (form.gstin && !/^[0-9A-Z]{15}$/.test(form.gstin.toUpperCase())) next.gstin = 'A GSTIN is 15 characters — letters and digits'
      if (!form.terms) next.terms = 'You need to accept the terms to continue'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onNext = async (e) => {
    e.preventDefault()
    if (!validateStep()) return

    if (step < 2) {
      setStep((s) => s + 1)
      return
    }

    setSubmitting(true)
    setServerError(null)
    try {
      const { user, token } = await signup(form)
      dispatch({ type: ACTIONS.AUTH_SUCCESS, payload: { user, token } })
      setStep(3)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 3) {
    return (
      <AuthShell>
        <Stepper step={3} />
        <div className="stack gap-16">
          <span className="empty-icon" style={{ background: 'var(--success-soft)', color: 'var(--success-text)', width: 52, height: 52 }}>
            <Icon name="checkCircle" size={26} />
          </span>
          <div>
            <h1 className="auth-title">You’re set up, {form.name.split(' ')[0]}</h1>
            <p className="auth-sub" style={{ marginBottom: 0 }}>
              {form.orgName} is registered as a{' '}
              {ORG_TYPES.find((o) => o.value === form.orgType)?.title.toLowerCase()}. Your workspace is ready.
            </p>
          </div>

          <Callout tone="info" title="What happens next">
            Connect your invoicing system under Settings → Integrations so e-way bills and invoices are pulled
            automatically, then create your first shipment.
          </Callout>

          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => navigate(ROLE_HOME[form.orgType === 'fulfilment_centre' ? 'fc' : form.orgType === 'carrier' ? 'driver' : 'vendor_admin'])}
            iconRight="arrowRight"
          >
            Open my workspace
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Stepper step={step} />

      <h1 className="auth-title">
        {step === 0 ? 'Create your account' : step === 1 ? 'What kind of organisation?' : 'Organisation details'}
      </h1>
      <p className="auth-sub">
        {step === 0
          ? 'One login covers every portal — your role decides what opens.'
          : step === 1
            ? 'This decides which portal you land in and what the platform can do for you.'
            : 'Used on your documents and shared with the fulfilment centres you deliver into.'}
      </p>

      {serverError ? (
        <Callout tone="danger" className="mb-16">
          {serverError}
        </Callout>
      ) : null}

      <form onSubmit={onNext} noValidate className="stack gap-16">
        {step === 0 ? (
          <>
            <Input label="Full name" value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} required autoComplete="name" placeholder="Priya Raghavan" />
            <Input label="Work email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} required autoComplete="email" leadIcon="mail" placeholder="you@company.example" />
            <Input label="Mobile number" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" leadIcon="phone" placeholder="+91 98220 41180" hint="Used for delay alerts by SMS. Optional." />
            <div>
              <PasswordInput label="Password" value={form.password} onChange={(e) => set({ password: e.target.value })} error={errors.password} required autoComplete="new-password" />
              {form.password ? (
                <div className="strength">
                  <div className="strength-bars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`strength-bar ${strength.score >= n ? `is-on-${strength.score}` : ''}`} />
                    ))}
                  </div>
                  <span className="t-sm c-muted">{strength.label}</span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="stack gap-8">
              {ORG_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  className={`org-choice ${form.orgType === type.value ? 'is-selected' : ''}`}
                  onClick={() => set({ orgType: type.value })}
                  aria-pressed={form.orgType === type.value}
                >
                  <span className="org-choice-icon">
                    <Icon name={type.icon} size={18} />
                  </span>
                  <span className="grow">
                    <span className="demo-btn-title">{type.title}</span>
                    <span className="demo-btn-desc">{type.desc}</span>
                  </span>
                  {form.orgType === type.value ? <Icon name="checkCircle" size={17} className="c-accent" /> : null}
                </button>
              ))}
            </div>
            {errors.orgType ? (
              <span className="field-error">
                <Icon name="alertCircle" size={13} />
                {errors.orgType}
              </span>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Input label="Registered organisation name" value={form.orgName} onChange={(e) => set({ orgName: e.target.value })} error={errors.orgName} required placeholder="Anand Auto Components Pvt Ltd" />
            <Input label="GSTIN" value={form.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} error={errors.gstin} placeholder="27AABCU9603R1ZM" hint="Validated against your invoices before every gate-in. Optional for now." className="mono" />
            <Input label="Operating city" value={form.city} onChange={(e) => set({ city: e.target.value })} error={errors.city} required placeholder="Pune" />

            {form.orgType !== 'fulfilment_centre' ? (
              <Select
                label="Fulfilment centre you deliver into most"
                value={form.fcId}
                onChange={(e) => set({ fcId: e.target.value })}
                options={SIGNUP_FC_OPTIONS.map((fc) => ({ value: fc.id, label: fc.label }))}
              />
            ) : null}

            <Select
              label="Shipments per month"
              value={form.monthlyShipments}
              onChange={(e) => set({ monthlyShipments: e.target.value })}
              options={[
                { value: '0-50', label: 'Under 50' },
                { value: '50-200', label: '50 to 200' },
                { value: '200-1000', label: '200 to 1,000' },
                { value: '1000+', label: 'More than 1,000' },
              ]}
            />

            <div>
              <Checkbox
                label="I accept the terms of service and privacy policy"
                description="Including the cluster data-sharing terms — released dock slots are offered to other vendors delivering into the same centre."
                checked={form.terms}
                onChange={(v) => set({ terms: v })}
              />
              {errors.terms ? (
                <span className="field-error mt-4">
                  <Icon name="alertCircle" size={13} />
                  {errors.terms}
                </span>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="row gap-8">
          {step > 0 ? (
            <Button variant="secondary" size="lg" onClick={() => setStep((s) => s - 1)} icon="arrowLeft" disabled={submitting}>
              Back
            </Button>
          ) : null}
          <Button type="submit" variant="primary" size="lg" block loading={submitting} iconRight={step === 2 ? undefined : 'arrowRight'}>
            {step === 2 ? (submitting ? 'Creating your workspace…' : 'Create account') : 'Continue'}
          </Button>
        </div>
      </form>

      <p className="t-md c-muted mt-24" style={{ textAlign: 'center' }}>
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  )
}
