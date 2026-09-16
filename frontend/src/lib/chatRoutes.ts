export type ChatView = 'chat' | 'files'

export function chatPath(conversationId: string, view: ChatView = 'chat'): string {
  return view === 'files' ? `/chat/${conversationId}/files` : `/chat/${conversationId}`
}

export function isFilesView(pathname: string): boolean {
  return /\/files\/?$/.test(pathname)
}
