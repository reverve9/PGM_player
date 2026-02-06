import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 선택
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectImage: () => ipcRenderer.invoke('select-image'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readFolder: (folderPath: string) => ipcRenderer.invoke('read-folder', folderPath),
  readFolderContents: (folderPath: string) => ipcRenderer.invoke('read-folder-contents', folderPath),
  
  // PGM 윈도우 관리
  openPGMWindow: () => ipcRenderer.send('open-pgm-window'),
  closePGMWindow: () => ipcRenderer.send('close-pgm-window'),
  isPGMOpen: () => ipcRenderer.invoke('is-pgm-open'),
  
  // 윈도우 간 통신
  sendToPGM: (data: unknown) => ipcRenderer.send('to-pgm', data),
  sendToControl: (data: unknown) => ipcRenderer.send('to-control', data),
  
  // 리스너 등록 (기존 리스너 제거 후 등록 — 누적 방지)
  onFromControl: (callback: (data: unknown) => void) => {
    ipcRenderer.removeAllListeners('from-control')
    ipcRenderer.on('from-control', (_event, data) => callback(data))
  },
  onFromPGM: (callback: (data: unknown) => void) => {
    ipcRenderer.removeAllListeners('from-pgm')
    ipcRenderer.on('from-pgm', (_event, data) => callback(data))
  },
  onPGMClosed: (callback: () => void) => {
    ipcRenderer.removeAllListeners('pgm-closed')
    ipcRenderer.on('pgm-closed', () => callback())
  },
  
  // 디스플레이 관리
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  movePGMToDisplay: (index: number) => ipcRenderer.send('move-pgm-to-display', index),
  
  // 전체화면 관리
  togglePGMFullscreen: () => ipcRenderer.send('toggle-pgm-fullscreen'),
  getPGMFullscreen: () => ipcRenderer.invoke('get-pgm-fullscreen'),
  setPGMFullscreen: (fullscreen: boolean) => ipcRenderer.send('set-pgm-fullscreen', fullscreen),
  resizePGMWindow: (width: number, height: number) => ipcRenderer.send('resize-pgm-window', width, height),
  
  // 미디어 키 헬퍼
  startMediaKeyHelper: () => ipcRenderer.send('start-media-key-helper'),
  stopMediaKeyHelper: () => ipcRenderer.send('stop-media-key-helper'),
  onMediaKey: (callback: (key: string) => void) => {
    ipcRenderer.removeAllListeners('media-key')
    ipcRenderer.on('media-key', (_event, key) => callback(key))
  },
  onMediaKeyStatus: (callback: (status: string) => void) => {
    ipcRenderer.removeAllListeners('media-key-status')
    ipcRenderer.on('media-key-status', (_event, status) => callback(status))
  },
  
  // 프리젠터 잠금
  setPresenterLocked: (locked: boolean) => ipcRenderer.send('set-presenter-locked', locked),

  // 프리젠터 키 설정  ← 여기 추가
  setPresenterKeys: (keys: { next: string; prev: string }) => ipcRenderer.send('set-presenter-keys', keys),

  // 개별 탭 윈도우 관리
  openTabWindow: (tabId: string, tabName: string) => ipcRenderer.send('open-tab-window', tabId, tabName),
  closeTabWindow: (tabId: string) => ipcRenderer.send('close-tab-window', tabId),
  isTabOpen: (tabId: string) => ipcRenderer.invoke('is-tab-open', tabId),
  toggleTabAlwaysOnTop: (tabId: string) => ipcRenderer.invoke('toggle-tab-always-on-top', tabId),
  sendTabState: (state: unknown) => ipcRenderer.send('tab-sync-state', state),
  onTabStateUpdate: (callback: (state: unknown) => void) => {
    ipcRenderer.removeAllListeners('tab-state-update')
    ipcRenderer.on('tab-state-update', (_event, state) => callback(state))
  },
  sendTabAction: (action: unknown) => ipcRenderer.send('tab-action', action),
  onTabAction: (callback: (action: unknown) => void) => {
    ipcRenderer.removeAllListeners('tab-action')
    ipcRenderer.on('tab-action', (_event, action) => callback(action))
  },
  onTabDocked: (callback: (tabId: string) => void) => {
    ipcRenderer.removeAllListeners('tab-docked')
    ipcRenderer.on('tab-docked', (_event, tabId) => callback(tabId))
  },
})

export {}
