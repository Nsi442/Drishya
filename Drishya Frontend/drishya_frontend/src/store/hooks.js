// The app talks to the store through these, never through useContext directly.

import { useContext, useCallback, useMemo } from 'react'
import { StateContext, DispatchContext } from './contexts.js'
import { ACTIONS, selectUnreadCount, selectRoleScope } from './reducer.js'
import { nextId } from '../lib/id.js'
import { signOut } from '../services/authService.js'
import { clearReferenceData } from '../services/referenceData.js'

export function useAppState() {
  const state = useContext(StateContext)
  if (!state) throw new Error('useAppState must be used inside <AppProvider>')
  return state
}

export function useDispatch() {
  const dispatch = useContext(DispatchContext)
  if (!dispatch) throw new Error('useDispatch must be used inside <AppProvider>')
  return dispatch
}

export function useAuth() {
  const state = useAppState()
  const dispatch = useDispatch()

  // Signing out clears the bearer token and the cached reference data too, or
  // the next account would inherit the last one's.
  const logout = useCallback(() => {
    signOut()
    clearReferenceData()
    dispatch({ type: ACTIONS.AUTH_LOGOUT })
  }, [dispatch])
  const patchUser = useCallback((patch) => dispatch({ type: ACTIONS.AUTH_PATCH_USER, payload: patch }), [dispatch])

  return useMemo(
    () => ({
      user: state.auth.user,
      token: state.auth.token,
      status: state.auth.status,
      error: state.auth.error,
      isAuthenticated: state.auth.status === 'authenticated' && Boolean(state.auth.user),
      role: state.auth.user?.role ?? null,
      logout,
      patchUser,
    }),
    [state.auth, logout, patchUser],
  )
}

export function useUI() {
  const state = useAppState()
  const dispatch = useDispatch()

  const set = useCallback((patch) => dispatch({ type: ACTIONS.UI_SET, payload: patch }), [dispatch])
  const toggle = useCallback((key) => dispatch({ type: ACTIONS.UI_TOGGLE, payload: key }), [dispatch])
  const setNotificationPref = useCallback(
    (patch) => dispatch({ type: ACTIONS.UI_SET_NOTIFICATION_PREF, payload: patch }),
    [dispatch],
  )
  const toggleTheme = useCallback(
    () => dispatch({ type: ACTIONS.UI_SET, payload: { theme: state.ui.theme === 'dark' ? 'light' : 'dark' } }),
    [dispatch, state.ui.theme],
  )

  return useMemo(() => ({ ...state.ui, set, toggle, toggleTheme, setNotificationPref }), [state.ui, set, toggle, toggleTheme, setNotificationPref])
}

export function useToast() {
  const dispatch = useDispatch()

  const push = useCallback(
    (toast) => {
      const id = nextId('toast')
      dispatch({
        type: ACTIONS.TOAST_PUSH,
        payload: { id, tone: 'info', duration: 5000, ...(typeof toast === 'string' ? { title: toast } : toast) },
      })
      return id
    },
    [dispatch],
  )

  const dismiss = useCallback((id) => dispatch({ type: ACTIONS.TOAST_DISMISS, payload: id }), [dispatch])

  return useMemo(
    () => ({
      push,
      dismiss,
      success: (title, rest = {}) => push({ title, tone: 'success', ...rest }),
      error: (title, rest = {}) => push({ title, tone: 'danger', duration: 8000, ...rest }),
      warn: (title, rest = {}) => push({ title, tone: 'warn', ...rest }),
      info: (title, rest = {}) => push({ title, tone: 'info', ...rest }),
    }),
    [push, dismiss],
  )
}

export function useAlerts() {
  const state = useAppState()
  const dispatch = useDispatch()

  return useMemo(
    () => ({
      items: state.alerts.items,
      status: state.alerts.status,
      error: state.alerts.error,
      unread: selectUnreadCount(state),
      set: (items) => dispatch({ type: ACTIONS.ALERTS_SET, payload: items }),
      add: (alert) => dispatch({ type: ACTIONS.ALERTS_ADD, payload: alert }),
      markRead: (ids) => dispatch({ type: ACTIONS.ALERTS_MARK_READ, payload: ids }),
      markAllRead: () => dispatch({ type: ACTIONS.ALERTS_MARK_ALL_READ }),
      acknowledge: (id, by) => dispatch({ type: ACTIONS.ALERTS_ACK, payload: { id, by } }),
    }),
    [state, dispatch],
  )
}

export function useRoleScope() {
  const state = useAppState()
  return useMemo(() => selectRoleScope(state), [state])
}
