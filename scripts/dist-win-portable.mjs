import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(scriptPath), '..')
const iconPath = path.join(projectRoot, 'build', 'icon.ico')
const unpackedExePath = path.join(projectRoot, 'dist', 'win-unpacked', 'WindSound.exe')
const releaseZipPath = path.join(projectRoot, 'dist', 'WindSound_Windows_x64.zip')

const run = (command, options = {}) => {
  const result = spawnSync(command, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`)
  }
}

const findLatestRcedit = () => {
  const localAppData = process.env.LOCALAPPDATA

  if (!localAppData) {
    throw new Error('LOCALAPPDATA nao definido para localizar o cache do electron-builder.')
  }

  const cacheRoot = path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign')

  if (!existsSync(cacheRoot)) {
    throw new Error('Cache do winCodeSign nao encontrado.')
  }

  const candidates = readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(cacheRoot, entry.name)
      return {
        fullPath,
        rceditPath: path.join(fullPath, 'rcedit-x64.exe'),
        mtimeMs: statSync(fullPath).mtimeMs,
      }
    })
    .filter((entry) => existsSync(entry.rceditPath))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  if (candidates.length === 0) {
    throw new Error('rcedit-x64.exe nao encontrado no cache do winCodeSign.')
  }

  return candidates[0].rceditPath
}

const patchExecutableIcon = (rceditPath, executablePath) => {
  if (!existsSync(executablePath)) {
    return
  }

  run(`"${rceditPath}" "${executablePath}" --set-icon "${iconPath}"`)
}

const createReleaseZip = () => {
  if (existsSync(releaseZipPath)) {
    run(`powershell -NoProfile -Command "Remove-Item -LiteralPath '${releaseZipPath}' -Force"`)
  }

  run(
    `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(projectRoot, 'dist', 'win-unpacked', '*')}' -DestinationPath '${releaseZipPath}' -Force"`,
  )
}

const stopPreviousBuildProcesses = () => {
  const unpackedPattern = `${path.join(projectRoot, 'dist', 'win-unpacked')}*`
  const portablePattern = `${path.join(projectRoot, 'dist', 'WindSound_Portable_')}*`

  run(
    `powershell -NoProfile -Command "$unpacked='${unpackedPattern}'; $portable='${portablePattern}'; Get-Process WindSound* -ErrorAction SilentlyContinue | Where-Object { $_.Path -like $unpacked -or $_.Path -like $portable } | Stop-Process -Force"`,
  )
}

stopPreviousBuildProcesses()
run('npm run icons:win')
run('npm run build:web')
run('npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false', {
  env: process.env,
})

const rceditPath = findLatestRcedit()
patchExecutableIcon(rceditPath, unpackedExePath)
createReleaseZip()
