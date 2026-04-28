const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windsound', {
  platform: process.platform,
  ping: () => ipcRenderer.invoke('windsound:ping'),
  innertubeRequest: (endpoint, payload) => ipcRenderer.invoke('innertube:request', endpoint, payload),
  buildRadioQueue: (seed, limit) => ipcRenderer.invoke('windsound:build-radio-queue', seed, limit),
  primePlayback: (videoId, fallbackUrl) => ipcRenderer.invoke('windsound:prime-playback', videoId, fallbackUrl),
  getUpdateStatus: () => ipcRenderer.invoke('windsound:get-update-status'),
  launchUpdateInstaller: () => ipcRenderer.invoke('windsound:launch-update-installer'),
  createStreamUrl: (streamUrl) => `http://127.0.0.1:38947/stream?url=${encodeURIComponent(streamUrl)}`,
  createPlaybackUrl: (videoId) => {
    const params = new URLSearchParams({
      videoId: String(videoId),
    })

    return `http://127.0.0.1:38947/playback?${params.toString()}`
  },
  getAuthStatus: () => ipcRenderer.invoke('windsound:auth-status'),
  connectAccount: () => ipcRenderer.invoke('windsound:connect-account'),
  disconnectAccount: () => ipcRenderer.invoke('windsound:disconnect-account'),
})
