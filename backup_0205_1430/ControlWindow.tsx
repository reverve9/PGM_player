import { useEffect, useCallback, useState, useRef } from 'react'
import { 
  Settings, Monitor, MonitorOff, Maximize, Minimize,
  Play, Pause, Volume2, VolumeX,
  FolderOpen, Grid, List, RefreshCw,
  SkipBack, SkipForward, Square, Trash2, ChevronLeft, Folder,
  Plus, X, Copy, Radio, MousePointer
} from 'lucide-react'
import { usePlayerStore, useActivePlaylist, useCurrentPlayingItem } from '../stores/playerStore'
import SettingsPanel from './SettingsPanel'
import type { FileInfo } from '../types/electron.d'

function ControlWindow() {
  const [showSettings, setShowSettings] = useState(false)
  const [isPGMOpen, setIsPGMOpen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showVolumePopup, setShowVolumePopup] = useState(false)
  const [queueViewMode, setQueueViewMode] = useState<'thumbnail' | 'list'>('thumbnail')
  const [browserViewMode, setBrowserViewMode] = useState<'thumbnail' | 'list'>('thumbnail')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [activeFileTab, setActiveFileTab] = useState<'all' | 'video' | 'image'>('all')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTabName, setEditingTabName] = useState('')
  
  const pgmVideoRef = useRef<HTMLVideoElement>(null)
  const volumePopupRef = useRef<HTMLDivElement>(null)
  const tabInputRef = useRef<HTMLInputElement>(null)
  
  const {
    tabs,
    activeTabId,
    selectedIndex,
    currentTabId,
    currentIndex,
    browserPath,
    playerState,
    settings,
    addTab,
    removeTab,
    renameTab,
    duplicateTab,
    setActiveTab,
    addItems,
    removeItem,
    reorderPlaylist,
    setSelectedIndex,
    setCurrentIndex,
    setCurrentTabId,
    setBrowserPath,
    setPlayerState,
    setTabInputMode,
  } = usePlayerStore()

  // useRef로 최신 settings 추적 (클로저 문제 해결)
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  const playlist = useActivePlaylist()
  const currentPlayingItem = useCurrentPlayingItem()
  const selectedItem = selectedIndex >= 0 ? playlist[selectedIndex] : null

  // PGM 윈도우 상태 확인
  useEffect(() => {
    const checkPGM = async () => {
      const isOpen = await window.electronAPI.isPGMOpen()
      setIsPGMOpen(isOpen)
    }
    checkPGM()
    const interval = setInterval(checkPGM, 500)
    return () => clearInterval(interval)
  }, [])

  // 저장된 브라우저 경로 복원
  useEffect(() => {
    if (browserPath && !currentPath) {
      setCurrentPath(browserPath)
      loadFolder(browserPath)
    }
  }, [browserPath])

  // PGM에서 오는 메시지 수신 (ref로 최신 핸들러 추적, 리스너 한 번만 등록)
  const autoPlayNextRef = useRef<() => void>(() => {})
  const pgmHandlerRef = useRef<(data: any) => void>(() => {})
  
  useEffect(() => {
    pgmHandlerRef.current = (data: any) => {
      if (data.type === 'TIME_UPDATE') {
        setPlayerState({
          currentTime: data.currentTime,
          duration: data.duration,
        })
        // 독립 재생 중 드리프트 보정 (0.1초 이상 차이나면)
        if (pgmVideoRef.current && !pgmVideoRef.current.paused) {
          if (Math.abs(pgmVideoRef.current.currentTime - data.currentTime) > 0.1) {
            pgmVideoRef.current.currentTime = data.currentTime
          }
        }
      } else if (data.type === 'PLAYING') {
        setPlayerState({ isPlaying: true })
        // PGM 재생 시작 시점에 맞춰 미니 PGM도 시작
        if (pgmVideoRef.current) {
          if (typeof data.currentTime === 'number') {
            pgmVideoRef.current.currentTime = data.currentTime
          }
          pgmVideoRef.current.play().catch(() => {})
        }
      } else if (data.type === 'PAUSED') {
        setPlayerState({ isPlaying: false })
        pgmVideoRef.current?.pause()
      } else if (data.type === 'ENDED') {
        setPlayerState({ isPlaying: false })
        pgmVideoRef.current?.pause()
        if (settingsRef.current.autoPlay) {
          autoPlayNextRef.current()
        }
      }
    }
  })

  // 리스너 한 번만 등록
  useEffect(() => {
    window.electronAPI.onFromPGM((data: any) => {
      pgmHandlerRef.current(data)
    })
  }, [])

  // 다음 프리뷰 인덱스 계산 (자동플레이 설정에 따라)
  const getNextPreviewIndex = useCallback((currentIdx: number, items: typeof playlist) => {
    const autoPlay = settingsRef.current.autoPlay
    const loopMode = settingsRef.current.loopMode
    
    if (!autoPlay) {
      // 수동: 다음 항목 그대로 (이미지 포함)
      return currentIdx + 1 < items.length ? currentIdx + 1 : -1
    }
    
    if (loopMode === 'shuffle') {
      const videoIndices = items
        .map((item, i) => ({ item, i }))
        .filter(({ item, i }) => item.type === 'video' && i !== currentIdx)
        .map(({ i }) => i)
      
      if (videoIndices.length > 0) {
        return videoIndices[Math.floor(Math.random() * videoIndices.length)]
      }
      return -1
    }
    
    // 일반/순환: 다음 비디오 찾기
    for (let i = currentIdx + 1; i < items.length; i++) {
      if (items[i].type === 'video') return i
    }
    
    // 순환 모드면 처음부터 다시
    if (loopMode === 'loop') {
      for (let i = 0; i < currentIdx; i++) {
        if (items[i].type === 'video') return i
      }
    }
    
    return -1
  }, [playlist])

  // 외부입력 - 특정 inputMode 탭에서 재생 실행
  const handleExternalPlay = useCallback((mode: 'media' | 'presenter') => {
    const targetTab = tabs.find(t => t.inputMode === mode)
    if (!targetTab || !isPGMOpen) return
    
    const tabItems = targetTab.items
    // 현재 이 탭에서 재생 중인지 확인
    const isPlayingThisTab = currentTabId === targetTab.id
    
    if (mode === 'presenter') {
      // 프리젠터: 현재 선택된 프리뷰를 TAKE
      if (activeTabId === targetTab.id && selectedIndex >= 0) {
        const item = tabItems[selectedIndex]
        if (!item) return
        setPlayerState({ currentTime: 0, duration: 0 })
        window.electronAPI.sendToPGM({ type: 'PLAY', item })
        setCurrentTabId(targetTab.id)
        setCurrentIndex(selectedIndex)
        // 다음 프리뷰
        const nextPreview = getNextPreviewIndex(selectedIndex, tabItems)
        setSelectedIndex(nextPreview)
      } else if (!isPlayingThisTab && tabItems.length > 0) {
        // 아직 재생 안 한 상태면 첫 항목 재생
        setActiveTab(targetTab.id)
        setPlayerState({ currentTime: 0, duration: 0 })
        window.electronAPI.sendToPGM({ type: 'PLAY', item: tabItems[0] })
        setCurrentTabId(targetTab.id)
        setCurrentIndex(0)
        if (tabItems.length > 1) setSelectedIndex(1)
      }
    } else {
      // 미디어키: 재생/일시정지
      if (isPlayingThisTab && currentIndex >= 0) {
        window.electronAPI.sendToPGM({ type: playerState.isPlaying ? 'PAUSE' : 'RESUME' })
      } else if (tabItems.length > 0) {
        // 재생 시작
        const startIdx = activeTabId === targetTab.id && selectedIndex >= 0 ? selectedIndex : 0
        setActiveTab(targetTab.id)
        setPlayerState({ currentTime: 0, duration: 0 })
        window.electronAPI.sendToPGM({ type: 'PLAY', item: tabItems[startIdx] })
        setCurrentTabId(targetTab.id)
        setCurrentIndex(startIdx)
        const nextPreview = getNextPreviewIndex(startIdx, tabItems)
        setSelectedIndex(nextPreview)
      }
    }
  }, [tabs, isPGMOpen, currentTabId, activeTabId, selectedIndex, currentIndex, playerState.isPlaying,
      setPlayerState, setCurrentTabId, setCurrentIndex, setSelectedIndex, setActiveTab, getNextPreviewIndex])

  const handleExternalNext = useCallback((mode: 'media' | 'presenter') => {
    const targetTab = tabs.find(t => t.inputMode === mode)
    if (!targetTab || !isPGMOpen) return
    
    const tabItems = targetTab.items
    const isPlayingThisTab = currentTabId === targetTab.id
    
    if (isPlayingThisTab && playerState.isPlaying) {
      // 재생 중: 다음 항목 재생
      if (currentIndex + 1 >= tabItems.length) return
      const newIndex = currentIndex + 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: tabItems[newIndex] })
      setCurrentIndex(newIndex)
      if (activeTabId === targetTab.id) {
        const nextPreview = getNextPreviewIndex(newIndex, tabItems)
        setSelectedIndex(nextPreview)
      }
    } else if (activeTabId === targetTab.id) {
      // 정지 중: 프리뷰만 이동
      const nextIdx = selectedIndex + 1
      if (nextIdx < tabItems.length) {
        setSelectedIndex(nextIdx)
      }
    }
  }, [tabs, isPGMOpen, currentTabId, currentIndex, activeTabId, selectedIndex, playerState.isPlaying, setCurrentIndex, setSelectedIndex, getNextPreviewIndex])

  const handleExternalPrev = useCallback((mode: 'media' | 'presenter') => {
    const targetTab = tabs.find(t => t.inputMode === mode)
    if (!targetTab || !isPGMOpen) return
    
    const tabItems = targetTab.items
    const isPlayingThisTab = currentTabId === targetTab.id
    
    if (isPlayingThisTab && playerState.isPlaying) {
      // 재생 중: 이전 항목 재생
      if (currentIndex <= 0) return
      const newIndex = currentIndex - 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: tabItems[newIndex] })
      setCurrentIndex(newIndex)
      if (activeTabId === targetTab.id) {
        const nextPreview = getNextPreviewIndex(newIndex, tabItems)
        setSelectedIndex(nextPreview)
      }
    } else if (activeTabId === targetTab.id) {
      // 정지 중: 프리뷰만 이동
      if (selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1)
      }
    }
  }, [tabs, isPGMOpen, currentTabId, currentIndex, activeTabId, selectedIndex, playerState.isPlaying, setCurrentIndex, setSelectedIndex, getNextPreviewIndex])

  // 미디어 키 네이티브 헬퍼 관리
  useEffect(() => {
    const hasMediaTab = tabs.some(t => t.inputMode === 'media')
    
    if (hasMediaTab) {
      window.electronAPI.startMediaKeyHelper()
    } else {
      window.electronAPI.stopMediaKeyHelper()
    }
  }, [tabs])

  // 미디어 키 수신 (ref로 최신 핸들러 추적, 리스너 한 번만 등록)
  const mediaKeyHandlerRef = useRef<(key: string) => void>(() => {})
  
  useEffect(() => {
    mediaKeyHandlerRef.current = (key: string) => {
      const hasMediaTab = tabs.some(t => t.inputMode === 'media')
      if (!hasMediaTab) return
      
      switch (key) {
        case 'MediaPlayPause': handleExternalPlay('media'); break
        case 'MediaNextTrack': handleExternalNext('media'); break
        case 'MediaPreviousTrack': handleExternalPrev('media'); break
      }
    }
  })

  useEffect(() => {
    window.electronAPI.onMediaKey((key: string) => {
      mediaKeyHandlerRef.current(key)
    })
  }, [])

  // 자동 플레이
  const handleAutoPlayNext = useCallback(() => {
    if (!isPGMOpen || !currentTabId) return
    
    const playingTab = tabs.find(t => t.id === currentTabId)
    if (!playingTab) return
    
    const playlistItems = playingTab.items
    let nextIndex = -1
    const loopMode = settingsRef.current.loopMode
    
    if (loopMode === 'shuffle') {
      const videoIndices = playlistItems
        .map((item, i) => ({ item, i }))
        .filter(({ item, i }) => item.type === 'video' && i !== currentIndex)
        .map(({ i }) => i)
      
      if (videoIndices.length > 0) {
        nextIndex = videoIndices[Math.floor(Math.random() * videoIndices.length)]
      }
    } else {
      // 다음 비디오 찾기
      for (let i = currentIndex + 1; i < playlistItems.length; i++) {
        if (playlistItems[i].type === 'video') {
          nextIndex = i
          break
        }
      }
      // 순환 모드면 처음부터 다시 찾기
      if (nextIndex === -1 && loopMode === 'loop') {
        for (let i = 0; i < currentIndex; i++) {
          if (playlistItems[i].type === 'video') {
            nextIndex = i
            break
          }
        }
      }
    }
    
    if (nextIndex !== -1) {
      window.electronAPI.sendToPGM({ type: 'PLAY', item: playlistItems[nextIndex] })
      setCurrentIndex(nextIndex)
      
      // 다음 프리뷰 자동 선택
      if (currentTabId === activeTabId) {
        const nextPreview = getNextPreviewIndex(nextIndex, playlistItems)
        setSelectedIndex(nextPreview)
      }
    }
  }, [isPGMOpen, tabs, currentTabId, currentIndex, activeTabId, setSelectedIndex, setCurrentIndex, getNextPreviewIndex])
  
  useEffect(() => { autoPlayNextRef.current = handleAutoPlayNext }, [handleAutoPlayNext])

  // 볼륨 팝업 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (volumePopupRef.current && !volumePopupRef.current.contains(e.target as Node)) {
        setShowVolumePopup(false)
      }
    }
    if (showVolumePopup) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showVolumePopup])

  // 탭 이름 편집 시 입력 포커스
  useEffect(() => {
    if (editingTabId && tabInputRef.current) {
      tabInputRef.current.focus()
      tabInputRef.current.select()
    }
  }, [editingTabId])

  // PGM 열기/닫기
  const togglePGMWindow = useCallback(() => {
    if (isPGMOpen) {
      setCurrentIndex(-1)
      setCurrentTabId(null)
      setPlayerState({ isPlaying: false, currentTime: 0, duration: 0 })
      window.electronAPI.closePGMWindow()
      setIsPGMOpen(false)
    } else {
      window.electronAPI.openPGMWindow()
      setIsPGMOpen(true)
      
      setTimeout(() => {
        window.electronAPI.sendToPGM({ 
          type: 'SET_FADE_DURATION', 
          duration: settings.fadeEnabled ? settings.fadeDuration : 0 
        })
        if (settings.standbyImage) {
          window.electronAPI.sendToPGM({ type: 'SET_STANDBY_IMAGE', path: settings.standbyImage })
        }
      }, 500)
    }
  }, [isPGMOpen, setCurrentIndex, setCurrentTabId, setPlayerState, settings])

  const toggleFullscreen = useCallback(() => {
    window.electronAPI.togglePGMFullscreen()
  }, [])

  // 타임코드 포맷
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00:00'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 폴더 로드
  const loadFolder = useCallback(async (folderPath: string) => {
    setIsLoading(true)
    const result = await window.electronAPI.readFolder(folderPath)
    if (result.success && result.files) {
      setFiles(result.files)
      setCurrentPath(folderPath)
    } else {
      setFiles([])
    }
    setIsLoading(false)
  }, [])

  const handleSelectFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (folderPath) {
      setBrowserPath(folderPath)
      await loadFolder(folderPath)
    }
  }, [loadFolder, setBrowserPath])

  const handleRefreshFolder = useCallback(async () => {
    if (currentPath) await loadFolder(currentPath)
  }, [currentPath, loadFolder])

  const handleEnterFolder = useCallback(async (folderPath: string) => {
    await loadFolder(folderPath)
  }, [loadFolder])

  const handleGoUp = useCallback(async () => {
    if (!currentPath || !browserPath || currentPath === browserPath) return
    const parentPath = currentPath.split('/').slice(0, -1).join('/')
    if (parentPath.length >= browserPath.length) {
      await loadFolder(parentPath)
    }
  }, [currentPath, browserPath, loadFolder])

  const handleFolderDrop = useCallback(async (folderPath: string) => {
    const result = await window.electronAPI.readFolderContents(folderPath)
    if (result.success && result.files && result.files.length > 0) {
      const items = result.files.map(file => ({
        id: crypto.randomUUID(),
        name: file.name,
        path: file.path,
        type: file.type as 'video' | 'image'
      }))
      addItems(items)
    }
  }, [addItems])

  const filteredFiles = files.filter(file => 
    file.type === 'folder' || activeFileTab === 'all' || file.type === activeFileTab
  )

  // 탭 관리
  const handleAddTab = () => addTab()
  
  const handleRemoveTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length > 1) {
      removeTab(tabId)
    }
  }

  const handleDuplicateTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    duplicateTab(tabId)
  }

  const handleFinishEditTab = () => {
    if (editingTabId && editingTabName.trim()) {
      renameTab(editingTabId, editingTabName.trim())
    }
    setEditingTabId(null)
    setEditingTabName('')
  }

  // 파일 드래그
  const handleFileDragStart = (e: React.DragEvent, file: FileInfo) => {
    e.dataTransfer.setData('application/file', JSON.stringify(file))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleQueueDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleQueueDragLeave = () => setIsDragOver(false)

  const handleQueueDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const fileData = e.dataTransfer.getData('application/file')
    if (fileData) {
      try {
        const file: FileInfo = JSON.parse(fileData)
        if (file.type === 'folder') {
          await handleFolderDrop(file.path)
        } else {
          addItems([{ id: crypto.randomUUID(), name: file.name, path: file.path, type: file.type }])
        }
      } catch {}
    }
  }

  // 플레이큐 내 순서 변경
  const handleItemDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    
    const selectedItemId = selectedIndex >= 0 ? playlist[selectedIndex]?.id : null
    const currentItemId = currentTabId === activeTabId && currentIndex >= 0 ? playlist[currentIndex]?.id : null
    
    const newPlaylist = [...playlist]
    const [item] = newPlaylist.splice(draggedIndex, 1)
    newPlaylist.splice(index, 0, item)
    reorderPlaylist(newPlaylist)
    
    if (selectedItemId) {
      const newSelectedIndex = newPlaylist.findIndex(p => p.id === selectedItemId)
      if (newSelectedIndex !== -1 && newSelectedIndex !== selectedIndex) {
        setSelectedIndex(newSelectedIndex)
      }
    }
    if (currentItemId) {
      const newCurrentIndex = newPlaylist.findIndex(p => p.id === currentItemId)
      if (newCurrentIndex !== -1 && newCurrentIndex !== currentIndex) {
        setCurrentIndex(newCurrentIndex)
      }
    }
    
    setDraggedIndex(index)
  }

  const handleItemDragEnd = () => setDraggedIndex(null)

  const handleDeleteItem = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    removeItem(id)
  }, [removeItem])

  // TAKE → PGM
  const handleTake = useCallback(() => {
    if (!isPGMOpen || selectedIndex < 0) return
    const item = playlist[selectedIndex]
    if (!item) return
    
    setPlayerState({ currentTime: 0, duration: 0 })
    window.electronAPI.sendToPGM({ type: 'PLAY', item })
    setCurrentTabId(activeTabId)
    setCurrentIndex(selectedIndex)
    
    // 다음 프리뷰 자동 선택
    const nextPreview = getNextPreviewIndex(selectedIndex, playlist)
    setSelectedIndex(nextPreview)
  }, [isPGMOpen, selectedIndex, playlist, activeTabId, setCurrentTabId, setCurrentIndex, setPlayerState, setSelectedIndex, getNextPreviewIndex])

  // 컨트롤
  const handlePlayPause = useCallback(() => {
    if (!isPGMOpen || currentIndex < 0) return
    window.electronAPI.sendToPGM({ type: playerState.isPlaying ? 'PAUSE' : 'RESUME' })
  }, [isPGMOpen, currentIndex, playerState.isPlaying])

  const handleStop = useCallback(() => {
    if (!isPGMOpen) return
    window.electronAPI.sendToPGM({ type: 'STOP' })
    setCurrentIndex(-1)
    setCurrentTabId(null)
    setPlayerState({ isPlaying: false, currentTime: 0, duration: 0 })
  }, [isPGMOpen, setCurrentIndex, setCurrentTabId, setPlayerState])

  const handlePrev = useCallback(() => {
    const isPlayingInActive = currentTabId === activeTabId
    
    if (isPlayingInActive && playerState.isPlaying && currentIndex > 0) {
      // 재생 중: 이전 항목 바로 재생
      const playingTab = tabs.find(t => t.id === currentTabId)
      if (!playingTab) return
      const newIndex = currentIndex - 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: playingTab.items[newIndex] })
      setCurrentIndex(newIndex)
      const nextPreview = getNextPreviewIndex(newIndex, playingTab.items)
      setSelectedIndex(nextPreview)
    } else {
      // 정지/일시정지: 프리뷰만 이동
      if (selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1)
      }
    }
  }, [currentTabId, activeTabId, currentIndex, selectedIndex, tabs, playerState.isPlaying, isPGMOpen, setSelectedIndex, setCurrentIndex, getNextPreviewIndex])

  const handleNext = useCallback(() => {
    const isPlayingInActive = currentTabId === activeTabId
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab) return
    
    if (isPlayingInActive && playerState.isPlaying) {
      // 재생 중: 다음 항목 바로 재생
      if (currentIndex + 1 >= activeTab.items.length) return
      const newIndex = currentIndex + 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: activeTab.items[newIndex] })
      setCurrentIndex(newIndex)
      const nextPreview = getNextPreviewIndex(newIndex, activeTab.items)
      setSelectedIndex(nextPreview)
    } else {
      // 정지/일시정지: 프리뷰만 이동
      if (selectedIndex + 1 < activeTab.items.length) {
        setSelectedIndex(selectedIndex + 1)
      }
    }
  }, [currentTabId, activeTabId, currentIndex, selectedIndex, tabs, playerState.isPlaying, isPGMOpen, setSelectedIndex, setCurrentIndex, getNextPreviewIndex])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPGMOpen || playerState.duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const time = percent * playerState.duration
    window.electronAPI.sendToPGM({ type: 'SEEK', time })
  }, [isPGMOpen, playerState.duration])

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume)
    if (isPGMOpen) window.electronAPI.sendToPGM({ type: 'SET_VOLUME', volume: newVolume })
  }, [isPGMOpen])

  // 전역 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (showSettings) return
      
      const { shortcuts } = settings
      
      if (e.code === shortcuts.playPause) {
        e.preventDefault()
        if (isPGMOpen && currentIndex >= 0) {
          window.electronAPI.sendToPGM({ type: playerState.isPlaying ? 'PAUSE' : 'RESUME' })
        }
      } else if (e.code === shortcuts.playSelected) {
        e.preventDefault()
        handleTake()
      } else if (e.code === shortcuts.prev) {
        e.preventDefault()
        handlePrev()
      } else if (e.code === shortcuts.next) {
        e.preventDefault()
        handleNext()
      } else if (e.code === shortcuts.stop) {
        e.preventDefault()
        handleStop()
      } else if (e.code === shortcuts.fullscreen) {
        e.preventDefault()
        window.electronAPI.togglePGMFullscreen()
      } else if (e.code === shortcuts.togglePGM) {
        e.preventDefault()
        togglePGMWindow()
      } else if (e.code === shortcuts.moveUp) {
        e.preventDefault()
        if (selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
      } else if (e.code === shortcuts.moveDown) {
        e.preventDefault()
        if (selectedIndex < playlist.length - 1) setSelectedIndex(selectedIndex + 1)
      } else if (e.code === shortcuts.delete) {
        e.preventDefault()
        if (selectedIndex >= 0 && playlist[selectedIndex]) {
          removeItem(playlist[selectedIndex].id)
        }
      }
      
      // 프리젠터 키 처리
      const hasPresenterTab = tabs.some(t => t.inputMode === 'presenter')
      if (hasPresenterTab) {
        if (e.code === 'PageDown' || e.code === 'ArrowRight' || e.code === 'ArrowDown') {
          e.preventDefault()
          handleExternalPlay('presenter')
        } else if (e.code === 'PageUp' || e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
          e.preventDefault()
          handleExternalPrev('presenter')
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, settings, isPGMOpen, currentIndex, selectedIndex, playlist, playerState.isPlaying, 
      handleTake, handlePrev, handleNext, handleStop, togglePGMWindow, setSelectedIndex, removeItem,
      tabs, handleExternalPlay, handleExternalPrev])

  const getFileSrc = (path: string) => `file://${path}`

  const getRelativePath = () => {
    if (!currentPath || !browserPath) return ''
    if (currentPath === browserPath) return browserPath.split('/').pop() || ''
    return currentPath.replace(browserPath, browserPath.split('/').pop() || '')
  }

  const isPlayingInActiveTab = currentTabId === activeTabId
  const isTakeEnabled = isPGMOpen && selectedIndex >= 0

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* 헤더 */}
      <header className="header-main">
        <div className="flex items-center gap-3">
          <img 
            src="./logo.png?v=2"
            alt="PGM Player"
          />
          {settings.logoImage && (
            <img 
              src={`file://${settings.logoImage}`} 
              alt="Logo"
            />
          )}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button onClick={togglePGMWindow} className={`header-btn ${isPGMOpen ? 'active' : ''}`}>
            {isPGMOpen ? <Monitor size={18} /> : <MonitorOff size={18} />}
          </button>
          <button onClick={toggleFullscreen} className="header-btn">
            {playerState.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="header-btn">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* 좌측 패널 */}
        <div className="flex-[6] min-w-0 flex flex-col" style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)' }}>
          
          {/* 모니터 영역 */}
          <div className="p-4">
            <div className="flex gap-4 items-center">
              {/* PREVIEW */}
              <div className="flex-1">
                <div className="monitor-label monitor-label-pvw mb-2">Preview</div>
                <div className="monitor-frame">
                  {!selectedItem ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>선택된 항목 없음</span>
                    </div>
                  ) : selectedItem.type === 'video' ? (
                    <video
                      key={selectedItem.id}
                      src={getFileSrc(selectedItem.path)}
                      className="w-full h-full object-contain"
                      muted
                      preload="metadata"
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget
                        setPreviewDuration(video.duration)
                        video.currentTime = Math.min(1, video.duration * 0.1)
                      }}
                    />
                  ) : (
                    <img src={getFileSrc(selectedItem.path)} className="w-full h-full object-contain" alt="" />
                  )}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="timecode">00:00:00</span>
                  <span className="timecode">{selectedItem?.type === 'video' ? formatTime(previewDuration) : '--:--:--'}</span>
                </div>
              </div>

              {/* TAKE 버튼 */}
              <button 
                onClick={handleTake} 
                disabled={!isTakeEnabled}
                className={`take-btn ${isTakeEnabled ? 'enabled' : ''}`}
              >
                <span className="take-btn-icon">›</span>
                <span className="take-btn-label">Take</span>
              </button>

              {/* PGM */}
              <div className="flex-1">
                <div className="monitor-label monitor-label-pgm mb-2">Program</div>
                <div className="monitor-frame">
                  {playerState.isPlaying && (
                    <div className="live-badge-overlay">LIVE</div>
                  )}
                  {!isPGMOpen ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>PGM 윈도우 닫힘</span>
                    </div>
                  ) : !currentPlayingItem ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>대기 중</span>
                    </div>
                  ) : currentPlayingItem.type === 'video' ? (
                    <video
                      ref={pgmVideoRef}
                      key={currentPlayingItem.id}
                      src={getFileSrc(currentPlayingItem.path)}
                      className="w-full h-full object-contain"
                      muted
                      playsInline
                    />
                  ) : (
                    <img src={getFileSrc(currentPlayingItem.path)} className="w-full h-full object-contain" alt="" />
                  )}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="timecode">{formatTime(playerState.currentTime)}</span>
                  <span className="timecode">{formatTime(playerState.duration)}</span>
                </div>
              </div>
            </div>

            {/* 프로그레스바 + 컨트롤 */}
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="progress-track mb-4 relative group" onClick={handleSeek}>
                <div 
                  className="progress-fill" 
                  style={{ width: playerState.duration > 0 ? `${(playerState.currentTime / playerState.duration) * 100}%` : '0%' }} 
                />
                <div 
                  className="progress-thumb absolute top-1/2 -translate-y-1/2"
                  style={{ left: playerState.duration > 0 ? `calc(${(playerState.currentTime / playerState.duration) * 100}% - 5px)` : '0' }}
                />
              </div>

              <div className="flex items-center justify-center relative">
                <div className="flex items-center gap-1">
                  <button onClick={handlePrev} disabled={!isPGMOpen || !currentTabId || currentIndex <= 0} className="control-btn">
                    <SkipBack size={18} />
                  </button>
                  <button onClick={handlePlayPause} disabled={!isPGMOpen || currentIndex < 0} className="control-btn">
                    {playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button onClick={handleStop} disabled={!isPGMOpen || currentIndex < 0} className="control-btn">
                    <Square size={16} />
                  </button>
                  <button onClick={handleNext} disabled={!isPGMOpen || !currentTabId} className="control-btn">
                    <SkipForward size={18} />
                  </button>
                </div>

                <div className="absolute right-0" ref={volumePopupRef}>
                  <button onClick={() => setShowVolumePopup(!showVolumePopup)} className="control-btn">
                    {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  {showVolumePopup && (
                    <div className="volume-popup absolute bottom-full right-0 mb-2 w-12">
                      <div className="h-24 flex items-center justify-center">
                        <input
                          type="range" min="0" max="1" step="0.01" value={volume}
                          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                          className="w-20 -rotate-90" style={{ transformOrigin: 'center' }}
                        />
                      </div>
                      <div className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {Math.round(volume * 100)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 플레이큐 탭 */}
          <div className="tab-bar">
            {tabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-item ${activeTabId === tab.id ? 'active' : ''} ${currentTabId === tab.id ? 'playing' : ''}`}
              >
                {editingTabId === tab.id ? (
                  <input
                    ref={tabInputRef}
                    value={editingTabName}
                    onChange={(e) => setEditingTabName(e.target.value)}
                    onBlur={handleFinishEditTab}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishEditTab()
                      if (e.key === 'Escape') {
                        setEditingTabId(null)
                        setEditingTabName('')
                      }
                    }}
                    className="w-20 px-1 text-xs rounded"
                    style={{ background: 'var(--bg-elevated)', border: 'none', color: 'var(--text-primary)' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span onDoubleClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id); setEditingTabName(tab.name) }}>{tab.name} ({tab.items.length})</span>
                    {currentTabId === tab.id && <span className="tab-live-badge">LIVE</span>}
                    {tab.inputMode === 'media' && <span className="tab-input-badge" title="미디어 컨트롤러"><Radio size={9} /></span>}
                    {tab.inputMode === 'presenter' && <span className="tab-input-badge" title="프리젠터"><MousePointer size={9} /></span>}
                  </>
                )}
                
                {activeTabId === tab.id && !editingTabId && (
                  <button onClick={(e) => handleDuplicateTab(tab.id, e)} className="tab-btn duplicate" title="복제">
                    <Copy size={10} />
                  </button>
                )}
                
                {tabs.length > 1 && (
                  <button onClick={(e) => handleRemoveTab(tab.id, e)} className="tab-btn delete">
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
            
            <button onClick={handleAddTab} className="tab-add-btn" title="새 탭 추가">
              <Plus size={14} />
            </button>
            
            <div className="flex-1" />

            <div className="view-toggle mr-2">
              <button className={`view-toggle-btn ${queueViewMode === 'thumbnail' ? 'active' : ''}`} onClick={() => setQueueViewMode('thumbnail')}><Grid size={12} /></button>
              <button className={`view-toggle-btn ${queueViewMode === 'list' ? 'active' : ''}`} onClick={() => setQueueViewMode('list')}><List size={12} /></button>
            </div>
          </div>

          {/* 플레이 큐 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* 외부입력 모드 바 */}
            <div className="flex items-center justify-end px-2" style={{ height: '28px', flexShrink: 0, background: 'var(--bg-card)' }}>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => { const tab = tabs.find(t => t.id === activeTabId); if (tab) setTabInputMode(tab.id, tab.inputMode === 'media' ? 'none' : 'media') }} 
                  className={`input-mode-btn ${tabs.find(t => t.id === activeTabId)?.inputMode === 'media' ? 'active' : ''}`} 
                  title="미디어 컨트롤러"
                >
                  <Radio size={12} />
                </button>
                <button 
                  onClick={() => { const tab = tabs.find(t => t.id === activeTabId); if (tab) setTabInputMode(tab.id, tab.inputMode === 'presenter' ? 'none' : 'presenter') }} 
                  className={`input-mode-btn ${tabs.find(t => t.id === activeTabId)?.inputMode === 'presenter' ? 'active' : ''}`} 
                  title="프리젠터"
                >
                  <MousePointer size={12} />
                </button>
              </div>
            </div>

            <div 
              className={`flex-1 overflow-y-auto ${isDragOver ? 'drag-over' : ''}`}
              style={{ background: 'var(--bg-card)' }}
              onDragOver={handleQueueDragOver} 
              onDragLeave={handleQueueDragLeave} 
              onDrop={handleQueueDrop}
            >
            {playlist.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={32} className="empty-state-icon" />
                <p>{isDragOver ? '여기에 놓으세요!' : '우측에서 파일을 드래그하세요'}</p>
              </div>
            ) : queueViewMode === 'thumbnail' ? (
              <div className="queue-grid">
                {playlist.map((item, index) => (
                  <div 
                    key={item.id} 
                    draggable
                    onClick={() => setSelectedIndex(index)}
                    onDragStart={(e) => handleItemDragStart(e, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDragEnd={handleItemDragEnd}
                    className={`queue-item ${draggedIndex === index ? 'dragging' : ''} ${isPlayingInActiveTab && currentIndex === index ? 'playing' : selectedIndex === index ? 'selected' : ''}`}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '20%', overflow: 'hidden' }}>
                      {item.type === 'image' ? (
                        <img src={getFileSrc(item.path)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <video 
                          src={getFileSrc(item.path)} 
                          className="w-full h-full object-cover" 
                          preload="metadata" 
                          muted
                          onLoadedData={(e) => {
                            const video = e.currentTarget
                            video.currentTime = Math.min(1, video.duration * 0.1)
                          }}
                        />
                      )}
                      <button onClick={(e) => handleDeleteItem(item.id, e)} className="queue-item-delete">
                        <Trash2 size={10} />
                      </button>
                      {isPlayingInActiveTab && currentIndex === index && <span className="queue-item-badge live">LIVE</span>}
                      {selectedIndex === index && !(isPlayingInActiveTab && currentIndex === index) && <span className="queue-item-badge pvw">PVW</span>}
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%', display: 'flex', alignItems: 'center', padding: '0 6%', background: item.type === 'image' ? '#d4763b' : '#3b6fd4' }}>
                      <span style={{ color: '#fff', fontSize: 'clamp(7px, 1.1vw, 11px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{item.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {playlist.map((item, index) => (
                  <div 
                    key={item.id} 
                    draggable
                    onClick={() => setSelectedIndex(index)}
                    onDragStart={(e) => handleItemDragStart(e, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDragEnd={handleItemDragEnd}
                    className={`flex items-center gap-2 p-2 rounded cursor-grab ${draggedIndex === index ? 'opacity-50' : ''}`}
                    style={{ 
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${isPlayingInActiveTab && currentIndex === index ? 'var(--accent-red)' : selectedIndex === index ? 'var(--accent-green)' : 'transparent'}`
                    }}
                  >
                    <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0" style={{ background: 'var(--bg-base)' }}>
                      {item.type === 'image' ? (
                        <img src={getFileSrc(item.path)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <video src={getFileSrc(item.path)} className="w-full h-full object-cover" preload="metadata" muted
                          onLoadedData={(e) => { e.currentTarget.currentTime = Math.min(1, e.currentTarget.duration * 0.1) }}
                        />
                      )}
                    </div>
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                    {isPlayingInActiveTab && currentIndex === index && <span className="queue-item-badge live" style={{ position: 'static' }}>LIVE</span>}
                    {selectedIndex === index && !(isPlayingInActiveTab && currentIndex === index) && <span className="queue-item-badge pvw" style={{ position: 'static' }}>PVW</span>}
                    <button onClick={(e) => handleDeleteItem(item.id, e)} className="control-btn opacity-0 hover:opacity-100">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* 우측 파일 브라우저 */}
        <div className="flex-[4] min-w-0 flex flex-col" style={{ background: 'var(--bg-base)' }}>
          <div className="browser-toolbar">
            <button onClick={handleSelectFolder} className="browser-btn">
              <FolderOpen size={14} />
              <span>{browserPath ? '변경' : '폴더 선택'}</span>
            </button>
            {browserPath && (
              <>
                <button onClick={handleGoUp} className="browser-btn" disabled={currentPath === browserPath}>
                  <ChevronLeft size={14} />
                </button>
                <button onClick={handleRefreshFolder} className="browser-btn" disabled={isLoading}>
                  <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                </button>
                <span className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{getRelativePath()}</span>
              </>
            )}
            <div className="view-toggle">
              <button className={`view-toggle-btn ${browserViewMode === 'thumbnail' ? 'active' : ''}`} onClick={() => setBrowserViewMode('thumbnail')}><Grid size={12} /></button>
              <button className={`view-toggle-btn ${browserViewMode === 'list' ? 'active' : ''}`} onClick={() => setBrowserViewMode('list')}><List size={12} /></button>
            </div>
          </div>

          <div className="browser-tabs">
            {(['all', 'video', 'image'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveFileTab(tab)} className={`browser-tab ${activeFileTab === tab ? 'active' : ''}`}>
                {tab === 'all' ? '전체' : tab === 'video' ? '영상' : '이미지'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-card)' }}>
            {!browserPath ? (
              <div className="empty-state">
                <FolderOpen size={32} className="empty-state-icon" />
                <p>폴더를 선택해주세요</p>
              </div>
            ) : isLoading ? (
              <div className="empty-state"><p>로딩 중...</p></div>
            ) : filteredFiles.length === 0 ? (
              <div className="empty-state"><p>파일이 없습니다</p></div>
            ) : browserViewMode === 'thumbnail' ? (
              <div className="browser-grid">
                {filteredFiles.map(file => (
                  file.type === 'folder' ? (
                    <div 
                      key={file.path} 
                      draggable 
                      onDragStart={(e) => handleFileDragStart(e, file)}
                      onClick={() => handleEnterFolder(file.path)}
                      className="browser-item folder" 
                      title={`${file.name} (클릭: 열기, 드래그: 전체 추가)`}
                    >
                      <Folder size={24} style={{ color: '#d4a853' }} />
                      <span className="text-[9px] text-center truncate w-full px-1" style={{ color: 'var(--text-secondary)' }}>{file.name}</span>
                    </div>
                  ) : (
                    <div key={file.path} draggable onDragStart={(e) => handleFileDragStart(e, file)} className="browser-item" title={file.name}>
                      {file.type === 'image' ? (
                        <img src={getFileSrc(file.path)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <video src={getFileSrc(file.path)} className="w-full h-full object-cover" preload="metadata" muted
                          onLoadedData={(e) => { e.currentTarget.currentTime = Math.min(1, e.currentTarget.duration * 0.1) }}
                        />
                      )}
                    </div>
                  )
                ))}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredFiles.map(file => (
                  file.type === 'folder' ? (
                    <div 
                      key={file.path} 
                      draggable 
                      onDragStart={(e) => handleFileDragStart(e, file)}
                      onClick={() => handleEnterFolder(file.path)}
                      className="flex items-center gap-2 p-2 rounded cursor-pointer"
                      style={{ background: 'var(--bg-elevated)' }}
                    >
                      <Folder size={18} style={{ color: '#d4a853' }} />
                      <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>{file.name}</span>
                    </div>
                  ) : (
                    <div key={file.path} draggable onDragStart={(e) => handleFileDragStart(e, file)}
                      className="flex items-center gap-2 p-2 rounded cursor-grab"
                      style={{ background: 'var(--bg-elevated)' }}
                    >
                      <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0" style={{ background: 'var(--bg-base)' }}>
                        {file.type === 'image' ? (
                          <img src={getFileSrc(file.path)} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <video src={getFileSrc(file.path)} className="w-full h-full object-cover" preload="metadata" muted
                            onLoadedData={(e) => { e.currentTarget.currentTime = Math.min(1, e.currentTarget.duration * 0.1) }}
                          />
                        )}
                      </div>
                      <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>{file.name}</span>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 상태바 */}
      <div className="status-bar" style={{ justifyContent: 'flex-end', gap: '8px' }}>
        <span style={{ color: 'var(--text-primary)' }}>Copyright @ 2026 REVERVE9</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Special Thanks to Crystal</span>
      </div>
    </div>
  )
}

export default ControlWindow
