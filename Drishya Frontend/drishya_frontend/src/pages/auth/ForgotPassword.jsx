import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from './AuthShell.jsx'
import Input from '../../components/ui/Input.jsx'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { Callout } from '../../components/ui/Misc.jsx'
import { requestPasswordReset } from '../../services/authService.js'
import { isValidEmail } from '../../lib/validators.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import './auth.css'

export default function ForgotPassword() {
  useDocumentTitle('Reset your password')
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Enter the email address on your account')
      return
    }
    if (!isValidEmail(email)) {
      setError('That does not look like a valid email address')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="stack gap-16">
          <span className="empty-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', width: 52, height: 52 }}>
            <Icon name="mail" size={26} />
          </span>
          <div>
            <h1 className="auth-title">Check your inbox</h1>
            <p className="auth-sub" style={{ marginBottom: 0 }}>
              If an account exists for <strong className="c-strong">{email}</strong>, a reset link is on its way. It
              expires in 30 minutes.
            </p>
          </div>

          <Callout tone="info" title="Nothing arrived?">
            Look in spam first. Reset mail is sent from notifications@drishya.example — adding that address to your
            safe senders stops delay alerts going the same way.
          </Callout>

          <div className="stack gap-8">
            <Button variant="primary" size="lg" block to="/reset-password">
              I have the link — set a new password
            </Button>
            <Button
              variant="ghost"
              size="lg"
              block
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
            >
              Use a different email address
            </Button>
          </div>

          <p className="t-md c-muted" style={{ textAlign: 'center' }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="auth-title">Reset your password</h1>
      <p className="auth-sub">Enter the address on your account and we will send you a link to set a new password.</p>

      <form onSubmit={onSubmit} noValidate className="stack gap-16">
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          leadIcon="mail"
          placeholder="you@company.example"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          required
          size="lg"
        />

        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          {submitting ? 'Sending the link…' : 'Send reset link'}
        </Button>
      </form>

      <p className="t-md c-muted mt-24" style={{ textAlign: 'center' }}>
        Remembered it? <Link to="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  )
}
