import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthShell from './AuthShell.jsx'
import { PasswordInput } from '../../components/ui/Input.jsx'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { Callout } from '../../components/ui/Misc.jsx'
import { resetPassword } from '../../services/authService.js'
import { passwordStrength } from '../../lib/validators.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import './auth.css'

const RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'case', label: 'An upper and a lower case letter', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { key: 'digit', label: 'At least one number', test: (v) => /\d/.test(v) },
  { key: 'symbol', label: 'A symbol, for good measure', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

export default function ResetPassword() {
  useDocumentTitle('Set a new password')
  const [params] = useSearchParams()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const strength = passwordStrength(form.password)

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.password) next.password = 'Choose a new password'
    else if (form.password.length < 8) next.password = 'Use at least 8 characters'
    else if (strength.score < 3) next.password = 'This is still guessable — try the suggestions below'
    if (form.confirm !== form.password) next.confirm = 'The two passwords do not match'
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      await resetPassword({ token: params.get('token') ?? 'demo-token', password: form.password })
      setDone(true)
      setTimeout(() => navigate('/login'), 2200)
    } catch (err) {
      setErrors({ password: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="stack gap-16">
          <span className="empty-icon" style={{ background: 'var(--success-soft)', color: 'var(--success-text)', width: 52, height: 52 }}>
            <Icon name="checkCircle" size={26} />
          </span>
          <div>
            <h1 className="auth-title">Password updated</h1>
            <p className="auth-sub" style={{ marginBottom: 0 }}>
              You can sign in with your new password. Taking you to the sign-in screen…
            </p>
          </div>
          <Button variant="primary" size="lg" block to="/login">
            Sign in now
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="auth-title">Set a new password</h1>
      <p className="auth-sub">Choose something you have not used on this account before.</p>

      <form onSubmit={onSubmit} noValidate className="stack gap-16">
        <div>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={errors.password}
            required
            size="lg"
          />
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

        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          error={errors.confirm}
          required
          size="lg"
        />

        <Callout tone="neutral" icon="shield" title="A strong password contains">
          <ul className="stack gap-4 mt-4">
            {RULES.map((rule) => {
              const passed = rule.test(form.password)
              return (
                <li key={rule.key} className="row gap-6 t-sm" style={{ color: passed ? 'var(--success-text)' : 'var(--text-muted)' }}>
                  <Icon name={passed ? 'checkCircle' : 'minus'} size={13} />
                  {rule.label}
                </li>
              )
            })}
          </ul>
        </Callout>

        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>

      <p className="t-md c-muted mt-24" style={{ textAlign: 'center' }}>
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  )
}
