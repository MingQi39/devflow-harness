import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import ConversationSidebar from '../components/ConversationSidebar'
import FilePreview from '../components/FilePreview'
import JoinOrgBanner from '../components/JoinOrgBanner'
import {
  IconChevronDown,
  IconChevronUp,
  IconInbox,
  IconPanelLeftClose,
} from '../components/icons/LayoutIcons'
import ImportGitSetupStep from '../components/ImportGitSetupStep'
import StartDevSandboxPanel from '../components/StartDevSandboxPanel'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { useInboxUnread } from '../hooks/useInboxUnread'
import { chatPath } from '../lib/chatRoutes'
import { inboxPath } from '../lib/inboxRoutes'
import { apiFetch, ApiError } from '../lib/api'
import { getDesktopBridge, isDesktopApp } from '../lib/desktopBridge'
import { importProjectDirectory } from '../lib/projectImport'
import { createNewDevBranch, fetchGitStatus } from '../lib/projectGit'
import { devSandboxKickoffMessage } from '../lib/stageRoles'
import { usePersistedBool } from '../lib/usePersistedBool'
import type { StackRecommendation } from '../types/devProject'
import type { PrototypeDelivery } from '../types/org'

type DeliveryMode = 'inbox' | 'sent'

export default function InboxPage() {
  const navigate = useNavigate()
  const { deliveryId: deliveryIdParam } = useParams<{ deliveryId?: string }>()
  const { user, permissions, logout } = useAuth()
  const { currentOrgId, orgs, loading: orgLoading } = useOrg()
  const { refreshInboxUnread } = useInboxUnread()

  const canReceive = permissions.includes('prototype:receive')
  const canSend = permissions.includes('prototype:send')
  const mode: DeliveryMode = useMemo(
    () => (canReceive ? 'inbox' : 'sent'),
    [canReceive],
  )

  const [deliveries, setDeliveries] = useState<PrototypeDelivery[]>([])
  const [activeId, setActiveId] = useState<string | null>(deliveryIdParam ?? null)
  const [prototypeHtml, setPrototypeHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listReady, setListReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailExpanded, setDetailExpanded] = useState(true)
  const [listExpanded, setListExpanded] = usePersistedBool('devflow.inboxListExpanded', true)

  const selectedDeliveryId = deliveryIdParam ?? activeId
  const active = deliveries.find((item) => item.id === selectedDeliveryId) ?? null

  const refreshList = useCallback(async (options?: { silent?: boolean }) => {
    if (orgLoading) return
    if (!currentOrgId) {
      setDeliveries([])
      setListReady(true)
      setLoading(false)
      return
    }
    if (mode === 'inbox' && !canReceive) return
    if (mode === 'sent' && !canSend) return

    const silent = options?.silent ?? false
    if (!silent) {
      setLoading(true)
      setListReady(false)
    }
    setError(null)
    try {
      const path =
        mode === 'inbox'
          ? `/orgs/${currentOrgId}/prototype-deliveries/inbox`
          : `/orgs/${currentOrgId}/prototype-deliveries/sent`
      const list = await apiFetch<PrototypeDelivery[]>(path)
      setDeliveries(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      if (!silent) {
        setLoading(false)
        setListReady(true)
      }
    }
  }, [canReceive, canSend, currentOrgId, mode, orgLoading])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    if (deliveryIdParam) setActiveId(deliveryIdParam)
  }, [deliveryIdParam])

  const prevSelectedDeliveryRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedDeliveryId) return
    if (prevSelectedDeliveryRef.current === selectedDeliveryId) return
    prevSelectedDeliveryRef.current = selectedDeliveryId
    setDetailExpanded(true)
  }, [selectedDeliveryId])

  const toggleDetailExpanded = () => {
    setDetailExpanded((open) => !open)
  }

  const detailShellLoading =
    Boolean(deliveryIdParam) &&
    (orgLoading ||
      (deliveries.length === 0 && (loading || !listReady)))

  const patchDeliveryDevProject = (
    deliveryId: string,
    projectId: string,
    conversationId: string,
  ) => {
    setDeliveries((current) =>
      current.map((item) =>
        item.id === deliveryId
          ? {
              ...item,
              dev_project_id: projectId,
              dev_conversation_id: conversationId,
            }
          : item,
      ),
    )
  }

  const handleSandboxCreated = (payload: {
    projectId: string
    conversationId: string
    originMode: 'import' | 'greenfield'
    stack?: StackRecommendation | null
    created: boolean
    git?: { main_branch: string; dev_branch: string }
  }) => {
    if (!active) return
    patchDeliveryDevProject(active.id, payload.projectId, payload.conversationId)
    const role = user?.role ?? 'frontend'
    const stack = payload.stack ?? null
    const stackSummary = stack ? `${stack.frontend} + ${stack.backend}` : null
    navigate(chatPath(payload.conversationId, 'chat'), {
      state: payload.created
        ? {
            autoKickoff: true,
            role,
            devOrigin: payload.originMode,
            kickoffText: devSandboxKickoffMessage(
              payload.originMode,
              stackSummary,
              payload.git ?? null,
            ),
          }
        : undefined,
    })
  }

  const loadDeliveryDetail = useCallback(
    async (delivery: PrototypeDelivery) => {
      if (!currentOrgId) return
      setActiveId(delivery.id)
      setPrototypeHtml(null)
      setPreviewLoading(true)
      try {
        if (mode === 'inbox' && !delivery.read_at) {
          await apiFetch(`/orgs/${currentOrgId}/prototype-deliveries/${delivery.id}/read`, {
            method: 'POST',
          })
          void refreshList({ silent: true })
          void refreshInboxUnread()
        }
        const file = await apiFetch<{ path: string; content: string }>(
          `/orgs/${currentOrgId}/prototype-deliveries/${delivery.id}/files/content?path=${encodeURIComponent('prototype.html')}`,
        )
        setPrototypeHtml(file.content)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载原型失败')
      } finally {
        setPreviewLoading(false)
      }
    },
    [currentOrgId, mode, refreshInboxUnread, refreshList],
  )

  useEffect(() => {
    if (!deliveryIdParam) {
      setActiveId(null)
      setPrototypeHtml(null)
      return
    }
    if (orgLoading || loading || !listReady || !currentOrgId) return

    const delivery = deliveries.find((item) => item.id === deliveryIdParam)
    if (!delivery) {
      navigate(inboxPath(), { replace: true })
      return
    }

    if (activeId === deliveryIdParam && prototypeHtml !== null) return
    void loadDeliveryDetail(delivery)
  }, [
    activeId,
    currentOrgId,
    deliveries,
    deliveryIdParam,
    listReady,
    loadDeliveryDetail,
    loading,
    navigate,
    orgLoading,
    prototypeHtml,
  ])

  const selectDelivery = (delivery: PrototypeDelivery) => {
    navigate(inboxPath(delivery.id))
  }

  const hasSandbox = Boolean(active?.dev_project_id && active?.dev_conversation_id)
  const showDevSandboxPanel = Boolean(active && mode === 'inbox' && canReceive)
  const showSandboxReadyActions = Boolean(showDevSandboxPanel && hasSandbox)
  const showSandboxReadyStatus = Boolean(
    hasSandbox && (showDevSandboxPanel || (mode === 'sent' && canSend)),
  )
  const desktopImport = isDesktopApp()
  const [reimportBusy, setReimportBusy] = useState(false)
  const [reimportError, setReimportError] = useState<string | null>(null)
  const [localBoundPath, setLocalBoundPath] = useState<string | null>(null)
  const [recreateBranchBusy, setRecreateBranchBusy] = useState(false)
  const [recreateBranchError, setRecreateBranchError] = useState<string | null>(null)
  const [recreateBranchNotice, setRecreateBranchNotice] = useState<string | null>(null)
  const [gitSetupForRecreate, setGitSetupForRecreate] = useState(false)

  const recreateDevBranch = async () => {
    if (!currentOrgId || !active?.dev_project_id) return
    setRecreateBranchBusy(true)
    setRecreateBranchError(null)
    setRecreateBranchNotice(null)
    try {
      const status = await fetchGitStatus(currentOrgId, active.dev_project_id)
      if (!status.enabled || !status.main_branch) {
        setGitSetupForRecreate(true)
        return
      }
      const workflow = await createNewDevBranch(
        currentOrgId,
        active.dev_project_id,
        active.title || '新需求',
      )
      setRecreateBranchNotice(`已新开需求分支 ${workflow.dev_branch}，进入开发后将同步显示`)
    } catch (err) {
      setRecreateBranchError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '创建分支失败',
      )
    } finally {
      setRecreateBranchBusy(false)
    }
  }

  const reimportLocalDirectory = async () => {
    if (!currentOrgId || !active?.dev_project_id) return
    const bridge = getDesktopBridge()
    if (!bridge) return
    const dirPath = await bridge.pickProjectDirectory()
    if (!dirPath) return
    setReimportBusy(true)
    setReimportError(null)
    try {
      const result = await importProjectDirectory(currentOrgId, active.dev_project_id, dirPath)
      if (result.local_root) {
        setLocalBoundPath(result.local_root)
      } else if (result.local_bound) {
        setLocalBoundPath(dirPath)
      }
    } catch (err) {
      setReimportError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '导入失败',
      )
    } finally {
      setReimportBusy(false)
    }
  }

  if (!canReceive && !canSend) {
    return <Navigate to="/contacts" replace />
  }

  const title = mode === 'inbox' ? '原型收件箱' : '已发原型'
  const tagline = mode === 'inbox' ? 'PM 发来的可点击原型' : '发送记录与预览'

  return (
    <div className="chat-app">
      <ConversationSidebar
        conversations={[]}
        activeId={null}
        user={user}
        permissions={permissions}
        navActive={mode === 'inbox' ? 'inbox' : 'sent'}
        showConversations={false}
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={async () => {}}
        onRename={async () => {}}
        onLogout={async () => {
          await logout()
          navigate('/login')
        }}
      />

      <main className="inbox-page">
        <header className="inbox-page-header">
          <h1>{title}</h1>
          <span className="inbox-page-tagline">{tagline}</span>
        </header>

        {orgs.length === 0 ? <JoinOrgBanner /> : null}
        {error ? <p className="error-banner">{error}</p> : null}
        {loading ? <p className="contacts-status">加载中…</p> : null}

        {!currentOrgId && orgs.length === 0 ? (
          <p className="contacts-status">
            加入组织后才可以{mode === 'inbox' ? '接收' : '查看已发'}原型。也可先到{' '}
            <Link to="/contacts">联系人</Link> 页加入。
          </p>
        ) : null}

        <div className={`inbox-layout${listExpanded ? '' : ' inbox-layout--list-collapsed'}`}>
          <aside className="inbox-list-panel">
            {listExpanded ? (
              <>
                <div className="inbox-list-panel-head">
                  <span className="inbox-list-panel-title">
                    <IconInbox size={14} className="inbox-list-panel-title-icon" aria-hidden />
                    交付记录
                  </span>
                  <button
                    type="button"
                    className="inbox-panel-collapse-btn"
                    aria-expanded
                    aria-label="收起交付列表"
                    title="收起交付列表"
                    onClick={() => setListExpanded(false)}
                  >
                    <IconPanelLeftClose size={16} />
                  </button>
                </div>
                <ul className="inbox-list custom-scrollbar">
                  {deliveries.length === 0 && !loading ? (
                    <li className="inbox-empty">
                      {mode === 'inbox'
                        ? '暂无收到的原型，等 PM 在对话里点「发给开发」'
                        : '还没有发过原型，在对话预览区点「发给开发」即可'}
                    </li>
                  ) : null}
                  {deliveries.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`inbox-item${selectedDeliveryId === item.id ? ' active' : ''}${mode === 'inbox' && !item.read_at ? ' unread' : ''}`}
                        onClick={() => selectDelivery(item)}
                      >
                        <div className="inbox-item-head">
                          <strong>{item.title}</strong>
                          {mode === 'inbox' && item.dev_project_id ? (
                            <span className="inbox-item-badge">沙箱</span>
                          ) : null}
                          {mode === 'inbox' && !item.read_at ? (
                            <span className="inbox-item-dot" aria-hidden />
                          ) : null}
                        </div>
                        <div className="inbox-item-footer">
                          <span className="inbox-item-meta">
                            {mode === 'inbox'
                              ? item.sender_email ?? 'PM'
                              : `→ ${item.recipient_email ?? '开发'}`}
                          </span>
                          <time dateTime={item.created_at}>
                            {new Date(item.created_at).toLocaleString(undefined, {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <button
                type="button"
                className="inbox-list-expand-strip"
                aria-label="展开交付列表"
                title="展开交付列表"
                onClick={() => setListExpanded(true)}
              >
                <IconInbox size={18} />
                {deliveries.some((item) => mode === 'inbox' && !item.read_at) ? (
                  <span className="inbox-list-expand-dot" aria-hidden />
                ) : null}
              </button>
            )}
          </aside>

          <div className="inbox-detail">
            {detailShellLoading ? (
              <div className="inbox-detail-empty">
                <p className="inbox-detail-empty-title">加载交付记录…</p>
              </div>
            ) : !active ? (
              <div className="inbox-detail-empty">
                <p className="inbox-detail-empty-title">选择一条交付记录</p>
                <p className="inbox-detail-empty-sub">选中左侧条目预览原型并开始开发。</p>
              </div>
            ) : (
              <>
                <div
                  className={`inbox-detail-top${detailExpanded ? '' : ' is-collapsed'}${showDevSandboxPanel || showSandboxReadyStatus ? '' : ' inbox-detail-top--solo'}`}
                >
                  <header
                    className={`inbox-detail-header${detailExpanded && (showDevSandboxPanel || showSandboxReadyStatus) ? '' : ' inbox-detail-header--rounded'}`}
                  >
                    <div
                      className="inbox-detail-header-row"
                      role="button"
                      tabIndex={0}
                      onClick={toggleDetailExpanded}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleDetailExpanded()
                        }
                      }}
                    >
                      <div className="inbox-detail-title-block">
                        <h2 className="inbox-detail-title">{active.title}</h2>
                        {detailExpanded ? (
                          <p className="inbox-detail-meta">
                            {mode === 'inbox'
                              ? active.sender_email ?? 'PM'
                              : `→ ${active.recipient_email ?? '开发'}`}
                            <span aria-hidden> · </span>
                            <time dateTime={active.created_at}>
                              {new Date(active.created_at).toLocaleString(undefined, {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          </p>
                        ) : (
                          <p className="inbox-detail-meta inbox-detail-meta--collapsed">
                            {hasSandbox
                              ? mode === 'sent'
                                ? '开发沙箱已创建 · 点击展开详情'
                                : '沙箱已就绪 · 点击展开详情与预览'
                              : showDevSandboxPanel
                                ? '开始开发 · 点击展开'
                                : '交付详情 · 点击展开预览'}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="inbox-detail-collapse-btn"
                        aria-expanded={detailExpanded}
                        aria-label={detailExpanded ? '收起详情与开发设置' : '展开详情与开发设置'}
                        title={detailExpanded ? '收起详情与开发设置' : '展开详情与开发设置'}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleDetailExpanded()
                        }}
                      >
                        {detailExpanded ? (
                          <IconChevronUp size={16} />
                        ) : (
                          <IconChevronDown size={16} />
                        )}
                      </button>
                    </div>
                    {detailExpanded && active.message ? (
                      <blockquote className="inbox-detail-note">{active.message}</blockquote>
                    ) : null}
                  </header>

                  {showSandboxReadyStatus ? (
                    showSandboxReadyActions ? (
                      gitSetupForRecreate && currentOrgId && active.dev_project_id ? (
                        <section className="inbox-sandbox-card inbox-sandbox-setup">
                          <ImportGitSetupStep
                            orgId={currentOrgId}
                            projectId={active.dev_project_id}
                            requirementLabel={active.title}
                            onComplete={(workflow) => {
                              setGitSetupForRecreate(false)
                              setRecreateBranchNotice(`已新开需求分支 ${workflow.dev_branch}，进入开发后将同步显示`)
                            }}
                            onBack={() => setGitSetupForRecreate(false)}
                          />
                        </section>
                      ) : (
                        <section
                          className="inbox-sandbox-card inbox-sandbox-card--ready"
                          aria-labelledby="inbox-sandbox-heading"
                        >
                          <div className="inbox-sandbox-ready-main">
                            <p id="inbox-sandbox-heading" className="inbox-sandbox-title">
                              沙箱已就绪
                            </p>
                            {localBoundPath ? (
                              <p className="inbox-sandbox-path" title={localBoundPath}>
                                {localBoundPath}
                              </p>
                            ) : (
                              <p className="inbox-sandbox-desc">
                                {desktopImport
                                  ? '本地已绑定；目录不对可更换，新需求可新开分支。'
                                  : 'Web 端可进入开发会话；导入 ZIP 或桌面端可绑定本地目录。'}
                              </p>
                            )}
                            {reimportError ? (
                              <p className="inbox-sandbox-inline-error">{reimportError}</p>
                            ) : null}
                            {recreateBranchError ? (
                              <p className="inbox-sandbox-inline-error">{recreateBranchError}</p>
                            ) : null}
                            {recreateBranchNotice ? (
                              <p className="inbox-sandbox-inline-success">{recreateBranchNotice}</p>
                            ) : null}
                          </div>
                          <div className="inbox-sandbox-actions">
                            <button
                              type="button"
                              className="btn primary sm"
                            onClick={() =>
                              navigate(chatPath(active.dev_conversation_id!, 'chat'), {
                                state: { refreshGit: true },
                              })
                            }
                            >
                              进入开发
                            </button>
                            <div className="inbox-sandbox-actions-more">
                              <button
                                type="button"
                                className="btn ghost sm"
                                disabled={recreateBranchBusy || reimportBusy}
                                onClick={() => void recreateDevBranch()}
                              >
                                {recreateBranchBusy ? '创建中…' : '新开需求分支'}
                              </button>
                              {desktopImport ? (
                                <button
                                  type="button"
                                  className="btn ghost sm"
                                  disabled={reimportBusy || recreateBranchBusy}
                                  onClick={() => void reimportLocalDirectory()}
                                >
                                  {reimportBusy ? '绑定中…' : '更换目录'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </section>
                      )
                    ) : (
                      <section
                        className="inbox-sandbox-card inbox-sandbox-card--ready inbox-sandbox-card--readonly"
                        aria-labelledby="inbox-sandbox-heading-sent"
                      >
                        <div className="inbox-sandbox-ready-main">
                          <p id="inbox-sandbox-heading-sent" className="inbox-sandbox-title">
                            开发沙箱已创建
                          </p>
                          <p className="inbox-sandbox-desc">
                            {active.recipient_email ?? '开发同学'} 已接入沙箱并可在工作台继续开发。
                          </p>
                        </div>
                      </section>
                    )
                  ) : detailExpanded && showDevSandboxPanel && currentOrgId ? (
                    <StartDevSandboxPanel
                      orgId={currentOrgId}
                      delivery={active}
                      disabled={previewLoading || !prototypeHtml}
                      onDone={handleSandboxCreated}
                    />
                  ) : null}
                </div>

                <section
                  className={`inbox-preview-section${detailExpanded && (showDevSandboxPanel || showSandboxReadyStatus) ? '' : ' inbox-preview-section--attached'}`}
                  aria-label="原型预览"
                >
                  <div className="inbox-preview-section-head">
                    <span className="inbox-preview-label">原型预览</span>
                    <span className="inbox-preview-file">prototype.html</span>
                  </div>
                  {previewLoading ? (
                    <div className="inbox-preview-loading">加载原型…</div>
                  ) : prototypeHtml ? (
                    <FilePreview path="prototype.html" content={prototypeHtml} showPath={false} />
                  ) : (
                    <div className="inbox-preview-loading">无法加载预览</div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
