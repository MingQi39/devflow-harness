import type { ChatMessage } from '../types/chat'

const STORAGE_KEY = 'devflow-harness-m1-chat'

export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
}

export function clearMessages(): void {
  localStorage.removeItem(STORAGE_KEY)
}
