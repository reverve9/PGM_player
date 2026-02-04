import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlaylistItem, PlayQueueTab, Settings, PlayerState, Shortcuts } from '../types'

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

const defaultSettings: Settings = {
  autoPlay: false,
  loopMode: 'none',
  fadeEnabled: true,
  fadeDuration: 500,
  standbyImage: null,
  logoImage: null,
  shortcuts: defaultShortcuts,
}

const createDefaultTab = (): PlayQueueTab => ({
  id: crypto.randomUUID(),
  name: '플레이큐 1',
  items: [],
})

interface PlayerStore {
  // Tabs
  tabs: PlayQueueTab[]
  activeTabId: string
  
  // Selection & Playback
  selectedIndex: number      // 현재 탭에서 선택된 항목
  currentTabId: string | null  // PGM에서 재생 중인 탭
  currentIndex: number       // PGM에서 재생 중인 인덱스
  
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
          selectedIndex: -1,
        }),
        
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
        setCurrentIndex: (index) => set((state) => ({
          currentIndex: index,
          currentTabId: index >= 0 ? state.activeTabId : null,
        })),
        
        setCurrentTabId: (tabId) => set({ currentTabId: tabId }),
        
        // Browser Actions
        setBrowserPath: (path) => set({ browserPath: path }),
        
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
        browserPath: state.browserPath,
        settings: state.settings,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { 
          tabs?: PlayQueueTab[]
          activeTabId?: string
          browserPath?: string | null
          settings?: Partial<Settings> 
        }
        
        // 탭이 없으면 기본 탭 생성
        const tabs = persisted?.tabs?.length ? persisted.tabs : [createDefaultTab()]
        const activeTabId = persisted?.activeTabId && tabs.some(t => t.id === persisted.activeTabId)
          ? persisted.activeTabId
          : tabs[0].id
        
        return {
          ...currentState,
          tabs,
          activeTabId,
          browserPath: persisted?.browserPath || null,
          settings: {
            ...defaultSettings,
            ...persisted?.settings,
            shortcuts: {
              ...defaultShortcuts,
              ...persisted?.settings?.shortcuts,
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
