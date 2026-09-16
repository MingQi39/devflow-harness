interface ToolCallBlockProps {
  name: string
  argumentsText?: string
  result?: string
  pending?: boolean
}

function parseToolPath(argumentsText?: string): string | null {
  if (!argumentsText) return null
  try {
    const args = JSON.parse(argumentsText) as { path?: string }
    if (typeof args.path === 'string' && args.path) {
      return args.path
    }
  } catch {
    // ignore invalid JSON during streaming
  }
  return null
}

function toolSummary(name: string, argumentsText?: string, result?: string): string {
  const path = parseToolPath(argumentsText)
  if (name === 'write_file') {
    if (result?.startsWith('Wrote ')) return result
    return path ? `写入 ${path}` : '写入文件'
  }
  if (name === 'read_file') {
    if (result && !result.startsWith('{')) return path ? `读取 ${path}` : '读取文件'
    return path ? `读取 ${path}` : '读取文件'
  }
  return name
}

function previewText(text: string, max = 240): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export default function ToolCallBlock({
  name,
  argumentsText,
  result,
  pending = false,
}: ToolCallBlockProps) {
  const summary = toolSummary(name, argumentsText, result)
  const showArgs =
    argumentsText &&
    !result &&
    name === 'write_file' &&
    parseToolPath(argumentsText) === null

  return (
    <div className={`tool-call-block${pending ? ' pending' : ''}`}>
      <div className="tool-call-header">
        <span className="tool-call-icon">{name === 'write_file' ? '✎' : '📄'}</span>
        <span className="tool-call-name">{summary}</span>
        {pending ? <span className="tool-call-status">执行中…</span> : null}
      </div>
      {showArgs ? (
        <pre className="tool-call-body">{previewText(argumentsText)}</pre>
      ) : null}
      {result && !result.startsWith('Wrote ') ? (
        <pre className="tool-call-result">{previewText(result, 480)}</pre>
      ) : null}
    </div>
  )
}
