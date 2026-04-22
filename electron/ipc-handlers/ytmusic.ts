// electron/ipc/ytmusic.ts
// Actual implementations for InnerTube API calls
// Since these are called from the main process, we need to make HTTP requests directly

import fetch from 'node-fetch'

const INNERTUBE_BASE = 'https://music.youtube.com/youtubei/v1'
const INNERTUBE_KEY  = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'

const CLIENT_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',       // YouTube Music Web
    clientVersion: '1.20240101.01.00',
    hl: 'pt',
    gl: 'BR',
  }
}

async function innertubePost(endpoint: string, body: object) {
  try {
    const res = await fetch(`${INNERTUBE_BASE}/${endpoint}?key=${INNERTUBE_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Format-Version': '1',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ ...body, context: CLIENT_CONTEXT })
    })

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`)
    }

    return await res.json()
  } catch (error) {
    console.error(`InnerTube API error for ${endpoint}:`, error)
    throw error
  }
}

export async function ytSearch(query: string) {
  try {
    console.log(`Searching for: ${query}`)

    const response = await innertubePost('search', {
      query,
      params: 'EgWKAQIIAWoKEAkQBRAKEAMQ'
    })

    // Parse the response to extract track information
    let contents = response.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
    if (!contents) {
      contents = response.contents?.sectionListRenderer?.contents
    }

    if (!contents) {
      return {
        success: true,
        data: []
      }
    }

    const results: any[] = []

    for (const content of contents) {
      if (content.musicShelfRenderer) {
        const shelfContents = content.musicShelfRenderer.contents || []

        for (const item of shelfContents) {
          if (item.musicResponsiveListItemRenderer) {
            const renderer = item.musicResponsiveListItemRenderer
            const flexColumns = renderer.flexColumns || []

            // Extract primary text (usually the title)
            let title = ''
            if (flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) {
              title = flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].text
            }

            // Extract secondary text (usually the artist)
            let artist = ''
            if (flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) {
              const artistRuns = flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs
              // Combine runs to get the full artist name
              artist = artistRuns.map((run: any) => run.text).join('').trim()
            }

            // Extract thumbnails
            let thumbnail = ''
            if (renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails) {
              // Get the highest quality thumbnail
              const thumbs = renderer.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails
              thumbnail = thumbs[thumbs.length - 1].url
            }

            // Extract video ID
            let videoId = ''
            if (renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer) {
              videoId = renderer.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId
            }

            // Add to results if we have essential information
            if (title && videoId) {
              results.push({
                type: 'song',
                id: videoId,
                title,
                subtitle: artist,
                thumbnail,
                artists: [artist]
              })
            }
          }
        }
      }
    }

    return {
      success: true,
      data: results
    }
  } catch (error) {
    console.error('Search error:', error)
    return {
      success: false,
      error: (error as Error).message,
      data: []
    }
  }
}

export async function ytGetStream(videoId: string) {
  try {
    console.log(`Getting stream for video: ${videoId}`)

    // In a real implementation, we'd handle signature deciphering properly
    // For now, making the player request with a known signatureTimestamp
    const response = await innertubePost('player', {
      videoId,
      playbackContext: {
        contentPlaybackContext: {
          signatureTimestamp: 19804 // This is a placeholder value
        }
      }
    })

    if (!response.streamingData) {
      throw new Error('No streaming data in response')
    }

    // Extract the audio stream with the highest bitrate
    const adaptiveFormats = response.streamingData.adaptiveFormats || []

    // Filter for audio-only formats
    const audioFormats = adaptiveFormats.filter((format: any) => {
      return format.mimeType.startsWith('audio/') && format.audioQuality
    })

    if (audioFormats.length === 0) {
      throw new Error('No audio formats found')
    }

    // Sort by bitrate to get the highest quality audio
    audioFormats.sort((a: any, b: any) => b.bitrate - a.bitrate)

    // Get the URL of the highest quality audio format
    const highestQualityAudio = audioFormats[0]
    let audioUrl = highestQualityAudio.url

    // If the URL is encrypted with signature cipher, we need to decrypt it
    if (highestQualityAudio.signatureCipher || highestQualityAudio.cipher) {
      // Extract the URL and signature
      if (highestQualityAudio.signatureCipher) {
        const params = new URLSearchParams(highestQualityAudio.signatureCipher)
        const url = params.get('url') || ''
        const sp = params.get('sp') || 'signature'
        const sig = params.get('s') || ''

        if (url && sig) {
          const urlWithSig = new URL(url)
          urlWithSig.searchParams.set(sp, sig)
          audioUrl = urlWithSig.toString()
        }
      } else if (highestQualityAudio.cipher) {
        const params = new URLSearchParams(highestQualityAudio.cipher)
        const url = params.get('url') || ''
        const sp = params.get('sp') || 'signature'
        const sig = params.get('s') || ''

        if (url && sig) {
          const urlWithSig = new URL(url)
          urlWithSig.searchParams.set(sp, sig)
          audioUrl = urlWithSig.toString()
        }
      }
    }

    if (!audioUrl) {
      throw new Error('No playable URL found')
    }

    return {
      success: true,
      url: audioUrl
    }
  } catch (error) {
    console.error('Stream error:', error)
    return {
      success: false,
      error: (error as Error).message,
      url: ''
    }
  }
}

export async function ytGetHome() {
  try {
    console.log('Getting home feed')

    const response = await innertubePost('browse', {
      browseId: 'FEmusic_home'
    })

    // Parse the home feed response
    const contents = response.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents

    if (!contents) {
      return {
        success: true,
        data: []
      }
    }

    const homeData: any[] = []

    for (const content of contents) {
      // Handle different types of sections in the home feed
      if (content.musicImmersiveCarouselShelfRenderer) {
        // These are typically "Quick picks", "Made for you", etc.
        const title = content.musicImmersiveCarouselShelfRenderer.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || 'Section'

        homeData.push({
          id: `section-${Date.now()}-${Math.random()}`,
          title,
          type: 'immersive_shelf',
          items: [] // Will populate with items in a full implementation
        })
      } else if (content.musicCarouselShelfRenderer) {
        // These are other types of shelves
        const title = content.musicCarouselShelfRenderer.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || 'Section'

        homeData.push({
          id: `section-${Date.now()}-${Math.random()}`,
          title,
          type: 'carousel_shelf',
          items: [] // Will populate with items in a full implementation
        })
      }
    }

    return {
      success: true,
      data: homeData
    }
  } catch (error) {
    console.error('Home feed error:', error)
    return {
      success: false,
      error: (error as Error).message,
      data: []
    }
  }
}

export async function ytGetNext(videoId: string) {
  try {
    console.log(`Getting next tracks for: ${videoId}`)

    // This endpoint provides a queue of related tracks
    const response = await innertubePost('next', {
      videoId,
      isAudioOnly: true
    })

    // Parse the next tracks response
    const contents = response.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.contents

    if (!contents) {
      return {
        success: true,
        data: []
      }
    }

    const nextTracks: any[] = []

    // Look for the playlist panel that contains the next tracks
    for (const content of contents) {
      if (content.musicQueueRenderer) {
        const playlistPanel = content.musicQueueRenderer.content?.playlistPanelRenderer
        if (playlistPanel && playlistPanel.contents) {
          for (const item of playlistPanel.contents) {
            if (item.playlistPanelVideoRenderer) {
              const renderer = item.playlistPanelVideoRenderer

              nextTracks.push({
                id: renderer.videoId,
                title: renderer.title?.runs?.[0]?.text || '',
                artist: renderer.shortBylineText?.runs?.[0]?.text || '',
                duration: renderer.lengthText?.simpleText || '',
                thumbnail: renderer.thumbnail?.thumbnails?.[0]?.url || ''
              })
            }
          }
        }
      }
    }

    return {
      success: true,
      data: nextTracks
    }
  } catch (error) {
    console.error('Next tracks error:', error)
    return {
      success: false,
      error: (error as Error).message,
      data: []
    }
  }
}