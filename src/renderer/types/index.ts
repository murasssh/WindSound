export type RepeatMode = 'off' | 'one' | 'all'
export type QualityOption = 'auto' | 'small' | 'medium' | 'large' | 'hd720'
export type AppView = 'home' | 'search' | 'queue' | 'settings'

export interface AccountStatus {
  connected: boolean
  source: 'cookie-session' | 'local-mock'
  message: string
  displayName?: string
  avatarUrl?: string | null
}

export interface ThemeTokens {
  bg: string
  surface: string
  surface2: string
  border: string
  accent: string
  accent2: string
  text: string
  subtext: string
  waveform: string
}

export interface ThemeConfig {
  id: string
  label: string
  colors: ThemeTokens
}

export interface Track {
  id: string
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
  duration: number
  durationLabel: string
  album?: string
}

export interface SearchResult extends Track {
  album?: string
}

export interface SearchPlaylistResult {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  browseId: string
  itemType: 'playlist'
}

export type SearchCatalogResult = SearchResult | SearchPlaylistResult

export interface VideoDetails {
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
  duration: number
  durationLabel: string
  streamUrl?: string | null
}

export interface HomeSectionItem {
  id: string
  title: string
  subtitle: string
  thumbnail: string
  videoId?: string
  browseId?: string
}

export interface HomeSection {
  id: string
  title: string
  items: HomeSectionItem[]
}

export interface HomeFeed {
  accountStatus: AccountStatus
  recommendations: RecommendationItem[]
  playlistSections: HomeSection[]
  songSections: HomeSection[]
}

export interface RecommendationItem extends Track {
  reason: string
}

export interface PlayerStore {
  queue: Track[]
  currentIndex: number
  isPlaying: boolean
  isMuted: boolean
  volume: number
  progress: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  theme: ThemeConfig
  showVideo: boolean
  autoPlayNext: boolean
  quality: QualityOption
  currentView: AppView
  accountStatus: AccountStatus
  setCurrentView: (view: AppView) => void
  setAccountStatus: (status: AccountStatus) => void
  addToQueue: (track: Track) => void
  playTrack: (track: Track) => Promise<void>
  startPlaylist: (tracks: Track[], startIndex?: number) => void
  playFromQueue: (index: number) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  moveTrack: (oldIndex: number, newIndex: number) => void
  setIsPlaying: (isPlaying: boolean) => void
  togglePlayState: () => void
  setMuted: (isMuted: boolean) => void
  setVolume: (volume: number) => void
  setProgress: (progress: number) => void
  setDuration: (duration: number) => void
  playNext: () => Promise<void>
  playPrevious: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  setTheme: (theme: ThemeConfig) => void
  updateThemeColor: (key: keyof ThemeTokens, value: string) => void
  resetTheme: () => void
  setShowVideo: (value: boolean) => void
  setAutoPlayNext: (value: boolean) => void
  setQuality: (value: QualityOption) => void
}
