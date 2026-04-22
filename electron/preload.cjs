const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windsound', {
  platform: process.platform,
  ping: () => ipcRenderer.invoke('windsound:ping'),
  innertubeRequest: (endpoint, payload) => ipcRenderer.invoke('innertube:request', endpoint, payload),
  buildRadioQueue: (seed, limit) => ipcRenderer.invoke('windsound:build-radio-queue', seed, limit),
  createStreamUrl: (streamUrl) => `http://127.0.0.1:38947/stream?url=${encodeURIComponent(streamUrl)}`,
  createPlaybackUrl: (videoId) => `http://127.0.0.1:38947/yt-audio?videoId=${encodeURIComponent(videoId)}`,
  getAuthStatus: () => ipcRenderer.invoke('windsound:auth-status'),
  connectAccount: () => ipcRenderer.invoke('windsound:connect-account'),
  disconnectAccount: () => ipcRenderer.invoke('windsound:disconnect-account'),
})
