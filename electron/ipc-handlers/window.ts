// electron/ipc/window.ts
import { ipcMain, BrowserWindow } from 'electron';

export function registerWindowIPC(mainWindow: BrowserWindow) {
  ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
  });

  ipcMain.on('maximize-restore-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    mainWindow.close();
  });

  // Optionally, send window state changes to renderer
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-state-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state-changed', false));
}
