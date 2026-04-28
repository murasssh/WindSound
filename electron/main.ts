import { app, BrowserWindow, ipcMain, session } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { clearYouTubeAccountSession, getYouTubeAccountStatus } from './authentication/youtubeAuth'
import { MUSIC_ORIGIN } from './config/constants'
import { ensureStreamServer, primePlaybackFallback } from './stream/proxy'
import { ensureRendererServer } from './system/rendererServer'
import { getUpdateStatus, launchInstallerUpdate } from './system/updater'
import { innertubeRequest } from './youtube-services/innertube'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const legacyUserDataPath = path.join(app.getPath('appData'), 'beanplayer')
const windsoundUserDataPath = path.join(app.getPath('appData'), 'windsound')
const userDataPath = fs.existsSync(legacyUserDataPath) ? legacyUserDataPath : windsoundUserDataPath

// Garante que todos os diretórios de dados do app existam antes de iniciar
const ensureAppDirectories = () => {
  const dirs = [
    userDataPath,
    path.join(userDataPath, 'cache'),
    path.join(userDataPath, 'stream-cache'),
    path.join(userDataPath, 'session'),
    path.join(userDataPath, 'logs'),
  ]

  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (error) {
      console.warn(`[WindSound] Nao foi possivel criar diretorio: ${dir}`, error)
    }
  }
}
const iconPath = app.isPackaged
  ? path.join(__dirname, '../dist/branding/windsound-icon.png')
  : path.join(process.cwd(), 'public', 'branding', 'windsound-icon.png')

const resolvePackagedPreloadPath = () => {
  const candidates = [
    path.join(__dirname, '../electron/preload.cjs'),
    path.join(process.resourcesPath, 'app.asar', 'electron', 'preload.cjs'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'preload.cjs'),
    path.join(process.resourcesPath, 'electron', 'preload.cjs'),
  ]

  const resolved = candidates.find((candidate) => fs.existsSync(candidate))

  if (!resolved) {
    console.warn('[WindSound] preload nao encontrado no build empacotado', { candidates })
  }

  return resolved ?? candidates[0]
}

let radioQueueModulePromise: Promise<typeof import('./youtube-services/radioQueue')> | null = null

const loadRadioQueueModule = () => {
  if (!radioQueueModulePromise) {
    radioQueueModulePromise = import('./youtube-services/radioQueue')
  }

  return radioQueueModulePromise
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('in-process-gpu')
app.setPath('userData', userDataPath)

const waitForYouTubeLogin = (parentWindow?: BrowserWindow | null) =>
  new Promise<Awaited<ReturnType<typeof getYouTubeAccountStatus>>>((resolve) => {
    const authWindow = new BrowserWindow({
      width: 1180,
      height: 860,
      title: 'Conectar conta do WindSound',
      parent: parentWindow ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      backgroundColor: '#0d0d0d',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    let finished = false

    const finalize = async () => {
      if (finished) {
        return
      }

      finished = true
      clearInterval(pollTimer)

      let finalStatus = await getYouTubeAccountStatus()

      if (!finalStatus.connected) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await new Promise((waitResolve) => setTimeout(waitResolve, 1000))
          finalStatus = await getYouTubeAccountStatus()

          if (finalStatus.connected) {
            break
          }
        }
      }

      resolve(finalStatus)
    }

    const pollTimer = setInterval(async () => {
      const status = await getYouTubeAccountStatus()

      if (status.connected) {
        await finalize()

        if (!authWindow.isDestroyed()) {
          authWindow.close()
        }
      }
    }, 1500)

    authWindow.on('closed', () => {
      void finalize()
    })

    authWindow.loadURL('https://music.youtube.com')
  })

const createWindow = async () => {
  const preloadPath = app.isPackaged
    ? resolvePackagedPreloadPath()
    : path.join(process.cwd(), 'electron', 'preload.cjs')

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'WindSound',
    icon: iconPath,
    backgroundColor: '#0d0d0d',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d0d0d',
      symbolColor: '#f5f5f5',
      height: 30,
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'

  if (app.isPackaged) {
    const packagedRendererUrl = await ensureRendererServer(app, path.join(__dirname, '../dist'))
    await mainWindow.loadURL(packagedRendererUrl)
  } else {
    await mainWindow.loadURL(devServerUrl)
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[WindSound renderer console:${level}]`, message)
  })

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const targetUrl = details.url

    if (targetUrl.startsWith(MUSIC_ORIGIN) || targetUrl.startsWith('https://www.youtube.com')) {
      details.requestHeaders['Origin'] = MUSIC_ORIGIN
    }

    callback({ requestHeaders: details.requestHeaders })
  })
}

app.whenReady().then(async () => {
  app.setName('WindSound')
  ensureAppDirectories()
  ensureStreamServer(app)

  ipcMain.handle('windsound:ping', async () => {
    return { ok: true }
  })

  ipcMain.handle('innertube:request', async (_event, endpoint: string, payload: Record<string, unknown>) => {
    return innertubeRequest(endpoint, payload)
  })

  ipcMain.handle(
    'windsound:build-radio-queue',
    async (_event, seed: { videoId: string; title: string; channelTitle: string; album?: string }, limit?: number) => {
      const { buildBackendRadioQueue } = await loadRadioQueueModule()
      return buildBackendRadioQueue(seed, limit)
    },
  )

  ipcMain.handle('windsound:auth-status', async () => {
    return getYouTubeAccountStatus()
  })

  ipcMain.handle('windsound:connect-account', async () => {
    return waitForYouTubeLogin(BrowserWindow.getFocusedWindow())
  })

  ipcMain.handle('windsound:disconnect-account', async () => {
    return clearYouTubeAccountSession()
  })

  ipcMain.handle('windsound:prime-playback', async (_event, videoId: string, fallbackUrl: string) => {
    return primePlaybackFallback(videoId, fallbackUrl)
  })

  ipcMain.handle('windsound:get-update-status', async () => {
    return getUpdateStatus()
  })

  ipcMain.handle('windsound:launch-update-installer', async () => {
    return launchInstallerUpdate()
  })

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
