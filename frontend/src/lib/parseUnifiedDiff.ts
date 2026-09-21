export type DiffLineType = 'add' | 'del' | 'ctx' | 'hunk' | 'meta'

export interface DiffLine {
  type: DiffLineType
  content: string
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface ParsedDiffFile {
  path: string
  oldPath: string | null
  isNew: boolean
  isDeleted: boolean
  hunks: DiffHunk[]
}

export interface ParsedDiffStatLine {
  path: string
  churn: string
}

export function parseDiffStat(summary: string): ParsedDiffStatLine[] {
  const rows: ParsedDiffStatLine[] = []
  for (const line of summary.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.includes('files changed') || trimmed.includes('file changed')) {
      continue
    }
    const pipe = trimmed.lastIndexOf('|')
    if (pipe === -1) continue
    const path = trimmed.slice(0, pipe).trim()
    const churn = trimmed.slice(pipe + 1).trim()
    if (path) rows.push({ path, churn })
  }
  return rows
}

function parseFileChunk(chunk: string): ParsedDiffFile | null {
  const lines = chunk.split('\n')
  if (lines.length === 0) return null

  const header = lines[0]
  const pathMatch = header.match(/a\/(.+?) b\/(.+)$/)
  let oldPath: string | null = null
  let path = header
  if (pathMatch) {
    oldPath = pathMatch[1]
    path = pathMatch[2]
  }

  let isNew = false
  let isDeleted = false
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.startsWith('new file mode')) {
      isNew = true
      continue
    }
    if (line.startsWith('deleted file mode')) {
      isDeleted = true
      continue
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue
    }
    if (line.startsWith('@@')) {
      current = { header: line, lines: [] }
      hunks.push(current)
      continue
    }
    if (!current) continue

    if (line.startsWith('+')) {
      current.lines.push({ type: 'add', content: line.slice(1) })
    } else if (line.startsWith('-')) {
      current.lines.push({ type: 'del', content: line.slice(1) })
    } else if (line.startsWith('\\')) {
      current.lines.push({ type: 'meta', content: line.slice(1).trim() })
    } else {
      current.lines.push({ type: 'ctx', content: line.startsWith(' ') ? line.slice(1) : line })
    }
  }

  return { path, oldPath, isNew, isDeleted, hunks }
}

export function parseUnifiedDiff(patch: string): ParsedDiffFile[] {
  const text = patch.trim()
  if (!text) return []

  const normalized = text.startsWith('diff --git') ? text : `diff --git ${text}`
  const parts = normalized.split(/\n(?=diff --git )/)
  const files: ParsedDiffFile[] = []

  for (const part of parts) {
    const chunk = part.startsWith('diff --git') ? part.slice('diff --git '.length) : part
    const parsed = parseFileChunk(chunk)
    if (parsed && (parsed.hunks.length > 0 || parsed.isNew || parsed.isDeleted)) {
      files.push(parsed)
    }
  }

  return files
}
