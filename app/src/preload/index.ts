import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ElectronAPI } from '../types/electron-api'

import os from 'os'
import path from 'path'
// Remove micCapture import since it's causing a TypeScript error
// and move the functionality to the main process instead

const api: ElectronAPI = {  
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      console.log('Sending IPC message:', channel, ...args)
      ipcRenderer.send(channel, ...args)
    },
    on: (channel: string, func: (...args: any[]) => void) => {
      console.log('Setting up IPC listener for:', channel)
      ipcRenderer.on(channel, (event, ...args) => func(...args))
    },
    invoke: (channel: string, ...args: any[]) => {
      console.log('Invoking IPC:', channel, ...args)
      return ipcRenderer.invoke(channel, ...args)
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel)
    },
    selectFolder: async (): Promise<string | null> => {
      return await ipcRenderer.invoke('select-folder')
    },
    showInFolder: (path: string): void => {
      ipcRenderer.send('show-in-folder', path)
    },
  
    // Screen recording operations
    checkPermissions: async (): Promise<boolean> => {
      return await ipcRenderer.invoke('check-permissions')
    },
    startRecording: async (options: { recFolder: string; recFilename: string; trFolder: string; trFilename: string }): Promise<{ success: boolean; error?: string }> => {
      return await ipcRenderer.invoke('start-recording', options)
    },
    stopRecording: async (): Promise<{ success: boolean; error?: string }> => {
      return await ipcRenderer.invoke('stop-recording')
    },
    checkMediaAccess: (mediaType: 'microphone') => ipcRenderer.invoke('check-media-access', mediaType),
  
    // Media sources
    getMediaSources: () => ipcRenderer.invoke('get-media-sources'),
    
    // Audio data
    sendAudioData: (data: Uint8Array) => ipcRenderer.send('audio-data', data),
    startMic: async (): Promise<void> => {
      const { startMic } = await import('../renderer/micCapture');
      return startMic();
    },
    

    off: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, callback)
    },
    testQuery: async () => {
      return await ipcRenderer.invoke('test-query')
    }
  },
  path: {
    join: (...paths: string[]) => path.join(...paths)
  },
  os: {
    homedir: () => os.homedir(),
    platform: () => os.platform(),
    arch: () => os.arch()
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('Electron', api)
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.Electron = api
  // @ts-ignore (define in dts)
  window.electron = api
}
