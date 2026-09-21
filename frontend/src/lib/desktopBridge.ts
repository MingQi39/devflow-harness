export interface DevflowDesktopBridge {
  isDesktop: true
  pickProjectDirectory: () => Promise<string | null>
  uploadProjectDirectory: (
    orgId: string,
    projectId: string,
    dirPath: string,
    token: string | null,
  ) => Promise<{ files_imported: number }>
}

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && window.devflow?.isDesktop === true
}

export function getDesktopBridge(): DevflowDesktopBridge | null {
  if (!isDesktopApp() || !window.devflow) return null
  return window.devflow
}
