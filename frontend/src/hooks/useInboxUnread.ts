import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import type { PrototypeDelivery } from '../types/org'

export function useInboxUnread() {
  const { permissions } = useAuth()
  const { currentOrgId } = useOrg()
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!currentOrgId || !permissions.includes('prototype:receive')) {
      setUnreadCount(0)
      return
    }
    try {
      const list = await apiFetch<PrototypeDelivery[]>(
        `/orgs/${currentOrgId}/prototype-deliveries/inbox`,
      )
      setUnreadCount(list.filter((item) => !item.read_at).length)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setUnreadCount(0)
      }
    }
  }, [currentOrgId, permissions])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  return { unreadCount, refreshInboxUnread: refresh }
}
