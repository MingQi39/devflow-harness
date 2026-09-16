import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import ChatMessageRow from '../components/ChatMessageRow'
import ConversationSidebar from '../components/ConversationSidebar'
import FileTreePanel from '../components/FileTreePanel'
import ShareButton from '../components/ShareButton'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import { chatPath, isFilesView } from '../lib/chatRoutes'
import {
  handleComposerCompositionEnd,
  shouldSubmitComposerOnEnter,
} from '../lib/composerKeyboard'
import { mapConversation, mapMessage } from '../lib/mappers'
import { streamChat } from '../lib/streamChat'
import type { ChatMessage, Conversation } from '../types/chat'

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export default function ChatPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { conversationId } = useParams<{ conversationId?: string }>()
  const activeId = conversationId ?? null
  const workspaceOpen = isFilesView(location.pathname)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [bootLoading, setBootLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const chatBodyRef = useRef<HTMLDivElement | null>(null)
  const pinnedToBottomRef = useRef(true)
  const activeIdRef = useRef<string | null>(null)
  const messageLoadSeqRef = useRef(0)
  const assistantIdRef = useRef<string | null>(null)
  const hadToolSinceAssistantRef = useRef(false)
  const isComposingRef = useRef(false)
  const compositionEnterLockRef = useRef(false)
  const compositionState = {
    isComposingRef,
    enterLockRef: compositionEnterLockRef,
  }

  activeIdRef.current = activeId

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null

  const refreshConversations = useCallback(async () => {
    const raw = await apiFetch<Record<string, unknown>[]>('/conversations')
    const list = raw.map(mapConversation)
    setConversations(list)
    return list
  }, [])

  const loadMessages = useCallback(async (targetConversationId: string) => {
    const seq = ++messageLoadSeqRef.current
    const data = await apiFetch<{ messages: Record<string, unknown>[] }>(
      `/conversations/${targetConversationId}/messages`,
    )
    if (seq !== messageLoadSeqRef.current) return
    if (activeIdRef.current !== targetConversationId) return
    setMessages(data.messages.map(mapMessage))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let list = await refreshConversations()
        if (cancelled) return

        if (list.length === 0) {
          const created = await apiFetch<Record<string, unknown>>('/conversations', {
            method: 'POST',
            body: JSON.stringify({ title: '新对话' }),
          })
          list = [mapConversation(created)]
          setConversations(list)
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
  }, [refreshConversations])

  useEffect(() => {
    if (bootLoading || conversations.length === 0) return

    if (!conversationId) {
      navigate(chatPath(conversations[0].id, 'chat'), { replace: true })
      return
    }

    if (!conversations.some((item) => item.id === conversationId)) {
      navigate(chatPath(conversations[0].id, 'chat'), { replace: true })
    }
  }, [bootLoading, conversationId, conversations, navigate])

  useEffect(() => {
    if (!activeId || bootLoading) return

    const targetConversationId = activeId
    const seq = ++messageLoadSeqRef.current
    let cancelled = false

    ;(async () => {
      try {
        const data = await apiFetch<{ messages: Record<string, unknown>[] }>(
          `/conversations/${targetConversationId}/messages`,
        )
        if (cancelled || seq !== messageLoadSeqRef.current) return
        if (activeIdRef.current !== targetConversationId) return
        setMessages(data.messages.map(mapMessage))
        pinnedToBottomRef.current = true
        setFileTreeRefreshKey((value) => value + 1)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载消息失败')
      }
    })()

    return () => {
      cancelled = true
      abortRef.current?.abort()
      abortRef.current = null
      setIsLoading(false)
    }
  }, [activeId, bootLoading])

  const isNearBottom = useCallback((element: HTMLElement) => {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= 80
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = chatBodyRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  const handleChatScroll = useCallback(() => {
    const element = chatBodyRef.current
    if (!element) return
    pinnedToBottomRef.current = isNearBottom(element)
  }, [isNearBottom])

  useEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollToBottom('auto')
    }
  }, [messages, isLoading, scrollToBottom])

  const appendAssistantMessage = (assistantId: string, now: string) => {
    assistantIdRef.current = assistantId
    hadToolSinceAssistantRef.current = false
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: now,
      },
    ])
  }

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return
      abortRef.current?.abort()
      abortRef.current = null
      setIsLoading(false)
      setInput('')
      setError(null)
      navigate(chatPath(id, 'chat'))
    },
    [navigate],
  )

  const handleCreateConversation = async () => {
    const created = await apiFetch<Record<string, unknown>>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: '新对话' }),
    })
    const conversation = mapConversation(created)
    setConversations((current) => [conversation, ...current])
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
    setMessages([])
    setInput('')
    setError(null)
    setFileTreeRefreshKey((value) => value + 1)
    navigate(chatPath(conversation.id, 'chat'))
  }

  const handleDeleteConversation = async (id: string) => {
    await apiFetch(`/conversations/${id}`, { method: 'DELETE' })
    const remaining = conversations.filter((item) => item.id !== id)
    setConversations(remaining)
    if (activeId === id) {
      setMessages([])
      setFileTreeRefreshKey((value) => value + 1)
      if (remaining.length === 0) {
        await handleCreateConversation()
        return
      }
      navigate(chatPath(remaining[0].id, 'chat'))
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
    if (isComposingRef.current || compositionEnterLockRef.current) return
    const text = input.trim()
    const submitConversationId = activeId
    if (!text || isLoading || !submitConversationId) return

    setError(null)
    setInput('')
    setIsLoading(true)
    messageLoadSeqRef.current += 1

    pinnedToBottomRef.current = true

    const now = new Date().toISOString()
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: text,
      createdAt: now,
    }
    const assistantId = createId()
    assistantIdRef.current = assistantId
    hadToolSinceAssistantRef.current = false
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: now,
      },
    ])
    requestAnimationFrame(() => scrollToBottom('smooth'))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat({
        conversationId: submitConversationId,
        message: text,
        signal: controller.signal,
        onContent: (chunk) => {
          if (activeIdRef.current !== submitConversationId) return
          if (hadToolSinceAssistantRef.current) {
            const nextAssistantId = createId()
            appendAssistantMessage(nextAssistantId, new Date().toISOString())
          }
          const currentAssistantId = assistantIdRef.current
          if (!currentAssistantId) return
          setMessages((current) =>
            current.map((item) =>
              item.id === currentAssistantId
                ? { ...item, content: item.content + chunk }
                : item,
            ),
          )
        },
        onToolCall: ({ id, name, arguments: args }) => {
          if (activeIdRef.current !== submitConversationId) return
          hadToolSinceAssistantRef.current = true
          setMessages((current) => [
            ...current,
            {
              id: `tool-${id}`,
              role: 'tool',
              content: args,
              toolCallId: id,
              toolName: name,
              createdAt: new Date().toISOString(),
            },
          ])
        },
        onToolResult: ({ id, result }) => {
          if (activeIdRef.current !== submitConversationId) return
          setMessages((current) =>
            current.map((item) =>
              item.toolCallId === id ? { ...item, content: result } : item,
            ),
          )
        },
        onFileChanged: () => {
          if (activeIdRef.current !== submitConversationId) return
          navigate(chatPath(submitConversationId, 'files'))
          setFileTreeRefreshKey((value) => value + 1)
        },
        onError: (message) => {
          if (activeIdRef.current !== submitConversationId) return
          setError(message)
        },
      })
      if (activeIdRef.current !== submitConversationId) return
      await refreshConversations()
      await loadMessages(submitConversationId)
      setFileTreeRefreshKey((value) => value + 1)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (activeIdRef.current === submitConversationId) {
          await loadMessages(submitConversationId)
        }
        return
      }
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantIdRef.current && !item.content
            ? { ...item, content: `请求失败：${message}` }
            : item,
        ),
      )
    } finally {
      abortRef.current = null
      assistantIdRef.current = null
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

  if (bootLoading || (!conversationId && conversations.length > 0)) {
    return <div className="auth-loading">加载对话…</div>
  }

  return (
    <div className="chat-app">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        user={user}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        onLogout={handleLogout}
      />

      {workspaceOpen && activeId ? (
        <FileTreePanel
          conversationId={activeId}
          refreshKey={fileTreeRefreshKey}
          conversationTitle={activeConversation?.title ?? '新对话'}
          onBackToChat={() => navigate(chatPath(activeId, 'chat'))}
        />
      ) : (
        <div className="chat-main">
          <header className="chat-header">
            <div>
              <h1 className="chat-header-title">{activeConversation?.title ?? '新对话'}</h1>
              <p className="chat-header-sub">Agent Loop · 读/写项目文件</p>
            </div>
            <div className="header-actions">
              {activeId ? (
                <button
                  type="button"
                  className="btn ghost sm workspace-toggle-btn"
                  onClick={() => navigate(chatPath(activeId, 'files'))}
                  title="查看项目文件"
                >
                  项目文件
                </button>
              ) : null}
              {activeId ? (
                <ShareButton
                  key={activeId}
                  conversationId={activeId}
                  initialShared={Boolean(activeConversation?.shareToken)}
                  onChange={() => void refreshConversations()}
                />
              ) : null}
              {isLoading ? (
                <button type="button" className="btn secondary sm" onClick={handleStop}>
                  停止
                </button>
              ) : null}
            </div>
          </header>

          <div
            ref={chatBodyRef}
            className="chat-body custom-scrollbar"
            onScroll={handleChatScroll}
          >
            <div className="message-stream">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <img src="/favicon.png" alt="" width={56} height={56} className="empty-state-logo" />
                  <p className="empty-state-title">开始一段对话</p>
                  <p className="empty-state-sub">
                    例如：「创建一个 index.html，写一个简单的待办列表页面」
                  </p>
                </div>
              ) : null}

              {messages.map((message) => (
                <ChatMessageRow key={message.id} message={message} />
              ))}

              {isLoading ? (
                <div className="agent-generating-hint" aria-live="polite">
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Agent 正在处理…
                </div>
              ) : null}
            </div>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="composer-wrap">
            <form className="composer-card" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="描述需求或让 Agent 修改项目文件…（Enter 发送，Shift+Enter 换行）"
                rows={1}
                disabled={isLoading || !activeId}
                onCompositionStart={() => {
                  isComposingRef.current = true
                }}
                onCompositionEnd={() => {
                  handleComposerCompositionEnd(compositionState)
                }}
                onKeyDown={(event) => {
                  if (!shouldSubmitComposerOnEnter(event, compositionState)) return
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
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
      )}
    </div>
  )
}
