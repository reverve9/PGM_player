import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let controlWindow: BrowserWindow | null = null
let pgmWindow: BrowserWindow | null = null
let pgmWindowBounds = { x: 0, y: 0, width: 1920, height: 1080 }
let boundsBeforeFullscreen = { x: 0, y: 0, width: 1920, height: 1080 } // 전체화면 전 bounds 별도 저장

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged

function createControlWindow() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.focus()
    return
  }

  controlWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'PGM Player',
    backgroundColor: '#f8f9fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // file:// 프로토콜 접근 허용
    },
  })

  if (isDev) {
    controlWindow.loadURL('http://localhost:5173?window=control')
    // DevTools는 Cmd+Option+I로 수동으로 열기
  } else {
    controlWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { window: 'control' }
    })
  }

  controlWindow.on('closed', () => {
    controlWindow = null
    if (pgmWindow) {
      pgmWindow.close()
    }
    app.quit()
  })
}

function createPGMWindow() {
  if (pgmWindow && !pgmWindow.isDestroyed()) {
    pgmWindow.focus()
    return
  }

  const displays = screen.getAllDisplays()
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0
  })

  const targetDisplay = externalDisplay || displays[0]

  pgmWindow = new BrowserWindow({
    x: targetDisplay.bounds.x + 50,
    y: targetDisplay.bounds.y + 50,
    width: 1920,
    height: 1080,
    fullscreen: false,
    fullscreenable: true,
    frame: true,
    backgroundColor: '#000000',
    title: 'PGM Output',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false, // 로컬 파일 재생 허용
    },
  })
  
  // 초기 위치+크기 저장
  pgmWindowBounds = {
    x: targetDisplay.bounds.x + 50,
    y: targetDisplay.bounds.y + 50,
    width: 1920,
    height: 1080
  }
  boundsBeforeFullscreen = { ...pgmWindowBounds }

  if (isDev) {
    pgmWindow.loadURL('http://localhost:5173?window=pgm')
  } else {
    pgmWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { window: 'pgm' }
    })
  }

  pgmWindow.on('closed', () => {
    pgmWindow = null
    // Control 윈도우에 PGM 닫힘 알림
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('pgm-closed')
    }
  })
}

app.whenReady().then(() => {
  createControlWindow()
  // PGM 윈도우는 사용자가 열기 전까지 생성하지 않음

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers

// 파일 선택 다이얼로그
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(controlWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'] }
    ]
  })
  return result.filePaths
})

// 이미지 선택 다이얼로그 (대기 화면용)
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(controlWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  })
  return result.filePaths[0] || null
})

// PGM 윈도우 열기
ipcMain.on('open-pgm-window', () => {
  createPGMWindow()
})

// PGM 윈도우 닫기
ipcMain.on('close-pgm-window', () => {
  if (pgmWindow) {
    pgmWindow.close()
    pgmWindow = null
  }
})

// PGM 윈도우 상태 확인
ipcMain.handle('is-pgm-open', () => {
  return pgmWindow !== null && !pgmWindow.isDestroyed()
})

// PGM 윈도우로 메시지 전송
ipcMain.on('to-pgm', (_event, data) => {
  if (pgmWindow) {
    pgmWindow.webContents.send('from-control', data)
  }
})

// Control 윈도우로 메시지 전송
ipcMain.on('to-control', (_event, data) => {
  if (controlWindow) {
    controlWindow.webContents.send('from-pgm', data)
  }
})

// PGM 전체화면 토글
ipcMain.on('toggle-pgm-fullscreen', () => {
  console.log('toggle-pgm-fullscreen called, pgmWindow:', !!pgmWindow)
  if (pgmWindow) {
    const isFullScreen = pgmWindow.isSimpleFullScreen()
    console.log('current fullscreen:', isFullScreen, '-> setting to:', !isFullScreen)
    
    if (!isFullScreen) {
      // 전체화면 전에 현재 위치+크기 저장
      const bounds = pgmWindow.getBounds()
      boundsBeforeFullscreen = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      console.log('saving bounds:', boundsBeforeFullscreen)
      pgmWindow.setSimpleFullScreen(true)
      pgmWindow.setAlwaysOnTop(true, 'screen-saver') // 항상 최상위
      pgmWindow.webContents.insertCSS('* { cursor: none !important; }')
    } else {
      // 전체화면 해제
      pgmWindow.setAlwaysOnTop(false)
      pgmWindow.setSimpleFullScreen(false)
      pgmWindow.webContents.insertCSS('* { cursor: auto !important; }')
      
      // 약간의 딜레이 후 bounds 복원
      setTimeout(() => {
        if (pgmWindow && !pgmWindow.isDestroyed()) {
          console.log('restoring bounds:', boundsBeforeFullscreen)
          pgmWindow.setBounds(boundsBeforeFullscreen)
        }
      }, 100)
    }
  }
})

// PGM 전체화면 상태 가져오기
ipcMain.handle('get-pgm-fullscreen', () => {
  return pgmWindow?.isSimpleFullScreen() || false
})

// PGM 전체화면 설정
ipcMain.on('set-pgm-fullscreen', (_event, fullscreen: boolean) => {
  if (pgmWindow) {
    if (fullscreen) {
      const bounds = pgmWindow.getBounds()
      boundsBeforeFullscreen = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      pgmWindow.setSimpleFullScreen(true)
      pgmWindow.setAlwaysOnTop(true, 'screen-saver')
      pgmWindow.webContents.insertCSS('* { cursor: none !important; }')
    } else {
      pgmWindow.setAlwaysOnTop(false)
      pgmWindow.setSimpleFullScreen(false)
      pgmWindow.webContents.insertCSS('* { cursor: auto !important; }')
      
      setTimeout(() => {
        if (pgmWindow && !pgmWindow.isDestroyed()) {
          pgmWindow.setBounds(boundsBeforeFullscreen)
        }
      }, 100)
    }
  }
})

// PGM 윈도우 크기 조절 (영상 크기에 맞춤)
ipcMain.on('resize-pgm-window', (_event, width: number, height: number) => {
  if (pgmWindow && !pgmWindow.isSimpleFullScreen()) {
    // 화면 크기 제한 (최소 640x360, 최대 화면 크기)
    const display = screen.getPrimaryDisplay()
    const maxWidth = display.workAreaSize.width - 100
    const maxHeight = display.workAreaSize.height - 100
    
    const newWidth = Math.max(640, Math.min(width, maxWidth))
    const newHeight = Math.max(360, Math.min(height, maxHeight))
    
    // 현재 위치 유지하면서 content 크기만 변경
    const currentBounds = pgmWindow.getBounds()
    pgmWindow.setContentSize(newWidth, newHeight)
    
    // 새 bounds 저장 (둘 다 업데이트)
    const newBounds = pgmWindow.getBounds()
    const savedBounds = { x: currentBounds.x, y: currentBounds.y, width: newBounds.width, height: newBounds.height }
    pgmWindowBounds = savedBounds
    boundsBeforeFullscreen = savedBounds
  }
})

// PGM 윈도우를 특정 모니터로 이동
ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    index: i,
    label: d.label || `Display ${i + 1}`,
    bounds: d.bounds,
    primary: d.bounds.x === 0 && d.bounds.y === 0
  }))
})

ipcMain.on('move-pgm-to-display', (_event, displayIndex: number) => {
  const displays = screen.getAllDisplays()
  if (displays[displayIndex] && pgmWindow) {
    const display = displays[displayIndex]
    // 현재 윈도우 크기 유지하면서 해당 디스플레이로 이동
    const currentSize = pgmWindow.getSize()
    const newBounds = {
      x: display.bounds.x + 50,
      y: display.bounds.y + 50,
      width: currentSize[0],
      height: currentSize[1]
    }
    pgmWindow.setBounds(newBounds)
    // 둘 다 업데이트
    pgmWindowBounds = newBounds
    boundsBeforeFullscreen = newBounds
  }
})

// YouTube 등 URL에서 실제 스트림 URL 추출
ipcMain.handle('extract-stream-url', async (_event, url: string) => {
  try {
    // yt-dlp로 best 포맷 URL 추출
    const { stdout } = await execAsync(`yt-dlp -f "best[height<=1080]" -g --no-warnings "${url}"`)
    const streamUrl = stdout.trim().split('\n')[0]
    
    // 제목도 가져오기
    const { stdout: titleOut } = await execAsync(`yt-dlp --get-title --no-warnings "${url}"`)
    const title = titleOut.trim()
    
    if (streamUrl) {
      return { success: true, url: streamUrl, title }
    }
    
    return { success: false, error: 'No stream URL found' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// 폴더 선택 다이얼로그
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(controlWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: '미디어 폴더 선택'
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  
  return result.filePaths[0]
})

// 지원하는 확장자
const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

// 폴더 내 파일/폴더 목록 가져오기
ipcMain.handle('read-folder', async (_event, folderPath: string) => {
  const fs = await import('fs/promises')
  const pathModule = await import('path')
  
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true })
    const items: any[] = []
    
    for (const entry of entries) {
      // 숨김 파일/폴더 제외
      if (entry.name.startsWith('.')) continue
      
      const fullPath = pathModule.join(folderPath, entry.name)
      
      if (entry.isDirectory()) {
        // 폴더
        items.push({
          name: entry.name,
          path: fullPath,
          type: 'folder',
          size: 0,
          modified: 0
        })
      } else if (entry.isFile()) {
        const ext = pathModule.extname(entry.name).toLowerCase()
        let type: 'video' | 'image' | null = null
        
        if (videoExts.includes(ext)) {
          type = 'video'
        } else if (imageExts.includes(ext)) {
          type = 'image'
        }
        
        if (type) {
          const stats = await fs.stat(fullPath)
          items.push({
            name: entry.name,
            path: fullPath,
            type,
            size: stats.size,
            modified: stats.mtime.getTime()
          })
        }
      }
    }
    
    // 폴더 먼저, 그다음 이름순 정렬
    items.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1
      if (a.type !== 'folder' && b.type === 'folder') return 1
      return a.name.localeCompare(b.name)
    })
    
    return { success: true, files: items }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// 폴더 내 모든 미디어 파일 가져오기 (재귀)
ipcMain.handle('read-folder-contents', async (_event, folderPath: string) => {
  const fs = await import('fs/promises')
  const pathModule = await import('path')
  
  const mediaFiles: any[] = []
  
  async function scanFolder(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        
        const fullPath = pathModule.join(dir, entry.name)
        
        if (entry.isDirectory()) {
          await scanFolder(fullPath) // 재귀
        } else if (entry.isFile()) {
          const ext = pathModule.extname(entry.name).toLowerCase()
          let type: 'video' | 'image' | null = null
          
          if (videoExts.includes(ext)) {
            type = 'video'
          } else if (imageExts.includes(ext)) {
            type = 'image'
          }
          
          if (type) {
            mediaFiles.push({
              name: entry.name,
              path: fullPath,
              type
            })
          }
        }
      }
    } catch {}
  }
  
  await scanFolder(folderPath)
  
  // 이름순 정렬
  mediaFiles.sort((a, b) => a.name.localeCompare(b.name))
  
  return { success: true, files: mediaFiles }
})
