import type {
  AccountStatus,
  HomeFeed,
  HomeSection,
  RecommendationItem,
  SearchCatalogResult,
  SearchPlaylistResult,
  SearchResult,
  Track,
  VideoDetails,
  YouTubePlaylist,
} from '@/types'

const SEARCH_SONGS_PARAMS = 'Eg-KAQwIARAAGAAgACgAMABqChAEEAMQCRAFEAo='
const ANDROID_CLIENT = {
  clientName: 'ANDROID',
  clientVersion: '21.03.38',
  clientId: '3',
  userAgent: 'com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip',
}
const IOS_CLIENT = {
  clientName: 'IOS',
  clientVersion: '21.03.1',
  clientId: '5',
  userAgent: 'com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)',
}
const playerResponseCache = new Map<string, any>()
const HOME_RECENT_IDS_KEY = 'windsound-home-recent-ids'
const HOME_RECENT_LIMIT = 40
const HOME_REFRESH_INTERVAL_MS = 1000 * 60 * 3

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

const parseDurationText = (value: string) => {
  const rawParts = value.trim().split(':')
  const parts: number[] = []

  for (let index = 0; index < rawParts.length; index += 1) {
    const nextPart = Number(rawParts[index])

    if (Number.isFinite(nextPart)) {
      parts.push(nextPart)
    }
  }

  if (parts.length === 0) {
    return 0
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  return parts[0]
}

const getRunsText = (runs: Array<{ text?: string }> | undefined) => {
  if (!runs || runs.length === 0) {
    return ''
  }

  let text = ''

  for (let index = 0; index < runs.length; index += 1) {
    text += runs[index]?.text ?? ''
  }

  return text.trim()
}

const createThumbnailFallback = (label: string) => {
  const safeLabel = encodeURIComponent(label.slice(0, 18).toUpperCase() || 'WINDSOUND')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18181b"/><stop offset="1" stop-color="#27272a"/></linearGradient></defs><rect width="640" height="640" rx="48" fill="url(#g)"/><text x="50%" y="50%" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="42" letter-spacing="8" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const normalizeThumbnailUrl = (url: string) => {
  let next = url.trim()

  if (!next) {
    return next
  }

  if (next.startsWith('//')) {
    next = `https:${next}`
  }

  next = next.replace(/=w\d+-h\d+(?:-[a-z0-9-]+)*$/i, '=w544-h544-p-l90-rj')
  next = next.replace(/-w\d+-h\d+(?:-[a-z0-9-]+)*(?=$|\?)/i, '-w544-h544')
  next = next.replace(/=s\d+(?:-[a-z0-9-]+)*$/i, '=s544')
  next = next.replace('w120-h120', 'w544-h544')

  return next
}

const pickThumbnail = (
  thumbnails: Array<{ url: string }> | undefined,
  fallbackVideoId?: string,
  fallbackLabel = 'WindSound',
) => {
  const lastThumb = thumbnails?.[thumbnails.length - 1]?.url

  if (lastThumb) {
    return normalizeThumbnailUrl(lastThumb)
  }

  if (fallbackVideoId) {
    return `https://i.ytimg.com/vi/${fallbackVideoId}/hqdefault.jpg`
  }

  return createThumbnailFallback(fallbackLabel)
}

const shuffleItems = <T>(items: T[]) => {
  const nextItems = [...items]

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[nextItems[index], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[index]]
  }

  return nextItems
}

const uniqueBy = <T>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>()
  const results: T[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const key = getKey(item)

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    results.push(item)
  }

  return results
}

const getRecentHomeIds = () => {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOME_RECENT_IDS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const storeRecentHomeIds = (ids: string[]) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(HOME_RECENT_IDS_KEY, JSON.stringify(ids.slice(0, HOME_RECENT_LIMIT)))
}

const rotateAgainstRecent = <T>(items: T[], getKey: (item: T) => string, stickyCount = 0) => {
  const recentIds = new Set(getRecentHomeIds())
  const stickyItems = items.slice(0, stickyCount)
  const rotatingItems = items.slice(stickyCount)
  const unseen = rotatingItems.filter((item) => !recentIds.has(getKey(item)))
  const seen = rotatingItems.filter((item) => recentIds.has(getKey(item)))

  return [...stickyItems, ...unseen, ...seen]
}

const rememberHomeItems = (items: Array<{ videoId?: string; browseId?: string; id: string }>) => {
  const nextIds = items.map((item) => item.videoId ?? item.browseId ?? item.id)
  const merged = uniqueBy([...nextIds, ...getRecentHomeIds()], (item) => item)
  storeRecentHomeIds(merged)
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const collectRenderers = (node: unknown, rendererKey: string, results: any[] = []): any[] => {
  const stack: unknown[] = [node]

  while (stack.length > 0) {
    const current = stack.pop()

    if (!current || typeof current !== 'object') {
      continue
    }

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index])
      }
      continue
    }

    const record = current as Record<string, unknown>

    if (rendererKey in record) {
      results.push(record[rendererKey])
    }

    const keys = Object.keys(record)
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      stack.push(record[keys[index]])
    }
  }

  return results
}

const buildRadioQueries = (track: Track) => {
  const title = normalizeText(track.title)
  const artist = normalizeText(track.channelTitle)
  const album = normalizeText(track.album ?? '')
  const titleParts = title.split(' ').filter((part) => part.length > 2).slice(0, 4).join(' ')
  const artistParts = artist.split(' ').filter((part) => part.length > 2).slice(0, 4).join(' ')

  return uniqueBy(
    [
      `${track.title} ${track.channelTitle}`,
      `${track.channelTitle} mix`,
      `${track.channelTitle} radio`,
      `${titleParts} ${artistParts}`.trim(),
      album ? `${album} ${track.channelTitle}` : '',
      `${track.title} audio`,
      `${track.channelTitle} similares`,
      `${track.channelTitle} related`,
    ].filter(Boolean),
    (item) => normalizeText(item),
  )
}

const isPlaylistSection = (section: HomeSection) => {
  const normalizedTitle = section.title.toLowerCase()

  if (/(playlist|mix|radio|album)/i.test(normalizedTitle)) {
    return true
  }

  const playlistLikeItems = section.items.filter((item) => !item.videoId).length
  return playlistLikeItems >= Math.ceil(section.items.length / 2)
}

const CLIP_POSITIVE_PATTERNS = [
  /official music video/i,
  /official video/i,
  /music video/i,
  /videoclipe oficial/i,
  /videoclipe/i,
  /\bclip oficial\b/i,
  /\bmv\b/i,
] as const

const CLIP_NEGATIVE_PATTERNS = [
  /\blyrics?\b/i,
  /\baudio\b/i,
  /\btopic\b/i,
  /provided to youtube by/i,
  /\bvisualizer\b/i,
  /\bkaraoke\b/i,
  /\binstrumental\b/i,
  /\bsped up\b/i,
  /\bslowed\b/i,
  /\bnightcore\b/i,
  /\b8d\b/i,
] as const

const innertubePost = async <T>(endpoint: string, body: object): Promise<T> => {
  if (window.windsound?.innertubeRequest) {
    return window.windsound.innertubeRequest(endpoint, body as Record<string, unknown>) as Promise<T>
  }

  throw new Error('InnerTube disponivel apenas pelo backend do WindSound. Abra o app desktop para continuar.')
}

const fetchPlayerResponse = async (videoId: string) => {
  const cachedResponse = playerResponseCache.get(videoId)

  if (cachedResponse) {
    return cachedResponse
  }

  let response = await innertubePost<any>('player', {
    videoId,
    __client: ANDROID_CLIENT,
  })

  if (response.playabilityStatus?.status !== 'OK') {
    response = await innertubePost<any>('player', {
      videoId,
      __client: IOS_CLIENT,
    })
  }

  playerResponseCache.set(videoId, response)
  return response
}

const detectVideoClipAvailability = (response: any) => {
  const details = response?.videoDetails ?? {}
  const playerMicroformat =
    response?.microformat?.playerMicroformatRenderer ?? response?.microformat?.microformatDataRenderer ?? {}
  const title = String(details.title ?? playerMicroformat.title ?? '')
  const author = String(details.author ?? playerMicroformat.ownerChannelName ?? '')
  const description =
    playerMicroformat.description?.simpleText ??
    getRunsText(playerMicroformat.description?.runs) ??
    ''
  const keywords = Array.isArray(details.keywords) ? details.keywords.join(' ') : ''
  const normalizedBlob = normalizeText([title, author, description, keywords].join(' '))
  const ownerLooksOfficial = /\bvevo\b/i.test(author)
  const hasPositiveSignal = CLIP_POSITIVE_PATTERNS.some((pattern) => pattern.test(normalizedBlob)) || ownerLooksOfficial
  const hasNegativeSignal = CLIP_NEGATIVE_PATTERNS.some((pattern) => pattern.test(normalizedBlob))

  return hasPositiveSignal && !hasNegativeSignal
}

const buildClipSearchQueries = (track: Pick<Track, 'title' | 'channelTitle' | 'album'>) =>
  uniqueBy(
    [
      `${track.title} ${track.channelTitle} official music video`,
      `${track.title} ${track.channelTitle} official video`,
      `${track.title} ${track.channelTitle} videoclipe oficial`,
      `${track.title} ${track.channelTitle}`,
      track.album ? `${track.title} ${track.album} ${track.channelTitle}` : '',
    ].filter(Boolean),
    (query) => normalizeText(query),
  )

const scoreClipCandidate = (
  candidate: SearchResult,
  track: Pick<Track, 'title' | 'channelTitle' | 'album'>,
) => {
  const candidateTitle = normalizeText(candidate.title)
  const candidateChannel = normalizeText(candidate.channelTitle)
  const trackTitle = normalizeText(track.title)
  const trackChannel = normalizeText(track.channelTitle)
  const trackAlbum = normalizeText(track.album ?? '')

  let score = 0

  if (candidateTitle.includes(trackTitle) || trackTitle.includes(candidateTitle)) {
    score += 6
  }

  if (candidateChannel.includes(trackChannel) || trackChannel.includes(candidateChannel)) {
    score += 5
  }

  if (trackAlbum && candidateTitle.includes(trackAlbum)) {
    score += 1
  }

  if (CLIP_POSITIVE_PATTERNS.some((pattern) => pattern.test(candidate.title))) {
    score += 6
  }

  if (/\bvevo\b/i.test(candidate.channelTitle)) {
    score += 3
  }

  if (CLIP_NEGATIVE_PATTERNS.some((pattern) => pattern.test(candidate.title))) {
    score -= 8
  }

  return score
}

const mapSearchItem = (item: any): SearchResult | null => {
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
  const channelTitle = metaParts[0] ?? 'Canal desconhecido'
  const album = metaParts.length > 2 ? metaParts[1] : undefined

  return {
    id: videoId,
    videoId,
    title,
    channelTitle,
    mediaType: /^vÃ­deo\b|^video\b/i.test(metaText) ? 'video' : 'audio',
    album,
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, videoId, title),
    duration: parseDurationText(durationLabel),
    durationLabel,
  }
}

const mapSearchPlaylistItem = (item: any): SearchPlaylistResult | null => {
  const renderer = item?.musicResponsiveListItemRenderer
  const flexColumns = renderer?.flexColumns ?? []
  const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
  const metaRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
  const browseId = renderer?.navigationEndpoint?.browseEndpoint?.browseId
  const pageType =
    renderer?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType

  if (!titleRuns || !browseId) {
    return null
  }

  if (pageType && !String(pageType).includes('PLAYLIST') && !String(pageType).includes('ALBUM')) {
    return null
  }

  const title = getRunsText(titleRuns)
  const metaText = getRunsText(metaRuns)
  const metaParts = metaText
    .split(/[•·•]/)
    .map((part) => part.trim())
    .filter(Boolean)

  return {
    id: browseId,
    title,
    channelTitle: metaParts[0] ?? 'YouTube Music',
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, undefined, title),
    browseId,
    itemType: 'playlist',
  }
}

const mapHomeItem = (item: any) => {
  const renderer = item?.musicTwoRowItemRenderer

  if (!renderer) {
    return null
  }

  return {
    id:
      renderer.navigationEndpoint?.watchEndpoint?.videoId ??
      renderer.navigationEndpoint?.browseEndpoint?.browseId ??
      crypto.randomUUID(),
    title: renderer.title?.runs?.[0]?.text ?? 'Sem titulo',
    subtitle: getRunsText(renderer.subtitle?.runs) || 'YouTube Music',
    thumbnail: pickThumbnail(
      renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails,
      renderer.navigationEndpoint?.watchEndpoint?.videoId,
      renderer.title?.runs?.[0]?.text ?? 'Playlist',
    ),
    videoId: renderer.navigationEndpoint?.watchEndpoint?.videoId,
    browseId: renderer.navigationEndpoint?.browseEndpoint?.browseId,
  }
}

const mapPlaylistTrackItem = (item: any): SearchResult | null => {
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
    .split(/[•·•]/)
    .map((part) => part.trim())
    .filter(Boolean)

  const durationLabel = metaParts.find((part) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(part)) ?? '--:--'

  return {
    id: videoId,
    videoId,
    title,
    channelTitle: metaParts[0] ?? 'YouTube Music',
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, videoId, title),
    duration: parseDurationText(durationLabel),
    durationLabel,
    album: metaParts.length > 2 ? metaParts[1] : undefined,
  }
}

const mapPlaylistPanelTrackItem = (item: any): SearchResult | null => {
  const renderer = item?.playlistPanelVideoRenderer
  const videoId = renderer?.videoId

  if (!renderer || !videoId) {
    return null
  }

  const title =
    renderer.title?.simpleText ??
    getRunsText(renderer.title?.runs) ??
    'Faixa sem titulo'

  const channelTitle =
    renderer.longBylineText?.runs?.map((run: any) => run.text ?? '').join('').trim() ||
    renderer.shortBylineText?.runs?.map((run: any) => run.text ?? '').join('').trim() ||
    'YouTube Music'

  const durationLabel =
    renderer.lengthText?.simpleText ??
    getRunsText(renderer.lengthText?.runs) ??
    '--:--'

  return {
    id: videoId,
    videoId,
    title,
    channelTitle,
    thumbnail: pickThumbnail(renderer.thumbnail?.thumbnails, videoId, title),
    duration: parseDurationText(durationLabel),
    durationLabel,
  }
}

export const searchVideos = async (query: string): Promise<SearchResult[]> => {
  if (!query.trim()) {
    return []
  }

  const response = await innertubePost<any>('search', {
    query,
    params: SEARCH_SONGS_PARAMS,
  })

  const sections =
    response.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []

  const results: SearchResult[] = []

  for (const section of sections) {
    const shelfItems = section?.musicShelfRenderer?.contents ?? []

    for (const item of shelfItems) {
      const mapped = mapSearchItem(item)
      if (mapped) {
        results.push(mapped)
      }
    }
  }

  return results.slice(0, 20)
}

const mapSearchCardShelfPlaylist = (section: any): SearchPlaylistResult | null => {
  const renderer = section?.musicCardShelfRenderer
  const titleRun = renderer?.title?.runs?.[0]
  const subtitleText = getRunsText(renderer?.subtitle?.runs)
  const browseId = titleRun?.navigationEndpoint?.browseEndpoint?.browseId
  const pageType =
    titleRun?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType
  const playlistId =
    renderer?.buttons?.[1]?.buttonRenderer?.command?.watchPlaylistEndpoint?.playlistId ??
    renderer?.buttons?.[0]?.buttonRenderer?.command?.watchPlaylistEndpoint?.playlistId

  if (!renderer || !titleRun?.text) {
    return null
  }

  if (/^vídeo\b|^video\b/i.test(subtitleText)) {
    return null
  }

  if (pageType && !String(pageType).includes('PLAYLIST')) {
    return null
  }

  return {
    id: browseId ?? playlistId ?? titleRun.text,
    title: titleRun.text,
    channelTitle: subtitleText.replace(/^Playlist\s*•\s*/i, '') || 'YouTube Music',
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, undefined, titleRun.text),
    browseId: browseId ?? `VL${playlistId}`,
    itemType: 'playlist',
  }
}

const mapSearchCardShelfVideo = (section: any): SearchResult | null => {
  const renderer = section?.musicCardShelfRenderer
  const titleRun = renderer?.title?.runs?.[0]
  const subtitleText = getRunsText(renderer?.subtitle?.runs)
  const metaParts = subtitleText
    .split(/[•·•]/)
    .map((part) => part.trim())
    .filter(Boolean)
  const videoId =
    titleRun?.navigationEndpoint?.watchEndpoint?.videoId ??
    renderer?.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ??
    renderer?.buttons?.[0]?.buttonRenderer?.command?.watchEndpoint?.videoId

  if (!renderer || !titleRun?.text || !videoId) {
    return null
  }

  if (!/^vídeo\b|^video\b/i.test(subtitleText)) {
    return null
  }

  const durationLabel = metaParts.find((part) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(part)) ?? '--:--'
  const channelTitle = metaParts.find((part) => !/^vídeo\b|^video\b/i.test(part)) ?? 'YouTube Music'

  return {
    id: videoId,
    videoId,
    title: titleRun.text,
    channelTitle,
    mediaType: 'video',
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, videoId, titleRun.text),
    duration: parseDurationText(durationLabel),
    durationLabel,
  }
}

export const searchCatalog = async (query: string): Promise<SearchCatalogResult[]> => {
  if (!query.trim()) {
    return []
  }

  const [songResponse, generalResponse] = await Promise.all([
    innertubePost<any>('search', {
      query,
      params: SEARCH_SONGS_PARAMS,
    }),
    innertubePost<any>('search', {
      query,
    }),
  ])

  const songSections =
    songResponse.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []
  const generalSections =
    generalResponse.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []

  const songs = songSections
    .flatMap((section: any) => section?.musicShelfRenderer?.contents ?? [])
    .map(mapSearchItem)
    .filter((item: SearchResult | null): item is SearchResult => Boolean(item))

  const generalItems = generalSections.flatMap((section: any) => {
    const cardVideo = mapSearchCardShelfVideo(section)
    const cardPlaylist = mapSearchCardShelfPlaylist(section)
    const shelfPlaylists = (section?.musicShelfRenderer?.contents ?? [])
      .map(mapSearchPlaylistItem)
      .filter((item: SearchPlaylistResult | null): item is SearchPlaylistResult => Boolean(item))

    return [
      ...(cardVideo ? [cardVideo] : []),
      ...(cardPlaylist ? [cardPlaylist] : []),
      ...shelfPlaylists,
    ]
  })

  const uniqueSongs: SearchResult[] = uniqueBy(
    [...songs, ...generalItems.filter((item: SearchCatalogResult): item is SearchResult => 'videoId' in item)],
    (item) => item.videoId,
  )
  const uniquePlaylists: SearchPlaylistResult[] = uniqueBy(
    generalItems.filter((item: SearchCatalogResult): item is SearchPlaylistResult => 'browseId' in item),
    (item) => item.browseId,
  )
  const prioritized: SearchCatalogResult[] = []
  const maxLength = Math.max(uniqueSongs.length, uniquePlaylists.length)

  for (let index = 0; index < maxLength; index += 1) {
    if (index < uniquePlaylists.length && index < 6) {
      prioritized.push(uniquePlaylists[index])
    }

    if (index < uniqueSongs.length) {
      prioritized.push(uniqueSongs[index])
    }
  }

  return uniqueBy(prioritized, (item) => ('browseId' in item ? item.browseId : item.videoId)).slice(0, 24)
}

export const getVideoDetails = async (videoId: string): Promise<VideoDetails> => {
  const response = await fetchPlayerResponse(videoId)

  const videoDetails = response.videoDetails ?? {}
  const adaptiveFormats = response.streamingData?.adaptiveFormats ?? []
  const preferredAudioItags = [140, 251, 250, 249, 139]
  const audioFormats = adaptiveFormats.filter((format: any) => String(format.mimeType).startsWith('audio/'))
  const audioFormat =
    preferredAudioItags
      .map((itag) => audioFormats.find((format: any) => format.itag === itag))
      .find(Boolean) ??
    audioFormats[0]

  if (!audioFormat?.url) {
    throw new Error(response.playabilityStatus?.reason ?? 'Nao foi possivel obter stream de audio')
  }

  const duration = Number(videoDetails.lengthSeconds ?? 0)

  if (window.windsound?.primePlayback) {
    try {
      await window.windsound.primePlayback(videoId, audioFormat.url)
    } catch (error) {
      console.warn('WindSound playback prime failed:', error)
    }
  }

  return {
    videoId,
    title: videoDetails.title ?? 'Faixa sem titulo',
    channelTitle: videoDetails.author ?? 'YouTube Music',
    thumbnail: pickThumbnail(videoDetails.thumbnail?.thumbnails, videoId, videoDetails.title ?? 'Faixa'),
    duration,
    durationLabel: formatDuration(duration),
    hasVideoClip: detectVideoClipAvailability(response),
    streamUrl: window.windsound?.createPlaybackUrl
      ? window.windsound.createPlaybackUrl(videoId)
      : window.windsound?.createStreamUrl
        ? window.windsound.createStreamUrl(audioFormat.url)
        : audioFormat.url,
    fallbackStreamUrl: window.windsound?.createStreamUrl ? window.windsound.createStreamUrl(audioFormat.url) : audioFormat.url,
    rawStreamUrl: audioFormat.url,
  }
}

export const getTrackVideoAvailability = async (videoId: string) => {
  try {
    const response = await fetchPlayerResponse(videoId)

    return {
      hasVideoClip: detectVideoClipAvailability(response),
    }
  } catch (error) {
    console.error('WindSound video availability error:', error)
    return {
      hasVideoClip: false,
    }
  }
}

export const resolveTrackVideoClip = async (track: Pick<Track, 'videoId' | 'title' | 'channelTitle' | 'album'>) => {
  const currentTrackAvailability = await getTrackVideoAvailability(track.videoId)

  if (currentTrackAvailability.hasVideoClip) {
    return {
      hasVideoClip: true,
      clipVideoId: track.videoId,
    }
  }

  const queries = buildClipSearchQueries(track)
  const candidates: SearchResult[] = []

  for (const query of queries) {
    const response = await innertubePost<any>('search', { query })
    const sections =
      response.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []

    for (const section of sections) {
      const shelfItems = section?.musicShelfRenderer?.contents ?? []

      for (const item of shelfItems) {
        const mapped = mapSearchItem(item)

        if (mapped) {
          candidates.push(mapped)
        }
      }
    }

    const uniqueCandidates = uniqueBy(candidates, (item) => item.videoId)
      .map((candidate) => ({
        candidate,
        score: scoreClipCandidate(candidate, track),
      }))
      .sort((left, right) => right.score - left.score)

    const bestMatch = uniqueCandidates[0]

    if (bestMatch && bestMatch.score >= 9) {
      return {
        hasVideoClip: true,
        clipVideoId: bestMatch.candidate.videoId,
      }
    }
  }

  return {
    hasVideoClip: false,
    clipVideoId: null,
  }
}

const mapResponsiveHomeItem = (item: any): HomeSection['items'][number] | null => {
  const renderer = item?.musicResponsiveListItemRenderer
  const flexColumns = renderer?.flexColumns ?? []
  const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
  const subtitleRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
  const watchEndpoint =
    renderer?.playlistItemData?.videoId ??
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ??
    renderer?.navigationEndpoint?.watchEndpoint?.videoId
  const browseEndpoint = renderer?.navigationEndpoint?.browseEndpoint?.browseId
  const title = getRunsText(titleRuns)

  if (!title || (!watchEndpoint && !browseEndpoint)) {
    return null
  }

  return {
    id: watchEndpoint ?? browseEndpoint,
    title,
    subtitle: getRunsText(subtitleRuns) || 'YouTube Music',
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, watchEndpoint, title),
    videoId: watchEndpoint,
    browseId: browseEndpoint,
  }
}

const mapShelfContentsToItems = (contents: any[]) =>
  contents
    .map((item) => mapHomeItem(item) ?? mapResponsiveHomeItem(item))
    .filter((item: HomeSection['items'][number] | null): item is HomeSection['items'][number] => Boolean(item))

export const getPlaylistTracks = async (browseId: string): Promise<SearchResult[]> => {
  const response = await innertubePost<any>('browse', {
    browseId,
  })

  const responsiveItems = collectRenderers(response, 'musicResponsiveListItemRenderer')
    .map((renderer) => mapPlaylistTrackItem({ musicResponsiveListItemRenderer: renderer }))
    .filter((item: SearchResult | null): item is SearchResult => Boolean(item))

  const panelItems = collectRenderers(response, 'playlistPanelVideoRenderer')
    .map((renderer) => mapPlaylistPanelTrackItem({ playlistPanelVideoRenderer: renderer }))
    .filter((item: SearchResult | null): item is SearchResult => Boolean(item))

  return uniqueBy([...responsiveItems, ...panelItems], (item) => item.videoId)
}

export const normalizePlaylistBrowseId = (value: string) => {
  const input = value.trim()

  if (!input) {
    return ''
  }

  if (/^(VL|MPREb_)/i.test(input)) {
    return input
  }

  try {
    const parsed = new URL(input)
    const listId = parsed.searchParams.get('list')

    if (listId) {
      return listId.startsWith('VL') ? listId : `VL${listId}`
    }
  } catch {
    return input.startsWith('VL') ? input : `VL${input}`
  }

  return input.startsWith('VL') ? input : `VL${input}`
}

export const getYouTubePlaylist = async (browseIdOrUrl: string): Promise<YouTubePlaylist> => {
  const browseId = normalizePlaylistBrowseId(browseIdOrUrl)

  if (!browseId) {
    throw new Error('Informe um link ou browseId de playlist do YouTube Music.')
  }

  const response = await innertubePost<any>('browse', {
    browseId,
  })

  const tracks = await getPlaylistTracks(browseId)
  const header =
    response.header?.musicDetailHeaderRenderer ??
    response.header?.musicEditablePlaylistDetailHeaderRenderer ??
    response.header?.musicResponsiveHeaderRenderer

  const title =
    header?.title?.runs?.[0]?.text ??
    header?.title?.simpleText ??
    response.microformat?.microformatDataRenderer?.title ??
    'Playlist do YouTube'

  const channelTitle =
    getRunsText(header?.subtitle?.runs) ||
    getRunsText(header?.straplineTextOne?.runs) ||
    response.microformat?.microformatDataRenderer?.ownerChannelName ||
    'YouTube Music'

  const thumbnail =
    pickThumbnail(
      header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ??
        header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
        header?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails,
      tracks[0]?.videoId,
      title,
    ) || createThumbnailFallback(title)

  return {
    id: browseId,
    browseId,
    title,
    channelTitle,
    thumbnail,
    tracks,
    syncedAt: Date.now(),
  }
}

export const getReadyMadePlaylists = async () => {
  const feed = await getHomeFeed()

  return uniqueBy(
    feed.playlistSections.flatMap((section) =>
      section.items
        .filter((item) => item.browseId)
        .map((item) => ({
          id: item.browseId ?? item.id,
          browseId: item.browseId ?? item.id,
          title: item.title,
          channelTitle: item.subtitle || 'YouTube Music',
          thumbnail: item.thumbnail || createThumbnailFallback(item.title),
          itemType: 'playlist' as const,
        })),
    ),
    (item) => item.browseId,
  ).slice(0, 18)
}

export const getAccountPlaylists = async () => {
  const response = await innertubePost<any>('browse', {
    browseId: 'FEmusic_library_landing',
  })

  const twoRowPlaylists = collectRenderers(response, 'musicTwoRowItemRenderer')
    .map((renderer) => mapHomeItem({ musicTwoRowItemRenderer: renderer }))
    .flatMap((item) => {
      if (!item?.browseId || item.videoId) {
        return []
      }

      return [
        {
          id: item.browseId,
          browseId: item.browseId,
          title: item.title,
          channelTitle: item.subtitle || 'YouTube Music',
          thumbnail: item.thumbnail || createThumbnailFallback(item.title),
          itemType: 'playlist' as const,
        },
      ]
    })

  const responsivePlaylists = collectRenderers(response, 'musicResponsiveListItemRenderer')
    .map((renderer) => mapSearchPlaylistItem({ musicResponsiveListItemRenderer: renderer }))
    .filter((item: SearchPlaylistResult | null): item is SearchPlaylistResult => Boolean(item))

  return uniqueBy(
    [
      ...twoRowPlaylists,
      ...responsivePlaylists,
    ],
    (item) => item.browseId,
  ).slice(0, 24)
}

export const getHomeSections = async (): Promise<HomeSection[]> => {
  const response = await innertubePost<any>('browse', {
    browseId: 'FEmusic_home',
  })

  const carouselShelves = collectRenderers(response, 'musicCarouselShelfRenderer')
  const immersiveShelves = collectRenderers(response, 'musicImmersiveCarouselShelfRenderer')
  const shelves = [...carouselShelves, ...immersiveShelves]

  return shelves
    .map((shelf: any, index: number) => {
      const title =
        shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text ??
        shelf.header?.musicImmersiveCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text ??
        shelf.header?.musicSideAlignedItemRenderer?.startItems?.[0]?.musicSortFilterButtonRenderer?.title?.runs?.[0]?.text ??
        `Sessao ${index + 1}`

      const items = mapShelfContentsToItems(shelf.contents ?? [])

      if (items.length === 0) {
        return null
      }

      return {
        id: `${title}-${index}`,
        title,
        items: uniqueBy(items, (item) => item.videoId ?? item.browseId ?? item.id),
      }
    })
    .filter((section: HomeSection | null): section is HomeSection => Boolean(section))
}

export const getRadioCandidates = async (track: Track, limit = 5): Promise<SearchResult[]> => {
  const seeds = buildRadioQueries(track)
  const candidates: SearchResult[] = []
  const seen = new Set<string>([track.videoId])

  for (const seed of seeds) {
    const results = await searchVideos(seed)

    for (const item of results) {
      if (seen.has(item.videoId)) {
        continue
      }

      seen.add(item.videoId)
      candidates.push(item)

      if (candidates.length >= limit) {
        return candidates
      }
    }
  }

  return candidates
}

export const buildSmartQueue = async (track: Track, limit = 12): Promise<SearchResult[]> => {
  if (window.windsound?.buildRadioQueue) {
    try {
      const backendQueue = await window.windsound.buildRadioQueue(
        {
          videoId: track.videoId,
          title: track.title,
          channelTitle: track.channelTitle,
          album: track.album,
        },
        limit,
      )

      if (backendQueue.length > 0) {
        return backendQueue
      }
    } catch (error) {
      console.error('WindSound backend radio queue error:', error)
    }
  }

  const candidates = await getRadioCandidates(track, Math.max(limit * 2, 12))
  const normalizedArtist = normalizeText(track.channelTitle)
  const normalizedAlbum = normalizeText(track.album ?? '')

  const scored = candidates.map((item) => {
    let score = 0
    const candidateArtist = normalizeText(item.channelTitle)
    const candidateAlbum = normalizeText(item.album ?? '')
    const candidateTitle = normalizeText(item.title)

    if (candidateArtist === normalizedArtist) {
      score += 5
    }

    if (normalizedAlbum && candidateAlbum && candidateAlbum === normalizedAlbum) {
      score += 3
    }

    if (candidateTitle.includes(normalizeText(track.title).split(' ')[0] ?? '')) {
      score += 1
    }

    if (candidateArtist.includes(normalizedArtist) || normalizedArtist.includes(candidateArtist)) {
      score += 2
    }

    return { item, score }
  })

  return scored
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item)
    .slice(0, limit)
}

const mapSectionItemsToRecommendations = (sections: HomeSection[]): RecommendationItem[] =>
  rotateAgainstRecent(
    uniqueBy(
      shuffleItems(
        sections.flatMap((section) =>
          section.items
            .filter((item) => item.videoId)
            .map((item, index) => ({
              id: item.id,
              videoId: item.videoId ?? item.id,
              title: item.title,
              channelTitle: item.subtitle,
              thumbnail: item.thumbnail || createThumbnailFallback(item.title),
              duration: 0,
              durationLabel: '--:--',
              reason:
                index === 0
                  ? 'Sugerida a partir da sua conta conectada no YouTube Music.'
                  : `Descoberta puxada da sua Home personalizada: ${section.title}.`,
            })),
        ),
      ),
      (item) => item.videoId,
    ),
    (item) => item.videoId,
    2,
  ).slice(0, 14)

const prepareHomeSections = (sections: HomeSection[], usedVideoIds: Set<string>) => {
  const randomizedSections = shuffleItems(sections)
    .map((section) => ({
      ...section,
      items: uniqueBy(shuffleItems(section.items), (item) => item.videoId ?? item.id)
        .filter((item) => !item.videoId || !usedVideoIds.has(item.videoId))
        .map((item) => ({
          ...item,
          thumbnail: item.thumbnail || createThumbnailFallback(item.title),
        }))
        .slice(0, 12),
    }))
    .filter((section) => section.items.length > 0)

  const playlistSections = randomizedSections.filter(isPlaylistSection).slice(0, 4)
  const songSections = randomizedSections.filter((section) => !isPlaylistSection(section)).slice(0, 6)

  for (const section of songSections) {
    for (const item of section.items) {
      if (item.videoId) {
        usedVideoIds.add(item.videoId)
      }
    }
  }

  return { playlistSections, songSections }
}

const mergeHomeFeeds = (feeds: HomeFeed[]): HomeFeed => {
  const accountStatus = feeds[0]?.accountStatus ?? {
    connected: false,
    source: 'local-mock',
    message: 'Home indisponivel no momento.',
  }

  const recommendations = uniqueBy(
    feeds.flatMap((feed) => feed.recommendations),
    (item) => item.videoId,
  )

  const mergeSections = (sections: HomeSection[]) => {
    const grouped = new Map<string, HomeSection['items']>()

    for (const section of sections) {
      const currentItems = grouped.get(section.title) ?? []
      grouped.set(
        section.title,
        uniqueBy([...currentItems, ...section.items], (item) => item.videoId ?? item.browseId ?? item.id),
      )
    }

    return [...grouped.entries()].map(([title, items], index) => ({
      id: `${title}-${index}`,
      title,
      items,
    }))
  }

  return {
    accountStatus,
    recommendations,
    playlistSections: mergeSections(feeds.flatMap((feed) => feed.playlistSections)),
    songSections: mergeSections(feeds.flatMap((feed) => feed.songSections)),
  }
}

export const getAccountStatus = async (): Promise<AccountStatus> => {
  if (!window.windsound?.getAuthStatus) {
    return {
      connected: false,
      source: 'local-mock',
      message: 'Login de conta disponivel apenas na janela desktop do WindSound.',
    }
  }

  return window.windsound.getAuthStatus()
}

export const connectYouTubeAccount = async (): Promise<AccountStatus> => {
  if (!window.windsound?.connectAccount) {
    throw new Error('Conexao de conta disponivel apenas na janela desktop do WindSound.')
  }

  const initialStatus = await window.windsound.connectAccount()

  if (initialStatus.connected) {
    return initialStatus
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    const nextStatus = await getAccountStatus()

    if (nextStatus.connected) {
      return nextStatus
    }
  }

  return initialStatus
}

export const disconnectYouTubeAccount = async (): Promise<AccountStatus> => {
  if (!window.windsound?.disconnectAccount) {
    throw new Error('Desconexao de conta disponivel apenas na janela desktop do WindSound.')
  }

  return window.windsound.disconnectAccount()
}

export const getHomeFeed = async (): Promise<HomeFeed> => {
  const [accountStatus, sections] = await Promise.all([getAccountStatus(), getHomeSections()])
  const usedVideoIds = new Set<string>()

  if (accountStatus.connected) {
    const personalizedRecommendations = mapSectionItemsToRecommendations(sections)
    personalizedRecommendations.forEach((item) => usedVideoIds.add(item.videoId))
    const preparedSections = prepareHomeSections(sections, usedVideoIds)

    if (personalizedRecommendations.length > 0) {
      const itemsForHistory = [
        ...personalizedRecommendations,
        ...preparedSections.playlistSections.flatMap((section) => section.items),
        ...preparedSections.songSections.flatMap((section) => section.items),
      ]
      rememberHomeItems(itemsForHistory)
      return {
        accountStatus,
        recommendations: personalizedRecommendations,
        playlistSections: preparedSections.playlistSections,
        songSections: preparedSections.songSections,
      }
    }
  }

  const recommendations = uniqueBy(shuffleItems(await getMockRecommendations()), (item) => item.videoId).slice(0, 8)
  recommendations.forEach((item) => usedVideoIds.add(item.videoId))
  const preparedSections = prepareHomeSections(sections, usedVideoIds)
  rememberHomeItems([
    ...recommendations,
    ...preparedSections.playlistSections.flatMap((section) => section.items),
    ...preparedSections.songSections.flatMap((section) => section.items),
  ])

  return {
    accountStatus,
    recommendations,
    playlistSections: preparedSections.playlistSections,
    songSections: preparedSections.songSections,
  }
}

export const getHomeRefreshInterval = () => HOME_REFRESH_INTERVAL_MS

export const getMockRecommendations = async (): Promise<RecommendationItem[]> => {
  // TODO: integrar com GET /recommendations?userId={id} para ranking de gosto + historico proprio.
  return [
    {
      id: 'mock-1',
      videoId: 'jfKfPfyJRdk',
      title: 'lofi hip hop radio',
      channelTitle: 'Lofi Girl',
      thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/maxresdefault.jpg',
      duration: 0,
      durationLabel: 'Live',
      reason: 'Feito para entrar no app com clima de descoberta.',
    },
    {
      id: 'mock-2',
      videoId: 'DWcJFNfaw9c',
      title: 'Midnight City',
      channelTitle: 'M83',
      thumbnail: 'https://i.ytimg.com/vi/DWcJFNfaw9c/maxresdefault.jpg',
      duration: 244,
      durationLabel: '4:04',
      reason: 'Mistura synth e energia noturna, no estilo radio automatico.',
    },
    {
      id: 'mock-3',
      videoId: 'fJ9rUzIMcZQ',
      title: 'Bohemian Rhapsody',
      channelTitle: 'Queen Official',
      thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/maxresdefault.jpg',
      duration: 355,
      durationLabel: '5:55',
      reason: 'Classico forte para descoberta e fila inicial.',
    },
    {
      id: 'mock-4',
      videoId: 'kXYiU_JCYtU',
      title: 'Numb',
      channelTitle: 'Linkin Park',
      thumbnail: 'https://i.ytimg.com/vi/kXYiU_JCYtU/maxresdefault.jpg',
      duration: 187,
      durationLabel: '3:07',
      reason: 'Boa ancora para recomendacoes de rock alternativo.',
    },
    {
      id: 'mock-5',
      videoId: 'ktvTqknDobU',
      title: 'Radioactive',
      channelTitle: 'Imagine Dragons',
      thumbnail: 'https://i.ytimg.com/vi/ktvTqknDobU/maxresdefault.jpg',
      duration: 186,
      durationLabel: '3:06',
      reason: 'Energia alta para variar a abertura da Home.',
    },
    {
      id: 'mock-6',
      videoId: 'hTWKbfoikeg',
      title: 'Smells Like Teen Spirit',
      channelTitle: 'Nirvana',
      thumbnail: 'https://i.ytimg.com/vi/hTWKbfoikeg/maxresdefault.jpg',
      duration: 301,
      durationLabel: '5:01',
      reason: 'Alternativa forte para deixar a selecao menos previsivel.',
    },
    {
      id: 'mock-7',
      videoId: 'OPf0YbXqDm0',
      title: 'Uptown Funk',
      channelTitle: 'Mark Ronson ft. Bruno Mars',
      thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/maxresdefault.jpg',
      duration: 270,
      durationLabel: '4:30',
      reason: 'Ajuda a Home a variar entre climas e estilos.',
    },
    {
      id: 'mock-8',
      videoId: '09R8_2nJtjg',
      title: 'Sugar',
      channelTitle: 'Maroon 5',
      thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/maxresdefault.jpg',
      duration: 235,
      durationLabel: '3:55',
      reason: 'Mantem a abertura da Home mudando a cada sessao.',
    },
  ]
}

export const getRadioCandidate = async (track: Track): Promise<SearchResult | null> => {
  const candidates = await getRadioCandidates(track, 1)
  return candidates[0] ?? null
}
