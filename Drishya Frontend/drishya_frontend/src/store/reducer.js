// One reducer, four slices. Actions are namespaced by slice so a reader can
// tell from the type alone which part of the tree a dispatch touches.

import { ROLES } from '../lib/constants.js'

export const initialState = {
  auth: {
    user: null,
    token: null,
    status: 'idle', // idle | loading | authenticated | error
    error: null,
  },
  shipments: {
    byId: {},
    ids: [],
    status: 'idle', // idle | loading | ready | error
    error: null,
    lastTick: null,
    // ids touched by the most recent live tick — drives the row flash
    flashed: [],
  },
  alerts: {
    items: [],
    status: 'idle',
    error: null,
  },
  appointments: {
    items: [],
    status: 'idle',
    error: null,
  },
  ui: {
    theme: 'light',
    sidebarCollapsed: false,
    mobileNavOpen: false,
    notificationsOpen: false,
    paletteOpen: false,
    shortcutsOpen: false,
    liveEnabled: true,
    livePaused: false, // set when the tab is hidden
    language: 'en',
    density: 'comfortable',
    notifications: {
      delayEmail: true,
      delayPush: true,
      documentEmail: true,
      documentPush: false,
      arrivalPush: true,
      dailyDigest: true,
      quietHours: false,
    },
  },
  toasts: [],
}

export const ACTIONS = {
  AUTH_START: 'auth/start',
  AUTH_SUCCESS: 'auth/success',
  AUTH_FAILURE: 'auth/failure',
  AUTH_LOGOUT: 'auth/logout',
  AUTH_PATCH_USER: 'auth/patchUser',

  SHIPMENTS_LOADING: 'shipments/loading',
  SHIPMENTS_SET: 'shipments/set',
  SHIPMENTS_UPSERT: 'shipments/upsert',
  SHIPMENTS_ERROR: 'shipments/error',
  SHIPMENTS_TICK: 'shipments/tick',
  SHIPMENTS_CLEAR_FLASH: 'shipments/clearFlash',

  ALERTS_LOADING: 'alerts/loading',
  ALERTS_SET: 'alerts/set',
  ALERTS_ADD: 'alerts/add',
  ALERTS_ERROR: 'alerts/error',
  ALERTS_MARK_READ: 'alerts/markRead',
  ALERTS_MARK_ALL_READ: 'alerts/markAllRead',
  ALERTS_ACK: 'alerts/acknowledge',

  APPOINTMENTS_LOADING: 'appointments/loading',
  APPOINTMENTS_SET: 'appointments/set',
  APPOINTMENTS_UPSERT: 'appointments/upsert',
  APPOINTMENTS_ERROR: 'appointments/error',

  UI_SET: 'ui/set',
  UI_TOGGLE: 'ui/toggle',
  UI_SET_NOTIFICATION_PREF: 'ui/setNotificationPref',

  TOAST_PUSH: 'toast/push',
  TOAST_DISMISS: 'toast/dismiss',
  TOAST_CLEAR: 'toast/clear',
}

function indexById(list) {
  const byId = {}
  list.forEach((s) => {
    byId[s.id] = s
  })
  return byId
}

export function rootReducer(state, action) {
  switch (action.type) {
    // --- auth ------------------------------------------------------------
    case ACTIONS.AUTH_START:
      return { ...state, auth: { ...state.auth, status: 'loading', error: null } }

    case ACTIONS.AUTH_SUCCESS:
      return {
        ...state,
        auth: { user: action.payload.user, token: action.payload.token, status: 'authenticated', error: null },
        ui: {
          ...state.ui,
          // A driver opening the app gets their own language back.
          language: action.payload.user.language ?? state.ui.language,
        },
      }

    case ACTIONS.AUTH_FAILURE:
      return { ...state, auth: { ...state.auth, status: 'error', error: action.payload } }

    case ACTIONS.AUTH_LOGOUT:
      // Everything role-scoped goes with the session; UI preferences stay.
      return {
        ...initialState,
        ui: { ...state.ui, notificationsOpen: false, paletteOpen: false, mobileNavOpen: false },
      }

    case ACTIONS.AUTH_PATCH_USER:
      return { ...state, auth: { ...state.auth, user: { ...state.auth.user, ...action.payload } } }

    // --- shipments -------------------------------------------------------
    case ACTIONS.SHIPMENTS_LOADING:
      return { ...state, shipments: { ...state.shipments, status: 'loading', error: null } }

    case ACTIONS.SHIPMENTS_SET:
      return {
        ...state,
        shipments: {
          ...state.shipments,
          byId: indexById(action.payload),
          ids: action.payload.map((s) => s.id),
          status: 'ready',
          error: null,
        },
      }

    case ACTIONS.SHIPMENTS_UPSERT: {
      const s = action.payload
      const exists = Boolean(state.shipments.byId[s.id])
      return {
        ...state,
        shipments: {
          ...state.shipments,
          byId: { ...state.shipments.byId, [s.id]: s },
          ids: exists ? state.shipments.ids : [s.id, ...state.shipments.ids],
          status: 'ready',
        },
      }
    }

    case ACTIONS.SHIPMENTS_ERROR:
      return { ...state, shipments: { ...state.shipments, status: 'error', error: action.payload } }

    case ACTIONS.SHIPMENTS_TICK: {
      // action.payload is a list of shallow patches keyed by shipment id.
      const byId = { ...state.shipments.byId }
      const flashed = []
      action.payload.forEach((patch) => {
        const current = byId[patch.id]
        if (!current) return
        byId[patch.id] = { ...current, ...patch }
        if (patch.flash !== false) flashed.push(patch.id)
      })
      return {
        ...state,
        shipments: { ...state.shipments, byId, lastTick: Date.now(), flashed },
      }
    }

    case ACTIONS.SHIPMENTS_CLEAR_FLASH:
      return { ...state, shipments: { ...state.shipments, flashed: [] } }

    // --- alerts ----------------------------------------------------------
    case ACTIONS.ALERTS_LOADING:
      return { ...state, alerts: { ...state.alerts, status: 'loading', error: null } }

    case ACTIONS.ALERTS_SET:
      return { ...state, alerts: { items: action.payload, status: 'ready', error: null } }

    case ACTIONS.ALERTS_ADD:
      return { ...state, alerts: { ...state.alerts, items: [action.payload, ...state.alerts.items] } }

    case ACTIONS.ALERTS_ERROR:
      return { ...state, alerts: { ...state.alerts, status: 'error', error: action.payload } }

    case ACTIONS.ALERTS_MARK_READ: {
      const ids = new Set(Array.isArray(action.payload) ? action.payload : [action.payload])
      return {
        ...state,
        alerts: { ...state.alerts, items: state.alerts.items.map((a) => (ids.has(a.id) ? { ...a, read: true } : a)) },
      }
    }

    case ACTIONS.ALERTS_MARK_ALL_READ:
      return { ...state, alerts: { ...state.alerts, items: state.alerts.items.map((a) => ({ ...a, read: true })) } }

    case ACTIONS.ALERTS_ACK:
      return {
        ...state,
        alerts: {
          ...state.alerts,
          items: state.alerts.items.map((a) =>
            a.id === action.payload.id ? { ...a, acknowledged: true, read: true, acknowledgedBy: action.payload.by } : a,
          ),
        },
      }

    // --- appointments ----------------------------------------------------
    case ACTIONS.APPOINTMENTS_LOADING:
      return { ...state, appointments: { ...state.appointments, status: 'loading', error: null } }

    case ACTIONS.APPOINTMENTS_SET:
      return { ...state, appointments: { items: action.payload, status: 'ready', error: null } }

    case ACTIONS.APPOINTMENTS_UPSERT: {
      const next = action.payload
      const exists = state.appointments.items.some((a) => a.id === next.id)
      return {
        ...state,
        appointments: {
          ...state.appointments,
          items: exists ? state.appointments.items.map((a) => (a.id === next.id ? next : a)) : [...state.appointments.items, next],
        },
      }
    }

    case ACTIONS.APPOINTMENTS_ERROR:
      return { ...state, appointments: { ...state.appointments, status: 'error', error: action.payload } }

    // --- ui --------------------------------------------------------------
    case ACTIONS.UI_SET:
      return { ...state, ui: { ...state.ui, ...action.payload } }

    case ACTIONS.UI_TOGGLE:
      return { ...state, ui: { ...state.ui, [action.payload]: !state.ui[action.payload] } }

    case ACTIONS.UI_SET_NOTIFICATION_PREF:
      return {
        ...state,
        ui: { ...state.ui, notifications: { ...state.ui.notifications, ...action.payload } },
      }

    // --- toasts ----------------------------------------------------------
    case ACTIONS.TOAST_PUSH:
      // Cap the stack; an unattended live feed should not bury the screen.
      return { ...state, toasts: [...state.toasts, action.payload].slice(-4) }

    case ACTIONS.TOAST_DISMISS:
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) }

    case ACTIONS.TOAST_CLEAR:
      return { ...state, toasts: [] }

    default:
      return state
  }
}

// --- selectors -----------------------------------------------------------
// Kept next to the reducer so the shape is described in one place.

export function selectShipments(state) {
  return state.shipments.ids.map((id) => state.shipments.byId[id]).filter(Boolean)
}

export function selectShipment(state, id) {
  return state.shipments.byId[id] ?? null
}

export function selectUnreadCount(state) {
  return state.alerts.items.filter((a) => !a.read).length
}

export function selectRoleScope(state) {
  const user = state.auth.user
  if (!user) return {}
  if (user.role === ROLES.VENDOR) return { vendorId: user.orgId }
  if (user.role === ROLES.FC) return { fcId: user.orgId }
  if (user.role === ROLES.DRIVER) return { driverId: user.driverId }
  return {}
}
