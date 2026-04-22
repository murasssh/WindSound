import { useEffect, useRef, useState } from 'react'
import { getVideoDetails } from '@/integrations/youtube'
import { usePlayerStore } from '@/state/playerStore'
import type { RepeatMode, Track } from '@/types'

export const useYouTubePlayer = (track: Track | null) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackIdRef = useRef<string | null>(null)
  const currentStreamRef = useRef<string | null>(null)
  const autoplayRequestedRef = useRef(false)
  const repeatRef = useRef<RepeatMode>('off')
  const autoPlayNextRef = useRef(true)
  const [isReady, setIsReady] = useState(false)
  const [statusText, setStatusText] = useState('idle')
  const [currentTime, setCurrentTime] = useState(0)

  const {
    isPlaying,
    isMuted,
    volume,
    repeat,
    autoPlayNext,
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
    setIsPlaying: state.setIsPlaying,
    setProgress: state.setProgress,
    setDuration: state.setDuration,
    playNext: state.playNext,
  }))

  const attemptPlay = async (audio: HTMLAudioElement, origin: 'auto' | 'manual') => {
    if (!audio.src) {
      setStatusText('sem stream')
      return
    }

    if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      autoplayRequestedRef.current = true
      setStatusText('buffering')
      return
    }

    try {
      await audio.play()
      setStatusText('playing')
      setIsPlaying(true)
    } catch (error) {
      console.error(`WindSound audio play ${origin} error:`, error)
      setIsPlaying(false)
      setStatusText(origin === 'auto' ? 'pressione play' : 'play failed')
    }
  }

  useEffect(() => {
    repeatRef.current = repeat
  }, [repeat])

  useEffect(() => {
    autoPlayNextRef.current = autoPlayNext
  }, [autoPlayNext])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
      setCurrentTime(audio.currentTime)
      setIsReady(true)
      setStatusText('ready')
    }

    const handleCanPlay = () => {
      if (autoplayRequestedRef.current || usePlayerStore.getState().isPlaying) {
        autoplayRequestedRef.current = false
        void attemptPlay(audio, 'auto')
      }
    }

    const handleWaiting = () => {
      setStatusText('buffering')
    }

    const handleLoadStart = () => {
      setIsReady(false)
      setStatusText('loading stream')
    }

    const handleError = () => {
      const mediaError = audio.error
      console.error('[WindSound audio] media error', {
        code: mediaError?.code,
        message: mediaError?.message,
        readyState: audio.readyState,
        networkState: audio.networkState,
        src: audio.currentSrc || audio.src,
      })
      const message =
        mediaError?.code === MediaError.MEDIA_ERR_ABORTED
          ? 'stream abortado'
          : mediaError?.code === MediaError.MEDIA_ERR_NETWORK
            ? 'erro de rede no stream'
            : mediaError?.code === MediaError.MEDIA_ERR_DECODE
              ? 'erro ao decodificar audio'
              : mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                ? 'formato nao suportado'
                : 'stream failed'

      setStatusText(message)
      setIsPlaying(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      if (audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
    }

    const handleEnded = () => {
      setProgress(100)

      if (repeatRef.current === 'one') {
        audio.currentTime = 0
        void attemptPlay(audio, 'auto')
        return
      }

      if (autoPlayNextRef.current) {
        playNext()
        return
      }

      setIsPlaying(false)
      setStatusText('ended')
    }

    const handlePause = () => {
      if (!audio.ended) {
        setStatusText('paused')
      }
      setIsPlaying(false)
    }

    const handlePlay = () => {
      setStatusText('playing')
      setIsPlaying(true)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('error', handleError)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('play', handlePlay)

    return () => {
      audio.pause()
      audio.src = ''
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('play', handlePlay)
      audioRef.current = null
    }
  }, [playNext, setDuration, setIsPlaying, setProgress])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (!track) {
      trackIdRef.current = null
      currentStreamRef.current = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      setIsReady(false)
      setStatusText('idle')
      setCurrentTime(0)
      setProgress(0)
      setDuration(0)
      return
    }

    if (trackIdRef.current === track.videoId) {
      return
    }

    let cancelled = false
    trackIdRef.current = track.videoId
    currentStreamRef.current = null
    autoplayRequestedRef.current = usePlayerStore.getState().isPlaying
    setIsReady(false)
    setStatusText('loading stream')
    setCurrentTime(0)
    setProgress(0)

    getVideoDetails(track.videoId)
      .then((details) => {
        if (cancelled || !details.streamUrl) {
          return
        }

        currentStreamRef.current = details.streamUrl
        audio.pause()
        audio.src = details.streamUrl
        audio.currentTime = 0
        setDuration(details.duration)
        setStatusText('buffering')
        audio.load()
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('WindSound stream error:', error)
          setStatusText(error instanceof Error ? error.message : 'stream failed')
          setIsPlaying(false)
          autoplayRequestedRef.current = false
        }
      })

    return () => {
      cancelled = true
    }
  }, [track, setDuration, setIsPlaying, setProgress])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    audio.volume = volume / 100
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    audio.muted = isMuted
  }, [isMuted])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio || !currentStreamRef.current) {
      return
    }

    if (isPlaying) {
      void attemptPlay(audio, 'manual')
    } else {
      audio.pause()
    }
  }, [isPlaying])

  const seekToPercent = (percent: number) => {
    const audio = audioRef.current

    if (!audio || !audio.duration) {
      return
    }

    audio.currentTime = (audio.duration * percent) / 100
    setProgress(percent)
  }

  const seekToTime = (seconds: number) => {
    const audio = audioRef.current

    if (!audio || !audio.duration) {
      return
    }

    const safeTime = Math.max(0, Math.min(audio.duration, seconds))
    audio.currentTime = safeTime
    setCurrentTime(safeTime)
    setProgress((safeTime / audio.duration) * 100)
  }

  const stopPlayback = () => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    autoplayRequestedRef.current = false
    audio.pause()
    audio.currentTime = 0
    setCurrentTime(0)
    setIsPlaying(false)
    setProgress(0)
    setStatusText('stopped')
  }

  return {
    isReady,
    statusText,
    currentTime,
    seekToPercent,
    seekToTime,
    stopPlayback,
    playerElementId: 'windsound-audio-player',
  }
}
