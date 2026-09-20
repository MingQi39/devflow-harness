import { isSessionStage, type SessionStage } from './sessionStage'
import type { ChatMessage, Conversation, ToolCallInfo } from '../types/chat'

function mapDate(value: unknown): string {
  return typeof value === 'string' ? value : new Date().toISOString()
}

function mapToolCalls(raw: unknown): ToolCallInfo[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.map((item) => {
    const record = item as Record<string, unknown>
    const fn = record.function as Record<string, unknown> | undefined
    return {
      id: String(record.id ?? ''),
      name: String(fn?.name ?? ''),
      arguments: String(fn?.arguments ?? ''),
    }
  })
}

function normalizeConversationTitle(title: unknown): string {
  const value = String(title ?? '新对话')
  if (value === '新 Session' || value === 'Session') return '新对话'
  return value
}

export function mapConversation(raw: Record<string, unknown>): Conversation {
  const stage: SessionStage = isSessionStage(raw.stage) ? raw.stage : 'requirement'
  return {
    id: String(raw.id),
    title: normalizeConversationTitle(raw.title),
    stage,
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
    toolCalls: mapToolCalls(raw.tool_calls),
    toolCallId: (raw.tool_call_id as string | null | undefined) ?? null,
    toolName: (raw.tool_name as string | null | undefined) ?? null,
  }
}
