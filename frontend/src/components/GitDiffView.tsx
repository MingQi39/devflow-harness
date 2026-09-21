import { useMemo, useState } from 'react'
import {
  parseDiffStat,
  parseUnifiedDiff,
  type ParsedDiffFile,
} from '../lib/parseUnifiedDiff'

interface GitDiffViewProps {
  summary: string
  patch: string
  empty: boolean
}

function FileDiffBlock({ file }: { file: ParsedDiffFile }) {
  const [collapsed, setCollapsed] = useState(false)
  const adds = file.hunks.reduce(
    (n, h) => n + h.lines.filter((l) => l.type === 'add').length,
    0,
  )
  const dels = file.hunks.reduce(
    (n, h) => n + h.lines.filter((l) => l.type === 'del').length,
    0,
  )

  return (
    <section className="git-diff-file">
      <button
        type="button"
        className="git-diff-file-head"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className="git-diff-file-path" title={file.path}>
          {file.path}
        </span>
        <span className="git-diff-file-badges">
          {file.isNew ? <span className="git-diff-badge git-diff-badge-new">新文件</span> : null}
          {file.isDeleted ? (
            <span className="git-diff-badge git-diff-badge-del">已删除</span>
          ) : null}
          {dels > 0 ? <span className="git-diff-count git-diff-count-del">−{dels}</span> : null}
          {adds > 0 ? <span className="git-diff-count git-diff-count-add">+{adds}</span> : null}
        </span>
      </button>
      {!collapsed ? (
        <div className="git-diff-hunks">
          {file.hunks.map((hunk, index) => (
            <div key={`${file.path}-${index}`} className="git-diff-hunk">
              <div className="git-diff-hunk-header">{hunk.header}</div>
              <pre className="git-diff-lines">
                {hunk.lines.map((line, lineIndex) => (
                  <code
                    key={lineIndex}
                    className={`git-diff-line git-diff-line-${line.type}`}
                  >
                    <span className="git-diff-line-gutter" aria-hidden="true">
                      {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
                    </span>
                    <span className="git-diff-line-text">{line.content || ' '}</span>
                  </code>
                ))}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default function GitDiffView({ summary, patch, empty }: GitDiffViewProps) {
  const statLines = useMemo(() => parseDiffStat(summary), [summary])
  const files = useMemo(() => parseUnifiedDiff(patch), [patch])

  if (empty) {
    return (
      <p className="git-diff-empty">
        与主分支无业务代码差异（已忽略 .devflow 平台元数据）。若有未保存改动请先让 Agent 写入文件。
      </p>
    )
  }

  return (
    <div className="git-diff-view">
      {statLines.length > 0 ? (
        <ul className="git-diff-stat-list">
          {statLines.map((row) => (
            <li key={row.path}>
              <span className="git-diff-stat-path">{row.path}</span>
              <span className="git-diff-stat-churn">{row.churn}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {files.length > 0 ? (
        files.map((file) => <FileDiffBlock key={file.path} file={file} />)
      ) : (
        <pre className="git-diff-fallback">{patch || summary}</pre>
      )}
    </div>
  )
}
