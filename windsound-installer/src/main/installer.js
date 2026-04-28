const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  createDesktopShortcut,
  downloadFile,
  extractZip,
  findExecutableInDir,
  getLatestRelease,
  getWindowsBundleAsset,
  replaceDirectoryContents,
  resolvePortableRoot,
} = require('./utils')

const runInstall = async (targetDir, callbacks, options = {}) => {
  const { sendStep, sendLog, sendError, sendDone } = callbacks
  const mode = options.mode === 'update' ? 'update' : 'install'
  const modeLabel = mode === 'update' ? 'atualizacao' : 'instalacao'

  let zipPath = null
  let extractDir = null

  try {
    fs.mkdirSync(targetDir, { recursive: true })

    sendLog(`Preparando ${modeLabel} do WindSound...`)
    sendLog('Os dados da conta e da sessao ficam preservados em %AppData%\\windsound.')

    sendStep('download', 'running', 'Buscando a release mais recente...', 0)
    const release = await getLatestRelease()
    const bundleAsset = getWindowsBundleAsset(release)

    if (!bundleAsset?.browser_download_url) {
      throw new Error('Nenhum pacote Windows (.zip) foi encontrado na release mais recente do GitHub.')
    }

    zipPath = path.join(os.tmpdir(), `windsound-release-${Date.now()}.zip`)
    sendLog(`Baixando ${bundleAsset.name || 'pacote do WindSound'}...`)
    await downloadFile(bundleAsset.browser_download_url, zipPath, (progress) => {
      sendStep('download', 'running', `Baixando pacote... ${progress}%`, progress)
    })
    sendStep('download', 'done', 'Pacote baixado com sucesso', 100)
    sendLog(`✓ Release pronta: ${release.name || release.tag_name || 'WindSound'}`)

    sendStep('extract', 'running', 'Extraindo pacote otimizado...', 0)
    extractDir = path.join(os.tmpdir(), `windsound-extract-${Date.now()}`)
    fs.mkdirSync(extractDir, { recursive: true })
    await extractZip(zipPath, extractDir)

    const portableRoot = resolvePortableRoot(extractDir)
    if (!portableRoot) {
      throw new Error('Nao foi possivel localizar o pacote portatil do WindSound dentro do zip baixado.')
    }

    sendStep('extract', 'done', 'Pacote extraido', 100)
    sendLog('✓ Pacote extraido para staging temporario')

    sendStep(
      'replace',
      'running',
      mode === 'update' ? 'Aplicando atualizacao sem perder os dados...' : 'Instalando arquivos do app...',
      35,
    )
    replaceDirectoryContents(portableRoot, targetDir, sendLog)
    const exePath = findExecutableInDir(targetDir)

    if (!exePath) {
      throw new Error('A atualizacao terminou, mas o executavel do WindSound nao foi encontrado na pasta final.')
    }

    sendStep('replace', 'done', mode === 'update' ? 'Atualizacao aplicada' : 'Arquivos instalados', 100)
    sendLog(`✓ Executavel principal localizado em ${exePath}`)

    sendStep('shortcut', 'running', 'Configurando acesso rapido...', 40)
    createDesktopShortcut(exePath, sendLog)
    sendStep('shortcut', 'done', 'Tudo pronto', 100)

    sendLog('')
    if (mode === 'update') {
      sendLog('🎵 WindSound atualizado com sucesso!')
    } else {
      sendLog('🎵 WindSound instalado com sucesso!')
    }
    sendLog(`📂 Pasta final: ${targetDir}`)

    sendDone({
      exePath,
      mode,
      targetDir,
      releaseName: release.name || release.tag_name || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendLog(`[ERROR] ${message}`)
    sendError(message)
  } finally {
    if (zipPath && fs.existsSync(zipPath)) {
      fs.rmSync(zipPath, { force: true })
    }

    if (extractDir && fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true })
    }
  }
}

module.exports = { runInstall }
