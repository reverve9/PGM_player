import { useEffect, useCallback, useState, useRef } from 'react'
import { 
  Settings, Monitor, MonitorOff, Maximize, Minimize,
  Play, Pause, Volume2, VolumeX,
  FolderOpen, Grid, List, RefreshCw,
  SkipBack, SkipForward, Square, Trash2, ChevronLeft, Folder,
  Plus, X, Copy, MousePointer, Music, PanelRightOpen,
  Repeat, Repeat1
} from 'lucide-react'
import { usePlayerStore, useActivePlaylist, useCurrentPlayingItem } from '../stores/playerStore'
import SettingsPanel from './SettingsPanel'
import type { FileInfo } from '../types/electron.d'

function ControlWindow() {
  const [showSettings, setShowSettings] = useState(false)
  const [isPGMOpen, setIsPGMOpen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showVolumePopup, setShowVolumePopup] = useState(false)
  const [pgmMuted, setPgmMuted] = useState(false)
  const [queueViewMode, setQueueViewMode] = useState<'thumbnail' | 'list'>('thumbnail')
  const [browserViewMode, setBrowserViewMode] = useState<'thumbnail' | 'list'>('thumbnail')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [activeFileTab, setActiveFileTab] = useState<'all' | 'video' | 'image' | 'audio'>('all')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [previewResolution, setPreviewResolution] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTabName, setEditingTabName] = useState('')
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null)
  const [audioVolume, setAudioVolume] = useState(1)
  const [audioMuted, setAudioMuted] = useState(false)
  const [showAudioVolumePopup, setShowAudioVolumePopup] = useState(false)
  const [audioLoopMode, setAudioLoopMode] = useState<'none' | 'all' | 'one'>('none')
  const [detachedTabIds, setDetachedTabIds] = useState<Set<string>>(new Set())
  
  const pgmVideoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
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
    reorderTabs,
    setSelectedIndex,
    setCurrentIndex,
    setCurrentTabId,
    setBrowserPath,
    setPlayerState,
    presenterLocked,
    setPresenterLocked,
    audioTabId,
    audioIndex,
    audioIsPlaying,
    audioCurrentTime,
    audioDuration,
    setAudioTabId,
    setAudioIndex,
    setAudioState,
    updateSettings,
  } = usePlayerStore()

  // useRef로 최신 settings 추적 (클로저 문제 해결)
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  const playlist = useActivePlaylist()
  const currentPlayingItem = useCurrentPlayingItem()
  
  // 프리뷰는 활성 탭과 독립 — 어느 탭에서 선택했는지 별도 추적
  const [previewTabId, setPreviewTabId] = useState<string>(activeTabId)
  const previewPlaylist = tabs.find(t => t.id === previewTabId)?.items || []
  const selectedItem = selectedIndex >= 0 ? previewPlaylist[selectedIndex] : null

  // 큐 아이템 포커스 (오디오 포함 모든 아이템의 시각적 선택)
  const [queueFocusIndex, setQueueFocusIndex] = useState<number>(-1)
  
  // 탭 전환 시 큐 포커스 리셋
  useEffect(() => { setQueueFocusIndex(-1) }, [activeTabId])

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

  // presenterLocked 상태를 main process에 동기화 (앱 시작/변경 시)
  useEffect(() => {
    window.electronAPI.setPresenterLocked(presenterLocked)
  }, [presenterLocked])

  // presenterKeys를 main process에 동기화
  useEffect(() => {
    window.electronAPI.setPresenterKeys(settings.presenterKeys)
  }, [settings.presenterKeys])

  // 탭 윈도우 상태 동기화
  useEffect(() => {
    if (detachedTabIds.size === 0) return
    
    const syncState = () => {
      const s = usePlayerStore.getState()
      window.electronAPI.sendTabState({
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        selectedIndex: s.selectedIndex,
        currentTabId: s.currentTabId,
        currentIndex: s.currentIndex,
        playerIsPlaying: s.playerState.isPlaying,
        audioTabId: s.audioTabId,
        audioIndex: s.audioIndex,
        audioIsPlaying: s.audioIsPlaying,
        audioCurrentTime: s.audioCurrentTime,
        audioDuration: s.audioDuration,
        autoPlay: s.settings.autoPlay,
        audioVolume,
        audioMuted,
        audioLoopMode,
        queueViewMode,
      })
    }
    
    // 초기 상태 전송 (약간 딜레이)
    const initTimer = setTimeout(syncState, 300)
    
    // 상태 변경 구독
    const unsub = usePlayerStore.subscribe(syncState)
    
    return () => {
      clearTimeout(initTimer)
      unsub()
    }
  }, [detachedTabIds.size, audioVolume, audioMuted, audioLoopMode, queueViewMode])

  // 탭 윈도우 복귀 알림 수신
  useEffect(() => {
    window.electronAPI.onTabDocked((tabId: string) => {
      setDetachedTabIds(prev => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
    })
  }, [])

  // PGM에서 오는 메시지 수신 (ref로 최신 핸들러 추적, 리스너 한 번만 등록)
  const autoPlayNextRef = useRef<() => void>(() => {})
  const pgmHandlerRef = useRef<(data: any) => void>(() => {})
  
  useEffect(() => {
    pgmHandlerRef.current = (data: any) => {
      if (data.type === 'TIME_UPDATE') {
        // 정지 상태면 TIME_UPDATE 무시 (프로그레스바 초기화 유지)
        if (currentIndex < 0) return
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

// 미디어 키 네이티브 헬퍼 시작
  useEffect(() => {
    window.electronAPI.startMediaKeyHelper()
    return () => window.electronAPI.stopMediaKeyHelper()
  }, [])

  // 프리젠터 Next (전역 - 라이브 탭 우선, 없으면 활성 탭)
  // 잠금은 main process에서 before-input-event로 차단하므로 여기선 체크 불필요
  const handlePresenterNext = useCallback(() => {
    if (!isPGMOpen) return
    
    // 라이브 탭 우선, 없으면 활성 탭
    const targetTabId = currentTabId || activeTabId
    const targetTab = tabs.find(t => t.id === targetTabId)
    if (!targetTab) return
    
    const tabItems = targetTab.items
    
    if (currentTabId) {
      // PGM에 탭이 올라가 있으면: 라이브 탭 기준으로 다음 재생
      if (currentIndex + 1 >= tabItems.length) return
      const newIndex = currentIndex + 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: tabItems[newIndex] })
      setCurrentTabId(targetTab.id)
      setCurrentIndex(newIndex)
      const nextPreview = getNextPreviewIndex(newIndex, tabItems)
      setPreviewTabId(targetTab.id)
      setSelectedIndex(nextPreview)
    } else {
      // PGM 없음: 프리뷰만 이동
      const nextIdx = selectedIndex + 1
      if (nextIdx < tabItems.length) {
        setPreviewTabId(targetTab.id)
        setSelectedIndex(nextIdx)
      }
    }
  }, [isPGMOpen, currentTabId, activeTabId, tabs, currentIndex, selectedIndex, 
      setCurrentIndex, setCurrentTabId, setSelectedIndex, getNextPreviewIndex])

  const handlePresenterPrev = useCallback(() => {
    if (!isPGMOpen) return
    
    const targetTabId = currentTabId || activeTabId
    const targetTab = tabs.find(t => t.id === targetTabId)
    if (!targetTab) return
    
    const tabItems = targetTab.items
    
    if (currentTabId) {
      // PGM에 탭이 올라가 있으면: 라이브 탭 기준으로 이전 재생
      if (currentIndex <= 0) return
      const newIndex = currentIndex - 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: tabItems[newIndex] })
      setCurrentTabId(targetTab.id)
      setCurrentIndex(newIndex)
      const nextPreview = getNextPreviewIndex(newIndex, tabItems)
      setPreviewTabId(targetTab.id)
      setSelectedIndex(nextPreview)
    } else {
      // PGM 없음: 프리뷰만 이동
      if (selectedIndex > 0) {
        setPreviewTabId(targetTab.id)
        setSelectedIndex(selectedIndex - 1)
      }
    }
  }, [isPGMOpen, currentTabId, activeTabId, tabs, currentIndex, selectedIndex,
      setCurrentIndex, setCurrentTabId, setSelectedIndex, getNextPreviewIndex])

  // 프리젠터 핸들러 ref (미디어키와 동일 패턴)
  const presenterHandlerRef = useRef<{ next: () => void, prev: () => void }>({ next: () => {}, prev: () => {} })
  useEffect(() => {
    presenterHandlerRef.current = { next: handlePresenterNext, prev: handlePresenterPrev }
  })

  // 미디어 키 수신 (ref로 최신 핸들러 추적, 리스너 한 번만 등록)
  const mediaKeyHandlerRef = useRef<(key: string) => void>(() => {})
  const lastMediaKeyRef = useRef<{ key: string; time: number }>({ key: '', time: 0 })
  
  useEffect(() => {
    mediaKeyHandlerRef.current = (key: string) => {
      // 300ms 디바운스 (HID 중복 이벤트 방지)
      const now = Date.now()
      if (key === lastMediaKeyRef.current.key && now - lastMediaKeyRef.current.time < 300) return
      lastMediaKeyRef.current = { key, time: now }
      
      switch (key) {
        case 'MediaPlayPause': handleAudioPlayPause(); break
        case 'MediaNextTrack': handleAudioNext(); break
        case 'MediaPreviousTrack': handleAudioPrev(); break
        case 'MediaStop': handleAudioStop(); break
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
      if (currentTabId) {
        const nextPreview = getNextPreviewIndex(nextIndex, playlistItems)
        setPreviewTabId(currentTabId)
        setSelectedIndex(nextPreview)
      }
    }
  }, [isPGMOpen, tabs, currentTabId, currentIndex, activeTabId, setSelectedIndex, setCurrentIndex, getNextPreviewIndex])
  
  useEffect(() => { autoPlayNextRef.current = handleAutoPlayNext }, [handleAutoPlayNext])


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
        type: file.type as 'video' | 'image' | 'audio'
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

  // 탭 드래그 순서 변경
  const handleTabDragStart = (e: React.DragEvent, index: number) => {
    setDraggedTabIndex(index)
    e.dataTransfer.setData('application/tab', String(index))
    e.dataTransfer.effectAllowed = 'move'
    // 드래그 이미지를 작게 (탭 자체)
    const target = e.currentTarget as HTMLElement
    e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2)
  }

  const handleTabDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedTabIndex === null || draggedTabIndex === index) return
    
    const newTabs = [...tabs]
    const [tab] = newTabs.splice(draggedTabIndex, 1)
    newTabs.splice(index, 0, tab)
    reorderTabs(newTabs)
    setDraggedTabIndex(index)
  }

  const handleTabDragEnd = () => {
    setDraggedTabIndex(null)
  }

  // 플레이큐 분리/복귀
  // 개별 탭 분리/복귀
  const handleDetachTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return
    window.electronAPI.openTabWindow(tabId, tab.name)
    setDetachedTabIds(prev => new Set(prev).add(tabId))
    // 분리한 탭이 현재 활성 탭이면, 남은 탭 중 하나로 전환
    if (activeTabId === tabId) {
      const remaining = tabs.filter(t => t.id !== tabId && !detachedTabIds.has(t.id))
      if (remaining.length > 0) setActiveTab(remaining[0].id)
    }
  }, [tabs, activeTabId, detachedTabIds, setActiveTab])

  const handleDockTab = useCallback((tabId: string) => {
    window.electronAPI.closeTabWindow(tabId)
    setDetachedTabIds(prev => {
      const next = new Set(prev)
      next.delete(tabId)
      return next
    })
    setActiveTab(tabId)
  }, [setActiveTab])

  // 탭 드래그로 분리 (개별 탭에서 아래로 드래그)
  const tabDragDetachRef = useRef<{ tabId: string; startY: number; active: boolean } | null>(null)

  const handleTabDetachMouseDown = useCallback((e: React.MouseEvent, tabId: string) => {
    // 버튼이나 입력 위에서는 무시
    if ((e.target as HTMLElement).closest('button, input')) return
    tabDragDetachRef.current = { tabId, startY: e.clientY, active: true }
    
    const handleMouseMove = (ev: MouseEvent) => {
      if (!tabDragDetachRef.current?.active) return
      const dy = Math.abs(ev.clientY - tabDragDetachRef.current.startY)
      if (dy > 60) {
        const tid = tabDragDetachRef.current.tabId
        tabDragDetachRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        handleDetachTab(tid)
      }
    }
    const handleMouseUp = () => {
      tabDragDetachRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [handleDetachTab])

  // 탭 윈도우 액션 핸들러 ref
  const tabActionRef = useRef<(action: any) => void>(() => {})

  useEffect(() => {
    tabActionRef.current = (action: any) => {
      const srcTabId = action.tabId  // 액션을 보낸 탭
      switch (action.action) {
        case 'SET_SELECTED_INDEX':
          if (srcTabId) setPreviewTabId(srcTabId)
          if (srcTabId && srcTabId !== activeTabId) setActiveTab(srcTabId)
          setSelectedIndex(action.index)
          break
        case 'SELECT_AND_ACTIVATE':
          if (srcTabId) setPreviewTabId(srcTabId)
          if (srcTabId && srcTabId !== activeTabId) setActiveTab(srcTabId)
          setSelectedIndex(action.index)
          break
        case 'REMOVE_ITEM': removeItem(action.itemId); break
        case 'REORDER_PLAYLIST':
          // 분리된 탭의 플레이리스트 순서 변경
          if (srcTabId) {
            // 해당 탭이 활성 탭이 아니면 먼저 활성화
            if (srcTabId !== activeTabId) setActiveTab(srcTabId)
            reorderPlaylist(action.items)
          }
          break
        case 'TAKE_FROM_TAB':
          if (srcTabId) {
            setPreviewTabId(srcTabId)
            if (srcTabId !== activeTabId) setActiveTab(srcTabId)
            setSelectedIndex(action.index)
            // 약간 딜레이 후 TAKE (상태 반영 대기)
            setTimeout(() => handleTake(), 50)
          }
          break
        case 'TAKE': handleTake(); break
        case 'AUDIO_PLAY': handleAudioPlay(srcTabId || activeTabId, action.index); break
        case 'AUDIO_PLAY_PAUSE': handleAudioPlayPause(); break
        case 'AUDIO_STOP': handleAudioStop(); break
        case 'AUDIO_NEXT': handleAudioNext(); break
        case 'AUDIO_PREV': handleAudioPrev(); break
        case 'AUDIO_SEEK':
          if (audioRef.current && audioDuration > 0) {
            audioRef.current.currentTime = action.percent * audioDuration
          }
          break
        case 'AUDIO_MUTE_TOGGLE': toggleAudioMute(); break
        case 'AUDIO_VOLUME': handleAudioVolumeChange(action.volume); break
        case 'AUDIO_LOOP_MODE': setAudioLoopMode(action.mode); break
      }
    }
  })

  // 탭 윈도우 액션 리스너 (한 번만 등록)
  useEffect(() => {
    window.electronAPI.onTabAction((action: any) => {
      tabActionRef.current(action)
    })
  }, [])

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

  // === 오디오 독립 채널 핸들러 ===
  const handleAudioPlay = useCallback((tabId: string, index: number) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return
    const item = tab.items[index]
    if (!item || item.type !== 'audio') return
    
    setAudioTabId(tabId)
    setAudioIndex(index)
    setAudioState({ isPlaying: true, currentTime: 0, duration: 0 })
  }, [tabs, setAudioTabId, setAudioIndex, setAudioState])

  const handleAudioPlayPause = useCallback(() => {
    // 재생 중인 오디오가 없으면 활성 탭에서 첫 오디오 찾아서 시작
    if (!audioTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId)
      if (!activeTab) return
      const firstAudioIdx = activeTab.items.findIndex(item => item.type === 'audio')
      if (firstAudioIdx >= 0) {
        handleAudioPlay(activeTabId, firstAudioIdx)
      }
      return
    }
    if (!audioRef.current) return
    if (audioIsPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => {})
    }
  }, [audioIsPlaying, audioTabId, tabs, activeTabId, handleAudioPlay])

  const handleAudioStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setAudioTabId(null)
    setAudioIndex(-1)
    setAudioState({ isPlaying: false, currentTime: 0, duration: 0 })
  }, [setAudioTabId, setAudioIndex, setAudioState])

  const findNextAudio = useCallback((direction: 'next' | 'prev') => {
    if (!audioTabId) return -1
    const tab = tabs.find(t => t.id === audioTabId)
    if (!tab) return -1
    
    const step = direction === 'next' ? 1 : -1
    for (let i = audioIndex + step; i >= 0 && i < tab.items.length; i += step) {
      if (tab.items[i].type === 'audio') return i
    }
    return -1
  }, [tabs, audioTabId, audioIndex])

  const handleAudioNext = useCallback(() => {
    if (!audioTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId)
      if (!activeTab) return
      const firstAudioIdx = activeTab.items.findIndex(item => item.type === 'audio')
      if (firstAudioIdx >= 0) handleAudioPlay(activeTabId, firstAudioIdx)
      return
    }
    const nextIdx = findNextAudio('next')
    if (nextIdx >= 0) {
      handleAudioPlay(audioTabId, nextIdx)
    }
  }, [findNextAudio, audioTabId, handleAudioPlay, tabs, activeTabId])

  const handleAudioPrev = useCallback(() => {
    if (!audioTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId)
      if (!activeTab) return
      const firstAudioIdx = activeTab.items.findIndex(item => item.type === 'audio')
      if (firstAudioIdx >= 0) handleAudioPlay(activeTabId, firstAudioIdx)
      return
    }
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    const prevIdx = findNextAudio('prev')
    if (prevIdx >= 0) {
      handleAudioPlay(audioTabId, prevIdx)
    }
  }, [findNextAudio, audioTabId, handleAudioPlay, tabs, activeTabId])

  const handleAudioVolumeChange = useCallback((v: number) => {
    setAudioVolume(v)
    if (v > 0 && audioMuted) setAudioMuted(false)
    if (audioRef.current) audioRef.current.volume = v
  }, [audioMuted])

  const toggleAudioMute = useCallback(() => {
    setAudioMuted(prev => {
      const next = !prev
      if (audioRef.current) audioRef.current.volume = next ? 0 : audioVolume
      return next
    })
  }, [audioVolume])

  const handleAudioSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || audioDuration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = percent * audioDuration
  }, [audioDuration])

  const currentAudioItem = (() => {
    if (!audioTabId || audioIndex < 0) return null
    const tab = tabs.find(t => t.id === audioTabId)
    return tab?.items[audioIndex] || null
  })()

  // TAKE → PGM
  const handleTake = useCallback(() => {
    if (!isPGMOpen || selectedIndex < 0) return
    const item = previewPlaylist[selectedIndex]
    if (!item || item.type === 'audio') return
    
    setPlayerState({ currentTime: 0, duration: 0 })
    window.electronAPI.sendToPGM({ type: 'PLAY', item })
    setCurrentTabId(previewTabId)
    setCurrentIndex(selectedIndex)
    
    // 다음 프리뷰 자동 선택 (프리뷰 탭 내에서)
    const nextPreview = getNextPreviewIndex(selectedIndex, previewPlaylist)
    setSelectedIndex(nextPreview)
  }, [isPGMOpen, selectedIndex, previewPlaylist, previewTabId, setCurrentTabId, setCurrentIndex, setPlayerState, setSelectedIndex, getNextPreviewIndex])

  // 컨트롤
  const handlePlayPause = useCallback(() => {
    if (!isPGMOpen || currentIndex < 0) return
    if (playerState.isPlaying) {
      window.electronAPI.sendToPGM({ type: 'PAUSE' })
    } else {
      if (currentPlayingItem?.type === 'image') {
        window.electronAPI.sendToPGM({ type: 'PLAY', item: currentPlayingItem })
      } else {
        window.electronAPI.sendToPGM({ type: 'RESUME' })
      }
    }
  }, [isPGMOpen, currentIndex, playerState.isPlaying, currentPlayingItem])

  const handleStop = useCallback(() => {
    if (!isPGMOpen) return
    window.electronAPI.sendToPGM({ type: 'STOP' })
    setCurrentIndex(-1)
    setCurrentTabId(null)
    setPlayerState({ isPlaying: false, currentTime: 0, duration: 0 })
    // 미니 PGM도 명시적으로 정지
    if (pgmVideoRef.current) {
      pgmVideoRef.current.pause()
      pgmVideoRef.current.currentTime = 0
    }
  }, [isPGMOpen, setCurrentIndex, setCurrentTabId, setPlayerState])

  const handlePrev = useCallback(() => {
    if (currentTabId && currentIndex > 0) {
      // PGM에 탭이 올라가 있으면: 무조건 라이브 탭 기준
      const playingTab = tabs.find(t => t.id === currentTabId)
      if (!playingTab) return
      const newIndex = currentIndex - 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: playingTab.items[newIndex] })
      setCurrentIndex(newIndex)
      const nextPreview = getNextPreviewIndex(newIndex, playingTab.items)
      setPreviewTabId(currentTabId)
      setSelectedIndex(nextPreview)
    } else {
      // PGM 없음: 프리뷰만 이동
      const pvwTab = tabs.find(t => t.id === previewTabId)
      if (!pvwTab) return
      if (selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1)
      }
    }
  }, [currentTabId, currentIndex, selectedIndex, tabs, previewTabId, setSelectedIndex, setCurrentIndex, getNextPreviewIndex])

  const handleNext = useCallback(() => {
    if (currentTabId) {
      // PGM에 탭이 올라가 있으면: 무조건 라이브 탭 기준
      const playingTab = tabs.find(t => t.id === currentTabId)
      if (!playingTab) return
      if (currentIndex + 1 >= playingTab.items.length) return
      const newIndex = currentIndex + 1
      window.electronAPI.sendToPGM({ type: 'PLAY', item: playingTab.items[newIndex] })
      setCurrentIndex(newIndex)
      const nextPreview = getNextPreviewIndex(newIndex, playingTab.items)
      setPreviewTabId(currentTabId)
      setSelectedIndex(nextPreview)
    } else {
      // PGM 없음: 프리뷰만 이동
      const pvwTab = tabs.find(t => t.id === previewTabId)
      if (!pvwTab) return
      if (selectedIndex + 1 < pvwTab.items.length) {
        setSelectedIndex(selectedIndex + 1)
      }
    }
  }, [currentTabId, currentIndex, selectedIndex, tabs, previewTabId, setSelectedIndex, setCurrentIndex, getNextPreviewIndex])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPGMOpen || playerState.duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const time = percent * playerState.duration
    window.electronAPI.sendToPGM({ type: 'SEEK', time })
  }, [isPGMOpen, playerState.duration])

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume)
    if (newVolume > 0 && pgmMuted) setPgmMuted(false)
    if (isPGMOpen) window.electronAPI.sendToPGM({ type: 'SET_VOLUME', volume: newVolume })
  }, [isPGMOpen, pgmMuted])

  const togglePgmMute = useCallback(() => {
    setPgmMuted(prev => {
      const next = !prev
      if (isPGMOpen) window.electronAPI.sendToPGM({ type: 'SET_VOLUME', volume: next ? 0 : volume })
      return next
    })
  }, [isPGMOpen, volume])

  // 전역 키보드 단축키 (ref 패턴 - 리스너 한 번만 등록)
  const keydownHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  
  useEffect(() => {
    keydownHandlerRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (showSettings) return
      
      // 프리젠터 키 — 잠금 시 main process에서 차단되어 여기까지 안 옴
      const { presenterKeys } = settingsRef.current
      if (e.key === presenterKeys.next || e.key === presenterKeys.prev) {
        e.preventDefault()
        if (e.key === presenterKeys.next) {
          presenterHandlerRef.current.next()
        } else {
          presenterHandlerRef.current.prev()
        }
        return
      }
      
      // 이하 일반 단축키 — 프리젠터 상태와 무관하게 항상 동작
      const { shortcuts } = settingsRef.current
      
      if (e.code === shortcuts.playPause) {
        e.preventDefault()
        handlePlayPause()
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
      } else if (e.code === shortcuts.delete) {
        e.preventDefault()
        if (selectedIndex >= 0 && playlist[selectedIndex]) {
          removeItem(playlist[selectedIndex].id)
        }
      } else if (e.code === shortcuts.moveUp) {
        e.preventDefault()
        if (queueViewMode === 'list' && playlist.length > 0) {
          const newIdx = queueFocusIndex <= 0 ? 0 : queueFocusIndex - 1
          setQueueFocusIndex(newIdx)
          if (playlist[newIdx]?.type !== 'audio') {
            setPreviewTabId(activeTabId)
            setSelectedIndex(newIdx)
          }
        }
      } else if (e.code === shortcuts.moveDown) {
        e.preventDefault()
        if (queueViewMode === 'list' && playlist.length > 0) {
          const newIdx = queueFocusIndex >= playlist.length - 1 ? playlist.length - 1 : queueFocusIndex + 1
          setQueueFocusIndex(newIdx)
          if (playlist[newIdx]?.type !== 'audio') {
            setPreviewTabId(activeTabId)
            setSelectedIndex(newIdx)
          }
        }
      }
    }
  })

  // keydown 리스너 한 번만 등록
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keydownHandlerRef.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const getFileSrc = (path: string) => `file://${path}`

  const getRelativePath = () => {
    if (!currentPath || !browserPath) return ''
    if (currentPath === browserPath) return browserPath.split('/').pop() || ''
    return currentPath.replace(browserPath, browserPath.split('/').pop() || '')
  }

  const isPlayingInActiveTab = currentTabId === activeTabId
  const isTakeEnabled = isPGMOpen && selectedIndex >= 0 && previewPlaylist[selectedIndex]?.type !== 'audio'

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* 숨겨진 오디오 플레이어 */}
      {currentAudioItem && (
        <audio
          ref={audioRef}
          key={currentAudioItem.id}
          src={getFileSrc(currentAudioItem.path)}
          autoPlay
          onLoadedMetadata={() => {
            if (audioRef.current) {
              audioRef.current.volume = audioMuted ? 0 : audioVolume
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setAudioState({
                currentTime: audioRef.current.currentTime,
                duration: audioRef.current.duration || 0,
              })
            }
          }}
          onEnded={() => {
            if (audioLoopMode === 'one') {
              // 한곡 반복: 처음부터 다시 재생
              if (audioRef.current) {
                audioRef.current.currentTime = 0
                audioRef.current.play().catch(() => {})
              }
            } else {
              const nextIdx = findNextAudio('next')
              if (nextIdx >= 0 && audioTabId) {
                handleAudioPlay(audioTabId, nextIdx)
              } else if (audioLoopMode === 'all' && audioTabId) {
                // 전체 반복: 첫 오디오로 돌아감
                const tab = tabs.find(t => t.id === audioTabId)
                if (tab) {
                  const firstAudioIdx = tab.items.findIndex(item => item.type === 'audio')
                  if (firstAudioIdx >= 0) handleAudioPlay(audioTabId, firstAudioIdx)
                  else handleAudioStop()
                } else {
                  handleAudioStop()
                }
              } else {
                handleAudioStop()
              }
            }
          }}
          onPause={() => setAudioState({ isPlaying: false })}
          onPlay={() => setAudioState({ isPlaying: true })}
        />
      )}
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
          <button
            onClick={() => updateSettings({ autoPlay: !settings.autoPlay })}
            className={`header-btn ${settings.autoPlay ? 'active' : ''}`}
            title={settings.autoPlay ? '자동 재생 ON' : '수동 재생'}
            style={{ 
              width: '70px', 
              display: 'flex', 
              justifyContent: 'center', 
              marginRight: '10px',
              background: settings.autoPlay ? undefined : 'var(--bg-elevated)',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px' }}>
              {settings.autoPlay ? 'AUTO' : 'MANUAL'}
            </span>
          </button>
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
        <div className="flex-[6.5] min-w-0 flex flex-col" style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)' }}>
          
          {/* 모니터 영역 */}
          <div className="p-4">
            <div className="flex gap-4 items-start">
              {/* PREVIEW (4비율) */}
              <div style={{ flex: '4.5' }}>
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
                        setPreviewResolution(`${video.videoWidth}×${video.videoHeight}`)
                        video.currentTime = Math.min(1, video.duration * 0.1)
                      }}
                    />
                  ) : (
                    <img 
                      src={getFileSrc(selectedItem.path)} 
                      className="w-full h-full object-contain" 
                      alt=""
                      onLoad={(e) => {
                        const img = e.currentTarget
                        setPreviewResolution(`${img.naturalWidth}×${img.naturalHeight}`)
                      }}
                    />
                  )}
                </div>
                {/* 프리뷰 파일 정보 */}
                <div style={{ marginTop: '0px', padding: '15px', background: 'var(--bg-elevated)', borderRadius: '4px', minHeight: '50px' }}>
                  {selectedItem ? (
                    <>
                      <div className="truncate" style={{ fontSize: 'clamp(10px, 1.1vw, 14px)', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {selectedItem.name}
                      </div>
                      <div style={{ fontSize: 'clamp(9px, 1vw, 13px)', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                        <span>{selectedItem.type === 'video' ? '영상' : selectedItem.type === 'image' ? '이미지' : selectedItem.type === 'audio' ? '오디오' : selectedItem.type}</span>
                        {previewResolution && <span>{previewResolution}</span>}
                        {selectedItem.type === 'video' && <span>{formatTime(previewDuration)}</span>}
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>선택된 항목 없음</span>
                  )}
                </div>
              </div>

              {/* TAKE 버튼 + 프리젠터 토글 */}
              <div className="flex flex-col items-center gap-2 self-center">
                <button 
                  onClick={handleTake} 
                  disabled={!isTakeEnabled}
                  className={`take-btn ${isTakeEnabled ? 'enabled' : ''}`}
                >
                  <span className="take-btn-icon">›</span>
                  <span className="take-btn-label">Take</span>
                </button>
                <button
                  onClick={() => setPresenterLocked(!presenterLocked)}
                  className="flex items-center gap-1 px-2 py-1 rounded transition-colors"
                  style={{ 
                    background: !presenterLocked ? 'rgba(217, 119, 6, 0.15)' : 'rgba(128, 128, 128, 0.1)',
                    border: `1px solid ${!presenterLocked ? 'rgba(217, 119, 6, 0.4)' : 'rgba(128, 128, 128, 0.2)'}`,
                  }}
                  title={presenterLocked ? '프리젠터 잠금됨 (클릭하여 해제)' : '프리젠터 활성 (클릭하여 잠금)'}
                >
                  <MousePointer size={14} style={{ color: !presenterLocked ? '#d97706' : '#9ca3af' }} />
                  <span style={{ fontSize: 'clamp(10px, 1vw, 13px)', color: !presenterLocked ? '#d97706' : '#9ca3af', fontWeight: 500 }}>
                    {presenterLocked ? '잠금' : '활성'}
                  </span>
                </button>
              </div>

              {/* PGM (6비율) */}
              <div style={{ flex: '5.5' }}>
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
                {/* PGM 프로그레스바 + 컨트롤 */}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ padding: '8px 0 4px' }}>
                    <div className="progress-track relative group" onClick={handleSeek}>
                      <div 
                        className="progress-fill" 
                        style={{ width: playerState.duration > 0 ? `${(playerState.currentTime / playerState.duration) * 100}%` : '0%' }} 
                      />
                      <div 
                        className="progress-thumb absolute top-1/2 -translate-y-1/2"
                        style={{ left: playerState.duration > 0 ? `calc(${(playerState.currentTime / playerState.duration) * 100}% - 5px)` : '0' }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="timecode">{formatTime(playerState.currentTime)}</span>
                      <span className="timecode">{formatTime(playerState.duration)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center relative">
                    <div className="flex items-center gap-1">
                      <button onClick={handlePrev} disabled={!isPGMOpen || !currentTabId || currentIndex <= 0} className="control-btn" style={{ opacity: (!isPGMOpen || !currentTabId || currentIndex <= 0) ? 0.3 : 1 }}>
                        <SkipBack size={18} />
                      </button>
                      <button onClick={handlePlayPause} disabled={!isPGMOpen || currentIndex < 0} className="control-btn" style={{ opacity: (!isPGMOpen || currentIndex < 0) ? 0.3 : 1 }}>
                        {playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
                      </button>
                      <button onClick={handleStop} disabled={!isPGMOpen || currentIndex < 0} className="control-btn" style={{ opacity: (!isPGMOpen || currentIndex < 0) ? 0.3 : 1 }}>
                        <Square size={16} />
                      </button>
                      <button onClick={handleNext} disabled={!isPGMOpen || !currentTabId} className="control-btn" style={{ opacity: (!isPGMOpen || !currentTabId) ? 0.3 : 1 }}>
                        <SkipForward size={18} />
                      </button>
                    </div>
                    <div 
                      className="absolute right-0"
                      onMouseEnter={() => setShowVolumePopup(true)}
                      onMouseLeave={() => setShowVolumePopup(false)}
                    >
                      <button onClick={togglePgmMute} className="control-btn">
                        {pgmMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
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
            </div>
          </div>

          {/* 플레이큐 탭 */}
          <div className="tab-bar">
            {tabs.filter(t => !detachedTabIds.has(t.id)).map((tab) => {
              const realIdx = tabs.indexOf(tab)
              return (
              <div
                key={tab.id}
                draggable={!editingTabId}
                onClick={() => setActiveTab(tab.id)}
                onMouseDown={(e) => handleTabDetachMouseDown(e, tab.id)}
                onDragStart={(e) => handleTabDragStart(e, realIdx)}
                onDragOver={(e) => handleTabDragOver(e, realIdx)}
                onDragEnd={handleTabDragEnd}
                className={`tab-item ${activeTabId === tab.id ? 'active' : ''} ${currentTabId === tab.id ? 'playing' : ''} ${draggedTabIndex === realIdx ? 'tab-dragging' : ''}`}
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
                  </>
                )}
                
                {activeTabId === tab.id && !editingTabId && (
                  <>
                    <button onClick={(e) => handleDuplicateTab(tab.id, e)} className="tab-btn duplicate" title="복제">
                      <Copy size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDetachTab(tab.id) }} className="tab-btn duplicate" title="분리">
                      <PanelRightOpen size={11} />
                    </button>
                  </>
                )}
                
                {tabs.length > 1 && (
                  <button onClick={(e) => handleRemoveTab(tab.id, e)} className="tab-btn delete">
                    <X size={12} />
                  </button>
                )}
              </div>
              )
            })}

            {/* 분리된 탭 표시 (클릭하면 해당 윈도우 포커스 or 복귀) */}
            {tabs.filter(t => detachedTabIds.has(t.id)).map(tab => (
              <div
                key={tab.id}
                className={`tab-item ${currentTabId === tab.id ? 'playing' : ''}`}
                style={{ opacity: 0.5, fontStyle: 'italic' }}
                onClick={() => handleDockTab(tab.id)}
                title="클릭하여 복귀"
              >
                <span style={{ fontSize: '10px' }}>↗ {tab.name}</span>
                {currentTabId === tab.id && <span className="tab-live-badge">LIVE</span>}
              </div>
            ))}
            
            <button onClick={handleAddTab} className="tab-add-btn" title="새 탭 추가">
              <Plus size={16} />
            </button>
            
            <div className="flex-1" />

            <div className="view-toggle mr-2">
              <button className={`view-toggle-btn ${queueViewMode === 'thumbnail' ? 'active' : ''}`} onClick={() => setQueueViewMode('thumbnail')}><Grid size={14} /></button>
              <button className={`view-toggle-btn ${queueViewMode === 'list' ? 'active' : ''}`} onClick={() => setQueueViewMode('list')}><List size={14} /></button>
            </div>
          </div>

          {/* 플레이 큐 */}
          <div className="flex-1 overflow-hidden flex flex-col">

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
                    onClick={() => {
                      setQueueFocusIndex(index)
                      if (item.type !== 'audio') { setPreviewTabId(activeTabId); setSelectedIndex(index) }
                    }}
                    onDoubleClick={() => {
                      if (item.type === 'audio') handleAudioPlay(activeTabId, index)
                      else handleTake()
                    }}
                    onDragStart={(e) => handleItemDragStart(e, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDragEnd={handleItemDragEnd}
                    className={`queue-item ${draggedIndex === index ? 'dragging' : ''} ${isPlayingInActiveTab && currentIndex === index ? 'playing' : previewTabId === activeTabId && selectedIndex === index ? 'selected' : item.type === 'audio' && queueFocusIndex === index ? 'selected' : ''} ${audioTabId === activeTabId && audioIndex === index ? 'audio-playing' : ''}`}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '20%', overflow: 'hidden' }}>
                      {item.type === 'image' ? (
                        <img src={getFileSrc(item.path)} className="w-full h-full object-cover" alt="" />
                      ) : item.type === 'audio' ? (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
                          <Music size={24} style={{ color: audioTabId === activeTabId && audioIndex === index ? '#22c55e' : 'var(--text-muted)' }} />
                        </div>
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
                      {audioTabId === activeTabId && audioIndex === index && (
                        <div className="audio-eq-badge">
                          <span /><span /><span />
                        </div>
                      )}
                      {previewTabId === activeTabId && selectedIndex === index && !(isPlayingInActiveTab && currentIndex === index) && !(audioTabId === activeTabId && audioIndex === index) && <span className="queue-item-badge pvw">PVW</span>}
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%', display: 'flex', alignItems: 'center', padding: '0 6%', background: item.type === 'image' ? '#d4763b' : item.type === 'audio' ? '#22863a' : '#3b6fd4' }}>
                      <span style={{ color: '#fff', fontSize: 'clamp(7px, 1.1vw, 11px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{item.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-1">
                {playlist.map((item, index) => {
                  const isLive = isPlayingInActiveTab && currentIndex === index
                  const isAudioPlaying = audioTabId === activeTabId && audioIndex === index
                  const isSelected = previewTabId === activeTabId && selectedIndex === index && !isLive && !isAudioPlaying
                  const isAudioFocused = item.type === 'audio' && queueFocusIndex === index && !isLive && !isAudioPlaying
                  return (
                    <div 
                      key={item.id} 
                      draggable
                      onClick={() => {
                        setQueueFocusIndex(index)
                        if (item.type !== 'audio') { setPreviewTabId(activeTabId); setSelectedIndex(index) }
                      }}
                      onDoubleClick={() => {
                        if (item.type === 'audio') handleAudioPlay(activeTabId, index)
                        else handleTake()
                      }}
                      onDragStart={(e) => handleItemDragStart(e, index)}
                      onDragOver={(e) => handleItemDragOver(e, index)}
                      onDragEnd={handleItemDragEnd}
                      className={`flex items-center gap-2 cursor-grab ${draggedIndex === index ? 'opacity-50' : ''}`}
                      style={{ 
                        padding: '4px 8px',
                        borderLeft: `3px solid ${isLive ? 'var(--accent-red)' : isAudioPlaying ? '#22c55e' : (isSelected || isAudioFocused) ? 'var(--accent-green)' : 'transparent'}`,
                        background: isLive ? 'rgba(239,68,68,0.08)' : isAudioPlaying ? 'rgba(34,197,94,0.08)' : (isSelected || isAudioFocused) ? 'rgba(34,197,94,0.05)' : 'transparent',
                      }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', width: '20px', textAlign: 'right', flexShrink: 0 }}>{index + 1}</span>
                      {item.type === 'video' ? (
                        <Play size={12} style={{ color: '#3b6fd4', flexShrink: 0 }} />
                      ) : item.type === 'audio' ? (
                        isAudioPlaying ? (
                          <div className="audio-eq-badge" style={{ position: 'static', background: 'transparent', height: '12px', padding: 0 }}>
                            <span style={{ width: '2px' }} /><span style={{ width: '2px' }} /><span style={{ width: '2px' }} />
                          </div>
                        ) : (
                          <Music size={12} style={{ color: '#22863a', flexShrink: 0 }} />
                        )
                      ) : (
                        <img src="" alt="" style={{ width: 12, height: 12, flexShrink: 0, opacity: 0 }} />
                      )}
                      <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                      {isLive && <span className="queue-item-badge live" style={{ position: 'static' }}>LIVE</span>}
                      {isSelected && <span className="queue-item-badge pvw" style={{ position: 'static' }}>PVW</span>}
                      <button onClick={(e) => handleDeleteItem(item.id, e)} className="control-btn" style={{ opacity: 0.3, padding: '2px' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          </div>

          {/* 오디오 미니 바 */}
          {currentAudioItem && (
            <div style={{ 
              flexShrink: 0, 
              background: 'var(--bg-elevated)', 
              borderTop: '1px solid var(--border-subtle)',
              padding: '6px 12px',
            }}>
              <div className="flex items-center gap-2">
                <Music size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {currentAudioItem.name}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={handleAudioPrev} className="control-btn" style={{ padding: '2px' }}>
                    <SkipBack size={13} />
                  </button>
                  <button onClick={handleAudioPlayPause} className="control-btn" style={{ padding: '2px' }}>
                    {audioIsPlaying ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button onClick={handleAudioStop} className="control-btn" style={{ padding: '2px' }}>
                    <Square size={11} />
                  </button>
                  <button onClick={handleAudioNext} className="control-btn" style={{ padding: '2px' }}>
                    <SkipForward size={13} />
                  </button>
                  <button
                    onClick={() => setAudioLoopMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none')}
                    className="control-btn"
                    style={{ padding: '2px', color: audioLoopMode !== 'none' ? '#22c55e' : undefined }}
                    title={audioLoopMode === 'none' ? '반복 없음' : audioLoopMode === 'all' ? '전체 반복' : '한곡 반복'}
                  >
                    {audioLoopMode === 'one' ? <Repeat1 size={13} /> : <Repeat size={13} />}
                  </button>
                </div>
                <div 
                  className="relative"
                  onMouseEnter={() => setShowAudioVolumePopup(true)}
                  onMouseLeave={() => setShowAudioVolumePopup(false)}
                >
                  <button onClick={toggleAudioMute} className="control-btn" style={{ padding: '2px' }}>
                    {audioMuted || audioVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  {showAudioVolumePopup && (
                    <div className="volume-popup absolute bottom-full right-0 mb-2 w-12">
                      <div className="h-24 flex items-center justify-center">
                        <input
                          type="range" min="0" max="1" step="0.01" value={audioVolume}
                          onChange={(e) => handleAudioVolumeChange(parseFloat(e.target.value))}
                          className="w-20 -rotate-90" style={{ transformOrigin: 'center' }}
                        />
                      </div>
                      <div className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {Math.round(audioVolume * 100)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: '3px' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>{formatTime(audioCurrentTime)}</span>
                <div 
                  className="progress-track relative flex-1" 
                  style={{ height: '3px', cursor: 'pointer' }}
                  onClick={handleAudioSeek}
                >
                  <div 
                    style={{ 
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : '0%',
                      background: '#22c55e',
                      borderRadius: '2px',
                    }} 
                  />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>{formatTime(audioDuration)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex-[3.5] min-w-0 flex flex-col" style={{ background: 'var(--bg-base)' }}>
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
            {(['all', 'video', 'image', 'audio'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveFileTab(tab)} className={`browser-tab ${activeFileTab === tab ? 'active' : ''}`}>
                {tab === 'all' ? '전체' : tab === 'video' ? '영상' : tab === 'image' ? '이미지' : '오디오'}
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
                      ) : file.type === 'audio' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ background: 'var(--bg-elevated)' }}>
                          <Music size={18} style={{ color: '#22863a' }} />
                          <span className="text-[8px] text-center truncate w-full px-1" style={{ color: 'var(--text-muted)' }}>{file.name}</span>
                        </div>
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
                        ) : file.type === 'audio' ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music size={14} style={{ color: '#22863a' }} />
                          </div>
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
