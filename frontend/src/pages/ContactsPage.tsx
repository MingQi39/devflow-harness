import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ConversationSidebar from '../components/ConversationSidebar'
import JoinOrgBanner from '../components/JoinOrgBanner'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { useOrgContacts } from '../hooks/useOrgContacts'
import { personAvatarGradient, personAvatarLabel } from '../lib/avatarColor'
import { ROLE_LABELS } from '../types/auth'
import type { OrgMember } from '../types/org'

const ROLE_SORT = ['pm', 'frontend', 'backend', 'qa'] as const

function IconInviteKey() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCopy({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 6 9 17l-5-5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

export default function ContactsPage() {
  const navigate = useNavigate()
  const { user, permissions, logout } = useAuth()
  const {
    orgs,
    currentOrg,
    loading: orgLoading,
    error: orgError,
  } = useOrg()
  const { members, loading, error } = useOrgContacts()
  const [inviteCopied, setInviteCopied] = useState(false)
  const canReceive = permissions.includes('prototype:receive')
  const canSend = permissions.includes('prototype:send')

  const sortedMembers = useMemo(
    () =>
      [...members].sort(
        (a, b) => ROLE_SORT.indexOf(a.role) - ROLE_SORT.indexOf(b.role),
      ),
    [members],
  )

  const copyInvite = async () => {
    if (!currentOrg?.invite_code) return
    await navigator.clipboard.writeText(currentOrg.invite_code)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  return (
    <div className="chat-app">
      <ConversationSidebar
        conversations={[]}
        activeId={null}
        user={user}
        permissions={permissions}
        navActive="contacts"
        showConversations={false}
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={async () => {}}
        onRename={async () => {}}
        onLogout={async () => {
          await logout()
          navigate('/login')
        }}
      />

      <main className="contacts-page">
        <header className="contacts-header">
          <h1>组织联系人</h1>
        </header>

        <div className="contacts-page-scroll custom-scrollbar">
          <div className="contacts-shell">
            {orgLoading ? <p className="contacts-status">加载组织…</p> : null}

            {!orgLoading && orgs.length === 0 ? <JoinOrgBanner /> : null}

            {orgError ? <p className="error-banner">{orgError}</p> : null}
            {error ? <p className="error-banner">{error}</p> : null}

            {currentOrg ? (
              <section className="contacts-invite-section">
                <h2 className="contacts-section-title">邀请同事加入</h2>
                <p className="contacts-section-desc">
                  将邀请码发给同事，注册时填写即可加入
                  <strong className="contacts-org-inline"> {currentOrg.name}</strong>
                  （{currentOrg.member_count} 人）
                </p>
                <div className="contacts-invite-field">
                  <span className="contacts-invite-key-icon">
                    <IconInviteKey />
                  </span>
                  <span className="contacts-invite-code-text">
                    {currentOrg.invite_code}
                  </span>
                  <button
                    type="button"
                    className={`contacts-invite-copy${inviteCopied ? ' copied' : ''}`}
                    aria-label="复制邀请码"
                    title={inviteCopied ? '已复制' : '复制邀请码'}
                    onClick={() => void copyInvite()}
                  >
                    <IconCopy copied={inviteCopied} />
                  </button>
                </div>
                {canReceive || canSend ? (
                  <p className="contacts-quick-links">
                    {canReceive ? (
                      <Link to="/inbox">原型收件箱</Link>
                    ) : (
                      <Link to="/inbox">已发原型</Link>
                    )}
                  </p>
                ) : null}
              </section>
            ) : null}

            <h2 className="contacts-section-title contacts-members-title">当前成员</h2>

            {loading && sortedMembers.length === 0 ? (
              <p className="contacts-empty">加载联系人…</p>
            ) : null}

            {!loading && currentOrg && sortedMembers.length === 0 ? (
              <p className="contacts-empty">组织内还没有其他成员，分享邀请码即可。</p>
            ) : null}

            {!currentOrg && !orgLoading && orgs.length > 0 ? (
              <p className="contacts-empty">请在左侧选择组织</p>
            ) : null}

            <ul className="contacts-member-grid">
              {sortedMembers.map((member) => (
                <ContactMemberCard
                  key={member.user_id}
                  member={member}
                  isSelf={member.user_id === user?.id}
                />
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}

function ContactMemberCard({
  member,
  isSelf,
}: {
  member: OrgMember
  isSelf: boolean
}) {
  const displayName = member.email.split('@')[0] ?? member.email
  const gradient = personAvatarGradient(member.user_id)
  const label = personAvatarLabel(displayName)

  return (
    <li className="contact-member-card">
      <span
        className="contact-member-avatar"
        style={{ background: gradient }}
        aria-hidden="true"
      >
        {label}
      </span>
      <div className="contact-member-body">
        <p className="contact-member-name">
          <span className="contact-member-name-text">{member.email}</span>
          {isSelf ? <span className="contact-member-self">我</span> : null}
        </p>
        <p className="contact-member-role">{ROLE_LABELS[member.role]}</p>
      </div>
    </li>
  )
}
