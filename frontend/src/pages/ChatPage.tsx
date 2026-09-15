import { FormEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { clearMessages, loadMessages, saveMessages } from '../lib/storage'
import { streamChat } from '../lib/streamChat'
import type { ChatMessage } from '../types/chat'

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  }
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages())
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    saveMessages(messages)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    setError(null)
    setInput('')
    setIsLoading(true)

    const userMessage = createMessage('user', text)
    const assistantId = crypto.randomUUID()
    const assistantMessage = createMessage('assistant', '')
    assistantMessage.id = assistantId

    const history = [...messages, userMessage]
    setMessages([...history, assistantMessage])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat({
        message: text,
        history: messages,
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
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
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

  const handleClear = () => {
    if (isLoading) handleStop()
    setMessages([])
    clearMessages()
    setError(null)
    setInput('')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">DevFlow Harness · M1</p>
          <h1>Agent Harness 流式对话</h1>
          <p className="subtitle">全栈研发平台的第一块地基：SSE 流式 Chat + Markdown + 本地持久化</p>
        </div>
        <div className="header-actions">
          {isLoading ? (
            <button type="button" className="btn secondary" onClick={handleStop}>
              停止生成
            </button>
          ) : null}
          <button type="button" className="btn ghost" onClick={handleClear}>
            清空对话
          </button>
        </div>
      </header>

      <main className="chat-panel">
        <div className="message-list">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>发送第一条消息，开始 Milestone 1 的流式对话。</p>
            </div>
          ) : null}

          {messages.map((message) => (
            <article
              key={message.id}
              className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="message-meta">
                <span>{message.role === 'user' ? '你' : 'Assistant'}</span>
                <time>{formatTime(message.createdAt)}</time>
              </div>
              <div className="message-body">
                {message.role === 'assistant' ? (
                  message.content ? (
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  ) : (
                    <span className="typing">正在生成…</span>
                  )
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            rows={3}
            disabled={isLoading}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <button type="submit" className="btn primary" disabled={isLoading || !input.trim()}>
            {isLoading ? '生成中…' : '发送'}
          </button>
        </form>
      </main>
    </div>
  )
}
