import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Readable } from 'stream'
import type { App } from 'electron'
import {
  MIN_UPSTREAM_SLICE_SIZE,
  MUSIC_ORIGIN,
  STREAM_CHUNK_SIZE,
  STREAM_PROXY_PORT,
} from '../config/constants'
import { resolveYtDlpAudioUrl } from '../system/ytDlp'

const ALLOWED_STREAM_HOSTS = [
  'googlevideo.com',
  'youtube.com',
  'youtubei.googleapis.com',
]

let streamServerStarted = false
const resolvedAudioUrlCache = new Map<string, string>()
const fallbackAudioUrlCache = new Map<string, string>()

const isAllowedStreamUrl = (value: string) => {
  try {
    const parsed = new URL(value)

    if (parsed.protocol !== 'https:') {
      return false
    }

    return ALLOWED_STREAM_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    )
  } catch {
    return false
  }
}

const fetchUpstreamSlice = async (
  streamUrl: string,
  start: number,
  end: number,
  baseHeaders: Headers,
  timeoutMs = 30_000,
): Promise<{ buffer: Buffer; contentType: string; totalSize: number; acceptRanges: string | null }> => {
  const headers = new Headers(baseHeaders)
  headers.set('Range', `bytes=${start}-${end}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let upstream: Response

  try {
    upstream = await fetch(streamUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

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

  if (upstream.status === 403 && end === start) {
    const expandedEnd = start + STREAM_CHUNK_SIZE - 1
    const expandedHeaders = new Headers(baseHeaders)
    expandedHeaders.set('Range', `bytes=${start}-${expandedEnd}`)

    const expandedUpstream = await fetch(streamUrl, {
      method: 'GET',
      headers: expandedHeaders,
    })

    if (expandedUpstream.status === 206) {
      const buffer = Buffer.from(await expandedUpstream.arrayBuffer())
      const contentRange = expandedUpstream.headers.get('content-range')
      const totalSize =
        Number(contentRange?.split('/')[1] ?? new URL(streamUrl).searchParams.get('clen') ?? expandedEnd + 1) ||
        expandedEnd + 1

      return {
        buffer,
        contentType: expandedUpstream.headers.get('content-type') ?? 'audio/mp4',
        totalSize,
        acceptRanges: expandedUpstream.headers.get('accept-ranges'),
      }
    }
  }

  throw new Error(`Upstream respondeu com status ${upstream.status} para ${start}-${end}`)
}

const streamEntireUpstream = async (
  response: ServerResponse,
  streamUrl: string,
  baseHeaders: Headers,
) => {
  const hintedTotalSize = Number(new URL(streamUrl).searchParams.get('clen') ?? '0')
  let start = 0
  let totalSize = hintedTotalSize || 0
  let wroteHeaders = false
  const MAX_ITERATIONS = 4096
  let iteration = 0

  while (iteration < MAX_ITERATIONS) {
    iteration += 1
    const end =
      totalSize > 0 ? Math.min(totalSize - 1, start + STREAM_CHUNK_SIZE - 1) : start + STREAM_CHUNK_SIZE - 1
    const chunk = await fetchUpstreamSlice(streamUrl, start, end, baseHeaders)

    totalSize = chunk.totalSize || totalSize

    if (!wroteHeaders) {
      response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': chunk.contentType,
        'Content-Length': String(totalSize),
        'Accept-Ranges': chunk.acceptRanges ?? 'bytes',
      })
      wroteHeaders = true
    }

    if (chunk.buffer.byteLength === 0) {
      response.end()
      return
    }

    response.write(chunk.buffer)
    start += chunk.buffer.byteLength

    if (totalSize > 0 && start >= totalSize) {
      response.end()
      return
    }
  }

  // Safety: encerra se atingir o limite de iteracoes
  if (!response.writableEnded) {
    response.end()
  }
}

const pipeUpstreamResponse = async (
  upstream: Response,
  response: ServerResponse,
  overrideHeaders: Record<string, string> = {},
) => {
  const responseHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    ...overrideHeaders,
  }

  const passthroughHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges']

  passthroughHeaders.forEach((headerName) => {
    const value = upstream.headers.get(headerName)

    if (value) {
      responseHeaders[headerName.replace(/\b\w/g, (match) => match.toUpperCase())] = value
    }
  })

  response.writeHead(upstream.status, responseHeaders)

  if (!upstream.body) {
    response.end()
    return
  }

  Readable.fromWeb(upstream.body as globalThis.ReadableStream<Uint8Array>).pipe(response)
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

  if (!isAllowedStreamUrl(streamUrl)) {
    response.writeHead(400, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    })
    response.end('Invalid stream URL')
    return
  }

  try {
    const headers = new Headers({
      Accept: '*/*',
      Origin: MUSIC_ORIGIN,
      Referer: `${MUSIC_ORIGIN}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36',
    })
    const requestedRangeHeader = typeof request.headers.range === 'string' ? request.headers.range : null
    if (!requestedRangeHeader) {
      await streamEntireUpstream(response, streamUrl, headers)
      return
    }

    if (requestedRangeHeader) {
      headers.set('Range', requestedRangeHeader)
    }

    const upstream = await fetch(streamUrl, {
      method: 'GET',
      headers,
    })

    if (upstream.ok || upstream.status === 206) {
      await pipeUpstreamResponse(upstream, response)
      return
    }

    const totalSize = Number(new URL(streamUrl).searchParams.get('clen') ?? '0')
    const boundedRange = requestedRangeHeader?.match(/^bytes=(\d+)-(\d+)?$/)
    const start = boundedRange ? Number(boundedRange[1]) : 0
    const explicitEnd = boundedRange?.[2] ? Number(boundedRange[2]) : null
    const cappedEnd =
      explicitEnd ?? (totalSize > 0 ? Math.min(totalSize - 1, start + STREAM_CHUNK_SIZE - 1) : start + STREAM_CHUNK_SIZE - 1)
    const end = Math.min(cappedEnd, start + STREAM_CHUNK_SIZE - 1)
    const slicedUpstream = await fetchUpstreamSlice(streamUrl, start, end, headers)
    const requestedLength = end - start + 1
    const responseBuffer =
      slicedUpstream.buffer.byteLength > requestedLength
        ? slicedUpstream.buffer.subarray(0, requestedLength)
        : slicedUpstream.buffer
    const responseEnd = start + responseBuffer.byteLength - 1

    response.writeHead(206, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': slicedUpstream.contentType,
      'Content-Length': String(responseBuffer.byteLength),
      'Content-Range': `bytes ${start}-${responseEnd}/${slicedUpstream.totalSize}`,
      ...(slicedUpstream.acceptRanges ? { 'Accept-Ranges': slicedUpstream.acceptRanges } : {}),
    })
    response.end(responseBuffer)
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

const proxyPrimedPlaybackRequest = async (request: IncomingMessage, response: ServerResponse) => {
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

  const primedUrl = fallbackAudioUrlCache.get(videoId) ?? null
  await proxyResolvedStream(request, response, primedUrl)
}

const proxyYtDlpAudioRequest = async (request: IncomingMessage, response: ServerResponse) => {
  const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${STREAM_PROXY_PORT}`)
  const videoId = requestUrl.searchParams.get('videoId')
  const fallbackUrl = requestUrl.searchParams.get('fallbackUrl') ?? (videoId ? fallbackAudioUrlCache.get(videoId) ?? null : null)

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

    if (fallbackUrl && isAllowedStreamUrl(fallbackUrl)) {
      console.warn('[WindSound yt-dlp] using InnerTube fallback stream for playback')
      await proxyResolvedStream(request, response, fallbackUrl)
      return
    }

    response.writeHead(502, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    })
    response.end(error instanceof Error ? error.message : 'yt-dlp failed')
  }
}

export const primePlaybackFallback = (videoId: string, fallbackUrl: string) => {
  if (!videoId || !isAllowedStreamUrl(fallbackUrl)) {
    return false
  }

  fallbackAudioUrlCache.set(videoId, fallbackUrl)
  return true
}

export const ensureStreamServer = (app: App) => {
  if (streamServerStarted) {
    return
  }

  const server = createServer((request, response) => {
    if ((request.url ?? '').startsWith('/playback')) {
      void proxyPrimedPlaybackRequest(request, response)
      return
    }

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
