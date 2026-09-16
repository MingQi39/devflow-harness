import { getToken } from './api'

export interface StreamEventHandlers {
  onContent?: (chunk: string) => void
  onToolCall?: (payload: { id: string; name: string; arguments: string }) => void
  onToolResult?: (payload: { id: string; name: string; result: string }) => void
  onFileChanged?: () => void
  onDone?: () => void
  onStopped?: () => void
  onError?: (message: string) => void
}

interface StreamOptions extends StreamEventHandlers {
  conversationId: string
  message: string
  signal?: AbortSignal
}

type StreamPayload = {
  type?: string
  content?: string
  error?: string
  id?: string
  name?: string
  arguments?: string
  result?: string
}

export async function streamChat({
  conversationId,
  message,
  signal,
  onContent,
  onToolCall,
  onToolResult,
  onFileChanged,
  onDone,
  onStopped,
  onError,
}: StreamOptions): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      message,
    }),
    signal,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Request failed: ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Response body is empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const line = part.split('\n').find((item) => item.startsWith('data: '))
      if (!line) continue

      const payload = line.slice(6)
      if (payload === '[DONE]') {
        onDone?.()
        return
      }

      try {
        const data = JSON.parse(payload) as StreamPayload
        switch (data.type) {
          case 'content':
            if (data.content) onContent?.(data.content)
            break
          case 'tool_call':
            if (data.id && data.name !== undefined) {
              onToolCall?.({
                id: data.id,
                name: data.name,
                arguments: data.arguments ?? '',
              })
            }
            break
          case 'tool_result':
            if (data.id && data.name !== undefined) {
              onToolResult?.({
                id: data.id,
                name: data.name,
                result: data.result ?? '',
              })
            }
            break
          case 'file_changed':
            onFileChanged?.()
            break
          case 'started':
            break
          case 'stopped':
            onStopped?.()
            return
          case 'error':
            if (data.error) onError?.(data.error)
            break
          case 'done':
            onDone?.()
            break
          default:
            if (data.error) onError?.(data.error)
            else if (data.content) onContent?.(data.content)
            break
        }
      } catch (error) {
        if (error instanceof SyntaxError) continue
        throw error
      }
    }
  }
}
