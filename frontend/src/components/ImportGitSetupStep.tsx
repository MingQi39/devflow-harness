import { useEffect, useState } from 'react'
import { ApiError } from '../lib/api'
import { fetchGitBranches, setupImportGit } from '../lib/projectGit'

interface ImportGitSetupStepProps {
  orgId: string
  projectId: string
  requirementLabel: string
  onComplete: (workflow: { main_branch: string; dev_branch: string }) => void
  onBack?: () => void
}

export default function ImportGitSetupStep({
  orgId,
  projectId,
  requirementLabel,
  onComplete,
  onBack,
}: ImportGitSetupStepProps) {
  const [branches, setBranches] = useState<string[]>([])
  const [mainBranch, setMainBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchGitBranches(orgId, projectId)
        if (cancelled) return
        setBranches(data.branches)
        setMainBranch(data.suggested_main ?? data.branches[0] ?? 'main')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : '无法读取 Git 分支')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, projectId])

  const confirm = async () => {
    if (!mainBranch) {
      setError('请选择主分支')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const workflow = await setupImportGit(orgId, projectId, mainBranch, requirementLabel)
      onComplete({ main_branch: workflow.main_branch, dev_branch: workflow.dev_branch })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建开发分支失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="import-git-setup">
      <p className="inbox-sandbox-title">选择主分支</p>
      <p className="inbox-sandbox-desc">
        系统会先识别前/后端子目录并在对应 Git 仓库中操作（父目录无 <code>.git</code> 时不会在父目录建分支）。
        全栈单仓库只创建一条 <code>devflow/…</code> 开发分支。
      </p>
      {loading ? <p className="dev-path-hint">读取分支列表…</p> : null}
      {!loading && branches.length > 0 ? (
        <label className="dev-import-label">
          <span>主分支（生产基线）</span>
          <select
            value={mainBranch}
            disabled={busy}
            onChange={(event) => setMainBranch(event.target.value)}
          >
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!loading && branches.length === 0 ? (
        <p className="dev-setup-error">
          未检测到分支。请确认当前角色对应的前/后端子项目含 .git，或单项目导入已成功初始化仓库。
        </p>
      ) : null}
      {error ? <p className="dev-setup-error">{error}</p> : null}
      <div className="import-git-setup-actions">
        {onBack ? (
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onBack}>
            上一步
          </button>
        ) : null}
        <button
          type="button"
          className="btn primary"
          disabled={busy || loading || !mainBranch}
          onClick={() => void confirm()}
        >
          {busy ? '创建开发分支…' : '确认并进入开发'}
        </button>
      </div>
    </div>
  )
}
