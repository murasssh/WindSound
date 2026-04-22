import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Radio } from 'lucide-react'
import { getHomeFeed, getPlaylistTracks } from '@/integrations/youtube'
import { usePlayerStore } from '@/state/playerStore'
import type { HomeSection, HomeSectionItem, RecommendationItem } from '@/types'

const HOME_CACHE_KEY = 'windsound-home-cache-v1'
const HOME_CACHE_TTL_MS = 1000 * 60 * 12
const INITIAL_RECOMMENDATIONS = 15
const INITIAL_PLAYLISTS = 30
const INITIAL_SONGS = 60
const PLAYLISTS_PER_PAGE = 6
const SONGS_PER_PAGE = 12
const PLAYLISTS_PER_SECTION = 6

const PLAYLIST_SECTION_SLOTS = [
  {
    id: 'mixtapes',
    title: 'Mixtapes criadas para você',
    matchers: [/mix/i, /mixtape/i, /supermix/i, /for you/i, /para voce/i, /para você/i],
  },
  {
    id: 'community',
    title: 'Playlists da comunidade em alta',
    matchers: [/community/i, /comunidade/i, /alta/i, /popular/i, /trending/i, /playlist/i],
  },
  {
    id: 'radios',
    title: 'Rádios e mixes para tocar',
    matchers: [/radio/i, /mood/i, /daily/i, /descoberta/i],
  },
] as const

const clampToFullRows = <T,>(items: T[], columns: number, minimum = columns) => {
  if (items.length <= minimum) {
    return items
  }

  const fullRowsCount = Math.floor(items.length / columns) * columns

  if (fullRowsCount >= minimum) {
    return items.slice(0, fullRowsCount)
  }

  return items.slice(0, minimum)
}

const uniqueBy = <T,>(items: T[], getKey: (item: T) => string) => {
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

const makeFallbackThumbnail = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360"><rect width="360" height="360" rx="28" fill="#1b1b1f"/><text x="50%" y="50%" fill="#f4f4f5" font-family="Inter, Arial, sans-serif" font-size="28" letter-spacing="5" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 16).toUpperCase()}</text></svg>`,
  )}`

const flattenSectionItems = (sections: HomeSection[]) =>
  uniqueBy(
    sections.flatMap((section) =>
      section.items.map((item) => ({
        ...item,
        sourceSectionTitle: section.title,
      })),
    ),
    (item) => item.videoId ?? item.browseId ?? item.id,
  )

type FeedPlaylistItem = HomeSectionItem & { sourceSectionTitle: string }
type CachedHomeFeed = {
  savedAt: number
  data: Awaited<ReturnType<typeof getHomeFeed>>
}

const buildFixedPlaylistSections = (items: FeedPlaylistItem[]) => {
  const pool = [...items]

  const takeFromPool = (predicate?: (item: FeedPlaylistItem) => boolean) => {
    const collected: FeedPlaylistItem[] = []

    for (let index = 0; index < pool.length && collected.length < PLAYLISTS_PER_SECTION; ) {
      const current = pool[index]

      if (!predicate || predicate(current)) {
        collected.push(current)
        pool.splice(index, 1)
        continue
      }

      index += 1
    }

    return collected
  }

  return PLAYLIST_SECTION_SLOTS.map((slot) => {
    const matchedItems = takeFromPool((item) =>
      slot.matchers.some((matcher) => matcher.test(item.sourceSectionTitle.toLowerCase())),
    )
    const filledItems =
      matchedItems.length < PLAYLISTS_PER_SECTION
        ? [...matchedItems, ...takeFromPool().slice(0, PLAYLISTS_PER_SECTION - matchedItems.length)]
        : matchedItems

    return {
      id: slot.id,
      title: slot.title,
      items: clampToFullRows(filledItems, 3),
    }
  }).filter((section) => section.items.length > 0)
}

const Home = () => {
  const [playlistItems, setPlaylistItems] = useState<FeedPlaylistItem[]>([])
  const [songItems, setSongItems] = useState<FeedPlaylistItem[]>([])
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const [visiblePlaylists, setVisiblePlaylists] = useState(INITIAL_PLAYLISTS)
  const [visibleSongs, setVisibleSongs] = useState(INITIAL_SONGS)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreContent, setHasMoreContent] = useState(true)
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const { playTrack, startPlaylist, accountStatus, setAccountStatus, currentView } = usePlayerStore((state) => ({
    playTrack: state.playTrack,
    startPlaylist: state.startPlaylist,
    accountStatus: state.accountStatus,
    setAccountStatus: state.setAccountStatus,
    currentView: state.currentView,
  }))

  const writeHomeCache = useCallback((feed: Awaited<ReturnType<typeof getHomeFeed>>) => {
    try {
      const payload: CachedHomeFeed = {
        savedAt: Date.now(),
        data: feed,
      }
      window.localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(payload))
    } catch {
      undefined
    }
  }, [])

  const readHomeCache = useCallback(() => {
    try {
      const cached = window.localStorage.getItem(HOME_CACHE_KEY)

      if (!cached) {
        return null
      }

      const parsed = JSON.parse(cached) as CachedHomeFeed | Awaited<ReturnType<typeof getHomeFeed>>

      if ('data' in parsed && 'savedAt' in parsed) {
        return parsed
      }

      return {
        savedAt: 0,
        data: parsed,
      } satisfies CachedHomeFeed
    } catch {
      return null
    }
  }, [])

  const mergeFeed = useCallback(
    (feed: Awaited<ReturnType<typeof getHomeFeed>>) => {
      setRecommendations((current) =>
        uniqueBy([...current, ...feed.recommendations], (item) => item.videoId).slice(0, 18),
      )
      setPlaylistItems((current) =>
        uniqueBy([...current, ...flattenSectionItems(feed.playlistSections)], (item) => item.browseId ?? item.id),
      )
      setSongItems((current) =>
        uniqueBy([...current, ...flattenSectionItems(feed.songSections)], (item) => item.videoId ?? item.id),
      )
      setAccountStatus(feed.accountStatus)
      writeHomeCache(feed)
    },
    [setAccountStatus, writeHomeCache],
  )

  const bootstrapHome = useCallback(async () => {
    setIsBootstrapping(true)

    const cachedFeed = readHomeCache()
    const hasFreshCache = cachedFeed ? Date.now() - cachedFeed.savedAt < HOME_CACHE_TTL_MS : false

    if (cachedFeed) {
      setRecommendations(cachedFeed.data.recommendations.slice(0, 18))
      setPlaylistItems(flattenSectionItems(cachedFeed.data.playlistSections))
      setSongItems(flattenSectionItems(cachedFeed.data.songSections))
      setAccountStatus(cachedFeed.data.accountStatus)
      setVisiblePlaylists(INITIAL_PLAYLISTS)
      setVisibleSongs(INITIAL_SONGS)
      setHasMoreContent(true)
      if (hasFreshCache) {
        setIsBootstrapping(false)
        return
      }
    }

    try {
      const feed = await getHomeFeed()
      setRecommendations(feed.recommendations.slice(0, 18))
      setPlaylistItems(flattenSectionItems(feed.playlistSections))
      setSongItems(flattenSectionItems(feed.songSections))
      setAccountStatus(feed.accountStatus)
      setVisiblePlaylists(INITIAL_PLAYLISTS)
      setVisibleSongs(INITIAL_SONGS)
      setHasMoreContent(true)
      writeHomeCache(feed)
      setIsBootstrapping(false)
    } catch (error) {
      console.error('WindSound home error:', error)
      if (!cachedFeed) {
        setRecommendations([])
        setPlaylistItems([])
        setSongItems([])
        setIsBootstrapping(false)
      }
    }
  }, [readHomeCache, setAccountStatus, writeHomeCache])

  useEffect(() => {
    void bootstrapHome()
  }, [bootstrapHome])

  const loadMoreContent = useCallback(async () => {
    if (isLoadingMore || currentView !== 'home') {
      return
    }

    const canRevealMore = visiblePlaylists < playlistItems.length || visibleSongs < songItems.length

    if (canRevealMore) {
      setVisiblePlaylists((current) => Math.min(current + PLAYLISTS_PER_PAGE, playlistItems.length))
      setVisibleSongs((current) => Math.min(current + SONGS_PER_PAGE, songItems.length))
      return
    }

    if (!hasMoreContent) {
      return
    }

    setHasMoreContent(false)
  }, [currentView, hasMoreContent, isLoadingMore, playlistItems.length, songItems.length, visiblePlaylists, visibleSongs])

  useEffect(() => {
    const target = sentinelRef.current

    if (!target || currentView !== 'home') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreContent()
        }
      },
      {
        root: null,
        rootMargin: '0px 0px 280px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(target)

    return () => {
      observer.disconnect()
    }
  }, [currentView, loadMoreContent])

  const handleOpenPlaylist = async (browseId: string, fallbackTitle: string) => {
    setLoadingPlaylistId(browseId)

    try {
      const tracks = await getPlaylistTracks(browseId)

      if (tracks.length > 0) {
        startPlaylist(tracks, 0)
      }
    } catch (error) {
      console.error(`WindSound playlist load error (${fallbackTitle}):`, error)
    } finally {
      setLoadingPlaylistId(null)
    }
  }

  const visibleRecommendationItems = useMemo(
    () => clampToFullRows(recommendations.slice(0, INITIAL_RECOMMENDATIONS), 5),
    [recommendations],
  )
  const visiblePlaylistItems = useMemo(() => playlistItems.slice(0, visiblePlaylists), [playlistItems, visiblePlaylists])
  const visibleSongItems = useMemo(
    () => clampToFullRows(songItems.slice(0, visibleSongs), 6),
    [songItems, visibleSongs],
  )
  const fixedPlaylistSections = useMemo(() => buildFixedPlaylistSections(visiblePlaylistItems), [visiblePlaylistItems])
  const topPlaylistSections = useMemo(() => fixedPlaylistSections.slice(0, 2), [fixedPlaylistSections])
  const bottomPlaylistSections = useMemo(() => fixedPlaylistSections.slice(2), [fixedPlaylistSections])

  return (
    <section className="space-y-7">
      <div>
        <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-subtext)]">
          <Radio size={14} />
          <span>{accountStatus.connected ? 'Faixas para voce' : 'Faixas em destaque'}</span>
        </div>
        <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          {visibleRecommendationItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => playTrack(item)}
              className="flex items-center gap-3 rounded-[9px] bg-[color:color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-3 text-left transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_94%,transparent)]"
            >
              <img
                src={item.thumbnail}
                alt={item.title}
                className="h-12 w-12 rounded-[7px] object-cover"
                onError={(event) => {
                  event.currentTarget.onerror = null
                  event.currentTarget.src = makeFallbackThumbnail(item.title)
                }}
              />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{item.title}</p>
                <p className="truncate text-[11px] text-[var(--color-subtext)]">{item.channelTitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {topPlaylistSections.length > 0 ? (
        <div>
          <div className="space-y-7">
            {topPlaylistSections.map((section) => (
              <div key={section.title}>
                <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-subtext)]">
                  <span>{section.title}</span>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (item.browseId ? void handleOpenPlaylist(item.browseId, item.title) : undefined)}
                      className="flex items-center gap-3 rounded-[9px] bg-[color:color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-3 text-left transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_94%,transparent)]"
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="h-16 w-16 rounded-[7px] object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null
                          event.currentTarget.src = makeFallbackThumbnail(item.title)
                        }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{item.title}</p>
                        <p className="mt-1 truncate text-[11px] text-[var(--color-subtext)]">{item.subtitle}</p>
                        <p className="mt-2 truncate text-[10px] uppercase tracking-[0.16em] text-[var(--color-subtext)]">
                          {loadingPlaylistId === item.browseId ? 'Carregando...' : 'Abrir playlist'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-subtext)]">
          <span>Musicas para ouvir agora</span>
        </div>
        <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {visibleSongItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                item.videoId
                  ? playTrack({
                      id: item.videoId,
                      videoId: item.videoId,
                      title: item.title,
                      channelTitle: item.subtitle,
                      thumbnail: item.thumbnail,
                      duration: 0,
                      durationLabel: '--:--',
                    })
                  : undefined
              }
                className="overflow-hidden rounded-[8px] bg-[color:color-mix(in_srgb,var(--color-surface)_88%,transparent)] text-left transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_94%,transparent)]"
              >
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  className="aspect-square w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = makeFallbackThumbnail(item.title)
                  }}
                />
                <div className="p-2.5">
                  <p className="truncate text-[12px] font-medium text-[var(--color-text)]">{item.title}</p>
                  <p className="mt-1 truncate text-[10px] text-[var(--color-subtext)]">{item.subtitle}</p>
                </div>
            </button>
          ))}
        </div>
      </div>

      {bottomPlaylistSections.length > 0 ? (
        <div>
          <div className="space-y-7">
            {bottomPlaylistSections.map((section) => (
              <div key={section.title}>
                <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-subtext)]">
                  <span>{section.title}</span>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (item.browseId ? void handleOpenPlaylist(item.browseId, item.title) : undefined)}
                      className="flex items-center gap-3 rounded-[9px] bg-[color:color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-3 text-left transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_94%,transparent)]"
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="h-16 w-16 rounded-[7px] object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null
                          event.currentTarget.src = makeFallbackThumbnail(item.title)
                        }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{item.title}</p>
                        <p className="mt-1 truncate text-[11px] text-[var(--color-subtext)]">{item.subtitle}</p>
                        <p className="mt-2 truncate text-[10px] uppercase tracking-[0.16em] text-[var(--color-subtext)]">
                          {loadingPlaylistId === item.browseId ? 'Carregando...' : 'Abrir playlist'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div ref={sentinelRef} className="flex min-h-16 items-center justify-center py-4">
        {isBootstrapping || isLoadingMore ? (
          <div className="inline-flex items-center gap-2 rounded-[8px] bg-[color:color-mix(in_srgb,var(--color-surface)_92%,transparent)] px-4 py-3 text-[12px] text-[var(--color-subtext)]">
            <Loader2 size={14} className="animate-spin" />
            <span>{isBootstrapping ? 'Carregando Home...' : 'Buscando mais itens...'}</span>
          </div>
        ) : (
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-subtext)]">
            {hasMoreContent ? 'Role para continuar descobrindo' : 'Home carregada'}
          </span>
        )}
      </div>
    </section>
  )
}

export default Home
