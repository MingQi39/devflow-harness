import { FormEvent, useState } from 'react'
import { apiFetch } from '../lib/api'
import { ROLE_LABELS } from '../types/auth'
import type { OrgMember } from '../types/org'

interface SendPrototypeDialogProps {
  open: boolean
  orgId: string
  conversationId: string
  devMembers: OrgMember[]
  onClose: () => void
  onSent: () => void
}

export default function SendPrototypeDialog({
  open,
  orgId,
  conversationId,
  devMembers,
  onClose,
  onSent,
}: SendPrototypeDialogProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const toggle = (userId: string) => {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (selected.length === 0) {
      setError('请选择至少一位开发同学')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch(`/orgs/${orgId}/prototype-deliveries`, {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId,
          recipient_user_ids: selected,
          message,
        }),
      })
      onSent()
      onClose()
      setSelected([])
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
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
        className="confirm-dialog-panel send-prototype-panel"
        role="dialog"
        aria-labelledby="send-prototype-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="confirm-dialog-body">
          <h2 id="send-prototype-title" className="confirm-dialog-title">
            发送原型给开发
          </h2>
          <p className="send-prototype-sub">
            将当前 Session 的 prototype.html 快照发送到组织内的前端/后端同事，对方在「原型收件箱」查看。
          </p>
          {devMembers.length === 0 ? (
            <p className="send-prototype-sub">
              组织里还没有开发同学。请先到「联系人」复制邀请码 <code>DEVFLOW1</code>，让同事注册为前端/后端并加入。
            </p>
          ) : (
            <ul className="send-prototype-recipients">
              {devMembers.map((member) => (
                <li key={member.user_id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(member.user_id)}
                      onChange={() => toggle(member.user_id)}
                    />
                    <span>{member.email}</span>
                    <span className="role-badge">{ROLE_LABELS[member.role]}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <textarea
            className="send-prototype-message"
            placeholder="附言（可选）：例如请按原型实现 index.html…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
          />
          {error ? <p className="error-banner compact">{error}</p> : null}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="submit"
            className="btn primary sm"
            disabled={submitting || devMembers.length === 0}
          >
            {submitting ? '发送中…' : '发送'}
          </button>
        </div>
      </form>
    </div>
  )
}
