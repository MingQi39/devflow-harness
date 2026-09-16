const EMAIL_KEY = 'devflow-last-email'
const LOGIN_KEY = 'devflow-remember-login'

interface RememberedLogin {
  email: string
  password: string
}

export function loadLastEmail(): string {
  const email = localStorage.getItem(EMAIL_KEY)
  if (email) return email
  try {
    const raw = localStorage.getItem(LOGIN_KEY)
    if (!raw) return ''
    const data = JSON.parse(raw) as RememberedLogin
    if (data.email) {
      saveLastEmail(data.email)
      return data.email
    }
  } catch {
    // ignore
  }
  return ''
}

export function saveLastEmail(email: string): void {
  localStorage.setItem(EMAIL_KEY, email)
}

export function loadRememberedPassword(): string {
  try {
    const raw = localStorage.getItem(LOGIN_KEY)
    if (!raw) return ''
    const data = JSON.parse(raw) as RememberedLogin
    return data.password ?? ''
  } catch {
    return ''
  }
}

export function saveRememberedPassword(email: string, password: string): void {
  localStorage.setItem(LOGIN_KEY, JSON.stringify({ email, password }))
}

export function clearRememberedPassword(): void {
  localStorage.removeItem(LOGIN_KEY)
}
