import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  MAX_ZIP_BYTES,
  ZIP_SIZE_ERROR,
  shouldSkipRelative,
  zipProjectDirectoryToFile,
} from '../lib/zipProjectDirectory.mjs'

test('shouldSkipRelative skips venv and node_modules segments', () => {
  assert.equal(shouldSkipRelative('backend/venv/lib/python'), true)
  assert.equal(shouldSkipRelative('frontend/node_modules/foo'), true)
  assert.equal(shouldSkipRelative('src/index.ts'), false)
})

test('zipProjectDirectoryToFile rejects when compressed output exceeds limit', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'devflow-zip-test-'))
  t.after(async () => {
    await fs.promises.rm(root, { recursive: true, force: true })
  })

  const payload = crypto.randomBytes(1024 * 1024)
  for (let i = 0; i < 56; i += 1) {
    await fs.promises.writeFile(path.join(root, `chunk-${i}.bin`), payload)
  }

  const outFile = path.join(root, 'out.zip')
  await assert.rejects(
    () => zipProjectDirectoryToFile(root, outFile),
    (err) => {
      assert.ok(err instanceof Error)
      assert.equal(err.message, ZIP_SIZE_ERROR)
      return true
    },
  )
  assert.equal(fs.existsSync(outFile), false)
})

test('zipProjectDirectoryToFile stays under limit for small tree', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'devflow-zip-small-'))
  t.after(async () => {
    await fs.promises.rm(root, { recursive: true, force: true })
  })

  await fs.promises.mkdir(path.join(root, 'src'), { recursive: true })
  await fs.promises.writeFile(path.join(root, 'src', 'app.ts'), 'export {}')
  await fs.promises.mkdir(path.join(root, 'node_modules', 'ignored'), { recursive: true })
  await fs.promises.writeFile(
    path.join(root, 'node_modules', 'ignored', 'huge.js'),
    'x'.repeat(1024 * 1024),
  )

  const outFile = path.join(root, 'out.zip')
  const size = await zipProjectDirectoryToFile(root, outFile)
  assert.ok(size > 0)
  assert.ok(size < MAX_ZIP_BYTES)
  assert.ok(fs.existsSync(outFile))
})
