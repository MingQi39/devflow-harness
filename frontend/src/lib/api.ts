const TOKEN_KEY = 'devflow-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

interface ApiOptions extends RequestInit {
  auth?: boolean
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options
  const requestHeaders = new Headers(headers)
  if (!requestHeaders.has('Content-Type') && rest.body) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (auth) {
    const token = getToken()
    if (token) {
      requestHeaders.set('Authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(`/api${path}`, {
    ...rest,
    headers: requestHeaders,
  })

  if (response.status === 401 && auth) {
    clearToken()
    if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/share/')) {
      window.location.href = '/login'
    }
    throw new ApiError(401, 'Unauthorized')
  }

  if (!response.ok) {
    let detail = await response.text()
    try {
      const json = JSON.parse(detail) as { detail?: string }
      if (typeof json.detail === 'string') detail = json.detail
    } catch {
      // keep raw text
    }
    const friendly =
      response.status === 403 && detail === 'Permission denied'
        ? '当前账号没有此操作权限'
        : detail || `Request failed: ${response.status}`
    throw new ApiError(response.status, friendly)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

