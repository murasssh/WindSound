export {}

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface WindSoundUpdateStatus {
    available: boolean
    installerReady: boolean
    currentVersion: string
    currentCommitSha: string
    latestCommitSha: string | null
    latestCommitMessage: string | null
    latestPublishedAt: string | null
    latestReleaseName: string | null
  }

  interface Window {
    onYouTubeIframeAPIReady?: () => void
    YT?: typeof YT
    windsound?: {
      platform: string
      ping: () => Promise<{ ok: boolean }>
      innertubeRequest: (endpoint: string, payload: Record<string, unknown>) => Promise<unknown>
      buildRadioQueue: (
        seed: { videoId: string; title: string; channelTitle: string; album?: string },
        limit?: number,
      ) => Promise<
        Array<{
          id: string
          videoId: string
          title: string
          channelTitle: string
          thumbnail: string
          duration: number
          durationLabel: string
          album?: string
        }>
      >
      primePlayback: (videoId: string, fallbackUrl: string) => Promise<boolean>
      getUpdateStatus: () => Promise<WindSoundUpdateStatus>
      launchUpdateInstaller: () => Promise<{ ok: boolean }>
      createStreamUrl: (streamUrl: string) => string
      createPlaybackUrl: (videoId: string) => string
      getAuthStatus: () => Promise<{
        connected: boolean
        source: 'cookie-session' | 'local-mock'
        message: string
        displayName?: string
        avatarUrl?: string | null
      }>
      connectAccount: () => Promise<{
        connected: boolean
        source: 'cookie-session' | 'local-mock'
        message: string
        displayName?: string
        avatarUrl?: string | null
      }>
      disconnectAccount: () => Promise<{
        connected: boolean
        source: 'cookie-session' | 'local-mock'
        message: string
        displayName?: string
        avatarUrl?: string | null
      }>
    }
  }

  namespace YT {
    interface PlayerVars {
      autoplay?: 0 | 1
      controls?: 0 | 1
      rel?: 0 | 1
      modestbranding?: 0 | 1
      playsinline?: 0 | 1
      origin?: string
    }

    interface PlayerEvent {
      target: Player
      data: number
    }

    interface PlayerOptions {
      height?: string
      width?: string
      videoId?: string
      host?: string
      playerVars?: PlayerVars
      events?: {
        onReady?: (event: PlayerEvent) => void
        onStateChange?: (event: PlayerEvent) => void
      }
    }

    interface CueVideoOptions {
      videoId: string
      suggestedQuality?: string
    }

    class Player {
      constructor(container: string | HTMLElement, options: PlayerOptions)
      cueVideoById(options: CueVideoOptions): void
      loadVideoById(options: CueVideoOptions): void
      playVideo(): void
      pauseVideo(): void
      stopVideo(): void
      mute(): void
      unMute(): void
      setVolume(volume: number): void
      setPlaybackQuality(suggestedQuality: string): void
      getDuration(): number
      getCurrentTime(): number
      seekTo(seconds: number, allowSeekAhead?: boolean): void
      destroy(): void
    }

    const PlayerState: {
      UNSTARTED: -1
      ENDED: 0
      PLAYING: 1
      PAUSED: 2
      BUFFERING: 3
      CUED: 5
    }
  }
}
