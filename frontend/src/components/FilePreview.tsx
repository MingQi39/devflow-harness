import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'

interface FilePreviewProps {
  path: string
  content: string
  onDownloadCurrent?: () => void
  onDownloadHandoff?: () => void
  /** Show path in toolbar (inbox hides it in section head). */
  showPath?: boolean
}

type PreviewMode = 'preview' | 'code'

function isHtmlFile(path: string): boolean {
  return /\.html?$/i.test(path)
}

function fileLanguage(path: string): string {
  if (/\.tsx?$/i.test(path)) return 'typescript'
  if (/\.jsx?$/i.test(path)) return 'javascript'
  if (/\.css$/i.test(path)) return 'css'
  if (/\.json$/i.test(path)) return 'json'
  if (/\.md$/i.test(path)) return 'markdown'
  if (/\.html?$/i.test(path)) return 'html'
  return 'text'
}

function PreviewBody({
  mode,
  previewable,
  path,
  content,
  isEmpty,
  fullscreen,
}: {
  mode: PreviewMode
  previewable: boolean
  path: string
  content: string
  isEmpty: boolean
  fullscreen?: boolean
}) {
  if (mode === 'preview' && previewable) {
    return (
      <div
        className={`file-preview-frame-wrap custom-scrollbar${fullscreen ? ' is-fullscreen-body' : ''}`}
      >
        {isEmpty ? (
          <div className="file-preview-empty">文件为空，暂无可预览内容</div>
        ) : (
          <iframe
            key={`${path}:${content.length}:${fullscreen ? 'fs' : 'inline'}`}
            className="file-preview-frame"
            title={`预览 ${path}`}
            sandbox="allow-scripts allow-modals"
            srcDoc={content}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={`file-preview-code-wrap custom-scrollbar${fullscreen ? ' is-fullscreen-body' : ''}`}
    >
      {isEmpty ? (
        <div className="file-preview-empty">文件为空</div>
      ) : (
        <pre className="file-preview-code">
          <code>{content}</code>
        </pre>
      )}
    </div>
  )
}

function PreviewToolbar({
  path,
  showPath,
  previewable,
  mode,
  setMode,
  isPrototype,
  isEmpty,
  onDownloadCurrent,
  onDownloadHandoff,
  language,
  fullscreen,
  onToggleFullscreen,
}: {
  path: string
  showPath: boolean
  previewable: boolean
  mode: PreviewMode
  setMode: (mode: PreviewMode) => void
  isPrototype: boolean
  isEmpty: boolean
  onDownloadCurrent?: () => void
  onDownloadHandoff?: () => void
  language: string
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const canFullscreen = !isEmpty

  return (
    <div className="file-preview-toolbar">
      {showPath ? (
        <span className="file-preview-path" title={path}>
          {path}
        </span>
      ) : (
        <span className="file-preview-path file-preview-path-spacer" aria-hidden />
      )}
      <div className="file-preview-toolbar-actions">
        {isPrototype && !isEmpty ? (
          <>
            {onDownloadCurrent ? (
              <button
                type="button"
                className="btn ghost sm file-preview-export-btn"
                onClick={onDownloadCurrent}
              >
                下载 HTML
              </button>
            ) : null}
            {onDownloadHandoff ? (
              <button
                type="button"
                className="btn secondary sm file-preview-export-btn"
                onClick={onDownloadHandoff}
                title="含 prototype.html、REQUIREMENTS.md 与说明"
              >
                导出交付包
              </button>
            ) : null}
          </>
        ) : null}
        {previewable ? (
          <div className="file-preview-tabs" role="tablist" aria-label="预览模式">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'preview'}
              className={mode === 'preview' ? 'active' : ''}
              onClick={() => setMode('preview')}
            >
              预览
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'code'}
              className={mode === 'code' ? 'active' : ''}
              onClick={() => setMode('code')}
            >
              代码
            </button>
          </div>
        ) : (
          <span className="file-preview-lang">{language}</span>
        )}
        {canFullscreen ? (
          <button
            type="button"
            className="btn ghost sm file-preview-fs-btn"
            onClick={onToggleFullscreen}
            aria-pressed={fullscreen}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function FilePreview({
  path,
  content,
  onDownloadCurrent,
  onDownloadHandoff,
  showPath = true,
}: FilePreviewProps) {
  const previewable = isHtmlFile(path)
  const isPrototype = path === 'prototype.html'
  const [mode, setMode] = useState<PreviewMode>(previewable ? 'preview' : 'code')
  const [fullscreen, setFullscreen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    setMode(previewable ? 'preview' : 'code')
  }, [path, previewable])

  useEffect(() => {
    setFullscreen(false)
  }, [path])

  useEffect(() => {
    if (!fullscreen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [fullscreen])

  const language = fileLanguage(path)
  const isEmpty = content.trim().length === 0

  const toolbarProps = {
    path,
    showPath,
    previewable,
    mode,
    setMode,
    isPrototype,
    isEmpty,
    onDownloadCurrent,
    onDownloadHandoff,
    language,
    fullscreen,
    onToggleFullscreen: () => setFullscreen((value) => !value),
  }

  const body = (
    <PreviewBody
      mode={mode}
      previewable={previewable}
      path={path}
      content={content}
      isEmpty={isEmpty}
      fullscreen={fullscreen}
    />
  )

  const shell = (
    <>
      <PreviewToolbar {...toolbarProps} />
      {!fullscreen ? body : null}
    </>
  )

  return (
    <>
      <div className="file-preview">{shell}</div>
      {fullscreen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="file-preview-fullscreen-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="file-preview-fullscreen-panel">
                <p id={titleId} className="visually-hidden">
                  全屏查看 {path}
                </p>
                <PreviewToolbar {...toolbarProps} />
                {body}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
