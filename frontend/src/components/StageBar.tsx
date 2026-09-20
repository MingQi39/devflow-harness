import { nextActionLabel, prevActionLabel, stageAdvanceHint } from '../lib/stageRoles'
import {
  STAGE_LABELS,
  STAGE_ORDER,
  nextStage,
  prevStage,
  type SessionStage,
} from '../lib/sessionStage'
import type { UserRole } from '../types/auth'

interface StageBarProps {
  stage: SessionStage
  role: UserRole
  disabled?: boolean
  blockedReason?: string | null
  onStageChange: (target: SessionStage) => void
}

export default function StageBar({
  stage,
  role,
  disabled,
  blockedReason,
  onStageChange,
}: StageBarProps) {
  const currentIndex = STAGE_ORDER.indexOf(stage)
  const next = nextStage(stage)
  const prev = prevStage(stage)
  const actionLabel = nextActionLabel(role, stage)
  const retreatLabel = prevActionLabel(role, stage)
  const hint = stageAdvanceHint(role, stage)

  return (
    <div className="stage-bar">
      <ol className="stage-steps" aria-label="Session 阶段">
        {STAGE_ORDER.map((item, index) => {
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'
          return (
            <li key={item} className={`stage-step ${state}`}>
              <span className="stage-step-dot" aria-hidden="true">
                {index < currentIndex ? '✓' : index + 1}
              </span>
              <span className="stage-step-label">{STAGE_LABELS[item]}</span>
            </li>
          )
        })}
      </ol>
      <div className="stage-actions">
        {prev && retreatLabel ? (
          <button
            type="button"
            className="btn ghost sm"
            disabled={disabled}
            onClick={() => onStageChange(prev)}
          >
            {retreatLabel}
          </button>
        ) : null}
        {next && actionLabel ? (
          <div className="stage-advance-wrap">
            <button
              type="button"
              className="btn primary sm"
              disabled={disabled || Boolean(blockedReason)}
              title={blockedReason ?? undefined}
              onClick={() => onStageChange(next)}
            >
              {actionLabel}
            </button>
            {blockedReason ? <span className="stage-block-hint">{blockedReason}</span> : null}
          </div>
        ) : hint ? (
          <span className="stage-hint">{hint}</span>
        ) : (
          <span className="stage-complete">已提测通过</span>
        )}
      </div>
    </div>
  )
}
