import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import ChatMessageRow from '../components/ChatMessageRow'
import ConversationSidebar from '../components/ConversationSidebar'
import FileTreePanel from '../components/FileTreePanel'
import ShareButton from '../components/ShareButton'
import JoinOrgBanner from '../components/JoinOrgBanner'
import SendPrototypeDialog from '../components/SendPrototypeDialog'
import StageBar from '../components/StageBar'
import { useOrg } from '../contexts/OrgContext'
import { useOrgContacts } from '../hooks/useOrgContacts'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import { chatPath, isFilesView } from '../lib/chatRoutes'
import {
  handleComposerCompositionEnd,
  shouldSubmitComposerOnEnter,
} from '../lib/composerKeyboard'
import { mapConversation, mapMessage } from '../lib/mappers'
import {
  chatWelcomeForRole,
  composerPlaceholder,
  roleBuildsPrototypeInSession,
  roleCanOpenSessionWorkspace,
  stageKickoffMessage,
} from '../lib/stageRoles'
import {
  STAGE_LABELS,
  STAGE_ORDER,
  preferredPreviewFiles,
  type SessionStage,
} from '../lib/sessionStage'
import { stageAdvanceBlockedReason } from '../lib/stageReadiness'
import { streamChat } from '../lib/streamChat'
import type { ChatMessage, Conversation, FileTreeNode } from '../types/chat'

function flattenFilePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = []
  const walk = (list: FileTreeNode[]) => {
    for (const node of list) {
      if (node.type === 'file') paths.push(node.path)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return paths
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export default function ChatPage() {
  const { user, permissions, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { conversationId } = useParams<{ conversationId?: string }>()
  const activeId = conversationId ?? null
  const workspaceOpen = isFilesView(location.pathname)
  const userRole = user?.role ?? 'pm'
  const showEmbeddedWorkspace = roleBuildsPrototypeInSession(userRole)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [bootLoading, setBootLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0)
  const [stageAdvancing, setStageAdvancing] = useState(false)
  const [workspaceFilePaths, setWorkspaceFilePaths] = useState<string[]>([])
  const [sendPrototypeOpen, setSendPrototypeOpen] = useState(false)
  const [sendToast, setSendToast] = useState<string | null>(null)
  const { currentOrgId } = useOrg()
  const { devMembers } = useOrgContacts()
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

  const activeStage = activeConversation?.stage ?? 'requirement'
  const canOpenSessionWorkspace = roleCanOpenSessionWorkspace(userRole, activeStage)
  const showWorkspacePanel = Boolean(
    activeId && canOpenSessionWorkspace && (showEmbeddedWorkspace || workspaceOpen),
  )
  const chatWelcome = chatWelcomeForRole(userRole, activeStage)

  useEffect(() => {
    if (!activeId || !workspaceOpen || canOpenSessionWorkspace) return
    navigate(chatPath(activeId, 'chat'), { replace: true })
  }, [activeId, workspaceOpen, canOpenSessionWorkspace, navigate])

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

  useEffect(() => {
    if (!activeId) {
      setWorkspaceFilePaths([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const data = await apiFetch<{ tree: FileTreeNode[] }>(
          `/conversations/${activeId}/files`,
        )
        if (!cancelled) setWorkspaceFilePaths(flattenFilePaths(data.tree))
      } catch {
        if (!cancelled) setWorkspaceFilePaths([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeId, fileTreeRefreshKey])

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

  const sendUserMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      const submitConversationId = activeId
      if (!trimmed || isLoading || !submitConversationId) return

      setError(null)
      setIsLoading(true)
      messageLoadSeqRef.current += 1

      pinnedToBottomRef.current = true

      const now = new Date().toISOString()
      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: trimmed,
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
          message: trimmed,
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
            const stage =
              conversations.find((item) => item.id === submitConversationId)?.stage ??
              'requirement'
            const role = user?.role ?? 'pm'
            const shouldOpenFiles =
              roleCanOpenSessionWorkspace(role, stage) &&
              (window.matchMedia('(max-width: 768px)').matches ||
                !roleBuildsPrototypeInSession(role))
            if (shouldOpenFiles) {
              navigate(chatPath(submitConversationId, 'files'))
            }
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
    },
    [
      activeId,
      conversations,
      isLoading,
      loadMessages,
      navigate,
      refreshConversations,
      scrollToBottom,
      user?.role,
    ],
  )

  const handleStageChange = async (targetStage: SessionStage) => {
    if (!activeId || isLoading || stageAdvancing) return
    const fromIndex = STAGE_ORDER.indexOf(activeStage)
    const toIndex = STAGE_ORDER.indexOf(targetStage)
    setError(null)
    setStageAdvancing(true)
    try {
      const updated = await apiFetch<Record<string, unknown>>(
        `/conversations/${activeId}/stage`,
        {
          method: 'PATCH',
          body: JSON.stringify({ stage: targetStage }),
        },
      )
      const conversation = mapConversation(updated)
      setConversations((current) =>
        current.map((item) => (item.id === conversation.id ? conversation : item)),
      )
      setFileTreeRefreshKey((value) => value + 1)
      if (toIndex > fromIndex) {
        const role = user?.role ?? 'pm'
        const kickoff = stageKickoffMessage(conversation.stage, role)
        if (kickoff) {
          await sendUserMessage(kickoff)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换阶段失败')
    } finally {
      setStageAdvancing(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isComposingRef.current || compositionEnterLockRef.current) return
    const text = input.trim()
    if (!text || isLoading || !activeId) return
    setInput('')
    await sendUserMessage(text)
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

  const stageBlockedReason = useMemo(
    () => stageAdvanceBlockedReason(activeStage, messages, workspaceFilePaths),
    [activeStage, messages, workspaceFilePaths],
  )

  if (bootLoading || (!conversationId && conversations.length > 0)) {
    return <div className="auth-loading">加载对话…</div>
  }

  return (
    <div
      className={`chat-app${workspaceOpen ? ' is-files-view' : ''}${
        showEmbeddedWorkspace && !workspaceOpen ? ' has-embedded-workspace' : ''
      }${!showWorkspacePanel && !workspaceOpen ? ' is-chat-only' : ''}`}
    >
      {activeId && currentOrgId ? (
        <SendPrototypeDialog
          open={sendPrototypeOpen}
          orgId={currentOrgId}
          conversationId={activeId}
          devMembers={devMembers}
          onClose={() => setSendPrototypeOpen(false)}
          onSent={() => {
            setSendToast('已发送原型，开发同学可在「原型收件箱」查看')
            window.setTimeout(() => setSendToast(null), 4000)
          }}
        />
      ) : null}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        user={user}
        permissions={permissions}
        navActive="chat"
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        onLogout={handleLogout}
      />

      {showWorkspacePanel ? (
        <FileTreePanel
          key={activeId}
          conversationId={activeId}
          refreshKey={fileTreeRefreshKey}
          preferredPaths={preferredPreviewFiles(activeStage)}
          showBackButton={workspaceOpen}
          showSendToDevelopers={
            Boolean(activeId && currentOrgId && permissions.includes('prototype:send'))
          }
          onSendToDevelopers={() => setSendPrototypeOpen(true)}
          onBackToChat={() => navigate(chatPath(activeId!, 'chat'))}
          emptyHintVariant={showEmbeddedWorkspace ? 'pm' : 'dev'}
        />
      ) : null}

      <div className="chat-main">
          <header className="chat-header">
            <div>
              <h1 className="chat-header-title">{activeConversation?.title ?? '新对话'}</h1>
              <p className="chat-header-sub">
                {STAGE_LABELS[activeStage]} · 待办 Demo 闭环
              </p>
            </div>
            <div className="header-actions">
              {activeId && canOpenSessionWorkspace ? (
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

          <JoinOrgBanner />
          {sendToast ? <div className="toast-banner">{sendToast}</div> : null}

          {activeId ? (
            <StageBar
              stage={activeStage}
              role={user?.role ?? 'pm'}
              disabled={isLoading || stageAdvancing}
              blockedReason={stageBlockedReason}
              onStageChange={(stage) => void handleStageChange(stage)}
            />
          ) : null}

          <div
            ref={chatBodyRef}
            className="chat-body custom-scrollbar"
            onScroll={handleChatScroll}
          >
            <div className="message-stream">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <img src="/favicon.png" alt="" width={56} height={56} className="empty-state-logo" />
                  <p className="empty-state-title">{chatWelcome.title}</p>
                  <p className="empty-state-sub">{chatWelcome.sub}</p>
                  {chatWelcome.demoPrompt ? (
                    <button
                      type="button"
                      className="demo-prompt-chip"
                      onClick={() => setInput(chatWelcome.demoPrompt!)}
                    >
                      {chatWelcome.demoPrompt}
                    </button>
                  ) : null}
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
                placeholder={composerPlaceholder(activeStage, user?.role ?? 'pm')}
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
    </div>
  )
}
