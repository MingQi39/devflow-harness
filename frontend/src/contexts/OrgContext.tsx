import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiFetch } from '../lib/api'
import type { Organization } from '../types/org'
import { useAuth } from './AuthContext'

const ORG_STORAGE_KEY = 'devflow-current-org-id'

interface OrgContextValue {
  orgs: Organization[]
  currentOrgId: string | null
  currentOrg: Organization | null
  loading: boolean
  error: string | null
  setCurrentOrgId: (id: string | null) => void
  refreshOrgs: () => Promise<void>
  joinOrg: (inviteCode: string) => Promise<void>
  createOrg: (name: string) => Promise<Organization>
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, refreshSession } = useAuth()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(() =>
    localStorage.getItem(ORG_STORAGE_KEY),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setCurrentOrgId = useCallback((id: string | null) => {
    setCurrentOrgIdState(id)
    if (id) localStorage.setItem(ORG_STORAGE_KEY, id)
    else localStorage.removeItem(ORG_STORAGE_KEY)
  }, [])

  const refreshOrgs = useCallback(async () => {
    if (!isAuthenticated) {
      setOrgs([])
      return
    }
    setLoading(true)
    setError(null)
    const load = async (retry: boolean) => {
      try {
        const list = await apiFetch<Organization[]>('/orgs/mine')
        setOrgs(list)
        setError(null)
        if (list.length === 0) {
          setCurrentOrgId(null)
        } else {
          const storedId = localStorage.getItem(ORG_STORAGE_KEY)
          const preferredId = currentOrgId ?? storedId
          if (preferredId && list.some((item) => item.id === preferredId)) {
            if (preferredId !== currentOrgId) setCurrentOrgId(preferredId)
          } else {
            setCurrentOrgId(list[0].id)
          }
        }
      } catch (err) {
        if (!retry && err instanceof ApiError && err.status === 403) {
          await refreshSession()
          await load(true)
          return
        }
        setError(err instanceof Error ? err.message : '加载组织失败')
      } finally {
        setLoading(false)
      }
    }
    await load(false)
  }, [currentOrgId, isAuthenticated, refreshSession, setCurrentOrgId])

  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated) void refreshOrgs()
    else {
      setOrgs([])
      setCurrentOrgId(null)
    }
  }, [isAuthenticated, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps -- refresh on login only

  const joinOrg = useCallback(
    async (inviteCode: string) => {
      const org = await apiFetch<Organization>('/orgs/join', {
        method: 'POST',
        body: JSON.stringify({ invite_code: inviteCode.trim() }),
      })
      await refreshOrgs()
      setCurrentOrgId(org.id)
    },
    [refreshOrgs, setCurrentOrgId],
  )

  const createOrg = useCallback(
    async (name: string) => {
      const org = await apiFetch<Organization>('/orgs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      await refreshOrgs()
      setCurrentOrgId(org.id)
      return org
    },
    [refreshOrgs, setCurrentOrgId],
  )

  const currentOrg = useMemo(
    () => orgs.find((item) => item.id === currentOrgId) ?? null,
    [orgs, currentOrgId],
  )

  const value = useMemo(
    () => ({
      orgs,
      currentOrgId,
      currentOrg,
      loading,
      error,
      setCurrentOrgId,
      refreshOrgs,
      joinOrg,
      createOrg,
    }),
    [
      orgs,
      currentOrgId,
      currentOrg,
      loading,
      error,
      setCurrentOrgId,
      refreshOrgs,
      joinOrg,
      createOrg,
    ],
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
