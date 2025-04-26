import type { ElectronAPI } from '../types/electron-api'

declare global {
  interface Window {
    Electron: ElectronAPI
  }
}

export { }; 