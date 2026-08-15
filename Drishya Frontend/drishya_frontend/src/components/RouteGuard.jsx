import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/hooks.js'
import { ROLE_HOME } from '../lib/constants.js'

// Two jobs: keep signed-out visitors out, and keep a signed-in user inside
// their own portal. A driver who types /vendor/analytics is sent to /driver,
// not to a login screen they are already past.
export default function RouteGuard({ role, children }) {
  const { isAuthenticated, role: currentRole } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  if (role && currentRole !== role) {
    return <Navigate to={ROLE_HOME[currentRole] ?? '/login'} replace />
  }

  return children
}

// The bare "/" route: send people where they belong.
export function RootRedirect() {
  const { isAuthenticated, role } = useAuth()
  return <Navigate to={isAuthenticated ? (ROLE_HOME[role] ?? '/login') : '/login'} replace />
}
