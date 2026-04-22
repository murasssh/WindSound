import { app, BrowserWindow, ipcMain, session } from 'electron'
import { spawn } from 'child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { clearYouTubeAccountSession, getYouTubeAccountStatus } from './authentication/youtubeAuth'
import { innertubeRequest } from './youtube-services/innertube'
import { buildBackendRadioQueue } from './youtube-services/radioQueue'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const STREAM_PROXY_PORT = 38947
const legacyUserDataPath = path.join(app.getPath('appData'), 'beanplayer')
const windsoundUserDataPath = path.join(app.getPath('appData'), 'windsound')
const userDataPath = fs.existsSync(legacyUserDataPath) ? legacyUserDataPath : windsoundUserDataPath
const iconPath = app.isPackaged
  ? path.join(__dirname, '../dist/branding/windsound-icon.png')
  : path.join(process.cwd(), 'public', 'branding', 'windsound-icon.png')

app.setPath('userData', userDataPath)

let streamServerStarted = false
const STREAM_CHUNK_SIZE = 256 * 1024
const MIN_UPSTREAM_SLICE_SIZE = 1
const resolvedAudioUrlCache = new Map<string, string>()

const fetchUpstreamSlice = async (
  streamUrl: string,
  start: number,
  end: number,
  baseHeaders: Headers,
): Promise<{ buffer: Buffer; contentType: string; totalSize: number; acceptRanges: string | null }> => {
  const headers = new Headers(baseHeaders)
  headers.set('Range', `bytes=${start}-${end}`)

  const upstream = await fetch(streamUrl, {
    method: 'GET',
    headers,
  })

  if (upstream.status === 206) {
    const buffer = Buffer.from(await upstream.arrayBuffer())
    const contentRange = upstream.headers.get('content-range')
    const totalSize =
      Number(contentRange?.split('/')[1] ?? new URL(streamUrl).searchParams.get('clen') ?? end + 1) || end + 1

    return {
      buffer,
      contentType: upstream.headers.get('content-type') ?? 'audio/mp4',
      totalSize,
      acceptRanges: upstream.headers.get('accept-ranges'),
    }
  }

  if (upstream.status === 403 && end > start) {
    const sliceSize = end - start + 1

    if (sliceSize <= MIN_UPSTREAM_SLICE_SIZE) {
      throw new Error(`Range recusado pelo upstream em ${start}-${end}`)
    }

    const middle = start + Math.floor(sliceSize / 2) - 1
    const left = await fetchUpstreamSlice(streamUrl, start, middle, baseHeaders)
    const right = await fetchUpstreamSlice(streamUrl, middle + 1, end, baseHeaders)

    return {
      buffer: Buffer.concat([left.buffer, right.buffer]),
      contentType: left.contentType,
      totalSize: left.totalSize,
      acceptRanges: left.acceptRanges,
    }
  }

  throw new Error(`Upstream respondeu com status ${upstream.status} para ${start}-${end}`)
}

const proxyResolvedStream = async (
  request: IncomingMessage,
  response: ServerResponse,
  streamUrl: string | null,
) => {
  if (!streamUrl) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Missing stream URL')
    return
  }

  try {
    const headers = new Headers({
      Accept: '*/*',
      Origin: 'https://music.youtube.com',
      Referer: 'https://music.youtube.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36',
    })
    const totalSize = Number(new URL(streamUrl).searchParams.get('clen') ?? '0')
    const requestedRangeHeader = typeof request.headers.range === 'string' ? request.headers.range : null
    const boundedRange = requestedRangeHeader?.match(/^bytes=(\d+)-(\d+)?$/)
    const start = boundedRange ? Number(boundedRange[1]) : 0
    const explicitEnd = boundedRange?.[2] ? Number(boundedRange[2]) : null
    const cappedEnd = explicitEnd ?? (totalSize > 0 ? Math.min(totalSize - 1, start + STREAM_CHUNK_SIZE - 1) : start + STREAM_CHUNK_SIZE - 1)
    const end = Math.min(cappedEnd, start + STREAM_CHUNK_SIZE - 1)

    const upstream = await fetchUpstreamSlice(streamUrl, start, end, headers)

    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': upstream.contentType,
      'Content-Length': String(upstream.buffer.byteLength),
      'Content-Range': `bytes ${start}-${start + upstream.buffer.byteLength - 1}/${upstream.totalSize}`,
    }

    if (upstream.acceptRanges) responseHeaders['Accept-Ranges'] = upstream.acceptRanges

    response.writeHead(206, responseHeaders)
    response.end(upstream.buffer)
  } catch (error) {
    console.error('[WindSound stream proxy] failed', error)
    response.writeHead(502, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    })
    response.end(error instanceof Error ? error.message : 'Stream proxy failed')
  }
}

const proxyStreamRequest = async (request: IncomingMessage, response: ServerResponse) => {
  const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${STREAM_PROXY_PORT}`)
  const streamUrl = requestUrl.searchParams.get('url')

  await proxyResolvedStream(request, response, streamUrl)
}

const resolveYtDlpAudioUrl = (videoId: string) =>
  new Promise<string>((resolve, reject) => {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`
    const process = spawn('python', [
      '-m',
      'yt_dlp',
      '-f',
      'bestaudio[ext=m4a]/bestaudio',
      '-g',
      '--no-warnings',
      targetUrl,
    ])

    let stdout = ''
    let stderr = ''

    process.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    process.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    process.on('error', (error) => {
      reject(error)
    })

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp retornou codigo ${code}`))
        return
      }

      const resolvedUrl = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)

      if (!resolvedUrl) {
        reject(new Error('yt-dlp nao retornou URL de audio'))
        return
      }

      resolve(resolvedUrl)
    })
  })

const proxyYtDlpAudioRequest = async (request: IncomingMessage, response: ServerResponse) => {
  const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${STREAM_PROXY_PORT}`)
  const videoId = requestUrl.searchParams.get('videoId')

  if (!videoId) {
    response.writeHead(400, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    })
    response.end('Missing videoId')
    return
  }

  try {
    const cachedUrl = resolvedAudioUrlCache.get(videoId)
    const resolvedUrl = cachedUrl ?? (await resolveYtDlpAudioUrl(videoId))

    if (!cachedUrl) {
      resolvedAudioUrlCache.set(videoId, resolvedUrl)
    }

    await proxyResolvedStream(request, response, resolvedUrl)
  } catch (error) {
    console.error('[WindSound yt-dlp] failed to resolve audio url', error)
    resolvedAudioUrlCache.delete(videoId)
    response.writeHead(502, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    })
    response.end(error instanceof Error ? error.message : 'yt-dlp failed')
  }
}

const ensureStreamServer = () => {
  if (streamServerStarted) {
    return
  }

  const server = createServer((request, response) => {
    if ((request.url ?? '').startsWith('/yt-audio')) {
      void proxyYtDlpAudioRequest(request, response)
      return
    }

    if ((request.url ?? '').startsWith('/stream')) {
      void proxyStreamRequest(request, response)
      return
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  })

  server.listen(STREAM_PROXY_PORT, '127.0.0.1')
  streamServerStarted = true

  app.on('before-quit', () => {
    server.close()
  })
}

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
      resolve(await getYouTubeAccountStatus())
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

const createWindow = () => {
  const preloadPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'preload.cjs')
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
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadURL(devServerUrl)
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[WindSound renderer console:${level}]`, message)
  })

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Origin'] = 'https://music.youtube.com'
    callback({ requestHeaders: details.requestHeaders })
  })
}

app.whenReady().then(() => {
  app.setName('WindSound')
  ensureStreamServer()

  ipcMain.handle('windsound:ping', async () => {
    return { ok: true }
  })

  ipcMain.handle('innertube:request', async (_event, endpoint: string, payload: Record<string, unknown>) => {
    return innertubeRequest(endpoint, payload)
  })

  ipcMain.handle(
    'windsound:build-radio-queue',
    async (_event, seed: { videoId: string; title: string; channelTitle: string; album?: string }, limit?: number) => {
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
