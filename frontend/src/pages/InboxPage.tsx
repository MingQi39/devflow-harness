import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import ConversationSidebar from '../components/ConversationSidebar'
import FilePreview from '../components/FilePreview'
import JoinOrgBanner from '../components/JoinOrgBanner'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { useInboxUnread } from '../hooks/useInboxUnread'
import { apiFetch } from '../lib/api'
import type { PrototypeDelivery } from '../types/org'

type DeliveryMode = 'inbox' | 'sent'

export default function InboxPage() {
  const navigate = useNavigate()
  const { user, permissions, logout } = useAuth()
  const { currentOrgId, orgs } = useOrg()
  const { refreshInboxUnread } = useInboxUnread()

  const canReceive = permissions.includes('prototype:receive')
  const canSend = permissions.includes('prototype:send')
  const mode: DeliveryMode = useMemo(
    () => (canReceive ? 'inbox' : 'sent'),
    [canReceive],
  )

  const [deliveries, setDeliveries] = useState<PrototypeDelivery[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [prototypeHtml, setPrototypeHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = deliveries.find((item) => item.id === activeId) ?? null

  const refreshList = useCallback(async () => {
    if (!currentOrgId) {
      setDeliveries([])
      return
    }
    if (mode === 'inbox' && !canReceive) return
    if (mode === 'sent' && !canSend) return

    setLoading(true)
    setError(null)
    try {
      const path =
        mode === 'inbox'
          ? `/orgs/${currentOrgId}/prototype-deliveries/inbox`
          : `/orgs/${currentOrgId}/prototype-deliveries/sent`
      const list = await apiFetch<PrototypeDelivery[]>(path)
      setDeliveries(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [canReceive, canSend, currentOrgId, mode])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const openDelivery = async (delivery: PrototypeDelivery) => {
    if (!currentOrgId) return
    setActiveId(delivery.id)
    setPrototypeHtml(null)
    try {
      if (mode === 'inbox' && !delivery.read_at) {
        await apiFetch(`/orgs/${currentOrgId}/prototype-deliveries/${delivery.id}/read`, {
          method: 'POST',
        })
        void refreshList()
        void refreshInboxUnread()
      }
      const file = await apiFetch<{ path: string; content: string }>(
        `/orgs/${currentOrgId}/prototype-deliveries/${delivery.id}/files/content?path=${encodeURIComponent('prototype.html')}`,
      )
      setPrototypeHtml(file.content)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载原型失败')
    }
  }

  if (!canReceive && !canSend) {
    return <Navigate to="/contacts" replace />
  }

  const title = mode === 'inbox' ? '原型收件箱' : '已发原型'
  const subtitle =
    mode === 'inbox'
      ? '开发同学在此查看 PM 发送的可点击原型快照'
      : '你发给开发同学的原型交付记录，可再次预览确认'

  return (
    <div className="chat-app">
      <ConversationSidebar
        conversations={[]}
        activeId={null}
        user={user}
        permissions={permissions}
        navActive={mode === 'inbox' ? 'inbox' : 'sent'}
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

      <main className="inbox-page">
        <header className="contacts-header">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>

        {orgs.length === 0 ? <JoinOrgBanner /> : null}
        {error ? <p className="error-banner">{error}</p> : null}
        {loading ? <p className="contacts-status">加载中…</p> : null}

        {!currentOrgId && orgs.length === 0 ? (
          <p className="contacts-status">
            加入组织后才可以{mode === 'inbox' ? '接收' : '查看已发'}原型。也可先到{' '}
            <Link to="/contacts">联系人</Link> 页加入。
          </p>
        ) : null}

        <div className="inbox-layout">
          <ul className="inbox-list custom-scrollbar">
            {deliveries.length === 0 && !loading ? (
              <li className="inbox-empty">
                {mode === 'inbox'
                  ? '暂无收到的原型，等 PM 在对话里点「发给开发」'
                  : '还没有发过原型，在对话预览区点「发给开发」即可'}
              </li>
            ) : null}
            {deliveries.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`inbox-item${activeId === item.id ? ' active' : ''}${mode === 'inbox' && !item.read_at ? ' unread' : ''}`}
                  onClick={() => void openDelivery(item)}
                >
                  <strong>{item.title}</strong>
                  <span>
                    {mode === 'inbox'
                      ? `来自 ${item.sender_email ?? 'PM'}`
                      : `发给 ${item.recipient_email ?? '开发'}`}
                  </span>
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                </button>
              </li>
            ))}
          </ul>

          <div className="inbox-detail">
            {active && prototypeHtml ? (
              <>
                {active.message ? <p className="inbox-message">{active.message}</p> : null}
                <FilePreview path="prototype.html" content={prototypeHtml} />
              </>
            ) : (
              <div className="workspace-preview-placeholder">
                <p className="workspace-preview-placeholder-title">选择一条记录查看原型</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
