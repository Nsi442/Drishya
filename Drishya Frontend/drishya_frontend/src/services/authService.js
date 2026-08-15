import { post, patch, setAuthToken } from './client.js'

// Every successful sign-in hands the token to the client module, which attaches
// it to subsequent requests. Held in memory only — see client.js.
function remember(response) {
  setAuthToken(response.token)
  return response
}

export async function login({ email, password }) {
  return remember(await post('/auth/login', { email, password }, { label: 'sign in' }))
}

/** The three one-click buttons on the login screen. */
export async function demoLogin(role) {
  return remember(await post('/auth/demo-login', { role }, { label: 'demo sign in' }))
}

export async function signup(payload) {
  return remember(
    await post(
      '/auth/signup',
      {
        name: payload.name,
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        title: payload.title,
        orgType: payload.orgType,
        orgName: payload.orgName,
        gstin: payload.gstin,
        city: payload.city,
      },
      { label: 'registration' },
    ),
  )
}

export function requestPasswordReset(email) {
  return post('/auth/forgot-password', { email }, { label: 'password reset' })
}

export function resetPassword({ token, password }) {
  return post('/auth/reset-password', { token, password }, { label: 'password reset' })
}

export function updateProfile(patchBody) {
  return patch('/auth/profile', patchBody, { label: 'profile update' })
}

export function signOut() {
  setAuthToken(null)
}
