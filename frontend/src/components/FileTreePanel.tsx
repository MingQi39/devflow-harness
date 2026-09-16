import { useCallback, useEffect, useState } from 'react'
import FilePreview from './FilePreview'
import { ApiError, apiFetch } from '../lib/api'
import type { FileTreeNode } from '../types/chat'

interface FileTreePanelProps {
  conversationId: string | null
  refreshKey: number
  conversationTitle: string
  onBackToChat: () => void
}

async function friendlyLoadError(error: unknown): Promise<string> {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      try {
        const health = await apiFetch<{ version?: string }>('/health', { auth: false })
        if (health.version && !health.version.includes('m2')) {
          return `后端仍是 ${health.version}，需要重启 backend 才能加载项目文件`
        }
      } catch {
        // ignore health check failure
      }
      return '文件列表接口不可用，请确认 backend 已重启到 M2'
    }
    if (error.status === 401 || error.status === 403) {
      return '没有权限查看该对话的文件'
    }
  }
  return '加载文件列表失败，请稍后重试'
}

function flattenFiles(nodes: FileTreeNode[]): FileTreeNode[] {
  const files: FileTreeNode[] = []
  for (const node of nodes) {
    if (node.type === 'file') files.push(node)
    if (node.children) files.push(...flattenFiles(node.children))
  }
  return files
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
}: {
  node: FileTreeNode
  depth: number
  selectedPath: string | null
  onSelectFile: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)

  if (node.type === 'dir') {
    return (
      <li className="file-tree-node">
        <button
          type="button"
          className="file-tree-dir"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="file-tree-chevron">{open ? '▾' : '▸'}</span>
          <span>{node.name}</span>
        </button>
        {open && node.children && node.children.length > 0 ? (
          <ul className="file-tree-children">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <li className="file-tree-node">
      <button
        type="button"
        className={`file-tree-file${selectedPath === node.path ? ' active' : ''}`}
        style={{ paddingLeft: `${24 + depth * 12}px` }}
        onClick={() => onSelectFile(node.path)}
      >
        {node.name}
      </button>
    </li>
  )
}

export default function FileTreePanel({
  conversationId,
  refreshKey,
  conversationTitle,
  onBackToChat,
}: FileTreePanelProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)

  const loadFileContent = useCallback(
    async (path: string) => {
      if (!conversationId) return
      setSelectedPath(path)
      setPreviewError(null)
      try {
        const data = await apiFetch<{ path: string; content: string }>(
          `/conversations/${conversationId}/files/content?path=${encodeURIComponent(path)}`,
        )
        setPreviewContent(data.content)
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : '读取文件失败')
        setPreviewContent(null)
      }
    },
    [conversationId],
  )

  const loadTree = useCallback(async () => {
    if (!conversationId) {
      setTree([])
      setSelectedPath(null)
      setPreviewContent(null)
      setLoadError(null)
      setPreviewError(null)
      return []
    }
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch<{ tree: FileTreeNode[] }>(
        `/conversations/${conversationId}/files`,
      )
      setTree(data.tree)
      return data.tree
    } catch (err) {
      setLoadError(await friendlyLoadError(err))
      setTree([])
      return []
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    void (async () => {
      const nextTree = await loadTree()
      if (!nextTree || nextTree.length === 0) return

      const files = flattenFiles(nextTree)
      if (files.length === 0) return

      const keepCurrent = selectedPath && files.some((file) => file.path === selectedPath)
      if (keepCurrent && selectedPath) {
        await loadFileContent(selectedPath)
        return
      }

      const preferred =
        files.find((file) => /\.html?$/i.test(file.path)) ?? files[0]
      await loadFileContent(preferred.path)
    })()
  }, [loadTree, refreshKey])

  const showEmpty = !loading && !loadError && tree.length === 0
  const fileCount = flattenFiles(tree).length

  return (
    <section className="workspace-shell" aria-label="项目工作区">
      <aside className="file-tree-sidebar">
        <div className="file-tree-sidebar-head">
          <div>
            <div className="sidebar-section-label">项目文件</div>
            <div className="file-tree-sidebar-title">
              <h2>{fileCount > 0 ? `${fileCount} 个文件` : '暂无文件'}</h2>
              <button
                type="button"
                className="sidebar-new-btn"
                onClick={() => void loadTree()}
                disabled={loading || !conversationId}
              >
                刷新
              </button>
            </div>
          </div>
        </div>

        <div className="file-tree-body custom-scrollbar">
          {loading ? (
            <div className="file-tree-status">
              <span className="file-tree-status-dot" aria-hidden="true" />
              加载中…
            </div>
          ) : null}

          {loadError ? (
            <div className="file-tree-error-state">
              <p className="file-tree-error-title">暂时无法加载</p>
              <p className="file-tree-error-message">{loadError}</p>
              <button type="button" className="btn ghost sm" onClick={() => void loadTree()}>
                重试
              </button>
            </div>
          ) : null}

          {showEmpty ? (
            <div className="file-tree-empty-state">
              <div className="file-tree-empty-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="file-tree-empty-title">还没有项目文件</p>
              <p className="file-tree-empty-hint">
                在对话里描述需求，Agent 会在这里创建和修改文件
              </p>
            </div>
          ) : null}

          {!loadError && tree.length > 0 ? (
            <ul className="file-tree-list">
              {tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  onSelectFile={(path) => void loadFileContent(path)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-main-header">
          <div className="workspace-main-title">
            <h3>{conversationTitle}</h3>
            <p>项目文件 · 预览与代码可切换查看</p>
          </div>
          <button
            type="button"
            className="btn secondary sm"
            onClick={onBackToChat}
            title="返回对话"
          >
            返回对话
          </button>
        </header>

        <div className="workspace-main-body">
          {selectedPath && previewContent !== null ? (
            <FilePreview path={selectedPath} content={previewContent} />
          ) : (
            <div className="workspace-preview-placeholder">
              <div className="workspace-preview-placeholder-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 10h8M8 14h5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="workspace-preview-placeholder-title">选择文件开始查看</p>
              <p className="workspace-preview-placeholder-hint">
                从左侧选择文件，通过 Tab 切换预览或代码
              </p>
            </div>
          )}
          {previewError ? <div className="file-preview-error">{previewError}</div> : null}
        </div>
      </div>
    </section>
  )
}
