const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('devflow', {
  isDesktop: true,
  pickProjectDirectory: () => ipcRenderer.invoke('pick-project-directory'),
  uploadProjectDirectory: (orgId, projectId, dirPath, token) =>
    ipcRenderer.invoke('upload-project-directory', { orgId, projectId, dirPath, token }),
})
