import type { ChatMessage, Conversation } from '../types/chat'

function mapDate(value: unknown): string {
  return typeof value === 'string' ? value : new Date().toISOString()
}

export function mapConversation(raw: Record<string, unknown>): Conversation {
  return {
    id: String(raw.id),
    title: String(raw.title ?? '新对话'),
    shareToken: (raw.share_token as string | null | undefined) ?? null,
    sharedAt: (raw.shared_at as string | null | undefined) ?? null,
    createdAt: mapDate(raw.created_at),
    updatedAt: mapDate(raw.updated_at),
  }
}

export function mapMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    id: String(raw.id),
    role: raw.role as ChatMessage['role'],
    content: String(raw.content ?? ''),
    createdAt: mapDate(raw.created_at),
  }
}
