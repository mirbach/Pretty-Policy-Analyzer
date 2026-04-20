import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { startSidecar, stopSidecar, getSidecarPort } from './sidecar';

// Log to a file so we can diagnose packaged-app issues
const logFile = path.join(app.getPath('userData'), 'app.log');
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trimEnd());
  try { fs.appendFileSync(logFile, line); } catch { /* ignore */ }
}

const APP_NAME = 'Pretty Policy Analyzer';

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.prettypolicyanalyzer.app');
}

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;
const appIconPath = path.join(__dirname, '..', 'electron', 'icon.ico');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'), {
      query: { port: String(getSidecarPort()) },
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  log('app ready');
  // Start Python sidecar — create the window regardless so errors are visible
  try {
    await startSidecar();
    log('sidecar started');
  } catch (err) {
    log(`Failed to start backend sidecar: ${err}`);
  }

  createWindow();
  log('window created');

  // Port is already passed via query string; IPC is a belt-and-suspenders fallback
  mainWindow!.webContents.on('did-finish-load', () => {
    log('renderer did-finish-load, sending api-port');
    mainWindow!.webContents.send('api-port', getSidecarPort());
  });
});

app.on('window-all-closed', () => {
  stopSidecar();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopSidecar();
});

// IPC: open folder dialog
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select GPO Backup Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
