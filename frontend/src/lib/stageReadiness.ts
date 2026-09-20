import { stageKickoffMessage } from './stageRoles'
import type { SessionStage } from './sessionStage'
import type { ChatMessage } from '../types/chat'

const KICKOFF_MESSAGES = new Set(
  (['prototype', 'development'] as const)
    .map((stage) => stageKickoffMessage(stage, 'pm'))
    .concat(stageKickoffMessage('development', 'frontend'))
    .filter((value): value is string => Boolean(value)),
)

function hasUserRequirementDialogue(messages: ChatMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = message.content.trim()
    if (!text || KICKOFF_MESSAGES.has(text)) continue
    return true
  }
  return false
}

function hasFile(paths: Set<string>, name: string): boolean {
  return paths.has(name)
}

export function stageAdvanceBlockedReason(
  stage: SessionStage,
  messages: ChatMessage[],
  workspaceFilePaths: string[],
): string | null {
  const paths = new Set(workspaceFilePaths)

  if (stage === 'requirement') {
    if (!hasUserRequirementDialogue(messages)) {
      return '请先在对话里描述需求'
    }
    if (!hasFile(paths, 'REQUIREMENTS.md')) {
      return '需要 REQUIREMENTS.md'
    }
    return null
  }
  if (stage === 'prototype') {
    if (!hasFile(paths, 'REQUIREMENTS.md')) {
      return '缺少 REQUIREMENTS.md'
    }
    if (!hasFile(paths, 'prototype.html')) {
      return '需要 prototype.html'
    }
    return null
  }
  if (stage === 'development') {
    if (!hasFile(paths, 'index.html')) {
      return '需要 index.html'
    }
    return null
  }
  if (stage === 'qa') {
    if (!hasFile(paths, 'index.html')) {
      return '缺少 index.html'
    }
    return null
  }
  return null
}
