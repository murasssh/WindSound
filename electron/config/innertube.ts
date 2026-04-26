import { net } from 'electron'
import { MUSIC_ORIGIN } from './constants'

const INNERTUBE_BASE = `${MUSIC_ORIGIN}/youtubei/v1`
const INNERTUBE_CONFIG_TTL_MS = 30 * 60 * 1000
const DEFAULT_WEB_REMIX_CLIENT_VERSION = '1.20260213.01.00'
const API_KEY_PATTERN = /"INNERTUBE_API_KEY":"([^"]+)"/
const CLIENT_VERSION_PATTERN = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/

let cachedConfig:
  | {
      apiKey: string
      clientVersion: string
    }
  | null = null
let cachedConfigAt = 0

const extractValue = (html: string, pattern: RegExp) => {
  const match = html.match(pattern)
  return match?.[1]?.trim() || null
}

const fetchRuntimeConfig = async () => {
  const response = await net.fetch(MUSIC_ORIGIN, {
    method: 'GET',
    credentials: 'omit',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    throw new Error(`Falha ao carregar a pagina do YouTube Music: ${response.status}`)
  }

  const html = await response.text()
  const apiKey = process.env.WINDSOUND_INNERTUBE_KEY?.trim() || extractValue(html, API_KEY_PATTERN)
  const clientVersion =
    process.env.WINDSOUND_INNERTUBE_CLIENT_VERSION?.trim() ||
    extractValue(html, CLIENT_VERSION_PATTERN) ||
    DEFAULT_WEB_REMIX_CLIENT_VERSION

  if (!apiKey) {
    throw new Error('Nao foi possivel descobrir a chave do InnerTube em tempo de execucao.')
  }

  cachedConfig = {
    apiKey,
    clientVersion,
  }
  cachedConfigAt = Date.now()

  return cachedConfig
}

export const getInnertubeRuntimeConfig = async () => {
  if (cachedConfig && Date.now() - cachedConfigAt < INNERTUBE_CONFIG_TTL_MS) {
    return cachedConfig
  }

  return fetchRuntimeConfig()
}

export const getInnertubeEndpointUrl = async (endpoint: string) => {
  const config = await getInnertubeRuntimeConfig()
  return `${INNERTUBE_BASE}/${endpoint}?key=${config.apiKey}&prettyPrint=false`
}

export const getWebRemixClientVersion = async () => {
  const config = await getInnertubeRuntimeConfig()
  return config.clientVersion
}
