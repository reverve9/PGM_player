export interface PlaylistItem {
  id: string
  name: string
  path: string
  duration?: number
  type: 'video' | 'image' | 'audio'
}

export interface PlayQueueTab {
  id: string
  name: string
  items: PlaylistItem[]
  inputMode: 'none' | 'media'
}

export interface Shortcuts {
  playPause: string
  playSelected: string
  prev: string
  next: string
  stop: string
  fullscreen: string
  togglePGM: string
  moveUp: string
  moveDown: string
  delete: string
}

export interface PresenterKeys {
  next: string
  prev: string
}

export interface Settings {
  autoPlay: boolean
  loopMode: 'none' | 'loop' | 'shuffle'  // 순환 모드
  fadeEnabled: boolean
  fadeDuration: number // ms
  standbyImage: string | null
  logoImage: string | null
  shortcuts: Shortcuts
  presenterKeys: PresenterKeys
}

export interface PlayerState {
  isPlaying: boolean
  currentIndex: number
  currentTime: number
  duration: number
  isFullscreen: boolean
}

export type PGMCommand = 
  | { type: 'PLAY'; item: PlaylistItem; fadeIn?: boolean }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP'; fadeOut?: boolean }
  | { type: 'SEEK'; time: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'SET_STANDBY_IMAGE'; path: string | null }
  | { type: 'SET_FADE_DURATION'; duration: number }
  | { type: 'SET_FULLSCREEN'; fullscreen: boolean }

export type ControlMessage =
  | { type: 'TIME_UPDATE'; currentTime: number; duration: number }
  | { type: 'ENDED' }
  | { type: 'ERROR'; message: string }
  | { type: 'PLAYING'; currentTime?: number }
  | { type: 'PAUSED' }
  | { type: 'FULLSCREEN_CHANGED'; isFullscreen: boolean }
