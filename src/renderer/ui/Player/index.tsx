import { useMemo } from 'react'
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useYouTubePlayer } from '@/react-hooks/useYouTubePlayer'
import { usePlayerStore } from '@/state/playerStore'

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const safeSeconds = Math.floor(seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

const makeFallbackThumbnail = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="22" fill="#1b1b1f"/><text x="50%" y="50%" fill="#f4f4f5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 12).toUpperCase()}</text></svg>`,
  )}`

const Player = () => {
  const {
    queue,
    currentIndex,
    isPlaying,
    isMuted,
    volume,
    progress,
    duration,
    shuffle,
    repeat,
    togglePlayState,
    setMuted,
    setVolume,
    playNext,
    playPrevious,
    cycleRepeat,
    toggleShuffle,
  } = usePlayerStore((state) => ({
    queue: state.queue,
    currentIndex: state.currentIndex,
    isPlaying: state.isPlaying,
    isMuted: state.isMuted,
    volume: state.volume,
    progress: state.progress,
    duration: state.duration,
    shuffle: state.shuffle,
    repeat: state.repeat,
    togglePlayState: state.togglePlayState,
    setMuted: state.setMuted,
    setVolume: state.setVolume,
    playNext: state.playNext,
    playPrevious: state.playPrevious,
    cycleRepeat: state.cycleRepeat,
    toggleShuffle: state.toggleShuffle,
  }))

  const currentTrack = queue[currentIndex] ?? null
  const { isReady, statusText, currentTime, seekToTime, stopPlayback } = useYouTubePlayer(currentTrack)

  const repeatLabel = useMemo(() => {
    if (repeat === 'one') {
      return 'Repeat one'
    }

    if (repeat === 'all') {
      return 'Repeat all'
    }

    return 'Repeat off'
  }, [repeat])

  return (
    <footer className="fixed bottom-4 left-[264px] right-4 z-30 rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_92%,transparent)] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[74px] max-w-[calc(100vw-292px)] flex-col justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(duration, currentTrack?.duration ?? 0, 1)}
            step={0.1}
            value={currentTime}
            onChange={(event) => seekToTime(Number(event.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[color:color-mix(in_srgb,var(--color-surface2)_82%,white_18%)] accent-[var(--color-accent)]"
          />
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration || currentTrack?.duration || 0)}</span>
            {!isReady ? (
              <>
                <span>•</span>
                <span>{statusText}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {currentTrack ? (
              <>
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="h-12 w-12 rounded-[7px] object-cover"
                  onError={(event) => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = makeFallbackThumbnail(currentTrack.title)
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[var(--color-text)]">{currentTrack.title}</p>
                  <p className="mt-1 truncate text-[12px] text-[var(--color-subtext)]">{currentTrack.channelTitle}</p>
                </div>
              </>
            ) : (
              <div>
                <p className="text-[14px] font-medium text-[var(--color-text)]">Nada tocando</p>
                <p className="mt-1 text-[12px] text-[var(--color-subtext)]">Escolha algo na Home ou va para a busca.</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`rounded-[8px] p-2.5 transition duration-150 hover:scale-[0.98] ${
                shuffle ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface2)] text-[var(--color-text)]'
              }`}
              aria-label="Shuffle"
            >
              <Shuffle size={16} />
            </button>
            <button
              type="button"
              onClick={playPrevious}
              className="rounded-[8px] bg-[var(--color-surface2)] p-2.5 text-[var(--color-text)] transition duration-150 hover:scale-[0.98]"
              aria-label="Faixa anterior"
            >
              <SkipBack size={16} />
            </button>
            <button
              type="button"
              onClick={togglePlayState}
              className="rounded-[8px] bg-[var(--color-accent)] p-3 text-white transition duration-150 hover:scale-[0.98] hover:bg-[var(--color-accent2)]"
              aria-label={isPlaying ? 'Pausar' : 'Tocar'}
              disabled={!currentTrack}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={stopPlayback}
              className="rounded-[8px] bg-[var(--color-surface2)] p-2.5 text-[var(--color-text)] transition duration-150 hover:scale-[0.98]"
              aria-label="Parar"
            >
              <Square size={16} fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={() => void playNext()}
              className="rounded-[8px] bg-[var(--color-surface2)] p-2.5 text-[var(--color-text)] transition duration-150 hover:scale-[0.98]"
              aria-label="Proxima faixa"
            >
              <SkipForward size={16} />
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              className={`rounded-[8px] p-2.5 transition duration-150 hover:scale-[0.98] ${
                repeat === 'off'
                  ? 'bg-[var(--color-surface2)] text-[var(--color-text)]'
                  : 'bg-[var(--color-accent)] text-white'
              }`}
              aria-label={repeatLabel}
            >
              {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMuted(!isMuted)}
              className="rounded-[8px] bg-[var(--color-surface2)] p-2.5 text-[var(--color-text)] transition duration-150 hover:scale-[0.98]"
              aria-label={isMuted ? 'Ativar audio' : 'Silenciar'}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-[var(--color-surface2)] accent-[var(--color-accent)]"
            />
          </div>
        </div>
      </div>

      {/* TODO: Web Audio API — bandas 60Hz/170Hz/350Hz/1kHz/3.5kHz/10kHz */}
      {/* TODO: canvas AudioContext analyser (frequencyData) */}
      {/* TODO: yt-dlp via Electron IPC bridge */}
      {/* TODO: Document Picture-in-Picture API */}
    </footer>
  )
}

export default Player
