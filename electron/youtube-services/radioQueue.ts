import { spawn } from 'child_process'
import { innertubeRequest } from './innertube'
import { COMMAND_CANDIDATES } from '../system/ytDlp'

interface RadioSeedTrack {
  videoId: string
  title: string
  channelTitle: string
  album?: string
}

interface RadioQueueTrack {
  id: string
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
  duration: number
  durationLabel: string
  album?: string
}

interface YtDlpMetadata {
  track?: string
  title?: string
  artist?: string
  album_artist?: string
  uploader?: string
  channel?: string
  album?: string
  genre?: string
  categories?: string[]
  tags?: string[]
}

const SEARCH_SONGS_PARAMS = 'Eg-KAQwIARAAGAAgACgAMABqChAEEAMQCRAFEAo='
const metadataCache = new Map<string, YtDlpMetadata>()

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const uniqueBy = <T>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = getKey(item)

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const getRunsText = (runs: Array<{ text?: string }> | undefined) =>
  (runs ?? []).map((run) => run.text ?? '').join('').trim()

const pickThumbnail = (thumbnails: Array<{ url: string }> | undefined) => {
  const lastThumb = thumbnails?.[thumbnails.length - 1]?.url
  return lastThumb?.replace('w120-h120', 'w544-h544') ?? ''
}

const parseDurationText = (value: string) => {
  const parts = value
    .trim()
    .split(':')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part))

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  if (parts.length === 1) {
    return parts[0]
  }

  return 0
}

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--:--'
  }

  const safeSeconds = Math.floor(seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

const mapSearchItem = (item: any): RadioQueueTrack | null => {
  const renderer = item?.musicResponsiveListItemRenderer
  const flexColumns = renderer?.flexColumns ?? []
  const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
  const metaRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
  const videoId =
    renderer?.playlistItemData?.videoId ??
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ??
    renderer?.navigationEndpoint?.watchEndpoint?.videoId

  if (!titleRuns || !videoId) {
    return null
  }

  const title = getRunsText(titleRuns)
  const metaText = getRunsText(metaRuns)
  const metaParts = metaText
    .split(/[•·]/)
    .map((part) => part.trim())
    .filter(Boolean)

  const durationLabel = metaParts.find((part) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(part)) ?? '--:--'

  return {
    id: videoId,
    videoId,
    title,
    channelTitle: metaParts[0] ?? 'YouTube Music',
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    duration: parseDurationText(durationLabel),
    durationLabel,
    album: metaParts.length > 2 ? metaParts[1] : undefined,
  }
}

const mapPlaylistPanelItem = (item: any): RadioQueueTrack | null => {
  const renderer = item?.playlistPanelVideoRenderer
  const videoId = renderer?.videoId

  if (!renderer || !videoId) {
    return null
  }

  const title = getRunsText(renderer.title?.runs) || renderer.title?.simpleText || 'Faixa sem titulo'
  const durationLabel = getRunsText(renderer.lengthText?.runs) || renderer.lengthText?.simpleText || '--:--'

  return {
    id: videoId,
    videoId,
    title,
    channelTitle:
      getRunsText(renderer.shortBylineText?.runs) ||
      renderer.shortBylineText?.simpleText ||
      getRunsText(renderer.longBylineText?.runs).split('•')[0]?.trim() ||
      'YouTube Music',
    thumbnail: pickThumbnail(renderer.thumbnail?.thumbnails),
    duration: parseDurationText(durationLabel),
    durationLabel,
  }
}

const diversifyQueue = (items: RadioQueueTrack[], seedArtist: string, limit: number) => {
  const normalizedSeedArtist = normalizeText(seedArtist)
  const artistCounts = new Map<string, number>()
  const diverse: RadioQueueTrack[] = []

  for (const item of items) {
    const artist = normalizeText(item.channelTitle)
    const currentCount = artistCounts.get(artist) ?? 0

    if (artist && artist === normalizedSeedArtist && currentCount >= 2) {
      continue
    }

    if (artist && currentCount >= 3) {
      continue
    }

    diverse.push(item)
    artistCounts.set(artist, currentCount + 1)

    if (diverse.length >= limit) {
      return diverse
    }
  }

  return items.slice(0, limit)
}

const fetchNativeRadioQueue = async (seed: RadioSeedTrack, limit: number): Promise<RadioQueueTrack[]> => {
  const response = await innertubeRequest('next', {
    videoId: seed.videoId,
    playlistId: `RDAMVM${seed.videoId}`,
    params: 'wAEB',
  })

  const items =
    (response as any).contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer
      ?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents ?? []

  const mapped = uniqueBy(
    items
      .map(mapPlaylistPanelItem)
      .filter((item: RadioQueueTrack | null): item is RadioQueueTrack => Boolean(item))
      .filter((item) => item.videoId !== seed.videoId),
    (item) => item.videoId,
  )

  return diversifyQueue(mapped, seed.channelTitle, limit)
}

const METADATA_TIMEOUT_MS = 90_000

const resolveYtDlpMetadata = (videoId: string) =>
  new Promise<YtDlpMetadata>((resolve, reject) => {
    const cached = metadataCache.get(videoId)

    if (cached) {
      resolve(cached)
      return
    }

    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`

    const tryCandidate = (index: number) => {
      if (index >= COMMAND_CANDIDATES.length) {
        reject(new Error('Nenhum candidato yt-dlp funcionou para metadata'))
        return
      }

      const candidate = COMMAND_CANDIDATES[index]
      const proc = spawn(candidate.command, [
        ...candidate.args,
        '--dump-single-json',
        '--no-playlist',
        '--no-warnings',
        targetUrl,
      ])

      let stdout = ''
      let stderr = ''
      let settled = false

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true
          try { proc.kill('SIGKILL') } catch {}
          tryCandidate(index + 1)
        }
      }, METADATA_TIMEOUT_MS)

      proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })

      proc.on('error', () => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          tryCandidate(index + 1)
        }
      })

      proc.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)

        if (code !== 0) {
          tryCandidate(index + 1)
          return
        }

        try {
          const parsed = JSON.parse(stdout) as YtDlpMetadata
          metadataCache.set(videoId, parsed)
          resolve(parsed)
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Nao foi possivel ler metadata do yt-dlp'))
        }
      })
    }

    tryCandidate(0)
  })


const extractStyleTokens = (metadata: YtDlpMetadata) =>
  uniqueBy(
    [
      metadata.genre ?? '',
      ...(metadata.categories ?? []),
      ...(metadata.tags ?? []).filter((tag) => normalizeText(tag).split(' ').length <= 3),
    ]
      .map((item) => item.trim())
      .filter(Boolean),
    (item) => normalizeText(item),
  ).slice(0, 6)

const buildStyleQueries = (seed: RadioSeedTrack, metadata: YtDlpMetadata) => {
  const baseArtist = metadata.artist || metadata.album_artist || metadata.uploader || metadata.channel || seed.channelTitle
  const baseTitle = metadata.track || metadata.title || seed.title
  const styleTokens = extractStyleTokens(metadata)
  const queries: string[] = []

  for (const style of styleTokens) {
    queries.push(`${baseArtist} ${style}`)
    queries.push(`${style} music`)
    queries.push(`${style} mix`)
    queries.push(`${style} playlist`)
  }

  queries.push(`${baseArtist} radio`)
  queries.push(`${baseArtist} ${baseTitle}`)
  queries.push(`${baseTitle} ${baseArtist}`)

  if (metadata.album || seed.album) {
    queries.push(`${metadata.album ?? seed.album} ${baseArtist}`)
  }

  return uniqueBy(
    queries.map((item) => item.trim()).filter(Boolean),
    (item) => normalizeText(item),
  )
}

const scoreCandidate = (candidate: RadioQueueTrack, seed: RadioSeedTrack, metadata: YtDlpMetadata) => {
  const styleTokens = extractStyleTokens(metadata).map(normalizeText)
  const artistTokens = [metadata.artist, metadata.album_artist, metadata.uploader, metadata.channel, seed.channelTitle]
    .filter(Boolean)
    .map((item) => normalizeText(item as string))
  const albumTokens = [metadata.album, seed.album].filter(Boolean).map((item) => normalizeText(item as string))
  const candidateBlob = normalizeText(`${candidate.title} ${candidate.channelTitle} ${candidate.album ?? ''}`)
  let score = 0

  for (const style of styleTokens) {
    if (candidateBlob.includes(style)) {
      score += 4
    }
  }

  for (const artist of artistTokens) {
    if (candidateBlob.includes(artist)) {
      score += 3
    }
  }

  for (const album of albumTokens) {
    if (candidateBlob.includes(album)) {
      score += 2
    }
  }

  if (normalizeText(candidate.channelTitle) === normalizeText(seed.channelTitle)) {
    score += 3
  }

  return score
}

const searchTracks = async (query: string): Promise<RadioQueueTrack[]> => {
  const response = await innertubeRequest('search', {
    query,
    params: SEARCH_SONGS_PARAMS,
  })

  const sections =
    (response as any).contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []

  const results: RadioQueueTrack[] = []

  for (const section of sections) {
    const shelfItems = section?.musicShelfRenderer?.contents ?? []

    for (const item of shelfItems) {
      const mapped = mapSearchItem(item)

      if (mapped) {
        results.push(mapped)
      }
    }
  }

  return results
}

export const buildBackendRadioQueue = async (seed: RadioSeedTrack, limit = 12): Promise<RadioQueueTrack[]> => {
  try {
    const nativeQueue = await fetchNativeRadioQueue(seed, limit)

    if (nativeQueue.length > 0) {
      return nativeQueue
    }
  } catch (error) {
    console.error('WindSound native radio queue fallback:', error)
  }

  const metadata = await resolveYtDlpMetadata(seed.videoId)
  const queries = buildStyleQueries(seed, metadata)
  const collected: RadioQueueTrack[] = []
  const seen = new Set<string>([seed.videoId])

  for (const query of queries) {
    const results = await searchTracks(query)

    for (const item of results) {
      if (seen.has(item.videoId)) {
        continue
      }

      seen.add(item.videoId)
      collected.push(item)
    }

    if (collected.length >= limit * 2) {
      break
    }
  }

  return diversifyQueue(
    collected
    .map((item) => ({ item, score: scoreCandidate(item, seed, metadata) }))
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item)
    .slice(0, limit * 2),
    seed.channelTitle,
    limit,
  )
}
