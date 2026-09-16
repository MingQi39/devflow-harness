import { useEffect } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  busy?: boolean
  variant?: 'danger' | 'warning'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  busy = false,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div className="confirm-dialog-root" role="presentation">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="关闭"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        className="confirm-dialog-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="confirm-dialog-icon" data-variant={variant} aria-hidden="true">
          <IconAlert />
        </div>
        <div className="confirm-dialog-body">
          <h2 id="confirm-dialog-title" className="confirm-dialog-title">
            {title}
          </h2>
          <p id="confirm-dialog-message" className="confirm-dialog-message">
            {message}
          </p>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn sm ${variant === 'danger' ? 'secondary' : 'primary'}`}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

function IconAlert() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
