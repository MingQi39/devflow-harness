import { chatPath } from './chatRoutes'

const STORAGE_KEY = 'devflow:lastConversationId'

export function rememberConversationId(conversationId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, conversationId)
  } catch {
    // private mode / quota
  }
}

export function getLastConversationId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** 侧边栏「对话」入口：有最近会话则直达该会话路由 */
export function chatHomePath(): string {
  const last = getLastConversationId()
  return last ? chatPath(last, 'chat') : '/'
}
