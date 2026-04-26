import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { usePlayerStore } from '@/state/playerStore'
import type { Track } from '@/types'

const makeFallbackThumbnail = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="22" fill="#1b1b1f"/><text x="50%" y="50%" fill="#f4f4f5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 12).toUpperCase()}</text></svg>`,
  )}`

type PlaylistPickerProps = {
  track: Track | null
  open: boolean
  onClose: () => void
}

const PlaylistPicker = ({ track, open, onClose }: PlaylistPickerProps) => {
  const [playlistName, setPlaylistName] = useState('')
  const { playlists, createPlaylist, addTrackToPlaylist } = usePlayerStore((state) => ({
    playlists: state.playlists,
    createPlaylist: state.createPlaylist,
    addTrackToPlaylist: state.addTrackToPlaylist,
  }))

  const previewThumbnail = useMemo(() => track?.thumbnail || (track ? makeFallbackThumbnail(track.title) : ''), [track])

  if (!open || !track) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
      <div className="w-full max-w-[720px] overflow-hidden rounded-[24px] border border-white/8 bg-[color:color-mix(in_srgb,var(--color-surface)_94%,black_6%)] shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
        <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="relative bg-[radial-gradient(circle_at_top,#1ed76033,transparent_60%),linear-gradient(180deg,#18181b,#101013)] p-6">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white transition duration-150 hover:bg-black/45"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>

            <img
              src={previewThumbnail}
              alt={track.title}
              className="mt-8 aspect-square w-full rounded-[18px] object-cover shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = makeFallbackThumbnail(track.title)
              }}
            />

            <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-white/55">Adicionar faixa</p>
            <h3 className="mt-2 line-clamp-2 text-xl font-semibold text-white">{track.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm text-white/65">{track.channelTitle}</p>
          </div>

          <div className="p-6">
            <p className="text-[12px] uppercase tracking-[0.22em] text-[var(--color-subtext)]">Suas playlists</p>

            <div className="mt-4 flex gap-2">
              <input
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                placeholder="Criar nova playlist"
                className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface2)] px-4 py-3 text-[14px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtext)]"
              />
              <button
                type="button"
                onClick={() => {
                  const createdId = createPlaylist(playlistName.trim() || track.title, [track])
                  setPlaylistName('')
                  if (createdId) {
                    onClose()
                  }
                }}
                className="inline-flex items-center justify-center rounded-[14px] bg-[#1ed760] px-4 py-3 text-black transition duration-150 hover:scale-[0.98]"
                aria-label="Criar playlist"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="mt-5 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {playlists.length === 0 ? (
                <div className="rounded-[16px] bg-[var(--color-surface2)] px-4 py-5 text-[14px] leading-6 text-[var(--color-subtext)]">
                  Nenhuma playlist local ainda. Crie uma nova acima e essa faixa já entra nela.
                </div>
              ) : (
                playlists.map((playlist) => {
                  const coverTrack = playlist.tracks[0]

                  return (
                    <button
                      key={playlist.id}
                      type="button"
                      onClick={() => {
                        addTrackToPlaylist(playlist.id, track)
                        onClose()
                      }}
                      className="flex w-full items-center gap-4 rounded-[16px] bg-[var(--color-surface2)] px-4 py-3 text-left transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_80%,white_6%)]"
                    >
                      <img
                        src={coverTrack?.thumbnail || makeFallbackThumbnail(playlist.name)}
                        alt={playlist.name}
                        className="h-14 w-14 rounded-[12px] object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null
                          event.currentTarget.src = makeFallbackThumbnail(playlist.name)
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[var(--color-text)]">{playlist.name}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
                          {playlist.tracks.length} faixas
                        </p>
                      </div>
                      <span className="rounded-full bg-[#1ed760]/12 px-3 py-1 text-[11px] font-medium text-[#1ed760]">
                        Adicionar
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlaylistPicker
