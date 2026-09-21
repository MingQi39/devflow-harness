import net from 'node:net'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5173

function parseAppUrl(raw) {
  if (!raw) {
    return { hostname: DEFAULT_HOST, port: DEFAULT_PORT, display: `http://${DEFAULT_HOST}:${DEFAULT_PORT}` }
  }
  const url = new URL(raw.endsWith('/') ? raw : `${raw}/`)
  return {
    hostname: url.hostname,
    port: url.port ? Number(url.port) : DEFAULT_PORT,
    display: url.origin,
  }
}

function portOpen(hostname, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port, timeout: 2500 }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

const { hostname, port, display } = parseAppUrl(process.env.DEVFLOW_APP_URL)

if (process.env.DEVFLOW_SKIP_VITE_CHECK === '1') {
  process.exit(0)
}

const hostsToTry = hostname === 'localhost' ? ['127.0.0.1', '::1', 'localhost'] : [hostname]
let ok = false
for (const host of hostsToTry) {
  if (await portOpen(host, port)) {
    ok = true
    break
  }
}

if (!ok) {
  console.error(`
未检测到前端 Vite（${display}，端口 ${port}）。

推荐一条命令启动（会自动拉起 frontend + Electron，参考 moreai-electron）：
  cd desktop && pnpm electron:dev

或手动两个终端：
  cd frontend && pnpm dev
  cd desktop && pnpm start
`)
  process.exit(1)
}
