import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlaylistItem, PlayQueueTab, Settings, PlayerState, Shortcuts, PresenterKeys } from '../types'

const defaultShortcuts: Shortcuts = {
  playPause: 'Space',
  playSelected: 'Enter',
  prev: 'KeyB',
  next: 'KeyN',
  stop: 'Escape',
  fullscreen: 'KeyF',
  togglePGM: 'KeyP',
  moveUp: 'ArrowUp',
  moveDown: 'ArrowDown',
  delete: 'Delete',
}

const defaultPresenterKeys: PresenterKeys = {
  next: 'ArrowRight',
  prev: 'ArrowLeft',
}

const defaultSettings: Settings = {
  autoPlay: false,
  loopMode: 'none',
  fadeEnabled: true,
  fadeDuration: 500,
  standbyImage: null,
  logoImage: null,
  shortcuts: defaultShortcuts,
  presenterKeys: defaultPresenterKeys,
}

const createDefaultTab = (): PlayQueueTab => ({
  id: crypto.randomUUID(),
  name: '플레이큐 1',
  items: [],
  inputMode: 'none',
})

interface PlayerStore {
  // Tabs
  tabs: PlayQueueTab[]
  activeTabId: string
  
  // Selection & Playback
  selectedIndex: number      // 현재 탭에서 선택된 항목
  currentTabId: string | null  // PGM에서 재생 중인 탭
  currentIndex: number       // PGM에서 재생 중인 인덱스
  
  // Presenter (전역)
  presenterLocked: boolean  // false = ON(활성), true = OFF(잠금)

  // Audio (독립 채널)
  audioTabId: string | null
  audioIndex: number
  audioIsPlaying: boolean
  audioCurrentTime: number
  audioDuration: number
  
  // Browser
  browserPath: string | null
  
  // Player State
  playerState: PlayerState
  
  // Settings
  settings: Settings
  
  // Computed - 현재 활성 탭의 플레이리스트
  getActiveTab: () => PlayQueueTab | undefined
  getActivePlaylist: () => PlaylistItem[]
  
  // Actions - Tabs
  addTab: () => void
  removeTab: (tabId: string) => void
  renameTab: (tabId: string, name: string) => void
  duplicateTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  setTabInputMode: (tabId: string, mode: 'none' | 'media') => void
  
  // Actions - Tabs (순서 변경)
  reorderTabs: (newTabs: PlayQueueTab[]) => void
  
  // Actions - Playlist (현재 활성 탭에 대해)
  addItems: (items: PlaylistItem[]) => void
  removeItem: (id: string) => void
  reorderPlaylist: (items: PlaylistItem[]) => void
  setSelectedIndex: (index: number) => void
  clearPlaylist: () => void
  
  // Actions - Playback
  setCurrentIndex: (index: number) => void
  setCurrentTabId: (tabId: string | null) => void
  
  // Actions - Browser
  setBrowserPath: (path: string | null) => void
  
  // Actions - Presenter
  setPresenterLocked: (locked: boolean) => void

  // Actions - Audio
  setAudioTabId: (tabId: string | null) => void
  setAudioIndex: (index: number) => void
  setAudioState: (state: { isPlaying?: boolean; currentTime?: number; duration?: number }) => void
  
  // Actions - Player State
  setPlayerState: (state: Partial<PlayerState>) => void
  
  // Actions - Settings
  updateSettings: (settings: Partial<Settings>) => void
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => {
      const defaultTab = createDefaultTab()
      
      return {
        // Initial State
        tabs: [defaultTab],
        activeTabId: defaultTab.id,
        selectedIndex: -1,
        currentTabId: null,
        currentIndex: -1,
        presenterLocked: false,  // 기본 ON (잠금 해제)
        audioTabId: null,
        audioIndex: -1,
        audioIsPlaying: false,
        audioCurrentTime: 0,
        audioDuration: 0,
        browserPath: null,
        
        playerState: {
          isPlaying: false,
          currentIndex: -1,
          currentTime: 0,
          duration: 0,
          isFullscreen: false,
        },
        
        settings: defaultSettings,
        
        // Computed
        getActiveTab: () => {
          const state = get()
          return state.tabs.find(t => t.id === state.activeTabId)
        },
        
        getActivePlaylist: () => {
          const tab = get().getActiveTab()
          return tab?.items || []
        },
        
        // Tab Actions
        addTab: () => set((state) => {
          const newTab: PlayQueueTab = {
            id: crypto.randomUUID(),
            name: `플레이큐 ${state.tabs.length + 1}`,
            items: [],
            inputMode: 'none',
          }
          return {
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
            selectedIndex: -1,
          }
        }),
        
        removeTab: (tabId) => set((state) => {
          if (state.tabs.length <= 1) return state // 최소 1개 유지
          
          const newTabs = state.tabs.filter(t => t.id !== tabId)
          const wasActive = state.activeTabId === tabId
          const wasPlaying = state.currentTabId === tabId
          
          return {
            tabs: newTabs,
            activeTabId: wasActive ? newTabs[0].id : state.activeTabId,
            selectedIndex: wasActive ? -1 : state.selectedIndex,
            currentTabId: wasPlaying ? null : state.currentTabId,
            currentIndex: wasPlaying ? -1 : state.currentIndex,
          }
        }),
        
        renameTab: (tabId, name) => set((state) => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, name } : t),
        })),
        
        duplicateTab: (tabId) => set((state) => {
          const sourceTab = state.tabs.find(t => t.id === tabId)
          if (!sourceTab) return state
          
          const newTab: PlayQueueTab = {
            id: crypto.randomUUID(),
            name: `${sourceTab.name} 복사본`,
            items: sourceTab.items.map(item => ({
              ...item,
              id: crypto.randomUUID(), // 새 ID 부여
            })),
            inputMode: sourceTab.inputMode,
          }
          
          // 원본 탭 다음에 삽입
          const sourceIndex = state.tabs.findIndex(t => t.id === tabId)
          const newTabs = [...state.tabs]
          newTabs.splice(sourceIndex + 1, 0, newTab)
          
          return {
            tabs: newTabs,
            activeTabId: newTab.id,
            selectedIndex: -1,
          }
        }),
        
        setActiveTab: (tabId) => set({
          activeTabId: tabId,
        }),

        reorderTabs: (newTabs) => set({ tabs: newTabs }),
        
        setTabInputMode: (tabId, mode) => set((state) => ({
          // 같은 모드를 사용하는 다른 탭은 none으로 초기화 (하나만 활성)
          tabs: state.tabs.map(t => {
            if (t.id === tabId) return { ...t, inputMode: mode }
            if (mode !== 'none' && t.inputMode === mode) return { ...t, inputMode: 'none' as const }
            return t
          }),
        })),
        
        // Playlist Actions (for active tab)
        addItems: (items) => set((state) => ({
          tabs: state.tabs.map(t => 
            t.id === state.activeTabId 
              ? { ...t, items: [...t.items, ...items] }
              : t
          ),
        })),
        
        removeItem: (id) => set((state) => {
          const activeTab = state.tabs.find(t => t.id === state.activeTabId)
          if (!activeTab) return state
          
          const itemIndex = activeTab.items.findIndex(item => item.id === id)
          const newItems = activeTab.items.filter(item => item.id !== id)
          
          // 재생 중인 항목이 삭제되면 정지
          const isPlayingItem = state.currentTabId === state.activeTabId && state.currentIndex === itemIndex
          
          return {
            tabs: state.tabs.map(t => 
              t.id === state.activeTabId 
                ? { ...t, items: newItems }
                : t
            ),
            selectedIndex: state.selectedIndex >= newItems.length 
              ? Math.max(0, newItems.length - 1) 
              : state.selectedIndex,
            currentIndex: isPlayingItem ? -1 : 
              (state.currentTabId === state.activeTabId && state.currentIndex > itemIndex)
                ? state.currentIndex - 1 
                : state.currentIndex,
            currentTabId: isPlayingItem ? null : state.currentTabId,
          }
        }),
        
        reorderPlaylist: (items) => set((state) => ({
          tabs: state.tabs.map(t => 
            t.id === state.activeTabId 
              ? { ...t, items }
              : t
          ),
        })),
        
        setSelectedIndex: (index) => set({ selectedIndex: index }),
        
        clearPlaylist: () => set((state) => ({
          tabs: state.tabs.map(t => 
            t.id === state.activeTabId 
              ? { ...t, items: [] }
              : t
          ),
          selectedIndex: -1,
          currentIndex: state.currentTabId === state.activeTabId ? -1 : state.currentIndex,
          currentTabId: state.currentTabId === state.activeTabId ? null : state.currentTabId,
        })),
        
        // Playback Actions
        setCurrentIndex: (index) => set({
          currentIndex: index,
        }),
        
        setCurrentTabId: (tabId) => set({ currentTabId: tabId }),
        
        // Browser Actions
        setBrowserPath: (path) => set({ browserPath: path }),
        
        // Presenter Actions
        setPresenterLocked: (locked) => set({ presenterLocked: locked }),

        // Audio Actions
        setAudioTabId: (tabId) => set({ audioTabId: tabId }),
        setAudioIndex: (index) => set({ audioIndex: index }),
        setAudioState: (newState) => set((state) => ({
          audioIsPlaying: newState.isPlaying ?? state.audioIsPlaying,
          audioCurrentTime: newState.currentTime ?? state.audioCurrentTime,
          audioDuration: newState.duration ?? state.audioDuration,
        })),
        
        // Player State Actions
        setPlayerState: (newState) => set((state) => ({
          playerState: { ...state.playerState, ...newState },
        })),
        
        // Settings Actions
        updateSettings: (newSettings) => set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      }
    },
    {
      name: 'pgm-player-storage',
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        presenterLocked: state.presenterLocked,
        browserPath: state.browserPath,
        settings: state.settings,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { 
          tabs?: PlayQueueTab[]
          activeTabId?: string
          presenterLocked?: boolean
          browserPath?: string | null
          settings?: Partial<Settings> 
        }
        
        // 탭이 없으면 기본 탭 생성, inputMode 기본값 보장
        const tabs = persisted?.tabs?.length 
          ? persisted.tabs.map(t => ({ ...t, inputMode: t.inputMode || 'none' as const }))
          : [createDefaultTab()]
        const activeTabId = persisted?.activeTabId && tabs.some(t => t.id === persisted.activeTabId)
          ? persisted.activeTabId
          : tabs[0].id
        
        return {
          ...currentState,
          tabs,
          activeTabId,
          presenterLocked: persisted?.presenterLocked ?? false,
          browserPath: persisted?.browserPath || null,
          settings: {
            ...defaultSettings,
            ...persisted?.settings,
            shortcuts: {
              ...defaultShortcuts,
              ...persisted?.settings?.shortcuts,
            },
            presenterKeys: {
              ...defaultPresenterKeys,
              ...persisted?.settings?.presenterKeys,
            },
          },
        }
      },
    }
  )
)

// 편의를 위한 selector
export const useActivePlaylist = () => usePlayerStore((state) => {
  const tab = state.tabs.find(t => t.id === state.activeTabId)
  return tab?.items || []
})

export const useCurrentPlayingItem = () => usePlayerStore((state) => {
  if (!state.currentTabId || state.currentIndex < 0) return null
  const tab = state.tabs.find(t => t.id === state.currentTabId)
  return tab?.items[state.currentIndex] || null
})
