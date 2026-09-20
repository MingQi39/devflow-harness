import { ApiError, getToken, clearToken } from './api'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function downloadTextFile(filename: string, content: string, mimeType?: string): void {
  const type = mimeType ?? 'text/plain;charset=utf-8'
  downloadBlob(new Blob([content], { type }), filename)
}

export async function downloadAuthenticated(path: string, filename: string): Promise<void> {
  const token = getToken()
  const headers: HeadersInit = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`/api${path}`, { headers })

  if (response.status === 401) {
    clearToken()
    if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/share/')) {
      window.location.href = '/login'
    }
    throw new ApiError(401, 'Unauthorized')
  }

  if (!response.ok) {
    let detail = await response.text()
    try {
      const json = JSON.parse(detail) as { detail?: string }
      if (typeof json.detail === 'string') detail = json.detail
    } catch {
      // keep raw text
    }
    throw new ApiError(response.status, detail || `Request failed: ${response.status}`)
  }

  const blob = await response.blob()
  downloadBlob(blob, filename)
}

export async function downloadPrototypeHandoff(conversationId: string): Promise<void> {
  await downloadAuthenticated(
    `/conversations/${conversationId}/files/export/prototype`,
    `prototype-handoff-${conversationId.slice(0, 8)}.zip`,
  )
}
