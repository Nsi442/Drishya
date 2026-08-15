import { Link, useLocation } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import Button from '../components/ui/Button.jsx'
import { useAuth } from '../store/hooks.js'
import { ROLE_HOME } from '../lib/constants.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import './auth/auth.css'

export default function NotFound() {
  useDocumentTitle('Page not found')
  const { isAuthenticated, role } = useAuth()
  const location = useLocation()
  const home = isAuthenticated ? ROLE_HOME[role] : '/login'

  return (
    <div className="notfound">
      <Link to={home} aria-label="Drishya home" className="mb-24">
        <Logo variant="horizontal" size={38} />
      </Link>

      <p className="notfound-code">404</p>
      <h1 className="t-xl c-strong">This page does not exist</h1>
      <p className="c-muted" style={{ maxWidth: 420 }}>
        Nothing is served at <code className="mono">{location.pathname}</code>. It may have been renamed, or the link
        that brought you here may be out of date.
      </p>

      <div className="row gap-8 mt-24 wrap center">
        <Button variant="primary" to={home} icon="home">
          {isAuthenticated ? 'Back to my dashboard' : 'Go to sign in'}
        </Button>
        {isAuthenticated ? (
          <Button variant="secondary" to={role === 'fc' ? '/fc/inbound' : role === 'driver' ? '/driver' : '/vendor/shipments'} icon="truck">
            {role === 'fc' ? 'Arrival board' : role === 'driver' ? 'Today’s trips' : 'All shipments'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
