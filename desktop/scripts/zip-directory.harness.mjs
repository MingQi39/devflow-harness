#!/usr/bin/env node
/**
 * Phase-1 feedback loop: exercises the same zip path as Electron main on pick+import fallback.
 * Usage: node scripts/zip-directory.harness.mjs [projectDir]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ZIP_SIZE_ERROR,
  zipProjectDirectoryToFile,
} from '../lib/zipProjectDirectory.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultDir = path.resolve(__dirname, '../..')
const dirPath = path.resolve(process.argv[2] || defaultDir)
const tmpFile = path.join(os.tmpdir(), `devflow-harness-zip-${Date.now()}.zip`)

try {
  const size = await zipProjectDirectoryToFile(dirPath, tmpFile)
  console.log(`OK zip ${dirPath} -> ${size} bytes (${tmpFile})`)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  if (message === ZIP_SIZE_ERROR) {
    console.error(`EXPECTED_LIMIT ${message}`)
    process.exit(2)
  }
  console.error('FAIL', err)
  process.exit(1)
} finally {
  await fs.promises.unlink(tmpFile).catch(() => {})
}
