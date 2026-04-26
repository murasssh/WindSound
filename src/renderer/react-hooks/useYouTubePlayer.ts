import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '@/state/playerStore'
import type { QualityOption, RepeatMode, Track } from '@/types'

const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'
const PLAYER_ELEMENT_ID = 'windsound-audio-player'
const PLAYER_SURFACE_ELEMENT_ID = 'windsound-audio-player-surface'
const PLAYER_HOSTS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'] as const
const QUALITY_TO_YT: Record<QualityOption, string | undefined> = {
  auto: undefined,
  small: 'small',
  medium: 'medium',
  large: 'large',
  hd720: 'hd720',
}

let iframeApiPromise: Promise<typeof YT> | null = null

const ensureIframeApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Janela indisponivel'))
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (iframeApiPromise) {
    return iframeApiPromise
  }

  iframeApiPromise = new Promise<typeof YT>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_IFRAME_API_SRC}"]`)

    window.onYouTubeIframeAPIReady = () => {
      if (window.YT?.Player) {
        resolve(window.YT)
        return
      }

      reject(new Error('YouTube Iframe API carregou sem Player'))
    }

    if (!existingScript) {
      const script = document.createElement('script')
      script.src = YOUTUBE_IFRAME_API_SRC
      script.async = true
      script.onerror = () => reject(new Error('Falha ao carregar YouTube Iframe API'))
      document.head.appendChild(script)
    }
  })

  return iframeApiPromise
}

const ensurePlayerHostElement = () => {
  let element = document.getElementById(PLAYER_ELEMENT_ID)

  if (!element) {
    element = document.createElement('div')
    element.id = PLAYER_ELEMENT_ID
    element.style.position = 'fixed'
    element.style.left = '-9999px'
    element.style.top = '0'
    element.style.width = '1px'
    element.style.height = '1px'
    element.style.pointerEvents = 'none'
    element.style.opacity = '0'
    document.body.appendChild(element)
  }

  return element
}

export const useYouTubePlayer = (
  track: Track | null,
  options?: {
    showVideoSurface?: boolean
    surfaceElementId?: string
    startAtSeconds?: number
  },
) => {
  const playerRef = useRef<YT.Player | null>(null)
  const trackIdRef = useRef<string | null>(null)
  const expectedVideoIdRef = useRef<string | null>(track?.videoId ?? null)
  const trackTransitionTokenRef = useRef(0)
  const playerReadyRef = useRef(false)
  const progressTimerRef = useRef<number | null>(null)
  const playbackRecoveryTimerRef = useRef<number | null>(null)
  const playbackReloadTimerRef = useRef<number | null>(null)
  const autoplayRequestedRef = useRef(false)
  const internalPauseRef = useRef(false)
  const transitionPlaybackRef = useRef(false)
  const triedAlternateHostRef = useRef(false)
  const activeHostIndexRef = useRef(0)
  const repeatRef = useRef<RepeatMode>('off')
  const autoPlayNextRef = useRef(true)
  const qualityRef = useRef<QualityOption>('auto')
  const trackRef = useRef<Track | null>(track)
  const pendingStartAtRef = useRef<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [statusText, setStatusText] = useState('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [currentDuration, setCurrentDuration] = useState(track?.duration || 0)

  const {
    isPlaying,
    isMuted,
    volume,
    repeat,
    autoPlayNext,
    quality,
    setIsPlaying,
    setProgress,
    setDuration,
    playNext,
  } = usePlayerStore((state) => ({
    isPlaying: state.isPlaying,
    isMuted: state.isMuted,
    volume: state.volume,
    repeat: state.repeat,
    autoPlayNext: state.autoPlayNext,
    quality: state.quality,
    setIsPlaying: state.setIsPlaying,
    setProgress: state.setProgress,
    setDuration: state.setDuration,
    playNext: state.playNext,
  }))

  const stopProgressTimer = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }

  const clearPlaybackRecoveryTimers = () => {
    if (playbackRecoveryTimerRef.current !== null) {
      window.clearTimeout(playbackRecoveryTimerRef.current)
      playbackRecoveryTimerRef.current = null
    }

    if (playbackReloadTimerRef.current !== null) {
      window.clearTimeout(playbackReloadTimerRef.current)
      playbackReloadTimerRef.current = null
    }
  }

  const applyPlayerElementMode = () => {
    const element = ensurePlayerHostElement()
    const shouldShowVideo = Boolean(trackRef.current && options?.showVideoSurface)
    const surfaceElement = document.getElementById(options?.surfaceElementId ?? PLAYER_SURFACE_ELEMENT_ID)

    if (!shouldShowVideo) {
      if (element.parentElement !== document.body) {
        document.body.appendChild(element)
      }

      element.style.position = 'fixed'
      element.style.left = '-9999px'
      element.style.top = '0'
      element.style.width = '1px'
      element.style.height = '1px'
      element.style.pointerEvents = 'none'
      element.style.opacity = '0'
      element.style.zIndex = '0'
      element.style.borderRadius = '0'
      element.style.overflow = 'hidden'
      element.style.boxShadow = 'none'
      element.style.background = 'transparent'
      element.style.transform = 'none'
      return
    }

    if (surfaceElement) {
      if (element.parentElement !== surfaceElement) {
        surfaceElement.innerHTML = ''
        surfaceElement.appendChild(element)
      }

      element.style.position = 'relative'
      element.style.left = '0'
      element.style.top = '0'
      element.style.right = 'auto'
      element.style.bottom = 'auto'
      element.style.width = '100%'
      element.style.height = '100%'
      element.style.transform = 'none'
      element.style.pointerEvents = 'none'
      element.style.opacity = '1'
      element.style.zIndex = '1'
      element.style.borderRadius = '0'
      element.style.overflow = 'hidden'
      element.style.boxShadow = 'none'
      element.style.background = '#050505'
      return
    }

    if (element.parentElement !== document.body) {
      document.body.appendChild(element)
    }

    element.style.position = 'fixed'
    element.style.left = 'auto'
    element.style.top = 'auto'
    element.style.right = '50%'
    element.style.bottom = '50%'
    element.style.width = '500px'
    element.style.height = '500px'
    element.style.transform = 'translate(50%, 50%)'
    element.style.pointerEvents = 'auto'
    element.style.opacity = '1'
    element.style.zIndex = '35'
    element.style.borderRadius = '18px'
    element.style.overflow = 'hidden'
    element.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.45)'
    element.style.background = '#050505'
  }

  const applyPreferredQuality = (player: YT.Player) => {
    const preferredQuality = QUALITY_TO_YT[qualityRef.current]

    if (!preferredQuality || typeof player.setPlaybackQuality !== 'function') {
      return
    }

    player.setPlaybackQuality(preferredQuality)
  }

  const syncProgress = () => {
    const player = playerRef.current
    const activeTrack = trackRef.current

    if (!player || typeof player.getCurrentTime !== 'function') {
      return
    }

    const nextCurrentTime = player.getCurrentTime() || 0
    const nextDuration = player.getDuration() || activeTrack?.duration || 0

    setCurrentTime(nextCurrentTime)
    setCurrentDuration(nextDuration)
    setDuration(nextDuration)

    if (nextDuration > 0) {
      setProgress((nextCurrentTime / nextDuration) * 100)
    }
  }

  const startProgressTimer = () => {
    stopProgressTimer()
    syncProgress()
    progressTimerRef.current = window.setInterval(syncProgress, 250)
  }

  const destroyCurrentPlayer = () => {
    stopProgressTimer()
    clearPlaybackRecoveryTimers()

    if (playerRef.current) {
      playerRef.current.destroy()
      playerRef.current = null
    }

    playerReadyRef.current = false
  }

  const schedulePlaybackRecovery = (player: YT.Player) => {
    clearPlaybackRecoveryTimers()

    if (!usePlayerStore.getState().isPlaying || !trackRef.current) {
      return
    }

    playbackRecoveryTimerRef.current = window.setTimeout(() => {
      try {
        const state = (player as YT.Player & { getPlayerState?: () => number }).getPlayerState?.()

        if (state !== YT.PlayerState.PLAYING && usePlayerStore.getState().isPlaying) {
          player.playVideo()
        }
      } catch (error) {
        console.error('WindSound playback recovery retry failed:', error)
      }
    }, 1200)

    playbackReloadTimerRef.current = window.setTimeout(() => {
      try {
        const state = (player as YT.Player & { getPlayerState?: () => number }).getPlayerState?.()

        if (state !== YT.PlayerState.PLAYING && usePlayerStore.getState().isPlaying) {
          loadCurrentTrackIntoPlayer(player, 'load')
        }
      } catch (error) {
        console.error('WindSound playback reload retry failed:', error)
      }
    }, 2800)
  }

  const syncPlayerTransport = (player: YT.Player) => {
    player.setVolume(volume)

    if (isMuted) {
      player.mute()
      return
    }

    player.unMute()
  }

  const getPlayerVideoId = (player: YT.Player) => {
    try {
      const data = (player as YT.Player & { getVideoData?: () => { video_id?: string } }).getVideoData?.()
      return data?.video_id ?? null
    } catch {
      return null
    }
  }

  const isCurrentPlayerEvent = (player: YT.Player) => {
    const expectedVideoId = expectedVideoIdRef.current

    if (!expectedVideoId) {
      return true
    }

    const playerVideoId = getPlayerVideoId(player)

    if (!playerVideoId) {
      return true
    }

    return playerVideoId === expectedVideoId
  }

  const loadCurrentTrackIntoPlayer = (player: YT.Player, mode: 'load' | 'cue') => {
    const activeTrack = trackRef.current

    if (!activeTrack) {
      return
    }

    trackTransitionTokenRef.current += 1
    expectedVideoIdRef.current = activeTrack.videoId
    transitionPlaybackRef.current = mode === 'load' || autoplayRequestedRef.current || usePlayerStore.getState().isPlaying
    trackIdRef.current = activeTrack.videoId
    const startSeconds = pendingStartAtRef.current ?? undefined
    pendingStartAtRef.current = null
    setIsReady(false)
    setStatusText(mode === 'load' ? 'loading video' : 'cueing video')
    setCurrentTime(startSeconds ?? 0)
    setCurrentDuration(activeTrack.duration || 0)
    setProgress(0)
    setDuration(activeTrack.duration || 0)

    const suggestedQuality = QUALITY_TO_YT[qualityRef.current]

    if (mode === 'load') {
      player.loadVideoById({
        videoId: activeTrack.videoId,
        startSeconds,
        suggestedQuality,
      } as any)
      return
    }

    player.cueVideoById({
      videoId: activeTrack.videoId,
      startSeconds,
      suggestedQuality,
    } as any)
  }

  useEffect(() => {
    trackRef.current = track
    expectedVideoIdRef.current = track?.videoId ?? null
  }, [track])

  useEffect(() => {
    const nextStartAt =
      typeof options?.startAtSeconds === 'number' && Number.isFinite(options.startAtSeconds) && options.startAtSeconds > 0
        ? options.startAtSeconds
        : 0

    setCurrentTime(nextStartAt)
    setCurrentDuration(track?.duration || 0)
    setProgress(0)
    setDuration(track?.duration || 0)

    if (!track) {
      setStatusText('idle')
      setIsReady(false)
      setCurrentDuration(0)
    }
  }, [options?.startAtSeconds, track?.duration, track?.videoId, setDuration, setProgress])

  useEffect(() => {
    if (typeof options?.startAtSeconds === 'number' && Number.isFinite(options.startAtSeconds) && options.startAtSeconds > 0) {
      pendingStartAtRef.current = options.startAtSeconds
    }
  }, [options?.startAtSeconds, track?.videoId])

  useEffect(() => {
    repeatRef.current = repeat
  }, [repeat])

  useEffect(() => {
    autoPlayNextRef.current = autoPlayNext
  }, [autoPlayNext])

  useEffect(() => {
    qualityRef.current = quality
  }, [quality])

  useEffect(() => {
    let cancelled = false

    const bootstrapPlayer = async () => {
      const YTApi = await ensureIframeApi()

      if (cancelled) {
        return
      }

      ensurePlayerHostElement()
      applyPlayerElementMode()
      destroyCurrentPlayer()

      const host = PLAYER_HOSTS[activeHostIndexRef.current]

      playerRef.current = new YTApi.Player(PLAYER_ELEMENT_ID, {
        height: '1',
        width: '1',
        host,
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            const currentPlayer = playerRef.current

            if (!currentPlayer) {
              return
            }

            playerReadyRef.current = true
            setIsReady(true)
            setStatusText('ready')
            syncPlayerTransport(currentPlayer)
            applyPreferredQuality(currentPlayer)

            if (trackRef.current) {
              loadCurrentTrackIntoPlayer(currentPlayer, usePlayerStore.getState().isPlaying ? 'load' : 'cue')
            }
          },
          onStateChange: (event) => {
            const currentPlayer = playerRef.current
            const activeTrack = trackRef.current
            const transitionToken = trackTransitionTokenRef.current

            if (!currentPlayer) {
              return
            }

            if (!isCurrentPlayerEvent(currentPlayer) && event.data !== YTApi.PlayerState.UNSTARTED) {
              return
            }

            if (event.data === YTApi.PlayerState.PLAYING) {
              clearPlaybackRecoveryTimers()
              transitionPlaybackRef.current = false
              setIsReady(true)
              setStatusText('playing')
              setIsPlaying(true)
              startProgressTimer()
              return
            }

            if (event.data === YTApi.PlayerState.BUFFERING) {
              setStatusText('buffering')
              schedulePlaybackRecovery(currentPlayer)
              return
            }

            if (event.data === YTApi.PlayerState.PAUSED) {
              stopProgressTimer()
              clearPlaybackRecoveryTimers()

              if (internalPauseRef.current) {
                internalPauseRef.current = false
                return
              }

               if (transitionPlaybackRef.current) {
                return
              }

              setStatusText('paused')
              setIsPlaying(false)
              return
            }

            if (event.data === YTApi.PlayerState.ENDED) {
              stopProgressTimer()
              clearPlaybackRecoveryTimers()
              setProgress(100)

              if (repeatRef.current === 'one') {
                transitionPlaybackRef.current = true
                currentPlayer.seekTo(0, true)
                currentPlayer.playVideo()
                return
              }

              if (autoPlayNextRef.current) {
                transitionPlaybackRef.current = true
                window.setTimeout(() => {
                  if (trackTransitionTokenRef.current === transitionToken) {
                    void playNext()
                  }
                }, 0)
                return
              }

              setStatusText('ended')
              setIsPlaying(false)
              return
            }

            if (event.data === YTApi.PlayerState.UNSTARTED) {
              setStatusText('starting')
              transitionPlaybackRef.current = true
              schedulePlaybackRecovery(currentPlayer)
              return
            }

            if (event.data === YTApi.PlayerState.CUED) {
              const nextDuration = currentPlayer.getDuration() || activeTrack?.duration || 0
              setCurrentDuration(nextDuration)
              setDuration(nextDuration)
              setCurrentTime(0)
              setProgress(0)
              setIsReady(true)
              setStatusText('ready')
              applyPreferredQuality(currentPlayer)

              if (autoplayRequestedRef.current || usePlayerStore.getState().isPlaying) {
                autoplayRequestedRef.current = false
                transitionPlaybackRef.current = true
                currentPlayer.playVideo()
                schedulePlaybackRecovery(currentPlayer)
                return
              }

              transitionPlaybackRef.current = false
            }
          },
          onError: async (event: { data: number }) => {
            stopProgressTimer()
            clearPlaybackRecoveryTimers()
            transitionPlaybackRef.current = false
            console.error(
              '[WindSound youtube iframe] error',
              JSON.stringify({
                code: event.data,
                videoId: trackIdRef.current,
                host: PLAYER_HOSTS[activeHostIndexRef.current],
              }),
            )

            if (event.data === 5 && !triedAlternateHostRef.current) {
              triedAlternateHostRef.current = true
              activeHostIndexRef.current = activeHostIndexRef.current === 0 ? 1 : 0
              setStatusText('retrying youtube host')
              await bootstrapPlayer()
              return
            }

            setStatusText(`youtube error ${event.data}`)
            setIsPlaying(false)
          },
        } as YT.PlayerOptions['events'] & { onError: (event: { data: number }) => void },
      })
    }

    void bootstrapPlayer().catch((error) => {
      console.error('WindSound iframe bootstrap error:', error)
      setStatusText(error instanceof Error ? error.message : 'Falha no player do YouTube')
    })

    return () => {
      cancelled = true
      destroyCurrentPlayer()
    }
  }, [options?.showVideoSurface, playNext, setDuration, setIsPlaying, setProgress, track?.videoId])

  useEffect(() => {
    applyPlayerElementMode()
  }, [options?.showVideoSurface, track])

  useEffect(() => {
    const player = playerRef.current

    if (!player || !playerReadyRef.current) {
      return
    }

    if (!track) {
      trackIdRef.current = null
      expectedVideoIdRef.current = null
      internalPauseRef.current = true
      transitionPlaybackRef.current = false
      clearPlaybackRecoveryTimers()
      player.stopVideo()
      stopProgressTimer()
      setIsReady(false)
      setStatusText('idle')
      setCurrentTime(0)
      setCurrentDuration(0)
      setProgress(0)
      setDuration(0)
      return
    }

    if (trackIdRef.current === track.videoId) {
      return
    }

    triedAlternateHostRef.current = false
    clearPlaybackRecoveryTimers()
    autoplayRequestedRef.current = usePlayerStore.getState().isPlaying
    transitionPlaybackRef.current = autoplayRequestedRef.current
    loadCurrentTrackIntoPlayer(player, 'load')
  }, [track, setDuration, setProgress])

  useEffect(() => {
    const player = playerRef.current

    if (!player || !playerReadyRef.current) {
      return
    }

    if (isMuted) {
      player.mute()
      return
    }

    player.unMute()
  }, [isMuted])

  useEffect(() => {
    const player = playerRef.current

    if (!player || !playerReadyRef.current) {
      return
    }

    player.setVolume(volume)
  }, [volume])

  useEffect(() => {
    const player = playerRef.current

    if (!player || !playerReadyRef.current) {
      return
    }

    applyPreferredQuality(player)
  }, [quality])

  useEffect(() => {
    const player = playerRef.current

    if (!player || !playerReadyRef.current || !trackIdRef.current) {
      return
    }

    if (isPlaying) {
      transitionPlaybackRef.current = true
      player.playVideo()
      schedulePlaybackRecovery(player)
      return
    }

    transitionPlaybackRef.current = false
    clearPlaybackRecoveryTimers()
    internalPauseRef.current = true
    player.pauseVideo()
  }, [isPlaying])

  const seekToPercent = (percent: number) => {
    const player = playerRef.current
    const duration = player?.getDuration() || 0

    if (!player || duration <= 0) {
      return
    }

    const seconds = (duration * percent) / 100
    player.seekTo(seconds, true)
    setCurrentTime(seconds)
    setProgress(percent)
  }

  const seekToTime = (seconds: number) => {
    const player = playerRef.current
    const duration = player?.getDuration() || 0

    if (!player || duration <= 0) {
      return
    }

    const safeTime = Math.max(0, Math.min(duration, seconds))
    player.seekTo(safeTime, true)
    setCurrentTime(safeTime)
    setProgress((safeTime / duration) * 100)
  }

  const stopPlayback = () => {
    const player = playerRef.current

    if (!player) {
      return
    }

    stopProgressTimer()
    clearPlaybackRecoveryTimers()
    transitionPlaybackRef.current = false
    internalPauseRef.current = true
    player.stopVideo()
    setCurrentTime(0)
    setCurrentDuration(0)
    setIsPlaying(false)
    setProgress(0)
    setStatusText('stopped')
  }

  return {
    isReady,
    statusText,
    currentTime,
    currentDuration,
    seekToPercent,
    seekToTime,
    stopPlayback,
    playerElementId: PLAYER_ELEMENT_ID,
    playerSurfaceElementId: options?.surfaceElementId ?? PLAYER_SURFACE_ELEMENT_ID,
  }
}
