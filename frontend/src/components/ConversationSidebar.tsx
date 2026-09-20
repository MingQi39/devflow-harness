import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDialog from './ConfirmDialog'
import OrganizationSwitcher from './OrganizationSwitcher'
import { useInboxUnread } from '../hooks/useInboxUnread'
import { STAGE_LABELS } from '../lib/sessionStage'
import { ROLE_LABELS } from '../types/auth'
import type { User } from '../types/auth'
import type { Conversation } from '../types/chat'

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  user: User | null
  permissions?: string[]
  navActive?: 'chat' | 'contacts' | 'inbox' | 'sent'
  /** 联系人 / 收件箱等页面不展示对话列表，避免与主区内容混淆 */
  showConversations?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onLogout: () => void
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function avatarLetter(email: string): string {
  return (email[0] ?? '?').toUpperCase()
}

export default function ConversationSidebar({
  conversations,
  activeId,
  user,
  permissions = [],
  navActive = 'chat',
  showConversations = true,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onLogout,
}: ConversationSidebarProps) {
  const canInbox = permissions.includes('prototype:receive')
  const canSent = permissions.includes('prototype:send')
  const { unreadCount } = useInboxUnread()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const deleteTarget = conversations.find((item) => item.id === deleteTargetId) ?? null

  return (
    <aside className="conversation-sidebar">
      <div className="sidebar-brand">
        <img src="/favicon.png" alt="DevFlow Harness" width={36} height={36} />
        <span className="sidebar-brand-text">DevFlow Harness</span>
      </div>

      <OrganizationSwitcher />

      <nav className="sidebar-nav" aria-label="主导航">
        <Link
          to="/"
          className={`sidebar-nav-link${navActive === 'chat' ? ' active' : ''}`}
        >
          对话
        </Link>
        <Link
          to="/contacts"
          className={`sidebar-nav-link${navActive === 'contacts' ? ' active' : ''}`}
        >
          联系人
        </Link>
        {canInbox ? (
          <Link
            to="/inbox"
            className={`sidebar-nav-link${navActive === 'inbox' ? ' active' : ''}`}
          >
            原型收件箱
            {unreadCount > 0 ? (
              <span className="sidebar-nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            ) : null}
          </Link>
        ) : null}
        {!canInbox && canSent ? (
          <Link
            to="/inbox"
            className={`sidebar-nav-link${navActive === 'sent' ? ' active' : ''}`}
          >
            已发原型
          </Link>
        ) : null}
      </nav>

      {showConversations ? (
        <>
          <div className="sidebar-section-label">对话列表</div>
          <div className="sidebar-header">
            <h2>{conversations.length} 个对话</h2>
            <button type="button" className="sidebar-new-btn" onClick={onCreate}>
              <IconPlus />
              新建
            </button>
          </div>

          <ul className="conversation-list custom-scrollbar">
            {conversations.length === 0 ? (
              <li className="conversation-empty">暂无对话</li>
            ) : (
              conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  isActive={activeId === conversation.id}
                  onSelect={() => onSelect(conversation.id)}
                  onDelete={() => setDeleteTargetId(conversation.id)}
                  onRename={(title) => onRename(conversation.id, title)}
                />
              ))
            )}
          </ul>
        </>
      ) : (
        <div className="sidebar-compact-hint">
          <Link to="/" className="sidebar-back-link">
            返回对话工作台
          </Link>
        </div>
      )}

      {user ? (
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{avatarLetter(user.email)}</div>
            <div className="user-meta">
              <div className="user-email">{user.email}</div>
              <span className="role-badge">{ROLE_LABELS[user.role]}</span>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn logout-btn"
            onClick={onLogout}
            title="登出"
            aria-label="登出"
          >
            <IconLogOut />
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除对话"
        message={
          deleteTarget
            ? `确定删除「${deleteTarget.title}」吗？删除后无法恢复。`
            : '确定删除这条对话吗？'
        }
        confirmText="删除"
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (!deleteTargetId) return
          onDelete(deleteTargetId)
          setDeleteTargetId(null)
        }}
      />
    </aside>
  )
}

interface ConversationRowProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}

function ConversationRow({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: ConversationRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    setDraft(conversation.title)
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editing, conversation.title])

  const commitRename = () => {
    const title = draft.trim()
    setEditing(false)
    if (title && title !== conversation.title) onRename(title)
    else setDraft(conversation.title)
  }

  const handleRenameSubmit = (event: FormEvent) => {
    event.preventDefault()
    commitRename()
  }

  return (
    <li
      className={`conversation-item ${isActive ? 'active' : ''} ${editing ? 'editing' : ''}`}
    >
      {isActive ? <span className="conversation-active-bar" aria-hidden="true" /> : null}
      <IconMessage className="conversation-icon" />
      {editing ? (
        <form className="conversation-meta" onSubmit={handleRenameSubmit}>
          <input
            ref={inputRef}
            className="conversation-rename-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(conversation.title)
                setEditing(false)
              }
            }}
            aria-label="对话标题"
          />
        </form>
      ) : (
        <button type="button" className="conversation-select" onClick={onSelect}>
          <span className="conversation-title">{conversation.title}</span>
          <span className="conversation-time">
            <span className="conversation-stage">{STAGE_LABELS[conversation.stage]}</span>
            {formatRelativeTime(conversation.updatedAt)}
          </span>
        </button>
      )}
      <div className="conversation-actions">
        <button
          type="button"
          className="icon-btn"
          title="重命名"
          aria-label="重命名"
          onClick={(event) => {
            event.stopPropagation()
            setEditing(true)
          }}
        >
          <IconPencil />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          title="删除"
          aria-label="删除"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <IconTrash />
        </button>
      </div>
    </li>
  )
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function IconMessage({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  )
}

function IconLogOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}
