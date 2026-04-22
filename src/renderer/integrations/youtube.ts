import type { AccountStatus, HomeFeed, HomeSection, RecommendationItem, SearchCatalogResult, SearchPlaylistResult, SearchResult, Track, VideoDetails } from '@/types'

const INNERTUBE_BASE = 'https://music.youtube.com/youtubei/v1'
const INNERTUBE_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'

const CLIENT_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20250414.03.00',
    hl: 'pt-BR',
    gl: 'BR',
  },
}

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
const HOME_RECENT_IDS_KEY = 'windsound-home-recent-ids'
const HOME_RECENT_LIMIT = 40

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
  const parts = value
    .trim()
    .split(':')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part))

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

const getRunsText = (runs: Array<{ text?: string }> | undefined) =>
  (runs ?? []).map((run) => run.text ?? '').join('').trim()

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

  next = next.replace(/=w\d+-h\d+(?:-[a-z0-9-]+)?$/i, '=w544-h544')
  next = next.replace(/-w\d+-h\d+(?:-[a-z0-9-]+)?(?=$|\?)/i, '-w544-h544')
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

  return items.filter((item) => {
    const key = getKey(item)

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
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
  if (!node || typeof node !== 'object') {
    return results
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectRenderers(item, rendererKey, results))
    return results
  }

  const record = node as Record<string, unknown>

  if (rendererKey in record) {
    results.push(record[rendererKey])
  }

  Object.values(record).forEach((value) => collectRenderers(value, rendererKey, results))
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

const innertubePost = async <T>(endpoint: string, body: object): Promise<T> => {
  if (window.windsound?.innertubeRequest) {
    return window.windsound.innertubeRequest(endpoint, body as Record<string, unknown>) as Promise<T>
  }

  if (window.windsound) {
    throw new Error('IPC do InnerTube indisponivel no preload. Reinicie o WindSound em modo desktop.')
  }

  const response = await fetch(`${INNERTUBE_BASE}/${endpoint}?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Format-Version': '1',
      Origin: 'https://music.youtube.com',
      Referer: 'https://music.youtube.com/',
    },
    body: JSON.stringify({
      context: CLIENT_CONTEXT,
      ...body,
    }),
  })

  if (!response.ok) {
    throw new Error(`InnerTube respondeu com status ${response.status}`)
  }

  return response.json() as Promise<T>
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
    .split(/[â€¢•Â·]/)
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
    .split(/[â€¢Â·]/)
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
  const browseId = titleRun?.navigationEndpoint?.browseEndpoint?.browseId
  const pageType =
    titleRun?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType
  const playlistId =
    renderer?.buttons?.[1]?.buttonRenderer?.command?.watchPlaylistEndpoint?.playlistId ??
    renderer?.buttons?.[0]?.buttonRenderer?.command?.watchPlaylistEndpoint?.playlistId

  if (!renderer || !titleRun?.text) {
    return null
  }

  if (pageType && !String(pageType).includes('PLAYLIST')) {
    return null
  }

  return {
    id: browseId ?? playlistId ?? titleRun.text,
    title: titleRun.text,
    channelTitle: getRunsText(renderer?.subtitle?.runs).replace(/^Playlist\s*•\s*/i, '') || 'YouTube Music',
    thumbnail: pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, undefined, titleRun.text),
    browseId: browseId ?? `VL${playlistId}`,
    itemType: 'playlist',
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

  const playlists = generalSections
    .flatMap((section: any) => {
      const cardPlaylist = mapSearchCardShelfPlaylist(section)
      const shelfPlaylists = (section?.musicShelfRenderer?.contents ?? [])
        .map(mapSearchPlaylistItem)
        .filter((item: SearchPlaylistResult | null): item is SearchPlaylistResult => Boolean(item))

      return cardPlaylist ? [cardPlaylist, ...shelfPlaylists] : shelfPlaylists
    })

  const uniqueSongs: SearchResult[] = uniqueBy(songs, (item) => item.videoId)
  const uniquePlaylists: SearchPlaylistResult[] = uniqueBy(playlists, (item) => item.browseId)
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

  return {
    videoId,
    title: videoDetails.title ?? 'Faixa sem titulo',
    channelTitle: videoDetails.author ?? 'YouTube Music',
    thumbnail: pickThumbnail(videoDetails.thumbnail?.thumbnails, videoId, videoDetails.title ?? 'Faixa'),
    duration,
    durationLabel: formatDuration(duration),
    streamUrl: window.windsound?.createPlaybackUrl
      ? window.windsound.createPlaybackUrl(videoId)
      : window.windsound?.createStreamUrl
        ? window.windsound.createStreamUrl(audioFormat.url)
        : audioFormat.url,
  }
}

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

export const getHomeSections = async (): Promise<HomeSection[]> => {
  const response = await innertubePost<any>('browse', {
    browseId: 'FEmusic_home',
  })

  const sections =
    response.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []

  return sections
    .map((section: any, index: number) => {
      const shelf = section.musicCarouselShelfRenderer ?? section.musicImmersiveCarouselShelfRenderer

      if (!shelf) {
        return null
      }

      const title =
        shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text ??
        shelf.header?.musicImmersiveCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text ??
        `Sessao ${index + 1}`

      const items = (shelf.contents ?? [])
        .map(mapHomeItem)
        .filter((item: HomeSection['items'][number] | null): item is HomeSection['items'][number] => Boolean(item))

      if (items.length === 0) {
        return null
      }

      return {
        id: `${title}-${index}`,
        title,
        items,
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

  return window.windsound.connectAccount()
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
