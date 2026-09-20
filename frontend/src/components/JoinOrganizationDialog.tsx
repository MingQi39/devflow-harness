import { FormEvent, useState } from 'react'

interface JoinOrganizationDialogProps {
  open: boolean
  onClose: () => void
  onJoin: (inviteCode: string) => Promise<void>
  initialCode?: string
}

export default function JoinOrganizationDialog({
  open,
  onClose,
  onJoin,
  initialCode = 'DEVFLOW1',
}: JoinOrganizationDialogProps) {
  const [inviteCode, setInviteCode] = useState(initialCode)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onJoin(inviteCode.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="confirm-dialog-root" role="presentation">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="关闭"
        disabled={submitting}
        onClick={onClose}
      />
      <form
        className="confirm-dialog-panel org-dialog-panel"
        role="dialog"
        aria-labelledby="join-org-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="confirm-dialog-body">
          <h2 id="join-org-title" className="confirm-dialog-title">
            加入组织
          </h2>
          <p className="org-dialog-sub">
            输入同事分享的邀请码。演示环境可用 <code>DEVFLOW1</code> 加入默认组织。
          </p>
          <label className="org-dialog-field">
            <span>邀请码</span>
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="DEVFLOW1"
              minLength={6}
              autoFocus
            />
          </label>
          {error ? <p className="error-banner compact">{error}</p> : null}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="btn primary sm" disabled={submitting}>
            {submitting ? '加入中…' : '加入并切换'}
          </button>
        </div>
      </form>
    </div>
  )
}
