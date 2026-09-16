import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import MarkdownContent from '../components/MarkdownContent'
import { apiFetch } from '../lib/api'
import { mapMessage } from '../lib/mappers'
import type { ChatMessage } from '../types/chat'

interface SharedMeta {
  title: string
  message_count: number
  shared_at: string
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [meta, setMeta] = useState<SharedMeta | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setError(null)

    Promise.all([
      apiFetch<SharedMeta>(`/shared/${token}`, { auth: false }),
      apiFetch<{ messages: Record<string, unknown>[] }>(
        `/shared/${token}/messages`,
        { auth: false },
      ),
    ])
      .then(([metaData, messageData]) => {
        setMeta(metaData)
        setMessages(messageData.messages.map(mapMessage))
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '分享不存在或已关闭')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return <div className="auth-loading">加载分享对话…</div>
  }

  if (error || !meta) {
    return (
      <div className="auth-page">
        <div className="auth-card-wrap">
          <div className="auth-card">
            <h1>无法查看</h1>
            <p className="auth-subtitle">{error ?? '分享链接无效'}</p>
            <Link to="/login" className="btn primary full">
              登录以开始对话
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="share-page">
      <div className="share-banner">只读分享 · 登录后可创建自己的对话</div>
      <header className="share-page-header">
        <div>
          <h1>{meta.title}</h1>
          <p className="chat-header-sub">
            {meta.message_count} 条消息 · 分享于 {formatTime(meta.shared_at)}
          </p>
        </div>
        <Link to="/login" className="btn primary sm">
          登录
        </Link>
      </header>

      <div className="chat-body custom-scrollbar">
        <div className="message-stream">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">暂无消息</p>
              <p className="empty-state-sub">这条对话还没有内容</p>
            </div>
          ) : null}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message-row ${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="message-meta">
                <span>{message.role === 'user' ? '用户' : 'Assistant'}</span>
                <time>{formatTime(message.createdAt)}</time>
              </div>
              <div className="message-bubble">
                <div className="message-body">
                  {message.role === 'assistant' ? (
                    <MarkdownContent content={message.content} />
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
