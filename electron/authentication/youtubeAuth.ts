import { createHash } from 'crypto'
import { BrowserWindow, net, session } from 'electron'
import { getInnertubeEndpointUrl, getWebRemixClientVersion } from '../config/innertube'

const MUSIC_ORIGIN = 'https://music.youtube.com'

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

  if (typeof candidate.src === 'string' && candidate.src.trim()) {
    return candidate.src.trim()
  }

  if (typeof candidate.srcset === 'string' && candidate.srcset.trim()) {
    const fromSrcSet = candidate.srcset
      .split(',')
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean)
      .at(-1)

    if (fromSrcSet) {
      return fromSrcSet
    }
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

const normalizeAvatarUrl = (value?: string | null) => {
  const trimmed = value?.trim()

  if (!trimmed) {
    return null
  }

  const normalizedProtocol = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed

  return normalizedProtocol
    .replace(/=s\d+(?:-c)?(?:-[a-z0-9-]+)?$/i, '=s256-c-k-c0x00ffffff-no-rj')
    .replace(/=w\d+-h\d+(?:-[a-z0-9-]+)*$/i, '=s256-c-k-c0x00ffffff-no-rj')
}

const normalizeProfile = (profile?: { displayName?: string | null; avatarUrl?: string | null } | null) => {
  if (!profile) {
    return null
  }

  const displayName = parseAccountLabel(profile.displayName) ?? extractText(profile.displayName) ?? null
  const avatarUrl = normalizeAvatarUrl(profile.avatarUrl)

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
  const webRemixVersion = await getWebRemixClientVersion()
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
      client: {
        ...DEFAULT_CLIENT,
        clientVersion: webRemixVersion,
      },
      body: {
        context: {
          client: {
            clientName: DEFAULT_CLIENT.clientName,
            clientVersion: webRemixVersion,
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
    const response = await net.fetch(await getInnertubeEndpointUrl('account/accounts_list'), {
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
    await hiddenWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve(true)
          return
        }

        window.addEventListener('load', () => resolve(true), { once: true })
        setTimeout(() => resolve(true), 2500)
      })
    `)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await wait(800)
      }

      const profile = (await hiddenWindow.webContents.executeJavaScript(`
        (() => {
          const selectors = [
            'button[aria-label*="Google"] img',
            'button[aria-label*="google"] img',
            'button[aria-label*="Conta"] img',
            'button[aria-label*="account"] img',
            'ytmusic-settings-button img',
            'img[alt*="@"]',
            'img[src*="googleusercontent"]',
            'img[src*="yt3.ggpht"]',
            'img[src*="yt3.googleusercontent"]',
          ]

          const image = selectors
            .map((selector) => document.querySelector(selector))
            .find(Boolean)

          const clickable = image?.closest('button, a') || [...document.querySelectorAll('button, a')].find((element) => {
            const label = element.getAttribute('aria-label') || element.textContent || ''
            return /google account|conta do google|youtube music|account/i.test(label)
          })

          const titleCandidate = image?.getAttribute('alt') ||
            clickable?.getAttribute('aria-label') ||
            clickable?.textContent ||
            document.querySelector('ytmusic-settings-button')?.getAttribute('aria-label') ||
            ''

          return {
            label: clickable?.getAttribute('aria-label') || '',
            text: titleCandidate.trim(),
            imageSrc:
              image?.getAttribute('src') ||
              image?.getAttribute('data-src') ||
              image?.getAttribute('srcset')?.split(',').map((entry) => entry.trim().split(/\\s+/)[0]).filter(Boolean).at(-1) ||
              null,
          }
        })()
      `)) as { label?: string; text?: string; imageSrc?: string | null }

      const displayName =
        parseAccountLabel(profile.label) ??
        parseAccountLabel(profile.text) ??
        profile.text?.trim() ??
        'Conta do YouTube'

      const normalized = normalizeProfile({
        displayName,
        avatarUrl: profile.imageSrc || null,
      })

      if (normalized?.avatarUrl || normalized?.displayName) {
        return normalized
      }
    }

    return null
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
  const webRemixVersion = await getWebRemixClientVersion()

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
    const response = await net.fetch(await getInnertubeEndpointUrl('browse'), {
      method: 'POST',
      credentials: 'include',
      headers: await createInnertubeHeaders({
        ...DEFAULT_CLIENT,
        clientVersion: webRemixVersion,
      }),
      body: JSON.stringify({
        context: {
          client: {
            clientName: DEFAULT_CLIENT.clientName,
            clientVersion: webRemixVersion,
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

  const detectedProfile = await getCachedProfile()

  if (authorization) {
    return {
      connected: true,
      source: 'cookie-session',
      message: 'Sessao detectada. O WindSound vai sincronizar a Home personalizada assim que o YouTube Music responder.',
      displayName: detectedProfile?.displayName ?? 'Conta do YouTube',
      avatarUrl: detectedProfile?.avatarUrl ?? null,
    }
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
