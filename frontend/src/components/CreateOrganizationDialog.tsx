import { FormEvent, useState } from 'react'

interface CreateOrganizationDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<unknown>
}

export default function CreateOrganizationDialog({
  open,
  onClose,
  onCreate,
}: CreateOrganizationDialogProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('组织名称至少 2 个字符')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(trimmed)
      setName('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
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
        aria-labelledby="create-org-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="confirm-dialog-body">
          <h2 id="create-org-title" className="confirm-dialog-title">
            创建组织
          </h2>
          <p className="org-dialog-sub">
            新建一个团队工作区。你会成为管理员，并自动生成邀请码供同事加入。
          </p>
          <label className="org-dialog-field">
            <span>组织名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：待办 Demo 小队"
              maxLength={200}
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
            {submitting ? '创建中…' : '创建并切换'}
          </button>
        </div>
      </form>
    </div>
  )
}
