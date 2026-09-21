import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipProjectDirectoryToFile } from './lib/zipProjectDirectory.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const APP_URL = process.env.DEVFLOW_APP_URL || 'http://localhost:5173'
const API_BASE = (process.env.DEVFLOW_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

const OFFLINE_HTML = path.join(__dirname, 'offline.html')
const APP_URL_NORMALIZED = APP_URL.replace(/\/$/, '')

/** @type {boolean} */
let showingOfflineFallback = false

function showOfflineFallback(window) {
  if (showingOfflineFallback || window.isDestroyed()) return
  showingOfflineFallback = true
  void window
    .loadFile(OFFLINE_HTML, { query: { url: APP_URL_NORMALIZED } })
    .catch((err) => {
      console.error('Failed to load offline fallback page', err)
    })
    .finally(() => {
      showingOfflineFallback = false
    })
}

function loadAppInto(window) {
  void window.loadURL(`${APP_URL_NORMALIZED}/`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'DevFlow Harness',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, description, validatedURL, isMainFrame) => {
      if (!isMainFrame || !mainWindow || mainWindow.isDestroyed()) return
      if (validatedURL.startsWith('file://')) return

      const refused =
        errorCode === -102 || description?.includes('ERR_CONNECTION_REFUSED')
      const normalized = validatedURL.replace(/\/$/, '')
      const sameTarget = normalized === APP_URL_NORMALIZED
      if (refused && sameTarget) {
        showOfflineFallback(mainWindow)
      }
    },
  )

  loadAppInto(mainWindow)

  if (process.env.DEVFLOW_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('pick-project-directory', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  const result = await dialog.showOpenDialog(win, {
    title: '选择本地项目目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('upload-project-directory', async (_event, payload) => {
  const { orgId, projectId, dirPath, token } = payload ?? {}
  if (!orgId || !projectId || !dirPath) {
    throw new Error('缺少导入参数')
  }

  const tmpFile = path.join(os.tmpdir(), `devflow-import-${Date.now()}.zip`)
  await zipProjectDirectoryToFile(dirPath, tmpFile)
  const zipBuffer = await fs.promises.readFile(tmpFile)

  try {
    const form = new FormData()
    const blob = new Blob([zipBuffer], { type: 'application/zip' })
    form.append('file', blob, 'project.zip')

    const headers = new Headers()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    const url = `${API_BASE}/orgs/${orgId}/projects/${projectId}/import`
    const response = await fetch(url, { method: 'POST', headers, body: form })
    if (!response.ok) {
      const text = await response.text()
      let detail = text
      try {
        const json = JSON.parse(text)
        if (typeof json.detail === 'string') detail = json.detail
      } catch {
        // keep raw
      }
      throw new Error(detail || '导入失败')
    }
    return await response.json()
  } finally {
    await fs.promises.unlink(tmpFile).catch(() => {})
  }
})
