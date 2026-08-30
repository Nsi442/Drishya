import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/hooks.js'
import { ROLE_HOME, ROLE_PORTAL } from '../lib/constants.js'

// Two jobs: keep signed-out visitors out, and keep a signed-in user inside
// their own portal. A driver who types /vendor/analytics is sent to /driver,
// not to a login screen they are already past.
//
// Guards a portal rather than a role. vendor_admin and dispatcher are different
// roles sharing the vendor portal, so comparing roles directly would lock a
// dispatcher out of the very screens they exist to use.
export default function RouteGuard({ portal, children }) {
  const { isAuthenticated, role: currentRole } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  if (portal && ROLE_PORTAL[currentRole] !== portal) {
    return <Navigate to={ROLE_HOME[currentRole] ?? '/login'} replace />
  }

  return children
}

// The bare "/" route: send people where they belong.
export function RootRedirect() {
  const { isAuthenticated, role } = useAuth()
  return <Navigate to={isAuthenticated ? (ROLE_HOME[role] ?? '/login') : '/login'} replace />
}
