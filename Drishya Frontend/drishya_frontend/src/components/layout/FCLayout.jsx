import PortalShell from './PortalShell.jsx'
import { FC_NAV } from './navConfig.js'

// Fulfilment centre desk: same shell, denser tables. Receiving staff read this
// across a room, so the arrival board runs at a larger type size while the
// supporting tables pack more rows into a screen.
export default function FCLayout() {
  return <PortalShell nav={FC_NAV} density="compact" homePath="/fc" />
}
