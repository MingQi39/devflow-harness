export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ToolCallInfo {
  id: string
  name: string
  arguments: string
  result?: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  toolCalls?: ToolCallInfo[]
  toolCallId?: string | null
  toolName?: string | null
}

export interface Conversation {
  id: string
  title: string
  shareToken: string | null
  sharedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileTreeNode[]
}
