import { getToken } from './api'

interface StreamOptions {
  conversationId: string
  message: string
  signal?: AbortSignal
  onChunk: (chunk: string) => void
}

export async function streamChat({
  conversationId,
  message,
  signal,
  onChunk,
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
      const line = part
        .split('\n')
        .find((item) => item.startsWith('data: '))
      if (!line) continue

      const payload = line.slice(6)
      if (payload === '[DONE]') return

      try {
        const data = JSON.parse(payload) as { content?: string; error?: string }
        if (data.error) throw new Error(data.error)
        if (data.content) onChunk(data.content)
      } catch (error) {
        if (error instanceof SyntaxError) continue
        throw error
      }
    }
  }
}
