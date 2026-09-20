import type { UserRole } from '../types/auth'
import { DEMO_PROMPT, type SessionStage } from './sessionStage'

/** PM 在 Session 内生成原型；开发/测试通过收件箱或项目文件查看，不默认展示原型工作区。 */
export function roleBuildsPrototypeInSession(role: UserRole): boolean {
  return role === 'pm'
}

/** 非产品角色仅在开发及之后阶段才可打开 Session 内项目文件/预览。 */
export function roleCanOpenSessionWorkspace(role: UserRole, stage: SessionStage): boolean {
  if (roleBuildsPrototypeInSession(role)) return true
  return stage === 'development' || stage === 'qa' || stage === 'done'
}

export function chatWelcomeForRole(
  role: UserRole,
  stage: SessionStage,
): {
  title: string
  sub: string
  demoPrompt: string | null
} {
  if (role === 'pm') {
    return {
      title: '跑通待办 Demo',
      sub: '需求 → 原型 → 开发 → 提测。先发一句需求，再在左侧 iframe 里点测。',
      demoPrompt: DEMO_PROMPT,
    }
  }
  if (role === 'qa') {
    if (stage === 'qa' || stage === 'done') {
      return {
        title: '参与提测',
        sub: '在此记录缺陷与验收结论；需要点测时点「项目文件」打开预览。',
        demoPrompt: null,
      }
    }
    return {
      title: '等待提测',
      sub: '当前还在需求/原型/开发阶段，由产品与开发推进；进入提测后再在此验收。',
      demoPrompt: null,
    }
  }
  if (stage === 'development' || stage === 'qa' || stage === 'done') {
    return {
      title: '接手开发',
      sub: '原型可在「原型收件箱」查看；在此让 Agent 实现 index.html，预览请点「项目文件」。',
      demoPrompt: null,
    }
  }
  return {
    title: '等待产品推进',
    sub: '需求与原型由产品负责；移交开发前无需项目文件，原型请先看「原型收件箱」。',
    demoPrompt: null,
  }
}

const STAGE_ADVANCE_ROLES: Record<SessionStage, UserRole[] | null> = {
  requirement: ['pm'],
  prototype: ['pm'],
  development: ['frontend', 'backend'],
  qa: ['qa'],
  done: null,
}

const STAGE_RETREAT_ROLES: Partial<Record<SessionStage, UserRole[]>> = {
  prototype: ['pm'],
  development: ['pm', 'frontend', 'backend'],
  qa: ['pm', 'qa', 'frontend', 'backend'],
  done: ['pm', 'qa'],
}

export function roleCanAdvanceFrom(role: UserRole, stage: SessionStage): boolean {
  const allowed = STAGE_ADVANCE_ROLES[stage]
  if (!allowed) return false
  return allowed.includes(role)
}

export function roleCanRetreatFrom(role: UserRole, stage: SessionStage): boolean {
  if (stage === 'requirement') return false
  const allowed = STAGE_RETREAT_ROLES[stage]
  if (!allowed) return false
  return allowed.includes(role)
}

export function nextActionLabel(role: UserRole, stage: SessionStage): string | null {
  if (!roleCanAdvanceFrom(role, stage)) return null
  if (stage === 'requirement') return '进入原型'
  if (stage === 'prototype') return '评审通过，移交开发'
  if (stage === 'development') return '提交测试'
  if (stage === 'qa') return '测试通过'
  return null
}

export function prevActionLabel(role: UserRole, stage: SessionStage): string | null {
  if (!roleCanRetreatFrom(role, stage)) return null
  if (stage === 'prototype') return '回到需求'
  if (stage === 'development') return '回到原型'
  if (stage === 'qa') return '回到开发'
  if (stage === 'done') return '退回提测'
  return null
}

export function stageAdvanceHint(role: UserRole, stage: SessionStage): string | null {
  if (roleCanAdvanceFrom(role, stage) || stage === 'done') return null
  if (stage === 'requirement' || stage === 'prototype') {
    return '当前阶段由产品推进'
  }
  if (stage === 'development') {
    return '请切换前端/后端账号开发并提交测试'
  }
  if (stage === 'qa') {
    return '请切换 QA 账号验证并通过'
  }
  return null
}

/** Agent 自动消息：仅 PM 进入原型时生成 prototype；移交开发后由开发同学自行开干。 */
export function stageKickoffMessage(stage: SessionStage, role: UserRole): string | null {
  if (stage === 'prototype' && role === 'pm') {
    return '请根据 REQUIREMENTS.md 生成可点击的 prototype.html'
  }
  if (stage === 'development' && (role === 'frontend' || role === 'backend')) {
    return '请根据 prototype.html 和 REQUIREMENTS.md 实现 index.html'
  }
  return null
}

export function composerPlaceholder(stage: SessionStage, role: UserRole): string {
  if (stage === 'requirement') {
    if (role !== 'pm') {
      return '等待产品整理需求…（当前 Session 在需求阶段）'
    }
    return '描述需求，例如「做一个待办列表」…（Enter 发送，Shift+Enter 换行）'
  }
  if (stage === 'prototype') {
    if (role !== 'pm') {
      return '等待产品完成原型与评审…'
    }
    return '补充原型修改意见，或确认后点「评审通过，移交开发」…（Enter 发送）'
  }
  if (stage === 'development') {
    if (role === 'pm') {
      return '已移交开发；请前端/后端同学在此实现 index.html…'
    }
    if (role === 'qa') {
      return '开发进行中，完成后会提交测试…'
    }
    return '让 Agent 根据原型实现 index.html…（Enter 发送）'
  }
  if (stage === 'qa') {
    if (role !== 'qa') {
      return '已提测，等待 QA 在「项目文件」预览里验收…'
    }
    return '在「项目文件」预览里勾选一条待办，有问题再让 Agent 修…'
  }
  return '这条需求已提测通过，还可以继续提问…'
}
