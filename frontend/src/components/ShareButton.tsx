import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { apiFetch } from '../lib/api'

interface ShareButtonProps {
  conversationId: string
  initialShared: boolean
  onChange?: () => void
}

interface ShareStatus {
  shared: boolean
  share_url?: string
  share_token?: string
}

interface ShareCreateResponse {
  share_url: string
  share_token: string
}

export default function ShareButton({
  conversationId,
  initialShared,
  onChange,
}: ShareButtonProps) {
  const [shared, setShared] = useState(initialShared)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const enableShare = async () => {
    setBusy(true)
    try {
      const data = await apiFetch<ShareCreateResponse>(
        `/conversations/${conversationId}/share`,
        { method: 'POST' },
      )
      setShared(true)
      setShareUrl(data.share_url)
      await navigator.clipboard.writeText(data.share_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onChange?.()
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    setBusy(true)
    try {
      let url = shareUrl
      if (!url) {
        const data = await apiFetch<ShareStatus>(
          `/conversations/${conversationId}/share`,
        )
        url = data.share_url ?? null
        setShareUrl(url)
      }
      if (url) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } finally {
      setBusy(false)
    }
  }

  const disableShare = async () => {
    setBusy(true)
    try {
      await apiFetch(`/conversations/${conversationId}/share`, { method: 'DELETE' })
      setShared(false)
      setShareUrl(null)
      setConfirmOpen(false)
      onChange?.()
    } finally {
      setBusy(false)
    }
  }

  if (!shared) {
    return (
      <button type="button" className="btn ghost sm" disabled={busy} onClick={enableShare}>
        {busy ? '处理中…' : '分享'}
      </button>
    )
  }

  return (
    <>
      <div className="share-actions">
        <span className="share-badge">已分享</span>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={copyLink}>
          {copied ? '已复制' : '复制链接'}
        </button>
        <button
          type="button"
          className="btn ghost sm danger"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          取消分享
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="取消分享"
        message="关闭分享后，已有链接将失效。确定继续吗？"
        confirmText="取消分享"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={disableShare}
      />
    </>
  )
}
