const { contextBridge, ipcRenderer } = require('electron')

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('installer', {
  getContext: () => ipcRenderer.invoke('installer:get-context'),
  selectFolder: () => ipcRenderer.invoke('installer:select-folder'),
  getDefaultDir: () => ipcRenderer.invoke('installer:get-default-dir'),
  start: (targetDir) => ipcRenderer.invoke('installer:start', targetDir),
  openExe: (exePath) => ipcRenderer.invoke('installer:open-exe', exePath),
  onStep: (callback) => subscribe('install:step', callback),
  onLog: (callback) => subscribe('install:log', callback),
  onError: (callback) => subscribe('install:error', callback),
  onDone: (callback) => subscribe('install:done', callback),
})
