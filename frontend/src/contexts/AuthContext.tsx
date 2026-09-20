import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiFetch, clearToken, getToken, setToken } from '../lib/api'
import type { AuthResponse, User, UserRole } from '../types/auth'

interface AuthContextValue {
  user: User | null
  permissions: string[]
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    role: UserRole,
    inviteCode?: string,
  ) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function applyAuth(data: AuthResponse) {
  setToken(data.token)
  return { user: data.user, permissions: data.permissions }
}

const SESSION_BOOTSTRAP_RETRIES = 5
const SESSION_BOOTSTRAP_DELAY_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchSessionWithRetry(): Promise<{ user: User; permissions: string[] }> {
  let lastError: unknown
  for (let attempt = 0; attempt < SESSION_BOOTSTRAP_RETRIES; attempt += 1) {
    try {
      return await apiFetch<{ user: User; permissions: string[] }>('/auth/me')
    } catch (err) {
      lastError = err
      if (err instanceof ApiError && err.status === 401) {
        throw err
      }
      if (attempt < SESSION_BOOTSTRAP_RETRIES - 1) {
        await sleep(SESSION_BOOTSTRAP_DELAY_MS * (attempt + 1))
      }
    }
  }
  throw lastError
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    fetchSessionWithRetry()
      .then((data) => {
        setUser(data.user)
        setPermissions(data.permissions)
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken()
        }
        setUser(null)
        setPermissions([])
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<AuthResponse>('/auth/login', {
      auth: false,
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    const next = applyAuth(data)
    setUser(next.user)
    setPermissions(next.permissions)
  }, [])

  const register = useCallback(
    async (email: string, password: string, role: UserRole, inviteCode?: string) => {
      const data = await apiFetch<AuthResponse>('/auth/register', {
        auth: false,
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          role,
          invite_code: inviteCode?.trim() || undefined,
        }),
      })
      const next = applyAuth(data)
      setUser(next.user)
      setPermissions(next.permissions)
    },
    [],
  )

  const refreshSession = useCallback(async () => {
    const data = await fetchSessionWithRetry()
    setUser(data.user)
    setPermissions(data.permissions)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    clearToken()
    setUser(null)
    setPermissions([])
  }, [])

  const value = useMemo(
    () => ({
      user,
      permissions,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      refreshSession,
    }),
    [user, permissions, isLoading, login, register, logout, refreshSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
