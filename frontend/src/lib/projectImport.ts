import { ApiError, apiFetch, getToken } from './api'
import { getDesktopBridge } from './desktopBridge'

export async function uploadProjectZip(
  orgId: string,
  projectId: string,
  file: File,
): Promise<{ files_imported: number }> {
  const form = new FormData()
  form.append('file', file)

  const headers = new Headers()
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/import`, {
    method: 'POST',
    headers,
    body: form,
  })

  if (!response.ok) {
    let detail = await response.text()
    try {
      const json = JSON.parse(detail) as { detail?: string }
      if (typeof json.detail === 'string') detail = json.detail
    } catch {
      // keep raw
    }
    throw new Error(detail || '导入失败')
  }

  return (await response.json()) as { files_imported: number }
}

/** Electron：本机目录导入（优先服务端路径拷贝，否则主进程 ZIP 上传） */
export async function importProjectDirectory(
  orgId: string,
  projectId: string,
  sourcePath: string,
): Promise<{ files_imported: number; local_bound?: boolean; local_root?: string | null }> {
  try {
    return await apiFetch<{
      files_imported: number
      local_bound?: boolean
      local_root?: string | null
    }>(
      `/orgs/${orgId}/projects/${projectId}/import/local`,
      { method: 'POST', body: JSON.stringify({ source_path: sourcePath }) },
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      throw new Error(
        err.message ||
          '本机路径导入未开启。请在 backend/.env 设置 ALLOW_LOCAL_PATH_IMPORT=true 并重启 uvicorn。',
      )
    }
    const bridge = getDesktopBridge()
    if (err instanceof ApiError && err.status === 404 && bridge) {
      return bridge.uploadProjectDirectory(orgId, projectId, sourcePath, getToken())
    }
    throw err
  }
}
