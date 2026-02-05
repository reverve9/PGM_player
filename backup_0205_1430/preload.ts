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
  
  onFromControl: (callback: (data: unknown) => void) => {
    ipcRenderer.on('from-control', (_event, data) => callback(data))
  },
  onFromPGM: (callback: (data: unknown) => void) => {
    ipcRenderer.on('from-pgm', (_event, data) => callback(data))
  },
  onPGMClosed: (callback: () => void) => {
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
  
  // URL 스트림 추출 (YouTube 등)
  extractStreamUrl: (url: string) => ipcRenderer.invoke('extract-stream-url', url),
  
  // 미디어 키 헬퍼
  startMediaKeyHelper: () => ipcRenderer.send('start-media-key-helper'),
  stopMediaKeyHelper: () => ipcRenderer.send('stop-media-key-helper'),
  onMediaKey: (callback: (key: string) => void) => {
    ipcRenderer.on('media-key', (_event, key) => callback(key))
  },
  onMediaKeyStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('media-key-status', (_event, status) => callback(status))
  },
})

export {}
