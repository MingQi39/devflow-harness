import { useEffect, useState } from 'react'

interface FilePreviewProps {
  path: string
  content: string
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

export default function FilePreview({ path, content }: FilePreviewProps) {
  const previewable = isHtmlFile(path)
  const [mode, setMode] = useState<PreviewMode>(previewable ? 'preview' : 'code')

  useEffect(() => {
    setMode(previewable ? 'preview' : 'code')
  }, [path, previewable])

  const language = fileLanguage(path)
  const isEmpty = content.trim().length === 0

  return (
    <div className="file-preview">
      <div className="file-preview-toolbar">
        <span className="file-preview-path" title={path}>
          {path}
        </span>
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
      </div>

      {mode === 'preview' && previewable ? (
        <div className="file-preview-frame-wrap custom-scrollbar">
          {isEmpty ? (
            <div className="file-preview-empty">文件为空，暂无可预览内容</div>
          ) : (
            <iframe
              className="file-preview-frame"
              title={`预览 ${path}`}
              sandbox="allow-scripts allow-modals"
              srcDoc={content}
            />
          )}
        </div>
      ) : (
        <div className="file-preview-code-wrap custom-scrollbar">
          {isEmpty ? (
            <div className="file-preview-empty">文件为空</div>
          ) : (
            <pre className="file-preview-code">
              <code>{content}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
