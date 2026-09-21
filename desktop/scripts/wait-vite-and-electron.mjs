import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import waitOn from 'wait-on'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const appUrl = process.env.DEVFLOW_APP_URL || 'http://127.0.0.1:5173'
const port = new URL(appUrl.endsWith('/') ? appUrl : `${appUrl}/`).port || '5173'

await waitOn({
  resources: [`tcp:127.0.0.1:${port}`, `tcp:5173`],
  timeout: 120_000,
  interval: 250,
  window: 1000,
})

const electronBin = path.join(desktopRoot, 'node_modules', 'electron', 'cli.js')
const child = spawn(process.execPath, [electronBin, '.'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DEVFLOW_APP_URL: appUrl.replace('127.0.0.1', 'localhost'),
    DEVFLOW_SKIP_VITE_CHECK: '1',
  },
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
