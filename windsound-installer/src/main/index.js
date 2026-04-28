const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { existsSync } = require('fs')
const { runInstall } = require('./installer')
const { DEFAULT_INSTALL_DIR } = require('./utils')

const parseLaunchContext = (argv) => {
  const context = {
    mode: 'install',
    targetDir: DEFAULT_INSTALL_DIR,
    currentVersion: null,
    currentCommit: null,
    latestCommit: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--mode=update') {
      context.mode = 'update'
      continue
    }

    if (arg.startsWith('--target-dir=')) {
      context.targetDir = arg.slice('--target-dir='.length)
      continue
    }

    if (arg.startsWith('--current-version=')) {
      context.currentVersion = arg.slice('--current-version='.length)
      continue
    }

    if (arg.startsWith('--current-commit=')) {
      context.currentCommit = arg.slice('--current-commit='.length)
      continue
    }

    if (arg.startsWith('--latest-commit=')) {
      context.latestCommit = arg.slice('--latest-commit='.length)
    }
  }

  return context
}

const launchContext = parseLaunchContext(process.argv.slice(1))

let mainWindow = null
let installDir = launchContext.targetDir || DEFAULT_INSTALL_DIR

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 620,
    resizable: false,
    title: launchContext.mode === 'update' ? 'WindSound Updater' : 'WindSound Installer',
    backgroundColor: '#08111f',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#08111f',
      symbolColor: '#f5f5f5',
      height: 30,
    },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

const sendStep = (step, status, message, progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install:step', { step, status, message, progress })
  }
}

const sendLog = (line) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install:log', line)
  }
}

const sendError = (message) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install:error', message)
  }
}

const sendDone = (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install:done', payload)
  }
}

const callbacks = { sendStep, sendLog, sendError, sendDone }

ipcMain.handle('installer:get-context', () => launchContext)

ipcMain.handle('installer:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolher pasta do WindSound',
    defaultPath: installDir,
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || !result.filePaths[0]) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('installer:get-default-dir', () => installDir)

ipcMain.handle('installer:start', async (_event, targetDir) => {
  installDir = targetDir || installDir || DEFAULT_INSTALL_DIR
  void runInstall(installDir, callbacks, { ...launchContext, targetDir: installDir })
  return { ok: true }
})

ipcMain.handle('installer:open-exe', async (_event, exePath) => {
  if (exePath && existsSync(exePath)) {
    await shell.openPath(exePath)
    return true
  }

  await shell.openPath(installDir)
  return false
})

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.disableHardwareAcceleration()

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
