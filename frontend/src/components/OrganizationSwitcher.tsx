import { useEffect, useRef, useState } from 'react'
import { useOrg } from '../contexts/OrgContext'
import CreateOrganizationDialog from './CreateOrganizationDialog'
import JoinOrganizationDialog from './JoinOrganizationDialog'
import { IconBuilding2, IconChevronDown, IconPlus, IconUserPlus } from './icons/LayoutIcons'

export default function OrganizationSwitcher() {
  const {
    orgs,
    currentOrgId,
    currentOrg,
    loading,
    setCurrentOrgId,
    joinOrg,
    createOrg,
  } = useOrg()
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const label = loading
    ? '加载组织…'
    : currentOrg?.name ?? (orgs.length > 0 ? '选择组织' : '未加入组织')

  const initial = label.trim().charAt(0) || '组'

  return (
    <div className="org-switcher-root" ref={rootRef}>
      <button
        type="button"
        className="org-switcher-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="org-switcher-avatar" aria-hidden="true">
          {currentOrg || orgs.length > 0 ? (
            initial
          ) : (
            <IconBuilding2 size={18} />
          )}
        </span>
        <span className="org-switcher-label">
          <span className="org-switcher-name">{label}</span>
          {currentOrg ? (
            <span className="org-switcher-meta">
              {currentOrg.member_count} 人 · 邀请码 {currentOrg.invite_code}
            </span>
          ) : (
            <span className="org-switcher-meta">点击创建或加入组织</span>
          )}
        </span>
        <span className="org-switcher-chevron" aria-hidden="true">
          <IconChevronDown size={14} className={menuOpen ? 'org-switcher-chevron-open' : ''} />
        </span>
      </button>

      {menuOpen ? (
        <div className="org-switcher-menu" role="listbox" aria-label="组织列表">
          {orgs.length === 0 ? (
            <p className="org-switcher-empty">还没有组织，可创建或加入</p>
          ) : (
            <ul className="org-switcher-list">
              {orgs.map((org) => (
                <li key={org.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={org.id === currentOrgId}
                    className={`org-switcher-item${org.id === currentOrgId ? ' active' : ''}`}
                    onClick={() => {
                      setCurrentOrgId(org.id)
                      setMenuOpen(false)
                    }}
                  >
                    <span className="org-switcher-item-avatar" aria-hidden>
                      {org.name.trim().charAt(0) || '组'}
                    </span>
                    <span className="org-switcher-item-name">{org.name}</span>
                    <span className="org-switcher-item-meta">
                      {org.member_count} 人
                      {org.membership_role === 'owner' ? ' · 管理员' : ''}
                    </span>
                    {org.id === currentOrgId ? <span className="org-switcher-check">✓</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="org-switcher-actions">
            <button
              type="button"
              className="btn ghost sm full-width org-switcher-action"
              onClick={() => {
                setMenuOpen(false)
                setJoinOpen(true)
              }}
            >
              <IconUserPlus size={16} />
              <span>加入组织</span>
            </button>
            <button
              type="button"
              className="btn primary sm full-width org-switcher-action"
              onClick={() => {
                setMenuOpen(false)
                setCreateOpen(true)
              }}
            >
              <IconPlus size={16} />
              <span>创建组织</span>
            </button>
          </div>
        </div>
      ) : null}

      <CreateOrganizationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createOrg}
      />
      <JoinOrganizationDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoin={joinOrg}
      />
    </div>
  )
}
