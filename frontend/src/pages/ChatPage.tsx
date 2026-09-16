import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConversationSidebar from '../components/ConversationSidebar'
import MarkdownContent from '../components/MarkdownContent'
import ShareButton from '../components/ShareButton'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import { mapConversation, mapMessage } from '../lib/mappers'
import { streamChat } from '../lib/streamChat'
import type { ChatMessage, Conversation } from '../types/chat'

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

export default function ChatPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [bootLoading, setBootLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const messageLoadSeqRef = useRef(0)

  activeIdRef.current = activeId

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null

  const refreshConversations = useCallback(async (selectId?: string) => {
    const raw = await apiFetch<Record<string, unknown>[]>('/conversations')
    const list = raw.map(mapConversation)
    setConversations(list)
    if (selectId) {
      setActiveId(selectId)
    } else if (list.length > 0 && !list.some((item) => item.id === activeId)) {
      setActiveId(list[0].id)
    }
    return list
  }, [activeId])

  const loadMessages = useCallback(async (conversationId: string) => {
    const seq = ++messageLoadSeqRef.current
    const data = await apiFetch<{ messages: Record<string, unknown>[] }>(
      `/conversations/${conversationId}/messages`,
    )
    if (seq !== messageLoadSeqRef.current) return
    if (activeIdRef.current !== conversationId) return
    setMessages(data.messages.map(mapMessage))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let list = await refreshConversations()
        if (list.length === 0) {
          const created = await apiFetch<Record<string, unknown>>('/conversations', {
            method: 'POST',
            body: JSON.stringify({ title: '新对话' }),
          })
          list = [mapConversation(created)]
          setConversations(list)
          setActiveId(list[0].id)
        } else if (!activeId) {
          setActiveId(list[0].id)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!cancelled) setBootLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeId || bootLoading) return

    const conversationId = activeId
    const seq = ++messageLoadSeqRef.current
    let cancelled = false

    ;(async () => {
      try {
        const data = await apiFetch<{ messages: Record<string, unknown>[] }>(
          `/conversations/${conversationId}/messages`,
        )
        if (cancelled || seq !== messageLoadSeqRef.current) return
        if (activeIdRef.current !== conversationId) return
        setMessages(data.messages.map(mapMessage))
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载消息失败')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeId, bootLoading])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleCreateConversation = async () => {
    const created = await apiFetch<Record<string, unknown>>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: '新对话' }),
    })
    const conversation = mapConversation(created)
    setConversations((current) => [conversation, ...current])
    setActiveId(conversation.id)
    setMessages([])
    setError(null)
  }

  const handleDeleteConversation = async (id: string) => {
    await apiFetch(`/conversations/${id}`, { method: 'DELETE' })
    const remaining = conversations.filter((item) => item.id !== id)
    setConversations(remaining)
    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? null)
      setMessages([])
      if (remaining.length === 0) {
        await handleCreateConversation()
      }
    }
  }

  const handleRenameConversation = async (id: string, title: string) => {
    const updated = await apiFetch<Record<string, unknown>>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
    const conversation = mapConversation(updated)
    setConversations((current) =>
      current.map((item) => (item.id === id ? conversation : item)),
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = input.trim()
    if (!text || isLoading || !activeId) return

    setError(null)
    setInput('')
    setIsLoading(true)
    messageLoadSeqRef.current += 1

    const assistantId = createId()
    const now = new Date().toISOString()
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: text,
      createdAt: now,
    }
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: now,
    }
    setMessages((current) => [...current, userMessage, assistantMessage])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat({
        conversationId: activeId,
        message: text,
        signal: controller.signal,
        onChunk: (chunk) => {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? { ...item, content: item.content + chunk }
                : item,
            ),
          )
        },
      })
      await refreshConversations(activeId)
      await loadMessages(activeId)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        await loadMessages(activeId)
        return
      }
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId && !item.content
            ? { ...item, content: `请求失败：${message}` }
            : item,
        ),
      )
    } finally {
      abortRef.current = null
      setIsLoading(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (bootLoading) {
    return <div className="auth-loading">加载对话…</div>
  }

  return (
    <div className="chat-app">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        user={user}
        onSelect={setActiveId}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        onLogout={handleLogout}
      />

      <div className="chat-main">
        <header className="chat-header">
          <div>
            <h1 className="chat-header-title">{activeConversation?.title ?? '对话'}</h1>
            <p className="chat-header-sub">SSE 流式对话 · Markdown 渲染</p>
          </div>
          <div className="header-actions">
            {activeId ? (
              <ShareButton
                key={activeId}
                conversationId={activeId}
                initialShared={Boolean(activeConversation?.shareToken)}
                onChange={() => void refreshConversations(activeId)}
              />
            ) : null}
            {isLoading ? (
              <button type="button" className="btn secondary sm" onClick={handleStop}>
                停止
              </button>
            ) : null}
          </div>
        </header>

        <div className="chat-body custom-scrollbar">
          <div className="message-stream">
            {messages.length === 0 ? (
              <div className="empty-state">
                <img src="/favicon.png" alt="" width={56} height={56} className="empty-state-logo" />
                <p className="empty-state-title">开始一段新对话</p>
                <p className="empty-state-sub">输入消息，体验 SSE 流式回复</p>
              </div>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`message-row ${message.role === 'user' ? 'user' : 'assistant'}`}
              >
                <div className="message-meta">
                  <span>{message.role === 'user' ? '你' : 'Assistant'}</span>
                  <time>{formatTime(message.createdAt)}</time>
                </div>
                <div className="message-bubble">
                  <div className="message-body">
                    {message.role === 'assistant' ? (
                      message.content ? (
                        <MarkdownContent content={message.content} />
                      ) : (
                        <span className="typing">
                          正在生成
                          <span className="typing-dots" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                        </span>
                      )
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </div>
              </article>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        <div className="composer-wrap">
          <form className="composer-card" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              rows={1}
              disabled={isLoading || !activeId}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <button
              type="submit"
              className="btn-send"
              disabled={isLoading || !input.trim() || !activeId}
              title={isLoading ? '生成中' : '发送'}
              aria-label={isLoading ? '生成中' : '发送'}
            >
              ↑
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
