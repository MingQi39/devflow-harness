import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import archiver from 'archiver'

export const MAX_ZIP_BYTES = 50 * 1024 * 1024

// Keep in sync with backend/services/project_import_skip.py
export const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '__MACOSX',
  '.devflow',
  '.git',
  'venv',
  '.venv',
  'dist',
  'build',
  '.next',
  'target',
  '__pycache__',
  '.turbo',
  'coverage',
  '.cache',
  '.pytest_cache',
  '.mypy_cache',
  '.pnpm-store',
  'vendor',
  'Pods',
  '.gradle',
  'workspaces',
  '.cursor',
  '.idea',
  'site-packages',
])

export function shouldSkipRelative(relPosix) {
  if (!relPosix) return true
  const parts = relPosix.split('/')
  if (parts.some((part) => SKIP_DIR_NAMES.has(part))) return true
  if (relPosix.startsWith('.devflow/')) return true
  return false
}

export const ZIP_SIZE_ERROR =
  'ZIP 超过 50MB（已跳过 node_modules、venv 等）。请在 backend/.env 开启 ALLOW_LOCAL_PATH_IMPORT=true 后重启后端，使用本机路径导入；依赖请在沙箱内 pnpm install / pip install 安装。'

/**
 * @param {string} dirPath
 * @param {string} outFilePath
 * @returns {Promise<number>} compressed size in bytes
 */
export async function zipProjectDirectoryToFile(dirPath, outFilePath) {
  const root = path.resolve(dirPath)
  const output = fs.createWriteStream(outFilePath)
  const archive = archiver('zip', { zlib: { level: 6 } })

  let compressedBytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      compressedBytes += chunk.length
      if (compressedBytes > MAX_ZIP_BYTES) {
        callback(new Error(ZIP_SIZE_ERROR))
        return
      }
      callback(null, chunk)
    },
  })

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      const rel = path.relative(root, abs).split(path.sep).join('/')
      if (shouldSkipRelative(rel)) continue
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (entry.isFile()) {
        archive.file(abs, { name: rel })
      }
    }
  }

  const finished = pipeline(archive, limiter, output)
  walk(root)
  void archive.finalize()

  try {
    await finished
  } catch (err) {
    archive.destroy()
    output.destroy()
    await fs.promises.unlink(outFilePath).catch(() => {})
    throw err
  }

  if (compressedBytes > MAX_ZIP_BYTES) {
    await fs.promises.unlink(outFilePath).catch(() => {})
    throw new Error(ZIP_SIZE_ERROR)
  }

  return compressedBytes
}
