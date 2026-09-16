import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch, clearToken, getToken, setToken } from '../lib/api'
import type { AuthResponse, User, UserRole } from '../types/auth'

interface AuthContextValue {
  user: User | null
  permissions: string[]
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, role: UserRole) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function applyAuth(data: AuthResponse) {
  setToken(data.token)
  return { user: data.user, permissions: data.permissions }
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

    apiFetch<{ user: User; permissions: string[] }>('/auth/me')
      .then((data) => {
        setUser(data.user)
        setPermissions(data.permissions)
      })
      .catch(() => {
        clearToken()
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
    async (email: string, password: string, role: UserRole) => {
      const data = await apiFetch<AuthResponse>('/auth/register', {
        auth: false,
        method: 'POST',
        body: JSON.stringify({ email, password, role }),
      })
      const next = applyAuth(data)
      setUser(next.user)
      setPermissions(next.permissions)
    },
    [],
  )

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
    }),
    [user, permissions, isLoading, login, register, logout],
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
