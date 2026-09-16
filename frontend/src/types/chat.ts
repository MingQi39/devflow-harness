export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
}

export interface Conversation {
  id: string
  title: string
  shareToken: string | null
  sharedAt: string | null
  createdAt: string
  updatedAt: string
}
