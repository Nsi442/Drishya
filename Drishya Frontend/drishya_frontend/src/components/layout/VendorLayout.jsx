import PortalShell from './PortalShell.jsx'
import { VENDOR_NAV } from './navConfig.js'

// Vendor desk: persistent left sidebar, top bar, comfortable row density.
export default function VendorLayout() {
  return <PortalShell nav={VENDOR_NAV} density="comfortable" homePath="/vendor" />
}
