import { useEffect, useMemo, useState } from 'react'
import { ListPlus, LoaderCircle, Play, SearchIcon } from 'lucide-react'
import { useDebouncedValue } from '@/react-hooks/useDebouncedValue'
import { getPlaylistTracks, searchCatalog } from '@/integrations/youtube'
import { usePlayerStore } from '@/state/playerStore'
import type { SearchCatalogResult } from '@/types'

const makeFallbackThumbnail = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360"><rect width="360" height="360" rx="28" fill="#1b1b1f"/><text x="50%" y="50%" fill="#f4f4f5" font-family="Inter, Arial, sans-serif" font-size="28" letter-spacing="5" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 16).toUpperCase()}</text></svg>`,
  )}`

const Search = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchCatalogResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const debouncedQuery = useDebouncedValue(query, 300)

  const { addToQueue, playTrack, startPlaylist } = usePlayerStore((state) => ({
    addToQueue: state.addToQueue,
    playTrack: state.playTrack,
    startPlaylist: state.startPlaylist,
  }))

  useEffect(() => {
    let cancelled = false

    if (!debouncedQuery.trim()) {
      setResults([])
      setIsLoading(false)
      setError('')
      return
    }

    setIsLoading(true)
    setError('')

    searchCatalog(debouncedQuery)
      .then((searchResults) => {
        if (!cancelled) {
          setResults(searchResults)
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          const message = searchError instanceof Error ? searchError.message : 'Nao foi possivel buscar agora.'
        console.error('WindSound search error:', searchError)
          setError(message)
          setResults([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const handleOpenPlaylist = async (browseId: string) => {
    try {
      const tracks = await getPlaylistTracks(browseId)

      if (tracks.length > 0) {
        startPlaylist(tracks, 0)
      }
    } catch (playlistError) {
        console.error('WindSound search playlist error:', playlistError)
    }
  }

  const searchStarted = useMemo(() => isFocused || query.trim().length > 0 || results.length > 0 || isLoading, [isFocused, query, results.length, isLoading])

  return (
    <section className="min-h-[calc(100vh-13rem)]">
      <div
        className={`mx-auto flex w-full max-w-4xl flex-col transition-all duration-300 ease-out ${
          searchStarted ? 'min-h-0 justify-start pt-2' : 'min-h-[calc(100vh-16rem)] justify-center'
        }`}
      >
        <div className={`transition-all duration-300 ease-out ${searchStarted ? 'mb-8' : 'mb-0'}`}>
          <label className="block">
            <span className="sr-only">Buscar musica</span>
            <div className="flex items-center gap-3 rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_92%,transparent)] px-5 py-4 backdrop-blur-xl">
              <SearchIcon size={18} className="text-[var(--color-subtext)]" />
              <input
                autoFocus
                value={query}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(query.trim().length > 0)}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar musica, artista ou album"
                className="w-full bg-transparent text-[16px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtext)]"
              />
            </div>
          </label>
        </div>

        {searchStarted ? (
          <div className="space-y-4">
            <div className="flex min-h-6 items-center justify-between">
              {isLoading ? (
                <div className="flex items-center gap-2 text-[13px] text-[var(--color-subtext)]">
                  <LoaderCircle size={14} className="animate-spin" />
                  <span>Buscando...</span>
                </div>
              ) : (
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
                  {results.length ? `${results.length} resultados` : query.trim() ? 'Sem resultados ainda' : ''}
                </span>
              )}
            </div>

            {error ? <p className="text-[13px] text-rose-300">{error}</p> : null}

            <div className="grid gap-4 xl:grid-cols-2">
              {results.map((result) => (
                <article
                  key={result.id}
                  className="group flex items-center gap-4 rounded-[10px] bg-[color:color-mix(in_srgb,var(--color-surface)_90%,transparent)] p-4 transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_94%,transparent)]"
                >
                  <img
                    src={result.thumbnail}
                    alt={result.title}
                    className="h-20 w-20 rounded-[8px] object-cover"
                    onError={(event) => {
                      event.currentTarget.onerror = null
                      event.currentTarget.src = makeFallbackThumbnail(result.title)
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-[15px] font-medium text-[var(--color-text)]">{result.title}</h4>
                    <p className="mt-1 truncate text-[13px] text-[var(--color-subtext)]">{result.channelTitle}</p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
                      {'itemType' in result ? <span>Playlist</span> : <span>{result.durationLabel}</span>}
                      {'album' in result && result.album ? <span>{result.album}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => ('itemType' in result ? void handleOpenPlaylist(result.browseId) : playTrack(result))}
                      className="rounded-[8px] bg-[var(--color-accent)] p-3 text-white transition duration-150 hover:scale-[0.98] hover:bg-[var(--color-accent2)]"
                      aria-label={`${'itemType' in result ? 'Abrir' : 'Tocar'} ${result.title}`}
                    >
                      <Play size={16} fill="currentColor" />
                    </button>
                    {'itemType' in result ? null : (
                      <button
                        type="button"
                        onClick={() => addToQueue(result)}
                        className="rounded-[8px] border border-[color:color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[color:color-mix(in_srgb,var(--color-surface2)_90%,transparent)] p-3 text-[var(--color-text)] transition duration-150 hover:scale-[0.98] hover:border-[var(--color-accent)]"
                        aria-label={`Adicionar ${result.title} na fila`}
                      >
                        <ListPlus size={16} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default Search
