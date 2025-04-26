
declare global {
  interface Window {
    Electron: ElectronAPI
  }
}

export interface ElectronAPI {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => void
    on: (channel: string, func: (...args: any[]) => void) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
    removeAllListeners: (channel: string) => void
    selectFolder: () => Promise<string | null>
    showInFolder: (path: string) => void
    checkPermissions: () => Promise<boolean>
    checkMediaAccess: (mediaType: 'microphone') => Promise<boolean>
    getMediaSources: () => Promise<MediaSource[]>
    sendAudioData: (data: Uint8Array) => void
    startRecording: (options: { recFolder: string; recFilename: string; trFolder: string; trFilename: string }) => Promise<{ success: boolean; error?: string }>
    stopRecording: () => Promise<{ success: boolean; error?: string }>
    off: (channel: string, callback: (...args: any[]) => void) => void
    startMic: () => Promise<void>
    testQuery: () => Promise<{ success: boolean; data?: string; error?: string }>
  }
  path: {
    join: (...paths: string[]) => string
  }
  os: {
    homedir: () => string
    platform: () => string
    arch: () => string
  }
}

