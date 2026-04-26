import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  FolderPlus,
  ListMusic,
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
import { resolveTrackVideoClip } from '@/integrations/youtube'
import { useYouTubePlayer } from '@/react-hooks/useYouTubePlayer'
import { usePlayerStore } from '@/state/playerStore'
import PlaylistPicker from '@/ui/PlaylistPicker'
import type { Track } from '@/types'

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

const getReliableThumbnail = (videoId: string, title: string) =>
  videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : makeFallbackThumbnail(title)

const controlButtonClass =
  'rounded-[8px] bg-[color:color-mix(in_srgb,var(--color-surface2)_72%,transparent)] p-2.5 text-[var(--color-text)] transition duration-150 hover:scale-[0.98]'
const timeInfoClass =
  'flex w-[132px] shrink-0 items-center justify-end gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]'
const mediaToggleClass = 'rounded-full px-4 py-2 text-[12px] font-medium transition duration-150'

const MarqueeText = ({
  text,
  className = '',
  animateAfter = 26,
  durationSeconds = 14,
}: {
  text: string
  className?: string
  animateAfter?: number
  durationSeconds?: number
}) => {
  const safeText = text?.trim() || 'Sem titulo'
  const shouldAnimate = safeText.length > animateAfter

  if (!shouldAnimate) {
    return (
      <div className={`overflow-hidden whitespace-nowrap ${className}`}>
        <span className="inline-block min-w-0 max-w-full truncate align-middle">{safeText}</span>
      </div>
    )
  }

  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div
        className="inline-flex min-w-full items-center will-change-transform"
        style={{ animation: `windsound-marquee ${durationSeconds}s linear infinite` }}
      >
        <span className="shrink-0 pr-10">{safeText}</span>
        <span className="shrink-0 pr-10">{safeText}</span>
      </div>
    </div>
  )
}

const Player = () => {
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false)
  const [preferredMediaMode, setPreferredMediaMode] = useState<'music' | 'video'>('music')
  const [hasVideoClip, setHasVideoClip] = useState(false)
  const [videoClipVideoId, setVideoClipVideoId] = useState<string | null>(null)
  const [videoClipSourceVideoId, setVideoClipSourceVideoId] = useState<string | null>(null)
  const [videoResumeTime, setVideoResumeTime] = useState<number | null>(null)
  const [isCheckingVideo, setIsCheckingVideo] = useState(false)
  const [upcomingTracksCache, setUpcomingTracksCache] = useState<Track[]>([])
  const [shouldRenderExpanded, setShouldRenderExpanded] = useState(false)
  const [isExpandedVisible, setIsExpandedVisible] = useState(false)
  const {
    queue,
    currentIndex,
    isNowPlayingExpanded,
    isPlaying,
    isMuted,
    volume,
    shuffle,
    repeat,
    togglePlayState,
    setMuted,
    setVolume,
    setNowPlayingExpanded,
    toggleNowPlayingExpanded,
    playFromQueue,
    playNext,
    playPrevious,
    cycleRepeat,
    toggleShuffle,
  } = usePlayerStore((state) => ({
    queue: state.queue,
    currentIndex: state.currentIndex,
    isNowPlayingExpanded: state.isNowPlayingExpanded,
    isPlaying: state.isPlaying,
    isMuted: state.isMuted,
    volume: state.volume,
    shuffle: state.shuffle,
    repeat: state.repeat,
    togglePlayState: state.togglePlayState,
    setMuted: state.setMuted,
    setVolume: state.setVolume,
    setNowPlayingExpanded: state.setNowPlayingExpanded,
    toggleNowPlayingExpanded: state.toggleNowPlayingExpanded,
    playFromQueue: state.playFromQueue,
    playNext: state.playNext,
    playPrevious: state.playPrevious,
    cycleRepeat: state.cycleRepeat,
    toggleShuffle: state.toggleShuffle,
  }))

  const currentTrack = queue[currentIndex] ?? null
  const resolvedVideoClipBelongsToCurrentTrack = Boolean(
    currentTrack &&
      videoClipSourceVideoId === currentTrack.videoId &&
      hasVideoClip &&
      videoClipVideoId,
  )
  const effectiveMediaMode =
    preferredMediaMode === 'video' && resolvedVideoClipBelongsToCurrentTrack ? 'video' : 'music'
  const resolvedPlaybackVideoId =
    resolvedVideoClipBelongsToCurrentTrack && videoClipVideoId ? videoClipVideoId : null
  const playbackTrack =
    currentTrack && effectiveMediaMode === 'video' && resolvedPlaybackVideoId
      ? {
          ...currentTrack,
          videoId: resolvedPlaybackVideoId,
        }
      : currentTrack
  const shouldRenderVideoSurface = Boolean(
    currentTrack && isNowPlayingExpanded && effectiveMediaMode === 'video' && resolvedVideoClipBelongsToCurrentTrack,
  )
  const { isReady, statusText, currentTime, currentDuration, seekToTime, stopPlayback, playerSurfaceElementId } = useYouTubePlayer(
    playbackTrack,
    {
      showVideoSurface: shouldRenderVideoSurface,
      surfaceElementId: 'windsound-now-playing-video-surface',
      startAtSeconds: videoResumeTime ?? undefined,
    },
  )
  const upcomingTracks = useMemo(() => queue.slice(Math.max(currentIndex + 1, 0), currentIndex + 4), [currentIndex, queue])
  const visibleUpcomingTracks = useMemo(() => {
    const nextTracks = upcomingTracks.slice(0, 3)

    if (nextTracks.length >= 3) {
      return nextTracks
    }

    const usedVideoIds = new Set(nextTracks.map((track) => track.videoId))
    const fillerTracks = upcomingTracksCache.filter((track) => !usedVideoIds.has(track.videoId)).slice(0, 3 - nextTracks.length)

    return [...nextTracks, ...fillerTracks].slice(0, 3)
  }, [upcomingTracks, upcomingTracksCache])
  const activeDuration = currentDuration || playbackTrack?.duration || currentTrack?.duration || 0
  const progressMax = Math.max(activeDuration, 1)

  const repeatLabel = useMemo(() => {
    if (repeat === 'one') return 'Repeat one'
    if (repeat === 'all') return 'Repeat all'
    return 'Repeat off'
  }, [repeat])

  useEffect(() => {
    if (upcomingTracks.length > 0) {
      setUpcomingTracksCache((currentCache) => {
        const nextTracks = upcomingTracks.slice(0, 3)
        const usedVideoIds = new Set(nextTracks.map((track) => track.videoId))
        const fillerTracks = currentCache.filter((track) => !usedVideoIds.has(track.videoId)).slice(0, 3 - nextTracks.length)

        return [...nextTracks, ...fillerTracks].slice(0, 3)
      })
    }
  }, [upcomingTracks])

  useEffect(() => {
    if (currentTrack && isNowPlayingExpanded) {
      setShouldRenderExpanded(true)
      const frame = window.requestAnimationFrame(() => setIsExpandedVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }

    setIsExpandedVisible(false)

    const timeout = window.setTimeout(() => {
      setShouldRenderExpanded(false)
    }, 360)

    return () => window.clearTimeout(timeout)
  }, [currentTrack, isNowPlayingExpanded])

  useEffect(() => {
    setHasVideoClip(false)
    setVideoClipVideoId(null)
    setVideoClipSourceVideoId(null)
    setVideoResumeTime(null)

    if (!currentTrack) {
      setIsCheckingVideo(false)
      return
    }

    let cancelled = false
    setIsCheckingVideo(true)

    void resolveTrackVideoClip(currentTrack)
      .then((result) => {
        if (!cancelled) {
          setVideoClipSourceVideoId(currentTrack.videoId)
          setHasVideoClip(result.hasVideoClip)
          setVideoClipVideoId(result.clipVideoId)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingVideo(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentTrack?.videoId])

  return (
    <>
      <style>{`
        @keyframes windsound-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes windsound-now-playing-fade-in {
          0% {
            opacity: 0;
            transform: scale(0.975);
            filter: blur(18px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }
      `}</style>
      {currentTrack && shouldRenderExpanded ? (
        <section
          className={`fixed inset-0 z-40 overflow-hidden bg-[var(--color-bg)] transition-all duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isExpandedVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className={`absolute inset-0 blur-3xl transition-all duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpandedVisible ? 'opacity-35 scale-100' : 'opacity-0 scale-[1.06]'
            }`}
            style={{
              backgroundImage: `linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 42%, transparent), transparent 55%), url(${currentTrack.thumbnail})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div
            className={`absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_22%),linear-gradient(180deg,rgba(8,8,8,0.22),rgba(8,8,8,0.9)_55%,rgba(8,8,8,0.98))] transition-opacity duration-[360ms] ${
              isExpandedVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />

          <div
            className={`relative h-full px-8 pb-8 pt-10 transition-all duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpandedVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-[0.985] opacity-0'
            }`}
            style={isExpandedVisible ? { animation: 'windsound-now-playing-fade-in 420ms cubic-bezier(0.22,1,0.36,1)' } : undefined}
          >
            <button
              type="button"
              onClick={() => setNowPlayingExpanded(false)}
              className="absolute left-8 top-10 inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10 bg-white/5 text-[var(--color-text)] backdrop-blur-xl transition duration-150 hover:bg-white/10"
              aria-label="Fechar tela da musica"
            >
              <ChevronDown size={16} />
            </button>

            <aside className="absolute right-8 top-1/2 w-[250px] -translate-y-1/2 rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_18%,transparent)] p-2 backdrop-blur-[10px]">
              <div className="mb-4 flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[var(--color-subtext)]">
                <ListMusic size={14} />
                <span>Proximas da fila</span>
              </div>

              {visibleUpcomingTracks.length > 0 ? (
                <div className="space-y-2 overflow-y-auto pr-1">
                  {visibleUpcomingTracks.map((track, index) => (
                    <button
                      key={`${track.videoId}-${index}`}
                      type="button"
                      onClick={() => {
                        const queueIndex = queue.findIndex(
                          (queueTrack, queueTrackIndex) =>
                            queueTrackIndex > currentIndex && queueTrack.videoId === track.videoId,
                        )

                        if (queueIndex >= 0) {
                          playFromQueue(queueIndex)
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-[8px] px-2 py-3 text-left transition duration-150 hover:bg-white/5"
                    >
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        className="h-14 w-14 rounded-[8px] object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null
                          event.currentTarget.src = getReliableThumbnail(track.videoId, track.title)
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--color-text)]">{track.title}</p>
                        <p className="mt-1 truncate text-[11px] text-[var(--color-subtext)]">{track.channelTitle}</p>
                      </div>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-subtext)]">
                        {track.durationLabel}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-[12px] bg-white/5 px-4 py-5 text-[13px] leading-6 text-[var(--color-subtext)]">
                  A fila vai continuar aparecendo aqui conforme voce tocar mais musicas.
                </div>
              )}
            </aside>

            <div className="absolute left-1/2 top-1/2 w-full max-w-[840px] -translate-x-1/2 -translate-y-1/2 px-6">
              <div className="flex w-full flex-col items-center text-center">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--color-surface)_78%,transparent)] p-1 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setVideoResumeTime(currentTime)
                      setPreferredMediaMode('music')
                    }}
                    className={`${mediaToggleClass} ${
                      effectiveMediaMode === 'music'
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-subtext)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    Música
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (resolvedVideoClipBelongsToCurrentTrack) {
                        setVideoResumeTime(currentTime)
                        setPreferredMediaMode('video')
                      }
                    }}
                    disabled={!resolvedVideoClipBelongsToCurrentTrack}
                    className={`${mediaToggleClass} ${
                      effectiveMediaMode === 'video' && resolvedVideoClipBelongsToCurrentTrack
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-subtext)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-45'
                    }`}
                  >
                    Vídeo
                  </button>
                </div>

                <div
                  className={`relative overflow-hidden rounded-[12px] bg-[var(--color-surface)] shadow-[0_40px_100px_rgba(0,0,0,0.45)] ${
                    shouldRenderVideoSurface ? 'aspect-video w-full max-w-[820px]' : 'aspect-square w-full max-w-[500px]'
                  }`}
                >
                  {shouldRenderVideoSurface ? (
                    <div id={playerSurfaceElementId} className="h-full w-full" />
                  ) : (
                    <img
                      src={currentTrack.thumbnail}
                      alt={currentTrack.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.onerror = null
                        event.currentTarget.src = getReliableThumbnail(currentTrack.videoId, currentTrack.title)
                      }}
                    />
                  )}
                </div>

                <div className="mt-8 min-w-0">
                  <p className="mb-3 text-[12px] uppercase tracking-[0.24em] text-[var(--color-subtext)]">Tocando agora</p>
                  <MarqueeText
                    text={currentTrack.title}
                    animateAfter={18}
                    durationSeconds={20}
                    className="mx-auto max-w-[760px] text-4xl font-extrabold leading-tight text-[var(--color-text)] xl:text-6xl"
                  />
                  <p className="mx-auto mt-4 max-w-[620px] truncate text-lg text-[var(--color-subtext)] xl:text-2xl">
                    {currentTrack.channelTitle}
                  </p>
                  {currentTrack.album ? (
                    <p className="mt-2 text-[13px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
                      Album: {currentTrack.album}
                    </p>
                  ) : null}
                  {effectiveMediaMode === 'video' && !resolvedVideoClipBelongsToCurrentTrack && !isCheckingVideo ? (
                    <p className="mt-3 text-[12px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
                      Vídeo disponível só quando a faixa tiver clipe oficial.
                    </p>
                  ) : null}
                </div>

                <div className="mt-8 w-full max-w-[780px] rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_92%,transparent)] px-5 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={progressMax}
                      step={0.1}
                      value={currentTime}
                      onChange={(event) => seekToTime(Number(event.target.value))}
                      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[color:color-mix(in_srgb,var(--color-surface2)_82%,white_18%)] accent-[var(--color-accent)]"
                    />
                    <div className={timeInfoClass}>
                      <span>{formatTime(currentTime)}</span>
                      <span>/</span>
                      <span>{formatTime(activeDuration)}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-[160px_1fr_160px] items-center gap-4">
                    <div className="flex items-center justify-start gap-3">
                      <button
                        type="button"
                        onClick={() => setPlaylistPickerOpen(true)}
                        disabled={!currentTrack}
                        className={controlButtonClass}
                        aria-label="Adicionar musica a playlist"
                      >
                        <FolderPlus size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setMuted(!isMuted)}
                        className={controlButtonClass}
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
                        className="h-1 w-[110px] cursor-pointer appearance-none rounded-full bg-[var(--color-surface2)] accent-[var(--color-accent)]"
                      />
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={toggleShuffle}
                        className={`${controlButtonClass} ${shuffle ? 'bg-[var(--color-accent)] text-white' : ''}`}
                        aria-label="Shuffle"
                      >
                        <Shuffle size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={playPrevious}
                        className={controlButtonClass}
                        aria-label="Faixa anterior"
                      >
                        <SkipBack size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={togglePlayState}
                        className="rounded-[8px] bg-[var(--color-accent)] p-3 text-white transition duration-150 hover:scale-[0.98] hover:bg-[var(--color-accent2)]"
                        aria-label={isPlaying ? 'Pausar' : 'Tocar'}
                      >
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                      </button>
                      <button
                        type="button"
                        onClick={stopPlayback}
                        className={controlButtonClass}
                        aria-label="Parar"
                      >
                        <Square size={16} fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void playNext()}
                        className={controlButtonClass}
                        aria-label="Proxima faixa"
                      >
                        <SkipForward size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={cycleRepeat}
                        className={`${controlButtonClass} ${repeat !== 'off' ? 'bg-[var(--color-accent)] text-white' : ''}`}
                        aria-label={repeatLabel}
                      >
                        {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                      </button>
                    </div>

                    <div />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="fixed bottom-4 left-[264px] right-4 z-30 rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_92%,transparent)] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[74px] max-w-[calc(100vw-292px)] flex-col justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={progressMax}
              step={0.1}
              value={currentTime}
              onChange={(event) => seekToTime(Number(event.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[color:color-mix(in_srgb,var(--color-surface2)_82%,white_18%)] accent-[var(--color-accent)]"
            />
            <div className={timeInfoClass}>
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(activeDuration)}</span>
              {!isReady ? (
                <>
                  <span>•</span>
                  <span>{statusText}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
            <button
              type="button"
              disabled={!currentTrack}
              onClick={() => currentTrack && toggleNowPlayingExpanded()}
              className="flex min-w-0 items-center gap-3 text-left transition duration-150 disabled:cursor-default xl:max-w-[340px]"
            >
              {currentTrack ? (
                <>
                  <img
                    src={currentTrack.thumbnail}
                    alt={currentTrack.title}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-[7px] object-cover"
                    onError={(event) => {
                      event.currentTarget.onerror = null
                      event.currentTarget.src = getReliableThumbnail(currentTrack.videoId, currentTrack.title)
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
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleShuffle}
                className={`${controlButtonClass} ${shuffle ? 'bg-[var(--color-accent)] text-white' : ''}`}
                aria-label="Shuffle"
              >
                <Shuffle size={16} />
              </button>
              <button
                type="button"
                onClick={playPrevious}
                className={controlButtonClass}
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
                className={controlButtonClass}
                aria-label="Parar"
              >
                <Square size={16} fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={() => void playNext()}
                className={controlButtonClass}
                aria-label="Proxima faixa"
              >
                <SkipForward size={16} />
              </button>
              <button
                type="button"
                onClick={cycleRepeat}
                className={`${controlButtonClass} ${repeat !== 'off' ? 'bg-[var(--color-accent)] text-white' : ''}`}
                aria-label={repeatLabel}
              >
                {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
              </button>
            </div>

            <div className="flex items-center gap-3 xl:justify-self-end">
              <button
                type="button"
                onClick={() => setPlaylistPickerOpen(true)}
                className={controlButtonClass}
                aria-label="Adicionar musica a playlist"
                disabled={!currentTrack}
              >
                <FolderPlus size={16} />
              </button>
              <button
                type="button"
                onClick={() => setMuted(!isMuted)}
                className={controlButtonClass}
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
      </footer>

      <PlaylistPicker
        track={currentTrack}
        open={playlistPickerOpen && Boolean(currentTrack)}
        onClose={() => setPlaylistPickerOpen(false)}
      />
    </>
  )
}

export default Player
