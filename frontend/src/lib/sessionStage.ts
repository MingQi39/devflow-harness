export type SessionStage = 'requirement' | 'prototype' | 'development' | 'qa' | 'done'

export const STAGE_ORDER: SessionStage[] = [
  'requirement',
  'prototype',
  'development',
  'qa',
  'done',
]

export const STAGE_LABELS: Record<SessionStage, string> = {
  requirement: '需求',
  prototype: '原型',
  development: '开发',
  qa: '提测',
  done: '已提测',
}

/** @deprecated Use nextActionLabel(role, stage) from stageRoles.ts */
export const NEXT_ACTION_LABELS: Partial<Record<SessionStage, string>> = {
  requirement: '进入原型',
  prototype: '评审通过，移交开发',
  development: '提交测试',
  qa: '测试通过',
}

export const DEMO_PROMPT = '做一个待办列表'

export function isSessionStage(value: unknown): value is SessionStage {
  return typeof value === 'string' && STAGE_ORDER.includes(value as SessionStage)
}

export function nextStage(current: SessionStage): SessionStage | null {
  const index = STAGE_ORDER.indexOf(current)
  if (index < 0 || index >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[index + 1]
}

export function prevStage(current: SessionStage): SessionStage | null {
  const index = STAGE_ORDER.indexOf(current)
  if (index <= 0) return null
  return STAGE_ORDER[index - 1]
}

export function preferredPreviewFiles(stage: SessionStage): string[] {
  if (stage === 'requirement') return ['REQUIREMENTS.md']
  if (stage === 'prototype') return ['prototype.html', 'index.html']
  return ['index.html', 'frontend/index.html', 'docs/prototype.html', 'prototype.html']
}

export function pickPreferredFile(paths: string[], preferred: string[]): string | null {
  for (const name of preferred) {
    if (paths.includes(name)) return name
  }
  const html = paths.find((path) => /\.html?$/i.test(path))
  return html ?? paths[0] ?? null
}

