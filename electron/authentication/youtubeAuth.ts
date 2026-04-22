import { createHash } from 'crypto'
import { BrowserWindow, net, session } from 'electron'

const MUSIC_ORIGIN = 'https://music.youtube.com'
const INNERTUBE_BASE = 'https://music.youtube.com/youtubei/v1'
const INNERTUBE_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'

const DEFAULT_CLIENT = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20260213.01.00',
  clientId: '67',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
}
const TV_CLIENT = {
  clientName: 'TVHTML5',
  clientVersion: '7.20260120.19.00',
  clientId: '7',
  userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 TV Safari/537.36',
}
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000

let cachedProfile: { displayName?: string; avatarUrl?: string | null } | null = null
let cachedProfileAt = 0

export type AccountStatus = {
  connected: boolean
  source: 'cookie-session' | 'local-mock'
  message: string
  displayName?: string
  avatarUrl?: string | null
}

export type InnertubeClient = {
  clientName: string
  clientVersion: string
  clientId: string
  userAgent: string
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const parseAccountLabel = (label?: string | null) => {
  if (!label) {
    return null
  }

  const normalized = label
    .replace(/^abrir menu de avatar(?: da)?\s*/i, '')
    .replace(/^open avatar menu(?: for)?\s*/i, '')
    .replace(/^abrir menu da conta(?: da)?\s*/i, '')
    .replace(/^open account menu(?: for)?\s*/i, '')
    .replace(/^conta do google(?: de)?\s*/i, '')
    .replace(/^google account(?: of)?\s*/i, '')
    .replace(/^conta do youtube(?: music)?(?: de)?\s*/i, '')
    .replace(/^youtube(?: music)? account(?: of)?\s*/i, '')
    .replace(/^account(?: of)?\s*/i, '')
    .trim()

  return normalized || null
}

const extractText = (value: unknown): string | null => {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    const normalized = parseAccountLabel(value) ?? value.trim()
    return normalized || null
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => extractText(entry))
      .filter(Boolean)
      .join(' ')
      .trim()

    return joined || null
  }

  if (typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>

  return (
    extractText(candidate.simpleText) ??
    extractText(candidate.text) ??
    extractText(candidate.label) ??
    extractText(candidate.title) ??
    extractText(candidate.name) ??
    extractText(candidate.runs) ??
    null
  )
}

const extractThumbnailUrl = (value: unknown): string | null => {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    const urls = value.map((entry) => extractThumbnailUrl(entry)).filter(Boolean)
    return urls.at(-1) ?? urls[0] ?? null
  }

  if (typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.url === 'string' && candidate.url.trim()) {
    return candidate.url.trim()
  }

  return (
    extractThumbnailUrl(candidate.thumbnails) ??
    extractThumbnailUrl(candidate.sources) ??
    extractThumbnailUrl(candidate.thumbnail) ??
    extractThumbnailUrl(candidate.image) ??
    extractThumbnailUrl(candidate.avatar) ??
    null
  )
}

const normalizeProfile = (profile?: { displayName?: string | null; avatarUrl?: string | null } | null) => {
  if (!profile) {
    return null
  }

  const displayName = parseAccountLabel(profile.displayName) ?? extractText(profile.displayName) ?? null
  const avatarUrl = profile.avatarUrl?.trim() || null

  if (!displayName && !avatarUrl) {
    return null
  }

  return {
    displayName,
    avatarUrl,
  }
}

const collectAccountProfiles = (
  value: unknown,
  results: Array<{ displayName?: string | null; avatarUrl?: string | null; score: number }> = [],
) => {
  if (!value || typeof value !== 'object') {
    return results
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectAccountProfiles(entry, results)
    }

    return results
  }

  const candidate = value as Record<string, unknown>
  const directName =
    extractText(candidate.accountName) ??
    extractText(candidate.channelHandle) ??
    extractText(candidate.accountByline) ??
    extractText(candidate.displayName)
  const directAvatar =
    extractThumbnailUrl(candidate.accountPhoto) ??
    extractThumbnailUrl(candidate.avatar) ??
    extractThumbnailUrl(candidate.thumbnail)

  if (directName || directAvatar) {
    let score = 0

    if (candidate.accountName) {
      score += 10
    }

    if (candidate.isSelected === true) {
      score += 100
    }

    if (candidate.hasChannel === true) {
      score += 10
    }

    if (candidate.channelHandle || candidate.accountByline) {
      score += 3
    }

    if (candidate.accountPhoto) {
      score += 2
    }

    if (directName) {
      score += 20
    }

    if (directAvatar) {
      score += 4
    }

    results.push({
      displayName: directName,
      avatarUrl: directAvatar,
      score,
    })
  }

  for (const nestedValue of Object.values(candidate)) {
    collectAccountProfiles(nestedValue, results)
  }

  return results
}

const findAccountProfile = (value: unknown): { displayName?: string | null; avatarUrl?: string | null } | null => {
  const profiles = collectAccountProfiles(value)
    .map((profile) => ({
      ...profile,
      normalized: normalizeProfile(profile),
    }))
    .filter(
      (profile): profile is {
        displayName?: string | null
        avatarUrl?: string | null
        score: number
        normalized: { displayName?: string | null; avatarUrl?: string | null }
      } => Boolean(profile.normalized),
    )
    .sort((left, right) => {
      const leftHasName = left.normalized.displayName ? 1 : 0
      const rightHasName = right.normalized.displayName ? 1 : 0

      if (leftHasName !== rightHasName) {
        return rightHasName - leftHasName
      }

      return right.score - left.score
    })

  return profiles[0]?.normalized ?? null
}

const fetchProfileFromAccountsList = async () => {
  const attempts = [
    {
      client: TV_CLIENT,
      body: {
        context: {
          client: {
            clientName: TV_CLIENT.clientName,
            clientVersion: TV_CLIENT.clientVersion,
            hl: 'pt-BR',
            gl: 'BR',
          },
        },
      },
    },
    {
      client: DEFAULT_CLIENT,
      body: {
        context: {
          client: {
            clientName: DEFAULT_CLIENT.clientName,
            clientVersion: DEFAULT_CLIENT.clientVersion,
            hl: 'pt-BR',
            gl: 'BR',
          },
        },
        requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER',
        callCircumstance: 'SWITCHING_USERS_FULL',
      },
    },
  ]

  for (const attempt of attempts) {
    const response = await net.fetch(`${INNERTUBE_BASE}/account/accounts_list?key=${INNERTUBE_KEY}&prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers: await createInnertubeHeaders(attempt.client, null, { includeAuth: true }),
      body: JSON.stringify(attempt.body),
    })

    if (!response.ok) {
      continue
    }

    const data = (await response.json()) as Record<string, unknown>
    const profile = normalizeProfile(findAccountProfile(data))

    if (profile?.displayName || profile?.avatarUrl) {
      return profile
    }
  }

  return null
}

const fetchProfileFromHiddenWindow = async () => {
  const hiddenWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    backgroundColor: '#0d0d0d',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  try {
    await hiddenWindow.loadURL(MUSIC_ORIGIN)
    await wait(1200)

    const profile = (await hiddenWindow.webContents.executeJavaScript(`
      (() => {
        const buttons = [...document.querySelectorAll('button, a')]
        const accountButton =
          buttons.find((element) => /google account|conta do google|account/i.test(element.getAttribute('aria-label') || '')) ||
          buttons.find((element) => element.querySelector('img') && /googleusercontent|yt3\\.ggpht|yt3\\.googleusercontent/i.test(element.querySelector('img')?.src || ''))

        const image = accountButton?.querySelector('img') ||
          [...document.querySelectorAll('img')].find((img) => /googleusercontent|yt3\\.ggpht|yt3\\.googleusercontent/i.test(img.src || ''))

        const inlineName =
          accountButton?.querySelector('[title]')?.getAttribute('title') ||
          accountButton?.querySelector('[aria-label]')?.getAttribute('aria-label') ||
          accountButton?.textContent ||
          ''

        return {
          label: accountButton?.getAttribute('aria-label') || '',
          text: inlineName.trim(),
          imageSrc: image?.src || null,
        }
      })()
    `)) as { label?: string; text?: string; imageSrc?: string | null }

    const displayName =
      parseAccountLabel(profile.label) ??
      parseAccountLabel(profile.text) ??
      profile.text?.trim() ??
      'Conta do YouTube'

    return normalizeProfile({
      displayName,
      avatarUrl: profile.imageSrc || null,
    })
  } finally {
    if (!hiddenWindow.isDestroyed()) {
      hiddenWindow.destroy()
    }
  }
}

const getCachedProfile = async () => {
  if (cachedProfile && Date.now() - cachedProfileAt < PROFILE_CACHE_TTL_MS) {
    return cachedProfile
  }

  try {
    cachedProfile = (await fetchProfileFromAccountsList()) ?? (await fetchProfileFromHiddenWindow())
    cachedProfileAt = Date.now()
    return cachedProfile
  } catch (error) {
    console.error('[WindSound auth] failed to resolve profile', error)
    return cachedProfile
  }
}

type HeaderOptions = {
  includeAuth?: boolean
}

const buildAuthorizationHeader = async () => {
  const cookies = await session.defaultSession.cookies.get({ url: MUSIC_ORIGIN })
  const sapisidCookie =
    cookies.find((cookie) => cookie.name === 'SAPISID') ??
    cookies.find((cookie) => cookie.name === '__Secure-3PAPISID') ??
    cookies.find((cookie) => cookie.name === 'APISID')

  if (!sapisidCookie?.value) {
    return null
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const digest = createHash('sha1')
    .update(`${timestamp} ${sapisidCookie.value} ${MUSIC_ORIGIN}`)
    .digest('hex')

  return `SAPISIDHASH ${timestamp}_${digest}`
}

export const createInnertubeHeaders = async (
  client: InnertubeClient,
  visitorData?: string | null,
  options: HeaderOptions = {},
) => {
  const { includeAuth = client.clientName === 'WEB_REMIX' } = options
  const authorization = includeAuth ? await buildAuthorizationHeader() : null

  return {
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'X-Goog-Api-Format-Version': '1',
    'X-YouTube-Client-Name': client.clientId,
    'X-YouTube-Client-Version': client.clientVersion,
    'X-Origin': MUSIC_ORIGIN,
    Origin: MUSIC_ORIGIN,
    Referer: `${MUSIC_ORIGIN}/`,
    'User-Agent': client.userAgent,
    ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
    ...(authorization ? { Authorization: authorization, 'X-Goog-AuthUser': '0' } : {}),
  }
}

export const getYouTubeAccountStatus = async (): Promise<AccountStatus> => {
  const authorization = await buildAuthorizationHeader()

  if (!authorization) {
    cachedProfile = null
    cachedProfileAt = 0
    return {
      connected: false,
      source: 'local-mock',
      message: 'Conecte sua conta do YouTube Music para liberar a Home personalizada.',
      displayName: 'Convidado',
      avatarUrl: null,
    }
  }

  try {
    const response = await net.fetch(`${INNERTUBE_BASE}/browse?key=${INNERTUBE_KEY}&prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers: await createInnertubeHeaders(DEFAULT_CLIENT),
      body: JSON.stringify({
        context: {
          client: {
            clientName: DEFAULT_CLIENT.clientName,
            clientVersion: DEFAULT_CLIENT.clientVersion,
            hl: 'pt-BR',
            gl: 'BR',
          },
        },
        browseId: 'FEmusic_library_landing',
      }),
    })

    if (!response.ok) {
      throw new Error(`status ${response.status}`)
    }

    const data = (await response.json()) as { contents?: unknown }

    if (data?.contents) {
      const profile = await getCachedProfile()
      return {
        connected: true,
        source: 'cookie-session',
        message: 'Conta conectada. A Home agora pode usar a sua sessao do YouTube Music.',
        displayName: profile?.displayName ?? 'Conta do YouTube',
        avatarUrl: profile?.avatarUrl ?? null,
      }
    }
  } catch (error) {
    console.error('[WindSound auth] failed to validate session', error)
  }

  return {
    connected: false,
    source: 'local-mock',
    message: 'A sessao existe, mas ainda nao foi validada para recomendacoes personalizadas.',
    displayName: 'Convidado',
    avatarUrl: null,
  }
}

export const clearYouTubeAccountSession = async (): Promise<AccountStatus> => {
  cachedProfile = null
  cachedProfileAt = 0
  const cookies = await session.defaultSession.cookies.get({})
  const targets = cookies.filter(
    (cookie) => cookie.domain.includes('youtube.com') || cookie.domain.includes('google.com'),
  )

  await Promise.all(
    targets.map((cookie) => {
      const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
      const url = `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path}`
      return session.defaultSession.cookies.remove(url, cookie.name)
    }),
  )

  await session.defaultSession.clearStorageData({
    origins: [MUSIC_ORIGIN, 'https://www.youtube.com', 'https://accounts.google.com'],
    storages: ['cookies', 'localstorage', 'cachestorage', 'serviceworkers'],
  })

  return {
    connected: false,
    source: 'local-mock',
    message: 'Conta desconectada. O WindSound voltou para recomendacoes locais.',
    displayName: 'Convidado',
    avatarUrl: null,
  }
}
