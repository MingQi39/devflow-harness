import { useEffect, useState } from 'react'
import { ApiError } from '../lib/api'
import GitDiffView from './GitDiffView'
import { fetchGitDiff, pushGitBranch, type GitDiffResponse } from '../lib/projectGit'

interface GitReleaseDialogProps {
  open: boolean
  orgId: string
  projectId: string
  mainBranch: string | null
  devBranch: string | null
  initialRemoteUrl: string | null
  onClose: () => void
  onPushed: (message: string) => void
}

export default function GitReleaseDialog({
  open,
  orgId,
  projectId,
  mainBranch,
  devBranch,
  initialRemoteUrl,
  onClose,
  onPushed,
}: GitReleaseDialogProps) {
  const [diffData, setDiffData] = useState<GitDiffResponse | null>(null)
  const [bindRemoteUrl, setBindRemoteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const originUrl = (diffData?.remote_url ?? initialRemoteUrl)?.trim() || null
  const hasOrigin = Boolean(originUrl)
  const canPush = !loading && (hasOrigin || bindRemoteUrl.trim().length > 0)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pushing) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, pushing, onClose])

  useEffect(() => {
    if (!open) return
    setBindRemoteUrl('')
    setError(null)
    setLoading(true)
    setDiffData(null)
    void (async () => {
      try {
        const data = await fetchGitDiff(orgId, projectId)
        setDiffData(data)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载 diff 失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [open, orgId, projectId])

  if (!open) return null

  const push = async () => {
    if (!canPush) return
    setPushing(true)
    setError(null)
    try {
      const result = await pushGitBranch(
        orgId,
        projectId,
        hasOrigin ? null : bindRemoteUrl.trim(),
      )
      onPushed(result.message)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '推送失败')
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="confirm-dialog-root" role="presentation">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="关闭"
        disabled={pushing}
        onClick={onClose}
      />
      <div
        className="confirm-dialog-panel git-release-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-release-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-body git-release-body">
          <h2 id="git-release-title" className="confirm-dialog-title">
            变更预览
          </h2>
          <p className="confirm-dialog-message git-release-desc">
            {mainBranch ?? 'main'} ← {devBranch ?? 'devflow/…'}
            {hasOrigin ? (
              <span className="git-release-push-hint">
                {' '}
                · 点「确定 Push」将直接推送到远程（与本机 <code>git push</code> 相同）
              </span>
            ) : (
              <span className="git-release-push-hint">
                {' '}
                · 本地尚未配置 origin，请先填写远程地址后再 Push
              </span>
            )}
          </p>
          <div className="git-diff-box custom-scrollbar" aria-live="polite">
            {loading ? (
              <p className="git-diff-placeholder">加载 diff…</p>
            ) : diffData ? (
              <GitDiffView
                summary={diffData.summary}
                patch={diffData.patch}
                empty={diffData.empty}
              />
            ) : null}
          </div>
          {!hasOrigin && !loading ? (
            <label className="dev-import-label git-remote-field">
              <span>远程仓库 URL（首次绑定 origin）</span>
              <input
                type="url"
                placeholder="https://github.com/org/repo.git"
                value={bindRemoteUrl}
                disabled={pushing}
                onChange={(event) => setBindRemoteUrl(event.target.value)}
              />
            </label>
          ) : null}
          {hasOrigin && originUrl ? (
            <p className="git-remote-bound">
              origin：<code>{originUrl}</code>
            </p>
          ) : null}
          {error ? <p className="dev-setup-error">{error}</p> : null}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn ghost sm" disabled={pushing} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary sm"
            disabled={pushing || !canPush}
            onClick={() => void push()}
          >
            {pushing ? '推送中…' : '确定 Push'}
          </button>
        </div>
      </div>
    </div>
  )
}
