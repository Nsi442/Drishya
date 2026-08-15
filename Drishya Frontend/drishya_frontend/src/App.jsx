import { Routes, Route } from 'react-router-dom'
import RouteGuard, { RootRedirect } from './components/RouteGuard.jsx'
import { ROLES } from './lib/constants.js'

import VendorLayout from './components/layout/VendorLayout.jsx'
import DriverLayout from './components/layout/DriverLayout.jsx'
import FCLayout from './components/layout/FCLayout.jsx'

import Login from './pages/auth/Login.jsx'
import Signup from './pages/auth/Signup.jsx'
import ForgotPassword from './pages/auth/ForgotPassword.jsx'
import ResetPassword from './pages/auth/ResetPassword.jsx'
import NotFound from './pages/NotFound.jsx'

import VendorDashboard from './pages/vendor/VendorDashboard.jsx'
import VendorShipments from './pages/vendor/VendorShipments.jsx'
import ShipmentNew from './pages/vendor/ShipmentNew.jsx'
import ShipmentDetail from './pages/vendor/ShipmentDetail.jsx'
import LiveMap from './pages/vendor/LiveMap.jsx'
import VendorDocuments from './pages/vendor/VendorDocuments.jsx'
import VendorAppointments from './pages/vendor/VendorAppointments.jsx'
import VendorCarriers from './pages/vendor/VendorCarriers.jsx'
import VendorDrivers from './pages/vendor/VendorDrivers.jsx'
import VendorAnalytics from './pages/vendor/VendorAnalytics.jsx'
import VendorAlerts from './pages/vendor/VendorAlerts.jsx'
import VendorSettings from './pages/vendor/VendorSettings.jsx'

import DriverToday from './pages/driver/DriverToday.jsx'
import TripDetail from './pages/driver/TripDetail.jsx'
import TripChecklist from './pages/driver/TripChecklist.jsx'
import TripPOD from './pages/driver/TripPOD.jsx'
import DriverScan from './pages/driver/DriverScan.jsx'
import DriverIncident from './pages/driver/DriverIncident.jsx'
import DriverDocuments from './pages/driver/DriverDocuments.jsx'
import DriverHistory from './pages/driver/DriverHistory.jsx'
import DriverProfile from './pages/driver/DriverProfile.jsx'

import FCDashboard from './pages/fc/FCDashboard.jsx'
import ArrivalBoard from './pages/fc/ArrivalBoard.jsx'
import InboundDetail from './pages/fc/InboundDetail.jsx'
import DockScheduler from './pages/fc/DockScheduler.jsx'
import FCAppointments from './pages/fc/FCAppointments.jsx'
import Yard from './pages/fc/Yard.jsx'
import Receiving from './pages/fc/Receiving.jsx'
import Exceptions from './pages/fc/Exceptions.jsx'
import FCVendors from './pages/fc/FCVendors.jsx'
import FCAnalytics from './pages/fc/FCAnalytics.jsx'
import FCSettings from './pages/fc/FCSettings.jsx'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Vendor portal */}
      <Route
        path="/vendor"
        element={
          <RouteGuard role={ROLES.VENDOR}>
            <VendorLayout />
          </RouteGuard>
        }
      >
        <Route index element={<VendorDashboard />} />
        <Route path="shipments" element={<VendorShipments />} />
        <Route path="shipments/new" element={<ShipmentNew />} />
        <Route path="shipments/:id" element={<ShipmentDetail />} />
        <Route path="live-map" element={<LiveMap />} />
        <Route path="documents" element={<VendorDocuments />} />
        <Route path="appointments" element={<VendorAppointments />} />
        <Route path="carriers" element={<VendorCarriers />} />
        <Route path="drivers" element={<VendorDrivers />} />
        <Route path="analytics" element={<VendorAnalytics />} />
        <Route path="alerts" element={<VendorAlerts />} />
        <Route path="settings" element={<VendorSettings />} />
      </Route>

      {/* Driver app */}
      <Route
        path="/driver"
        element={
          <RouteGuard role={ROLES.DRIVER}>
            <DriverLayout />
          </RouteGuard>
        }
      >
        <Route index element={<DriverToday />} />
        <Route path="trip/:id" element={<TripDetail />} />
        <Route path="trip/:id/checklist" element={<TripChecklist />} />
        <Route path="trip/:id/pod" element={<TripPOD />} />
        <Route path="scan" element={<DriverScan />} />
        <Route path="incident" element={<DriverIncident />} />
        <Route path="documents" element={<DriverDocuments />} />
        <Route path="history" element={<DriverHistory />} />
        <Route path="profile" element={<DriverProfile />} />
      </Route>

      {/* Fulfilment centre portal */}
      <Route
        path="/fc"
        element={
          <RouteGuard role={ROLES.FC}>
            <FCLayout />
          </RouteGuard>
        }
      >
        <Route index element={<FCDashboard />} />
        <Route path="inbound" element={<ArrivalBoard />} />
        <Route path="inbound/:id" element={<InboundDetail />} />
        <Route path="docks" element={<DockScheduler />} />
        <Route path="appointments" element={<FCAppointments />} />
        <Route path="yard" element={<Yard />} />
        <Route path="receiving" element={<Receiving />} />
        <Route path="exceptions" element={<Exceptions />} />
        <Route path="vendors" element={<FCVendors />} />
        <Route path="analytics" element={<FCAnalytics />} />
        <Route path="settings" element={<FCSettings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
