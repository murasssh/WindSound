import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultTheme } from '@/theme/theme'
import { buildSmartQueue, getRadioCandidate } from '@/integrations/youtube'
import type { LocalPlaylist, PlayerStore, ThemeTokens, Track, YouTubePlaylist } from '@/types'

const pickRandomIndex = (queue: Track[], currentIndex: number) => {
  if (queue.length <= 1) {
    return currentIndex
  }

  let nextIndex = currentIndex

  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * queue.length)
  }

  return nextIndex
}

const now = () => Date.now()

const createPlaylistId = () =>
  `playlist-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`

const uniqueTracks = (tracks: Track[]) => {
  const seen = new Set<string>()

  return tracks.filter((track) => {
    if (seen.has(track.videoId)) {
      return false
    }

    seen.add(track.videoId)
    return true
  })
}

const sanitizePlaylistTracks = (tracks: Track[]) => uniqueTracks(tracks.filter(Boolean))

const createYouTubeBackedPlaylist = (
  playlist: YouTubePlaylist,
  existing?: LocalPlaylist,
): LocalPlaylist => ({
  id: existing?.id ?? playlist.id ?? createPlaylistId(),
  name: playlist.title,
  source: 'youtube',
  thumbnail: playlist.thumbnail,
  syncSource: {
    platform: 'youtube',
    browseId: playlist.browseId,
    channelTitle: playlist.channelTitle,
    syncedAt: playlist.syncedAt,
  },
  tracks: sanitizePlaylistTracks(playlist.tracks),
  createdAt: existing?.createdAt ?? now(),
  updatedAt: now(),
})

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      queue: [],
      playlists: [],
      currentIndex: -1,
      isNowPlayingExpanded: false,
      isPlaying: false,
      isMuted: false,
      volume: 70,
      progress: 0,
      duration: 0,
      shuffle: false,
      repeat: 'off',
      theme: defaultTheme,
      showVideo: false,
      autoPlayNext: true,
      quality: 'auto',
      currentView: 'home',
      accountStatus: {
        connected: false,
        source: 'local-mock',
        message: 'Conta do YouTube Music ainda nao conectada.',
      },
      setCurrentView: (currentView) => set({ currentView }),
      setAccountStatus: (accountStatus) => set({ accountStatus }),
      createPlaylist: (name, tracks = []) => {
        const playlistName = name.trim() || 'Nova playlist'
        const playlistId = createPlaylistId()
        const playlist: LocalPlaylist = {
          id: playlistId,
          name: playlistName,
          source: 'local',
          tracks: sanitizePlaylistTracks(tracks),
          createdAt: now(),
          updatedAt: now(),
        }

        set((state) => ({
          playlists: [playlist, ...state.playlists],
          currentView: 'queue',
        }))

        return playlistId
      },
      addTrackToPlaylist: (playlistId, track) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  tracks: sanitizePlaylistTracks([...playlist.tracks, track]),
                  updatedAt: now(),
                }
              : playlist,
          ),
        })),
      renamePlaylist: (playlistId, name) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  name: name.trim() || playlist.name,
                  updatedAt: now(),
                }
              : playlist,
          ),
        })),
      deletePlaylist: (playlistId) =>
        set((state) => ({
          playlists: state.playlists.filter((playlist) => playlist.id !== playlistId),
        })),
      saveYouTubePlaylist: (playlist) => {
        const syncedId =
          get().playlists.find((item) => item.syncSource?.browseId === playlist.browseId)?.id ?? playlist.id

        set((state) => {
          const existing = state.playlists.find((item) => item.id === syncedId)
          const nextPlaylist = createYouTubeBackedPlaylist(playlist, existing)

          return {
            playlists: [
              nextPlaylist,
              ...state.playlists.filter((item) => item.id !== syncedId),
            ],
            currentView: 'queue',
          }
        })

        return syncedId
      },
      removeYouTubePlaylist: (browseId) =>
        set((state) => ({
          playlists: state.playlists.filter((playlist) => playlist.syncSource?.browseId !== browseId),
        })),
      saveQueueAsPlaylist: (name) => {
        const state = get()

        if (state.queue.length === 0) {
          return null
        }

        const playlistId = createPlaylistId()
        const playlist: LocalPlaylist = {
          id: playlistId,
          name: name.trim() || 'Minha playlist',
          source: 'local',
          tracks: sanitizePlaylistTracks(state.queue),
          createdAt: now(),
          updatedAt: now(),
        }

        set((currentState) => ({
          playlists: [playlist, ...currentState.playlists],
          currentView: 'queue',
        }))

        return playlistId
      },
      mergeQueueIntoPlaylist: (playlistId) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  tracks: sanitizePlaylistTracks([...playlist.tracks, ...state.queue]),
                  updatedAt: now(),
                }
              : playlist,
          ),
        })),
      playPlaylist: (playlistId, startIndex = 0) =>
        set((state) => {
          const playlist = state.playlists.find((item) => item.id === playlistId)
          const safeTracks = sanitizePlaylistTracks(playlist?.tracks ?? [])
          const nextTrack = safeTracks[startIndex]

          if (!nextTrack) {
            return state
          }

          return {
            queue: safeTracks,
            currentIndex: startIndex,
            isPlaying: true,
            progress: 0,
            duration: nextTrack.duration,
          }
        }),
      playYouTubePlaylist: (browseId, startIndex = 0) =>
        set((state) => {
          const playlist = state.playlists.find((item) => item.syncSource?.browseId === browseId)
          const safeTracks = sanitizePlaylistTracks(playlist?.tracks ?? [])
          const nextTrack = safeTracks[startIndex]

          if (!nextTrack) {
            return state
          }

          return {
            queue: safeTracks,
            currentIndex: startIndex,
            isPlaying: true,
            progress: 0,
            duration: nextTrack.duration,
          }
        }),
      removeTrackFromPlaylist: (playlistId, trackIndex) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  tracks: playlist.tracks.filter((_, index) => index !== trackIndex),
                  updatedAt: now(),
                }
              : playlist,
          ),
        })),
      movePlaylistTrack: (playlistId, oldIndex, newIndex) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) => {
            if (playlist.id !== playlistId || oldIndex === newIndex) {
              return playlist
            }

            const tracks = [...playlist.tracks]
            const [movedTrack] = tracks.splice(oldIndex, 1)
            tracks.splice(newIndex, 0, movedTrack)

            return {
              ...playlist,
              tracks,
              updatedAt: now(),
            }
          }),
        })),
      addToQueue: (track) =>
        set((state) => ({
          queue: [...state.queue, track],
          currentIndex: state.currentIndex === -1 ? 0 : state.currentIndex,
        })),
      playTrack: async (track) => {
        set({
          queue: [track],
          currentIndex: 0,
          isPlaying: true,
          progress: 0,
          duration: track.duration,
        })

        try {
          const relatedTracks = await buildSmartQueue(track, 10)

          set((state) => {
            if (state.queue[0]?.videoId !== track.videoId) {
              return state
            }

            const seen = new Set(state.queue.map((item) => item.videoId))
            const nextQueue = [
              ...state.queue,
              ...relatedTracks.filter((item) => {
                if (seen.has(item.videoId)) {
                  return false
                }

                seen.add(item.videoId)
                return true
              }),
            ]

            return { queue: nextQueue }
          })
        } catch (error) {
      console.error('WindSound radio seed error:', error)
        }
      },
      startPlaylist: (tracks, startIndex = 0) =>
        set(() => {
          const safeTracks = tracks.filter(Boolean)
          const nextTrack = safeTracks[startIndex]

          if (!nextTrack) {
            return {
              queue: [],
              currentIndex: -1,
              isPlaying: false,
              progress: 0,
              duration: 0,
            }
          }

          return {
            queue: safeTracks,
            currentIndex: startIndex,
            isPlaying: true,
            progress: 0,
            duration: nextTrack.duration,
          }
        }),
      playFromQueue: (index) =>
        set((state) => {
          const nextTrack = state.queue[index]
          if (!nextTrack) {
            return state
          }

          return {
            currentIndex: index,
            isPlaying: true,
            progress: 0,
            duration: nextTrack.duration,
          }
        }),
      removeFromQueue: (index) =>
        set((state) => {
          const queue = state.queue.filter((_, itemIndex) => itemIndex !== index)

          if (queue.length === 0) {
            return {
              queue,
              currentIndex: -1,
              isPlaying: false,
              progress: 0,
              duration: 0,
            }
          }

          if (index < state.currentIndex) {
            return { queue, currentIndex: state.currentIndex - 1 }
          }

          if (index === state.currentIndex) {
            const nextIndex = Math.min(state.currentIndex, queue.length - 1)
            return {
              queue,
              currentIndex: nextIndex,
              isPlaying: state.isPlaying,
              progress: 0,
              duration: queue[nextIndex]?.duration ?? 0,
            }
          }

          return { queue }
        }),
      clearQueue: () =>
        set({
          queue: [],
          currentIndex: -1,
          isNowPlayingExpanded: false,
          isPlaying: false,
          progress: 0,
          duration: 0,
        }),
      moveTrack: (oldIndex, newIndex) =>
        set((state) => {
          if (oldIndex === newIndex) {
            return state
          }

          const queue = [...state.queue]
          const [movedTrack] = queue.splice(oldIndex, 1)
          queue.splice(newIndex, 0, movedTrack)

          let currentIndex = state.currentIndex

          if (oldIndex === state.currentIndex) {
            currentIndex = newIndex
          } else if (oldIndex < state.currentIndex && newIndex >= state.currentIndex) {
            currentIndex -= 1
          } else if (oldIndex > state.currentIndex && newIndex <= state.currentIndex) {
            currentIndex += 1
          }

          return { queue, currentIndex }
        }),
      setNowPlayingExpanded: (isNowPlayingExpanded) => set({ isNowPlayingExpanded }),
      toggleNowPlayingExpanded: () => set((state) => ({ isNowPlayingExpanded: !state.isNowPlayingExpanded })),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      togglePlayState: () => set((state) => ({ isPlaying: !state.isPlaying })),
      setMuted: (isMuted) => set({ isMuted }),
      setVolume: (volume) => set({ volume }),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      playNext: async () => {
        const state = get()

        if (state.queue.length === 0) {
          return
        }

        const currentTrack = state.queue[state.currentIndex]
        const canAdvance = state.currentIndex < state.queue.length - 1

        if (state.shuffle) {
          const nextIndex = pickRandomIndex(state.queue, state.currentIndex)
          set({
            currentIndex: nextIndex,
            isPlaying: true,
            progress: 0,
            duration: state.queue[nextIndex]?.duration ?? 0,
          })
          return
        }

        if (canAdvance) {
          const nextIndex = state.currentIndex + 1
          set({
            currentIndex: nextIndex,
            isPlaying: true,
            progress: 0,
            duration: state.queue[nextIndex]?.duration ?? 0,
          })
          return
        }

        if (state.repeat === 'all') {
          set({
            currentIndex: 0,
            isPlaying: true,
            progress: 0,
            duration: state.queue[0]?.duration ?? 0,
          })
          return
        }

        if (!currentTrack) {
          set({ isPlaying: false, progress: 100 })
          return
        }

        const remainingQueue = state.queue.slice(state.currentIndex + 1)

        if (remainingQueue.length === 0) {
          try {
            const relatedTracks = await buildSmartQueue(currentTrack, 8)

            set((currentState) => {
              if (currentState.queue[currentState.currentIndex]?.videoId !== currentTrack.videoId) {
                return currentState
              }

              const seen = new Set(currentState.queue.map((item) => item.videoId))
              const additions = relatedTracks.filter((item) => {
                if (seen.has(item.videoId)) {
                  return false
                }

                seen.add(item.videoId)
                return true
              })

              if (additions.length === 0) {
                return currentState
              }

              return {
                queue: [...currentState.queue, ...additions],
              }
            })

            const refreshedState = get()

            if (refreshedState.currentIndex < refreshedState.queue.length - 1) {
              const nextIndex = refreshedState.currentIndex + 1
              set({
                currentIndex: nextIndex,
                isPlaying: true,
                progress: 0,
                duration: refreshedState.queue[nextIndex]?.duration ?? 0,
              })
              return
            }
          } catch (error) {
      console.error('WindSound radio queue refill error:', error)
          }
        }

        const radioCandidate = await getRadioCandidate(currentTrack)

        if (!radioCandidate) {
          set({ isPlaying: false, progress: 100 })
          return
        }

        set((currentState) => {
          const queue = [...currentState.queue, radioCandidate]
          return {
            queue,
            currentIndex: queue.length - 1,
            isPlaying: true,
            progress: 0,
            duration: radioCandidate.duration,
          }
        })
      },
      playPrevious: () =>
        set((state) => {
          if (state.queue.length === 0) {
            return state
          }

          let previousIndex = state.currentIndex

          if (state.shuffle) {
            previousIndex = pickRandomIndex(state.queue, state.currentIndex)
          } else if (state.currentIndex > 0) {
            previousIndex = state.currentIndex - 1
          } else if (state.repeat === 'all') {
            previousIndex = state.queue.length - 1
          }

          return {
            currentIndex: previousIndex,
            isPlaying: true,
            progress: 0,
            duration: state.queue[previousIndex]?.duration ?? 0,
          }
        }),
      toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
      cycleRepeat: () =>
        set((state) => ({
          repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off',
        })),
      setTheme: (theme) => set({ theme }),
      updateThemeColor: (key, value) =>
        set((state) => ({
          theme: {
            ...state.theme,
            colors: {
              ...state.theme.colors,
              [key]: value,
            },
          },
        })),
      resetTheme: () => set({ theme: defaultTheme }),
      setShowVideo: (showVideo) => set({ showVideo }),
      setAutoPlayNext: (autoPlayNext) => set({ autoPlayNext }),
      setQuality: (quality) => set({ quality }),
    }),
    {
      name: 'windsound-store',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any, version) => {
        if (!persistedState || version >= 2) {
          return persistedState
        }

        const existingPlaylists: LocalPlaylist[] = Array.isArray(persistedState.playlists)
          ? persistedState.playlists.map((playlist: LocalPlaylist) => ({
              ...playlist,
              source: playlist.source ?? 'local',
            }))
          : []

        const importedYouTubePlaylists: YouTubePlaylist[] = Array.isArray(persistedState.youtubePlaylists)
          ? persistedState.youtubePlaylists
          : []

        const migratedYouTubePlaylists = importedYouTubePlaylists.map((playlist) =>
          createYouTubeBackedPlaylist(playlist),
        )

        return {
          ...persistedState,
          playlists: [...migratedYouTubePlaylists, ...existingPlaylists],
        }
      },
      partialize: (state) => ({
        queue: state.queue,
        playlists: state.playlists,
        currentIndex: state.currentIndex,
        volume: state.volume,
        isMuted: state.isMuted,
        shuffle: state.shuffle,
        repeat: state.repeat,
        theme: state.theme,
        showVideo: state.showVideo,
        autoPlayNext: state.autoPlayNext,
        quality: state.quality,
        currentView: state.currentView,
        accountStatus: state.accountStatus,
      }),
    },
  ),
)
