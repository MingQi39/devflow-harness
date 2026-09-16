import MarkdownContent from './MarkdownContent'
import ToolCallBlock from './ToolCallBlock'
import type { ChatMessage } from '../types/chat'

interface ChatMessageRowProps {
  message: ChatMessage
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

export default function ChatMessageRow({ message }: ChatMessageRowProps) {
  if (message.role === 'tool') {
    const isResult =
      message.content.startsWith('Wrote ') ||
      message.content.startsWith('File not found') ||
      message.content.startsWith('Invalid tool') ||
      message.content.startsWith('Path ')
    return (
      <article className="message-row tool">
        <ToolCallBlock
          name={message.toolName ?? 'tool'}
          argumentsText={isResult ? undefined : message.content}
          result={isResult ? message.content : undefined}
        />
      </article>
    )
  }

  if (
    message.role === 'assistant' &&
    message.toolCalls &&
    message.toolCalls.length > 0 &&
    !message.content.trim()
  ) {
    return null
  }

  const isUser = message.role === 'user'

  return (
    <article className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-meta">
        <span>{isUser ? '你' : 'Agent'}</span>
        <time>{formatTime(message.createdAt)}</time>
      </div>
      <div className="message-bubble">
        <div className="message-body">
          {isUser ? (
            <p>{message.content}</p>
          ) : message.content ? (
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
          )}
        </div>
      </div>
    </article>
  )
}
