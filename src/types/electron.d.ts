export interface Display {
  id: number
  index: number
  label: string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  primary: boolean
}

export interface FileInfo {
  name: string
  path: string
  type: 'video' | 'image' | 'audio' | 'folder'
  size: number
  modified: number
}

export interface ElectronAPI {
  selectFiles: () => Promise<string[]>
  selectImage: () => Promise<string | null>
  selectFolder: () => Promise<string | null>
  readFolder: (folderPath: string) => Promise<{ success: boolean; files?: FileInfo[]; error?: string }>
  readFolderContents: (folderPath: string) => Promise<{ success: boolean; files?: FileInfo[]; error?: string }>
  
  // PGM 윈도우 관리
  openPGMWindow: () => void
  closePGMWindow: () => void
  isPGMOpen: () => Promise<boolean>
  
  sendToPGM: (data: unknown) => void
  sendToControl: (data: unknown) => void
  onFromControl: (callback: (data: unknown) => void) => void
  onFromPGM: (callback: (data: unknown) => void) => void
  onPGMClosed: (callback: () => void) => void
  getDisplays: () => Promise<Display[]>
  movePGMToDisplay: (index: number) => void
  togglePGMFullscreen: () => void
  getPGMFullscreen: () => Promise<boolean>
  setPGMFullscreen: (fullscreen: boolean) => void
  resizePGMWindow: (width: number, height: number) => void
  extractStreamUrl: (url: string) => Promise<{ success: boolean; url?: string; title?: string; error?: string }>
  startMediaKeyHelper: () => void
  stopMediaKeyHelper: () => void
  onMediaKey: (callback: (key: string) => void) => void
  onMediaKeyStatus: (callback: (status: string) => void) => void
  setPresenterLocked: (locked: boolean) => void
  setPresenterKeys: (keys: { next: string; prev: string }) => void

  // 개별 탭 윈도우 관리
  openTabWindow: (tabId: string, tabName: string) => void
  closeTabWindow: (tabId: string) => void
  isTabOpen: (tabId: string) => Promise<boolean>
  toggleTabAlwaysOnTop: (tabId: string) => Promise<boolean>
  sendTabState: (state: unknown) => void
  onTabStateUpdate: (callback: (state: unknown) => void) => void
  sendTabAction: (action: unknown) => void
  onTabAction: (callback: (action: unknown) => void) => void
  onTabDocked: (callback: (tabId: string) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
