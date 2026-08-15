import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import AuthShell from './AuthShell.jsx'
import Input, { PasswordInput } from '../../components/ui/Input.jsx'
import Button from '../../components/ui/Button.jsx'
import Checkbox from '../../components/ui/Checkbox.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { Callout } from '../../components/ui/Misc.jsx'
import { useDispatch, useAuth } from '../../store/hooks.js'
import { ACTIONS } from '../../store/reducer.js'
import { login, demoLogin } from '../../services/authService.js'
import { isValidEmail } from '../../lib/validators.js'
import { ROLE_HOME, ROLES } from '../../lib/constants.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import './auth.css'

const DEMO_ROLES = [
  { role: ROLES.VENDOR, icon: 'package', title: 'Vendor', desc: 'Dispatch desk — shipments, documents, control tower' },
  { role: ROLES.DRIVER, icon: 'truck', title: 'Driver', desc: 'Phone app — today’s trips, proof of delivery, incidents' },
  { role: ROLES.FC, icon: 'dock', title: 'Fulfilment centre', desc: 'Inbound desk — arrival board, docks, receiving' },
]

export default function Login() {
  useDocumentTitle('Sign in')
  const [form, setForm] = useState({ email: '', password: '', remember: true })
  const [errors, setErrors] = useState({})
  const [pendingRole, setPendingRole] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const dispatch = useDispatch()
  const { error: authError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = (user) => {
    const intended = location.state?.from
    // Only honour the intended route if it belongs to the role that just
    // signed in — otherwise a driver could be bounced into a vendor page.
    const home = ROLE_HOME[user.role]
    navigate(intended && intended.startsWith(home) ? intended : home, { replace: true })
  }

  const validate = () => {
    const next = {}
    if (!form.email.trim()) next.email = 'Enter your email address'
    else if (!isValidEmail(form.email)) next.email = 'That does not look like a valid email address'
    if (!form.password) next.password = 'Enter your password'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    dispatch({ type: ACTIONS.AUTH_START })
    try {
      const { user, token } = await login({ email: form.email, password: form.password })
      dispatch({ type: ACTIONS.AUTH_SUCCESS, payload: { user, token } })
      redirectTo(user)
    } catch (err) {
      dispatch({ type: ACTIONS.AUTH_FAILURE, payload: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const onDemo = async (role) => {
    setPendingRole(role)
    dispatch({ type: ACTIONS.AUTH_START })
    try {
      const { user, token } = await demoLogin(role)
      dispatch({ type: ACTIONS.AUTH_SUCCESS, payload: { user, token } })
      navigate(ROLE_HOME[user.role], { replace: true })
    } catch (err) {
      dispatch({ type: ACTIONS.AUTH_FAILURE, payload: err.message })
    } finally {
      setPendingRole(null)
    }
  }

  const busy = submitting || Boolean(pendingRole)

  return (
    <AuthShell>
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-sub">Your role decides which portal opens — vendor, driver or fulfilment centre.</p>

      {authError ? (
        <Callout tone="danger" className="mb-16">
          {authError}
        </Callout>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="stack gap-16">
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@company.example"
          leadIcon="mail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
          required
          size="lg"
        />

        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
          required
          size="lg"
        />

        <div className="row between gap-12">
          <Checkbox label="Keep me signed in" checked={form.remember} onChange={(v) => setForm({ ...form, remember: v })} />
          <Link to="/forgot-password" className="t-md">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={submitting} disabled={busy}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="auth-divider">or explore instantly</div>

      <div className="demo-grid">
        {DEMO_ROLES.map((d) => (
          <button key={d.role} type="button" className="demo-btn" onClick={() => onDemo(d.role)} disabled={busy}>
            <span className="demo-btn-icon">
              {pendingRole === d.role ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name={d.icon} size={17} />}
            </span>
            <span className="grow">
              <span className="demo-btn-title">Continue as {d.title}</span>
              <span className="demo-btn-desc">{d.desc}</span>
            </span>
            <Icon name="arrowRight" size={15} className="c-subtle" />
          </button>
        ))}
      </div>

      <p className="t-md c-muted mt-24" style={{ textAlign: 'center' }}>
        No account yet? <Link to="/signup">Register your organisation</Link>
      </p>
    </AuthShell>
  )
}
