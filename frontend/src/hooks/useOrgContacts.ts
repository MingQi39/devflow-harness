import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useOrg } from '../contexts/OrgContext'
import type { OrgMember } from '../types/org'
import type { UserRole } from '../types/auth'

const ROLE_ORDER: UserRole[] = ['pm', 'frontend', 'backend', 'qa']

export function useOrgContacts() {
  const { currentOrgId } = useOrg()
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!currentOrgId) {
      setMembers([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<OrgMember[]>(`/orgs/${currentOrgId}/members`)
      setMembers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载联系人失败')
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [currentOrgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    members: members.filter((member) => member.role === role),
  })).filter((group) => group.members.length > 0)

  const devMembers = members.filter(
    (member) => member.role === 'frontend' || member.role === 'backend',
  )

  return { members, grouped, devMembers, loading, error, refresh }
}
