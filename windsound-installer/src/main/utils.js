const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { spawn } = require('child_process')
const os = require('os')
const { createWriteStream } = require('fs')

const GITHUB_REPO = 'murasssh/WindSound'
const UPDATE_CHANNEL_TAG = 'installer-live'
const UPDATE_BUNDLE_ASSET_NAME = 'WindSound_Windows_x64.zip'
const GITHUB_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${UPDATE_CHANNEL_TAG}`
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), 'AppData', 'Local', 'WindSound')
const APP_EXECUTABLE_NAME = 'WindSound.exe'

const requestJson = (url) =>
  new Promise((resolve, reject) => {
    const requester = url.startsWith('https:') ? https : http
    const req = requester.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WindSound-Installer/2.0',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          requestJson(res.headers.location).then(resolve).catch(reject)
          return
        }

        if (res.statusCode !== 200) {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            body += chunk
          })
          res.on('end', () => {
            reject(new Error(`GitHub respondeu com status ${res.statusCode}: ${body.slice(0, 240)}`))
          })
          return
        }

        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch (error) {
            reject(error)
          }
        })
      },
    )

    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout ao consultar a release do GitHub'))
    })
  })

const getLatestRelease = () => requestJson(GITHUB_RELEASE_URL)

const getWindowsBundleAsset = (release) => {
  if (!release || !Array.isArray(release.assets)) {
    return null
  }

  for (let index = 0; index < release.assets.length; index += 1) {
    const asset = release.assets[index]
    const assetName = (asset.name || '').toLowerCase()

    if (asset.name === UPDATE_BUNDLE_ASSET_NAME) {
      return asset
    }

    if (assetName.endsWith('.zip') && assetName.includes('windows')) {
      return asset
    }
  }

  return null
}

const downloadFile = (url, destPath, onProgress) =>
  new Promise((resolve, reject) => {
    const doRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 8) {
        reject(new Error('Muitos redirecionamentos durante o download'))
        return
      }

      const parsedUrl = new URL(requestUrl)
      const requester = parsedUrl.protocol === 'https:' ? https : http

      const req = requester.get(
        requestUrl,
        { headers: { 'User-Agent': 'WindSound-Installer/2.0' } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            doRequest(res.headers.location, redirectCount + 1)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} ao baixar o pacote do WindSound`))
            return
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
          let downloaded = 0
          const file = createWriteStream(destPath)

          res.on('data', (chunk) => {
            downloaded += chunk.length

            if (totalBytes > 0 && onProgress) {
              onProgress(Math.floor((downloaded / totalBytes) * 100))
            }
          })

          res.pipe(file)

          file.on('finish', () => {
            file.close()
            resolve()
          })

          file.on('error', (error) => {
            fs.unlink(destPath, () => {})
            reject(error)
          })
        },
      )

      req.on('error', reject)
      req.setTimeout(120000, () => {
        req.destroy()
        reject(new Error('Timeout ao baixar o pacote do WindSound'))
      })
    }

    doRequest(url)
  })

const extractZip = (zipPath, destDir) =>
  new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${destDir}"`,
    ])

    let stderr = ''
    ps.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    ps.on('error', reject)
    ps.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Falha ao extrair o pacote (${code}): ${stderr.trim()}`))
        return
      }

      resolve()
    })
  })

const removePath = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    return
  }

  fs.rmSync(targetPath, { recursive: true, force: true })
}

const copyDirectoryContents = (sourceDir, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true })

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath)
      continue
    }

    fs.copyFileSync(sourcePath, targetPath)
  }
}

const replaceDirectoryContents = (sourceDir, targetDir, onLog, preserveNames = []) => {
  fs.mkdirSync(targetDir, { recursive: true })

  const preserveSet = new Set(preserveNames)
  const currentEntries = fs.readdirSync(targetDir)
  for (let index = 0; index < currentEntries.length; index += 1) {
    const entry = currentEntries[index]
    if (preserveSet.has(entry)) {
      continue
    }

    removePath(path.join(targetDir, entry))
  }

  copyDirectoryContents(sourceDir, targetDir)

  if (onLog) {
    onLog('✓ Arquivos do app atualizados sem tocar nos dados salvos da conta')
  }
}

const resolvePortableRoot = (extractDir) => {
  const stack = [{ dir: extractDir, depth: 0 }]

  while (stack.length > 0) {
    const current = stack.pop()

    if (!current) {
      continue
    }

    const executablePath = path.join(current.dir, APP_EXECUTABLE_NAME)
    const resourcesPath = path.join(current.dir, 'resources')

    if (fs.existsSync(executablePath) && fs.existsSync(resourcesPath)) {
      return current.dir
    }

    if (current.depth >= 4) {
      continue
    }

    const entries = fs.readdirSync(current.dir, { withFileTypes: true })
    for (let index = 0; index < entries.length; index += 1) {
      if (entries[index].isDirectory()) {
        stack.push({ dir: path.join(current.dir, entries[index].name), depth: current.depth + 1 })
      }
    }
  }

  return null
}

const findExecutableInDir = (targetDir) => {
  const directPath = path.join(targetDir, APP_EXECUTABLE_NAME)
  if (fs.existsSync(directPath)) {
    return directPath
  }

  const stack = [targetDir]
  while (stack.length > 0) {
    const currentDir = stack.pop()
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const entryPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        stack.push(entryPath)
        continue
      }

      if (entry.name === APP_EXECUTABLE_NAME) {
        return entryPath
      }
    }
  }

  return null
}

const createDesktopShortcut = (targetExe, onLog) => {
  try {
    const desktopPath = path.join(os.homedir(), 'Desktop')
    const shortcutPath = path.join(desktopPath, 'WindSound.lnk')
    const ps = `
      $WshShell = New-Object -ComObject WScript.Shell
      $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
      $Shortcut.TargetPath = '${targetExe.replace(/'/g, "''")}'
      $Shortcut.WorkingDirectory = '${path.dirname(targetExe).replace(/'/g, "''")}'
      $Shortcut.Description = 'WindSound - Player de Musica'
      $Shortcut.Save()
    `
    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    proc.on('close', (code) => {
      if (!onLog) {
        return
      }

      if (code === 0) {
        onLog('✓ Atalho criado na Area de Trabalho')
      } else {
        onLog('[warn] Nao foi possivel criar o atalho da Area de Trabalho')
      }
    })
  } catch {
    if (onLog) {
      onLog('[warn] Falha ao criar o atalho da Area de Trabalho')
    }
  }
}

module.exports = {
  APP_EXECUTABLE_NAME,
  DEFAULT_INSTALL_DIR,
  createDesktopShortcut,
  downloadFile,
  extractZip,
  findExecutableInDir,
  getLatestRelease,
  getWindowsBundleAsset,
  replaceDirectoryContents,
  resolvePortableRoot,
}
