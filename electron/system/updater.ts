import { app } from 'electron'
import * as fs from 'fs'
import * as https from 'https'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'

const GITHUB_REPOSITORY = 'murasssh/WindSound'
const COMMITS_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/commits?per_page=20`
const UPDATE_CHANNEL_TAG = 'installer-live'
const UPDATE_CHANNEL_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/tags/${UPDATE_CHANNEL_TAG}`
const UPDATE_BUNDLE_ASSET_NAME = 'WindSound_Windows_x64.zip'
const UPDATE_KEYWORD = 'update'
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000

interface GitHubCommitItem {
  sha?: string
  commit?: {
    message?: string
    committer?: {
      date?: string
    }
  }
}

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
  size?: number
}

interface GitHubRelease {
  name?: string
  tag_name?: string
  published_at?: string
  assets?: GitHubReleaseAsset[]
}

export interface BuildMetadata {
  appId: string
  name: string
  productName: string
  version: string
  commitSha: string
  shortCommitSha: string
  generatedAt: string
  repository: string
}

export interface UpdateStatus {
  available: boolean
  installerReady: boolean
  currentVersion: string
  currentCommitSha: string
  latestCommitSha: string | null
  latestCommitMessage: string | null
  latestPublishedAt: string | null
  latestReleaseName: string | null
}

let cachedStatus: UpdateStatus | null = null
let cachedStatusAt = 0

const readJsonFile = <T>(filePath: string): T | null => {
  try {
    if (!fs.existsSync(filePath)) {
      return null
    }

    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

const getBuildMetadataCandidates = () => {
  const appRoot = app.getAppPath()

  return app.isPackaged
    ? [
        path.join(appRoot, 'dist', 'build-meta.json'),
        path.join(process.resourcesPath, 'app.asar', 'dist', 'build-meta.json'),
        path.join(process.resourcesPath, 'dist', 'build-meta.json'),
      ]
    : [
        path.join(process.cwd(), 'public', 'build-meta.json'),
        path.join(appRoot, 'public', 'build-meta.json'),
      ]
}

const getBuildMetadata = (): BuildMetadata => {
  const candidates = getBuildMetadataCandidates()

  for (const candidate of candidates) {
    const metadata = readJsonFile<BuildMetadata>(candidate)

    if (metadata) {
      return metadata
    }
  }

  return {
    appId: 'com.windsound.app',
    name: 'windsound',
    productName: 'WindSound',
    version: app.getVersion(),
    commitSha: 'development',
    shortCommitSha: 'dev',
    generatedAt: new Date(0).toISOString(),
    repository: GITHUB_REPOSITORY,
  }
}

const requestJson = <T>(url: string) =>
  new Promise<T>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WindSound-Updater/1.0',
        },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume()
          requestJson<T>(response.headers.location).then(resolve).catch(reject)
          return
        }

        if (response.statusCode !== 200) {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            body += chunk
          })
          response.on('end', () => {
            reject(new Error(`GitHub respondeu com status ${response.statusCode}: ${body.slice(0, 240)}`))
          })
          return
        }

        let raw = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          raw += chunk
        })
        response.on('end', () => {
          try {
            resolve(JSON.parse(raw) as T)
          } catch (error) {
            reject(error)
          }
        })
      },
    )

    request.on('error', reject)
    request.setTimeout(15000, () => {
      request.destroy(new Error('Timeout ao consultar GitHub'))
    })
  })

const getReleaseZipAsset = (release: GitHubRelease | null) => {
  if (!release?.assets?.length) {
    return null
  }

  for (let index = 0; index < release.assets.length; index += 1) {
    const asset = release.assets[index]
    const assetName = asset.name?.toLowerCase() ?? ''

    if (asset.name === UPDATE_BUNDLE_ASSET_NAME) {
      return asset
    }

    if (assetName.endsWith('.zip') && assetName.includes('windows')) {
      return asset
    }
  }

  return null
}

const getLatestUpdateCommit = async () => {
  const commits = await requestJson<GitHubCommitItem[]>(COMMITS_URL)

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]
    const message = commit.commit?.message?.trim() ?? ''

    if (!message) {
      continue
    }

    const firstLine = message.split(/\r?\n/, 1)[0].trim()
    if (!firstLine.toLowerCase().includes(UPDATE_KEYWORD)) {
      continue
    }

    return {
      sha: commit.sha ?? null,
      message: firstLine,
      committedAt: commit.commit?.committer?.date ?? null,
    }
  }

  return {
    sha: null,
    message: null,
    committedAt: null,
  }
}

const resolveInstallerExecutable = () => {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'installer', 'WindSound Installer.exe'),
        path.join(process.resourcesPath, 'installer', 'WindSoundInstaller.exe'),
      ]
    : [
        path.join(process.cwd(), 'windsound-installer', 'dist-installer', 'WindSound Installer.exe'),
        path.join(process.cwd(), 'windsound-installer', 'dist-installer', 'WindSoundInstaller.exe'),
      ]

  for (let index = 0; index < candidates.length; index += 1) {
    if (fs.existsSync(candidates[index])) {
      return candidates[index]
    }
  }

  const installerDir = app.isPackaged
    ? path.join(process.resourcesPath, 'installer')
    : path.join(process.cwd(), 'windsound-installer', 'dist-installer')

  if (!fs.existsSync(installerDir)) {
    return null
  }

  const entries = fs.readdirSync(installerDir)
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].toLowerCase().endsWith('.exe')) {
      return path.join(installerDir, entries[index])
    }
  }

  return null
}

export const getUpdateStatus = async (force = false): Promise<UpdateStatus> => {
  const now = Date.now()
  if (!force && cachedStatus && now - cachedStatusAt < STATUS_CACHE_TTL_MS) {
    return cachedStatus
  }

  const buildMetadata = getBuildMetadata()
  const installerReady = Boolean(resolveInstallerExecutable())

  try {
    const [latestCommit, latestRelease] = await Promise.all([
      getLatestUpdateCommit(),
      requestJson<GitHubRelease>(UPDATE_CHANNEL_RELEASE_URL).catch(() => null),
    ])

    const releaseAsset = getReleaseZipAsset(latestRelease)
    const available = Boolean(
      installerReady &&
        latestCommit.sha &&
        releaseAsset?.browser_download_url &&
        buildMetadata.commitSha &&
        latestCommit.sha !== buildMetadata.commitSha,
    )

    cachedStatus = {
      available,
      installerReady,
      currentVersion: buildMetadata.version,
      currentCommitSha: buildMetadata.commitSha,
      latestCommitSha: latestCommit.sha,
      latestCommitMessage: latestCommit.message,
      latestPublishedAt: latestRelease?.published_at ?? latestCommit.committedAt,
      latestReleaseName: latestRelease?.name ?? latestRelease?.tag_name ?? null,
    }
    cachedStatusAt = now

    return cachedStatus
  } catch (error) {
    console.warn('[WindSound updater] Falha ao consultar atualizacoes', error)

    cachedStatus = {
      available: false,
      installerReady,
      currentVersion: buildMetadata.version,
      currentCommitSha: buildMetadata.commitSha,
      latestCommitSha: null,
      latestCommitMessage: null,
      latestPublishedAt: null,
      latestReleaseName: null,
    }
    cachedStatusAt = now

    return cachedStatus
  }
}

export const launchInstallerUpdate = async () => {
  const installerPath = resolveInstallerExecutable()

  if (!installerPath) {
    throw new Error('Instalador nao encontrado para iniciar a atualizacao.')
  }

  const buildMetadata = getBuildMetadata()
  const updateStatus = await getUpdateStatus(true)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsound-installer-'))
  const tempInstallerPath = path.join(tempDir, path.basename(installerPath))
  fs.copyFileSync(installerPath, tempInstallerPath)

  const targetDir = app.isPackaged ? path.dirname(process.execPath) : process.cwd()
  const args = [
    '--mode=update',
    `--target-dir=${targetDir}`,
    `--current-version=${buildMetadata.version}`,
    `--current-commit=${buildMetadata.commitSha}`,
  ]

  if (updateStatus.latestCommitSha) {
    args.push(`--latest-commit=${updateStatus.latestCommitSha}`)
  }

  const child = spawn(tempInstallerPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })

  child.unref()
  setTimeout(() => {
    app.quit()
  }, 250)

  return { ok: true }
}
