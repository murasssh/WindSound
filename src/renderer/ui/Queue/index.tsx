import { useEffect, useMemo, useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { getAccountPlaylists, getReadyMadePlaylists, getYouTubePlaylist } from '@/integrations/youtube'
import { usePlayerStore } from '@/state/playerStore'
import type { LocalPlaylist, SearchPlaylistResult } from '@/types'

type LibraryEntry = {
  id: string
  title: string
  subtitle: string
  thumbnail?: string
  active: boolean
  onSelect: () => void
}

const makeFallbackThumbnail = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="22" fill="#1b1b1f"/><text x="50%" y="50%" fill="#f4f4f5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 12).toUpperCase()}</text></svg>`,
  )}`

const isLikedPlaylist = (title: string) => /(curtidas|liked)/i.test(title)

const isSubscriptionLike = (item: SearchPlaylistResult) => {
  const normalized = `${item.title} ${item.channelTitle}`.toLowerCase()

  return (
    /(inscri|subscr|artist|artista|canal|channel|perfil|profile)/.test(normalized) &&
    !/(curtidas|liked|favoritas|favorites)/.test(normalized) &&
    !/(playlist|mix|radio|album)/.test(normalized)
  )
}

const isEpisodeLike = (item: SearchPlaylistResult) => {
  const normalized = `${item.title} ${item.channelTitle}`.toLowerCase()
  return /(episod|episode|podcast|show)/.test(normalized)
}

const LibraryCard = ({ entry }: { entry: LibraryEntry }) => (
  <button
    type="button"
    onClick={entry.onSelect}
    className={`group overflow-hidden rounded-[22px] text-left transition duration-200 ${
      entry.active
        ? 'bg-[color:color-mix(in_srgb,var(--color-surface)_96%,black_4%)]'
        : 'bg-[color:color-mix(in_srgb,var(--color-surface)_92%,black_8%)] hover:bg-[color:color-mix(in_srgb,var(--color-surface)_96%,black_4%)]'
    }`}
  >
    <div className="aspect-square w-full">
      <img
        src={entry.thumbnail || makeFallbackThumbnail(entry.title)}
        alt={entry.title}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.onerror = null
          event.currentTarget.src = makeFallbackThumbnail(entry.title)
        }}
      />
    </div>
    <div className="px-3 py-3">
      <p className="truncate text-[13px] font-semibold text-[var(--color-text)]">{entry.title}</p>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[var(--color-subtext)]">{entry.subtitle}</p>
    </div>
  </button>
)

const Queue = () => {
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [loadingYouTubePlaylist, setLoadingYouTubePlaylist] = useState(false)
  const [accountPlaylists, setAccountPlaylists] = useState<SearchPlaylistResult[]>([])
  const [readyMadePlaylists, setReadyMadePlaylists] = useState<SearchPlaylistResult[]>([])
  const { playlists, accountStatus, createPlaylist, saveYouTubePlaylist, playPlaylist } = usePlayerStore((state) => ({
    playlists: state.playlists,
    accountStatus: state.accountStatus,
    createPlaylist: state.createPlaylist,
    saveYouTubePlaylist: state.saveYouTubePlaylist,
    playPlaylist: state.playPlaylist,
  }))

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? playlists[0] ?? null,
    [playlists, selectedPlaylistId],
  )

  useEffect(() => {
    if (!selectedPlaylist && playlists.length > 0) {
      setSelectedPlaylistId(playlists[0].id)
      return
    }

    if (selectedPlaylist) {
      setSelectedPlaylistId(selectedPlaylist.id)
    }
  }, [playlists, selectedPlaylist])

  useEffect(() => {
    let cancelled = false

    const loadPlaylists = async () => {
      try {
        const [accountItems, suggestedItems] = await Promise.all([
          accountStatus.connected ? getAccountPlaylists() : Promise.resolve([]),
          getReadyMadePlaylists(),
        ])

        if (!cancelled) {
          setAccountPlaylists(accountItems)
          setReadyMadePlaylists(suggestedItems)
        }
      } catch (error) {
        console.error('WindSound playlists feed error:', error)
      }
    }

    void loadPlaylists()

    return () => {
      cancelled = true
    }
  }, [accountStatus.connected])

  const handleCreatePlaylist = () => {
    const createdId = createPlaylist(newPlaylistName)
    setNewPlaylistName('')
    setIsCreateModalOpen(false)
    setSelectedPlaylistId(createdId)
  }

  const handleImportYouTubePlaylist = async (
    playlistSeed: Pick<SearchPlaylistResult, 'browseId' | 'title' | 'channelTitle' | 'thumbnail'>,
  ) => {
    const source = playlistSeed.browseId.trim()

    if (!source) {
      return
    }

    setLoadingYouTubePlaylist(true)

    try {
      const playlist = await getYouTubePlaylist(source)
      const syncedId = saveYouTubePlaylist({
        ...playlist,
        title: playlistSeed.title || playlist.title,
        channelTitle: playlistSeed.channelTitle || playlist.channelTitle,
        thumbnail: playlistSeed.thumbnail || playlist.thumbnail,
      })

      setSelectedPlaylistId(syncedId)
      playPlaylist(syncedId, 0)
    } catch (error) {
      console.error('WindSound YouTube playlist import error:', error)
    } finally {
      setLoadingYouTubePlaylist(false)
    }
  }

  const libraryEntries = useMemo<LibraryEntry[]>(() => {
    const accountThumbnailMap = new Map(accountPlaylists.map((playlist) => [playlist.browseId, playlist.thumbnail]))
    const syncedBrowseIds = new Set(
      playlists
        .map((playlist) => playlist.syncSource?.browseId)
        .filter((browseId): browseId is string => Boolean(browseId)),
    )

    const localEntries: LibraryEntry[] = playlists.map((playlist: LocalPlaylist) => ({
      id: playlist.id,
      title: playlist.name,
      subtitle: playlist.syncSource
        ? `${playlist.syncSource.channelTitle} • ${playlist.tracks.length} faixas`
        : `${playlist.tracks.length} faixas salvas`,
      thumbnail:
        (playlist.syncSource?.browseId ? accountThumbnailMap.get(playlist.syncSource.browseId) : undefined) ||
        playlist.thumbnail ||
        (isLikedPlaylist(playlist.name) ? accountThumbnailMap.get(playlist.syncSource?.browseId ?? '') : undefined) ||
        playlist.tracks[0]?.thumbnail,
      active: playlist.id === selectedPlaylist?.id,
      onSelect: () => {
        setSelectedPlaylistId(playlist.id)
        playPlaylist(playlist.id, 0)
      },
    }))

    const accountEntries: LibraryEntry[] = accountPlaylists
      .filter((playlist) => !syncedBrowseIds.has(playlist.browseId))
      .filter((playlist) => !isEpisodeLike(playlist))
      .map((playlist) => ({
        id: playlist.browseId,
        title: playlist.title,
        subtitle: `${playlist.channelTitle} • da sua conta`,
        thumbnail: playlist.thumbnail,
        active: false,
        onSelect: () => {
          void handleImportYouTubePlaylist(playlist)
        },
      }))

    return [...localEntries, ...accountEntries]
  }, [accountPlaylists, playlists, playPlaylist, selectedPlaylist?.id])

  const playlistEntries = useMemo(
    () =>
      libraryEntries.filter(
        (entry) =>
          !isSubscriptionLike({
            title: entry.title,
            channelTitle: entry.subtitle,
            id: entry.id,
            thumbnail: entry.thumbnail ?? '',
            browseId: entry.id,
            itemType: 'playlist',
          }),
      ),
    [libraryEntries],
  )

  const subscriptionEntries = useMemo(
    () =>
      libraryEntries.filter((entry) =>
        isSubscriptionLike({
          title: entry.title,
          channelTitle: entry.subtitle,
          id: entry.id,
          thumbnail: entry.thumbnail ?? '',
          browseId: entry.id,
          itemType: 'playlist',
        }),
      ),
    [libraryEntries],
  )

  return (
    <section className="space-y-8">
      <div className="space-y-6">
        <div className="rounded-[24px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,black_6%)] p-6">
          <div className="flex items-center justify-between">
            <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Playlists</h2>
            <div className="rounded-full bg-[var(--color-surface2)] px-4 py-2 text-[12px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
              {libraryEntries.length} visiveis
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1ed760] text-black transition duration-150 hover:scale-[0.98]"
              aria-label="Criar playlist"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">Playlists</p>
              <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
                {playlistEntries.length === 0 ? (
                  <div className="rounded-[18px] bg-[var(--color-surface2)] px-5 py-6 text-[14px] leading-7 text-[var(--color-subtext)] sm:col-span-4 xl:col-span-8">
                    Crie uma playlist nova. As playlists da sua conta do YouTube Music entram aqui no mesmo campo.
                  </div>
                ) : (
                  playlistEntries.map((entry) => <LibraryCard key={entry.id} entry={entry} />)
                )}
              </div>
            </div>

            {subscriptionEntries.length > 0 ? (
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">Inscrições</p>
                <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
                  {subscriptionEntries.map((entry) => (
                    <LibraryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,black_6%)] p-6">
          <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Sugestões</h2>

          <div className="mt-6 grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {readyMadePlaylists.map((playlist) => (
              <div
                key={playlist.browseId}
                className="overflow-hidden rounded-[22px] bg-[color:color-mix(in_srgb,var(--color-surface)_92%,black_8%)]"
              >
                <img
                  src={playlist.thumbnail}
                  alt={playlist.title}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = makeFallbackThumbnail(playlist.title)
                  }}
                />
                <div className="px-3 py-3">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-text)]">{playlist.title}</p>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[var(--color-subtext)]">{playlist.channelTitle}</p>
                  <button
                    type="button"
                    onClick={() => void handleImportYouTubePlaylist(playlist)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--color-surface2)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text)] transition duration-150 hover:text-[#1ed760]"
                  >
                    <Save size={14} />
                    <span>{loadingYouTubePlaylist ? 'Adicionando...' : 'Salvar'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-[60px] backdrop-blur-sm">
          <div className="flex min-h-[360px] w-full max-w-[560px] flex-col justify-center rounded-[28px] bg-[color:color-mix(in_srgb,var(--color-surface)_96%,black_4%)] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
            <p className="text-center text-[12px] uppercase tracking-[0.22em] text-[var(--color-subtext)]">Nova playlist</p>
            <h3 className="mt-3 text-center text-3xl font-semibold text-[var(--color-text)]">Criar playlist</h3>

            <input
              autoFocus
              value={newPlaylistName}
              onChange={(event) => setNewPlaylistName(event.target.value)}
              placeholder="Nome da playlist"
              className="mt-8 rounded-[18px] bg-[var(--color-surface2)] px-5 py-4 text-[16px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtext)]"
            />

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false)
                  setNewPlaylistName('')
                }}
                className="rounded-[16px] bg-[var(--color-surface2)] px-5 py-3 text-[14px] font-semibold text-[var(--color-text)] transition duration-150 hover:scale-[0.98]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreatePlaylist}
                className="rounded-[16px] bg-[#1ed760] px-5 py-3 text-[14px] font-semibold text-black transition duration-150 hover:scale-[0.98]"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default Queue
