import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api'
import { getDesktopBridge, isDesktopApp } from '../lib/desktopBridge'
import { importProjectDirectory, uploadProjectZip } from '../lib/projectImport'
import ImportGitSetupStep from './ImportGitSetupStep'
import type { PrototypeDelivery } from '../types/org'
import type {
  DevProjectOriginMode,
  LocalProjectBinding,
  StackRecommendation,
} from '../types/devProject'

type DevPath = 'import' | 'greenfield'
type ImportSource = 'saved' | 'fresh'

function trimPathDisplay(path: string, max = 56): string {
  if (path.length <= max) return path
  return `…${path.slice(-(max - 1))}`
}

function folderName(path: string): string {
  const parts = path.replace(/\/$/, '').split(/[/\\]/)
  return parts[parts.length - 1] || path
}

interface StartDevSandboxPanelProps {
  orgId: string
  delivery: PrototypeDelivery
  disabled: boolean
  onDone: (result: {
    projectId: string
    conversationId: string
    originMode: DevProjectOriginMode
    stack?: StackRecommendation | null
    created: boolean
    git?: { main_branch: string; dev_branch: string }
  }) => void
}

export default function StartDevSandboxPanel({
  orgId,
  delivery,
  disabled,
  onDone,
}: StartDevSandboxPanelProps) {
  const [path, setPath] = useState<DevPath>('import')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [localDirPath, setLocalDirPath] = useState<string | null>(null)
  const [importSource, setImportSource] = useState<ImportSource>('fresh')
  const [savedBindings, setSavedBindings] = useState<LocalProjectBinding[]>([])
  const [bindingsLoading, setBindingsLoading] = useState(false)
  const desktopImport = isDesktopApp()
  const [prompt, setPrompt] = useState('')
  const [stack, setStack] = useState<StackRecommendation | null>(null)
  const [analyzedWithLlm, setAnalyzedWithLlm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gitStep, setGitStep] = useState<{
    projectId: string
    conversationId: string
    created: boolean
  } | null>(null)

  useEffect(() => {
    if (!desktopImport || path !== 'import') return
    let cancelled = false
    setBindingsLoading(true)
    void apiFetch<LocalProjectBinding[]>(`/orgs/${orgId}/projects/local-bindings`)
      .then((list) => {
        if (cancelled) return
        setSavedBindings(list)
        if (list.length > 0) {
          setImportSource('saved')
          setLocalDirPath((current) => current ?? list[0].local_root)
        }
      })
      .catch(() => {
        if (!cancelled) setSavedBindings([])
      })
      .finally(() => {
        if (!cancelled) setBindingsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [desktopImport, orgId, path])

  const analyzeStack = async () => {
    const text = prompt.trim()
    if (text.length < 4) {
      setError('请至少用几句话描述要做的功能或改造目标')
      return
    }
    setBusy(true)
    setError(null)
    setStack(null)
    try {
      const data = await apiFetch<{ recommendation: StackRecommendation; used_llm: boolean }>(
        `/orgs/${orgId}/prototype-deliveries/${delivery.id}/analyze-stack`,
        { method: 'POST', body: JSON.stringify({ prompt: text }) },
      )
      setStack(data.recommendation)
      setAnalyzedWithLlm(data.used_llm)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '技术栈分析失败')
    } finally {
      setBusy(false)
    }
  }

  const createSandbox = async () => {
    setBusy(true)
    setError(null)
    try {
      if (path === 'import' && !desktopImport && !zipFile) {
        setError('请选择本地项目的 ZIP 包')
        setBusy(false)
        return
      }
      if (path === 'import' && desktopImport && !localDirPath) {
        setError(
          importSource === 'saved' ? '请选择要沿用的已导入项目' : '请选择本地项目目录',
        )
        setBusy(false)
        return
      }
      if (path === 'greenfield') {
        if (!prompt.trim()) {
          setError('请填写需求描述')
          setBusy(false)
          return
        }
        if (!stack) {
          setError('请先点击「分析技术栈」')
          setBusy(false)
          return
        }
      }

      const body =
        path === 'import'
          ? {
              mode: 'import' as const,
              title: delivery.title,
              ...(localDirPath ? { source_path: localDirPath } : {}),
            }
          : {
              mode: 'greenfield' as const,
              title: delivery.title,
              prompt: prompt.trim(),
              stack,
            }

      const result = await apiFetch<{
        project_id: string
        conversation_id: string
        created: boolean
        origin_mode: DevProjectOriginMode
        files_imported?: number | null
      }>(`/orgs/${orgId}/prototype-deliveries/${delivery.id}/dev-project`, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const serverImported =
        typeof result.files_imported === 'number' && result.files_imported > 0

      if (path === 'import' && !serverImported && (zipFile || localDirPath)) {
        if (localDirPath) {
          await importProjectDirectory(orgId, result.project_id, localDirPath)
        } else if (zipFile) {
          await uploadProjectZip(orgId, result.project_id, zipFile)
        }
        setGitStep({
          projectId: result.project_id,
          conversationId: result.conversation_id,
          created: result.created,
        })
        return
      }

      onDone({
        projectId: result.project_id,
        conversationId: result.conversation_id,
        originMode: result.origin_mode,
        stack: path === 'greenfield' ? stack : null,
        created: result.created,
      })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '创建沙箱失败'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const selectedBinding =
    localDirPath != null
      ? savedBindings.find((item) => item.local_root === localDirPath) ?? null
      : null
  const importReady =
    path === 'import' && (desktopImport ? Boolean(localDirPath) : Boolean(zipFile))
  const selectionHint = localDirPath
    ? folderName(localDirPath)
    : zipFile?.name ?? null
  const selectionTitle =
    importSource === 'saved' && selectedBinding
      ? selectedBinding.label
      : localDirPath
        ? '本机目录'
        : zipFile
          ? 'ZIP 项目'
          : null

  if (gitStep) {
    return (
      <section className="inbox-sandbox-card inbox-sandbox-setup">
        <ImportGitSetupStep
          orgId={orgId}
          projectId={gitStep.projectId}
          requirementLabel={delivery.title}
          onComplete={(workflow) => {
            onDone({
              projectId: gitStep.projectId,
              conversationId: gitStep.conversationId,
              originMode: 'import',
              stack: null,
              created: gitStep.created,
              git: workflow,
            })
          }}
          onBack={() => setGitStep(null)}
        />
      </section>
    )
  }

  return (
    <section className="inbox-sandbox-card inbox-sandbox-setup" aria-labelledby="inbox-sandbox-heading">
      <div className="inbox-sandbox-setup-inner">
        <div className="dev-setup-head">
          <p id="inbox-sandbox-heading" className="inbox-sandbox-title">
            开始开发
          </p>
          <div className="dev-setup-toolbar">
            <div className="dev-segment dev-path-tabs" role="tablist" aria-label="开发方式">
              <button
                type="button"
                role="tab"
                aria-selected={path === 'import'}
                className={path === 'import' ? 'active' : ''}
                onClick={() => {
                  setPath('import')
                  setError(null)
                }}
              >
                本地仓库
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={path === 'greenfield'}
                className={path === 'greenfield' ? 'active' : ''}
                onClick={() => {
                  setPath('greenfield')
                  setError(null)
                }}
              >
                AI 生成
              </button>
            </div>
            {path === 'import' && desktopImport ? (
              <div
                className="dev-segment dev-import-source-tabs"
                role="tablist"
                aria-label="本地项目来源"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={importSource === 'saved'}
                  className={importSource === 'saved' ? 'active' : ''}
                  disabled={savedBindings.length === 0 && !bindingsLoading}
                  onClick={() => {
                    setImportSource('saved')
                    setError(null)
                    if (savedBindings.length > 0 && !localDirPath) {
                      setLocalDirPath(savedBindings[0].local_root)
                    }
                  }}
                >
                  已有
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={importSource === 'fresh'}
                  className={importSource === 'fresh' ? 'active' : ''}
                  onClick={() => {
                    setImportSource('fresh')
                    setLocalDirPath(null)
                    setZipFile(null)
                    setError(null)
                  }}
                >
                  选目录
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {path === 'import' ? (
          <div className="dev-path-panel">
            {desktopImport ? (
              <div className="dev-import-local">
                {importSource === 'saved' ? (
                  <div className="dev-saved-bindings">
                    {bindingsLoading ? (
                      <p className="dev-path-hint muted">加载中…</p>
                    ) : savedBindings.length === 0 ? (
                      <p className="dev-path-hint muted">暂无记录，请用「选择目录」。</p>
                    ) : savedBindings.length === 1 ? null : (
                      <ul className="dev-saved-bindings-list">
                        {savedBindings.map((item) => (
                          <li key={item.local_root}>
                            <button
                              type="button"
                              className={`dev-saved-binding-item${localDirPath === item.local_root ? ' active' : ''}`}
                              disabled={disabled || busy}
                              onClick={() => {
                                setLocalDirPath(item.local_root)
                                setError(null)
                              }}
                            >
                              <strong>{item.label}</strong>
                              <span className="dev-saved-binding-path" title={item.local_root}>
                                {folderName(item.local_root)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`dev-folder-pick${localDirPath ? ' has-path' : ''}`}
                    disabled={disabled || busy}
                    title={localDirPath ?? undefined}
                    onClick={() => {
                      void (async () => {
                        const bridge = getDesktopBridge()
                        if (!bridge) return
                        const picked = await bridge.pickProjectDirectory()
                        setLocalDirPath(picked)
                        setZipFile(null)
                        setError(null)
                      })()
                    }}
                  >
                    {localDirPath ? (
                      <>
                        <span className="dev-folder-pick-kicker">本机目录</span>
                        <span className="dev-folder-pick-path">{trimPathDisplay(localDirPath)}</span>
                        <span className="dev-folder-pick-change">更换</span>
                      </>
                    ) : (
                      <span className="dev-folder-pick-placeholder">点击选择项目文件夹</span>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <label className="dev-import-label">
                <span>项目 ZIP</span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  disabled={disabled || busy}
                  onChange={(event) => {
                    setZipFile(event.target.files?.[0] ?? null)
                    setError(null)
                  }}
                />
              </label>
            )}
            {path === 'import' && !desktopImport ? (
              <p className="dev-path-hint muted">ZIP 解压到沙箱；本机目录请用桌面客户端。</p>
            ) : null}
            {path === 'import' && desktopImport && importSource === 'fresh' && !localDirPath ? (
              <p className="dev-path-hint muted">绑定本机目录后直接改代码。</p>
            ) : null}
          </div>
        ) : (
          <div className="dev-path-panel">
            <label className="dev-prompt-label">
              <span>需求描述</span>
              <textarea
                rows={3}
                value={prompt}
                disabled={disabled || busy}
                placeholder="例如：React + FastAPI，待办增删改，SQLite 持久化"
                onChange={(event) => {
                  setPrompt(event.target.value)
                  setStack(null)
                  setError(null)
                }}
              />
            </label>
            <div className="dev-analyze-row">
              <button
                type="button"
                className="btn secondary sm"
                disabled={disabled || busy || prompt.trim().length < 4}
                onClick={() => void analyzeStack()}
              >
                {busy && !stack ? '分析中…' : '分析技术栈'}
              </button>
              {analyzedWithLlm ? (
                <span className="dev-analyze-badge">AI 推荐</span>
              ) : stack ? (
                <span className="dev-analyze-badge muted">规则推荐</span>
              ) : null}
            </div>
            {stack ? (
              <div className="dev-stack-card">
                <p className="dev-stack-title">{stack.summary || '推荐技术栈'}</p>
                <dl className="dev-stack-meta">
                  <div>
                    <dt>前端</dt>
                    <dd>{stack.frontend}</dd>
                  </div>
                  <div>
                    <dt>后端</dt>
                    <dd>{stack.backend}</dd>
                  </div>
                  <div>
                    <dt>模板</dt>
                    <dd>
                      <code>{stack.stack_id}</code>
                    </dd>
                  </div>
                </dl>
                {stack.rationale ? <p className="dev-stack-rationale">{stack.rationale}</p> : null}
              </div>
            ) : null}
          </div>
        )}

        {error ? <p className="dev-setup-error">{error}</p> : null}

        <div
          className={`dev-setup-action-row${importReady ? '' : ' dev-setup-action-row--solo'}`}
        >
          {importReady && selectionTitle && selectionHint ? (
            <div className="dev-setup-selection" title={localDirPath ?? zipFile?.name}>
              <strong>{selectionTitle}</strong>
              <span>{selectionHint}</span>
            </div>
          ) : null}
          <button
            type="button"
            className="btn primary sm dev-setup-submit"
            disabled={disabled || busy}
            onClick={() => void createSandbox()}
          >
            {busy ? '处理中…' : '进入开发'}
          </button>
        </div>
      </div>
    </section>
  )
}
