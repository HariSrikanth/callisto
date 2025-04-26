import { app, shell, BrowserWindow, ipcMain, dialog, desktopCapturer, systemPreferences } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { checkPermissions } from '../utils/permission'
import { startRecording, stopRecording } from '../utils/recording'
import * as dotenv from 'dotenv'
import { writeFileSync } from 'fs'
import { makeQuery } from '../utils/mcp'

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, '../../.env') })

let mainWindow: BrowserWindow | null = null

// Helper function to check and request media access
async function checkMediaAccess(mediaType: 'microphone'): Promise<boolean> {
  const status = systemPreferences.getMediaAccessStatus(mediaType)
  if (status === 'not-determined') {
    return await systemPreferences.askForMediaAccess(mediaType)
  }
  return status === 'granted'
}

// Helper function to check screen capture access
async function checkScreenAccess(): Promise<boolean> {
  return systemPreferences.getMediaAccessStatus('screen') === 'granted'
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Make API key available to renderer process
  process.env.ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Desktop Capture IPC Handlers
  ipcMain.handle('get-media-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 }
    })
    return sources
  })

  // Media Access IPC Handlers
  ipcMain.handle('check-media-access', async (_event, mediaType: 'microphone') => {
    return await checkMediaAccess(mediaType)
  })

  // Screen Recording IPC Handlers
  ipcMain.handle('check-permissions', async () => {
    const micAccess = await checkMediaAccess('microphone')
    const screenAccess = await checkScreenAccess()
    return micAccess && screenAccess
  })

  ipcMain.handle('start-recording', async (_event, { recFolder, recFilename, trFolder, trFilename }) => {
    if (!mainWindow) {
      throw new Error('Main window is not initialized')
    }

    // Check permissions before starting
    const micAccess = await checkMediaAccess('microphone')
    const screenAccess = await checkScreenAccess()
    if (!micAccess || !screenAccess) {
      throw new Error('Missing required permissions')
    }

    await startRecording({ recFolder, recFilename, trFolder, trFilename, window: mainWindow })
    return { success: true }
  })

  ipcMain.handle('stop-recording', () => {
    stopRecording()
    return { success: true }
  })

  // Folder selection handlers
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.on('show-in-folder', (_event, path) => {
    shell.showItemInFolder(path)
  })

  // IPC Handlers
  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      writeFileSync(filePath, content, 'utf8')
      return { success: true }
    } catch (error) {
      console.error('Error writing file:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error writing file'
      }
    }
  })

  // Handle test query
  ipcMain.handle('test-query', async () => {
    try {
      const response = await makeQuery("Research the startup Cardless");
      return { success: true, data: response };
    } catch (error) {
      console.error('Query error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})