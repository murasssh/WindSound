import { createServer, type Server } from 'http'
import * as fs from 'fs'
import * as path from 'path'
import type { App } from 'electron'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

let rendererServerPromise: Promise<string> | null = null
let rendererServer: Server | null = null

const getContentType = (targetPath: string) => CONTENT_TYPES[path.extname(targetPath).toLowerCase()] ?? 'application/octet-stream'

const resolveRendererFile = (distRoot: string, requestPathname: string) => {
  const normalizedPath = decodeURIComponent(requestPathname).replace(/^\/+/, '')
  const safeRelativePath = normalizedPath.length > 0 ? normalizedPath : 'index.html'
  const candidatePath = path.resolve(distRoot, safeRelativePath)
  const safeRoot = path.resolve(distRoot)

  if (!candidatePath.startsWith(safeRoot)) {
    return path.join(distRoot, 'index.html')
  }

  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return candidatePath
  }

  return path.join(distRoot, 'index.html')
}

export const ensureRendererServer = (app: App, distRoot: string) => {
  if (rendererServerPromise) {
    return rendererServerPromise
  }

  rendererServerPromise = new Promise<string>((resolve, reject) => {
    rendererServer = createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
        const targetPath = resolveRendererFile(distRoot, requestUrl.pathname)
        const fileBuffer = fs.readFileSync(targetPath)

        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': getContentType(targetPath),
        })
        response.end(fileBuffer)
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end(error instanceof Error ? error.message : 'Renderer server error')
      }
    })

    rendererServer.once('error', (error) => {
      rendererServerPromise = null
      reject(error)
    })

    rendererServer.listen(0, '127.0.0.1', () => {
      const address = rendererServer?.address()

      if (!address || typeof address === 'string') {
        rendererServer?.close()
        rendererServer = null
        rendererServerPromise = null
        reject(new Error('Nao foi possivel descobrir a porta do servidor do renderer.'))
        return
      }

      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

  app.on('before-quit', () => {
    rendererServer?.close()
    rendererServer = null
    rendererServerPromise = null
  })

  return rendererServerPromise
}
