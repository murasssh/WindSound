import { spawnSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, createWriteStream, rmSync, readdirSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import https from 'node:https'
import os from 'node:os'

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(scriptPath), '..')

const run = (command, options = {}) => {
  console.log(`\n> ${command}\n`)
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

const NODE_VERSION = 'v20.11.1'
const NODE_ZIP_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`
const RESOURCES_DIR = path.join(projectRoot, 'resources')
const NODE_DIR = path.join(RESOURCES_DIR, 'node')

const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject)
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to get '${url}' (${response.statusCode})`))
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      rmSync(destPath, { force: true })
      reject(err)
    })
  })
}

const extractZip = (zipPath, destDir) => {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${destDir}"`
    ])
    ps.on('close', (code) => {
      if (code !== 0) reject(new Error(`Extraction failed with code ${code}`))
      else resolve()
    })
  })
}

const ensureNodePortable = async () => {
  if (existsSync(path.join(NODE_DIR, 'node.exe'))) {
    console.log(`✅ Node.js portátil já existe em: ${NODE_DIR}`)
    return
  }

  console.log('📦 Baixando Node.js portátil para o instalador...')
  mkdirSync(RESOURCES_DIR, { recursive: true })
  
  const zipPath = path.join(os.tmpdir(), `node-portable-${Date.now()}.zip`)
  const extractDir = path.join(os.tmpdir(), `node-extract-${Date.now()}`)
  
  try {
    await downloadFile(NODE_ZIP_URL, zipPath)
    console.log('📦 Extraindo Node.js portátil...')
    mkdirSync(extractDir, { recursive: true })
    await extractZip(zipPath, extractDir)
    
    // O zip do node geralmente cria uma subpasta (ex: node-v20.11.1-win-x64)
    const contents = readdirSync(extractDir)
    const nodeSubDir = contents.find(d => d.startsWith('node-'))
    const sourceDir = nodeSubDir ? path.join(extractDir, nodeSubDir) : extractDir
    
    // Renomeia a pasta extraída para 'node'
    renameSync(sourceDir, NODE_DIR)
    console.log('✅ Node.js portátil configurado com sucesso!')
  } finally {
    // Cleanup
    rmSync(zipPath, { force: true })
    rmSync(extractDir, { recursive: true, force: true })
  }
}

const buildInstaller = async () => {
  try {
    console.log('🔨 Preparando dependências do instalador...')
    await ensureNodePortable()

    console.log('\n🔨 Buildando WindSound Installer...')
    run(
      'npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false',
      { env: process.env }
    )

    const outputDir = path.join(projectRoot, 'dist-installer')
    let portableExe = null
    if (existsSync(outputDir)) {
      try {
        const files = readdirSync(outputDir)
        const exe = files.find((f) => f.endsWith('.exe'))
        if (exe) portableExe = path.join(outputDir, exe)
      } catch {}
    }

    console.log('\n✅ Instalador gerado com sucesso!')
    if (portableExe) {
      console.log(`🚀 Executável: ${portableExe}`)
    } else {
      console.log(`📂 Output: ${outputDir}`)
    }
  } catch (err) {
    console.error('\n❌ Erro durante o build:', err.message)
    process.exit(1)
  }
}

buildInstaller()
