import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Play, Pause, Volume2, VolumeX,
  FolderOpen, Grid, List,
  SkipBack, SkipForward, Square, Trash2,
  Music, Pin, Repeat, Repeat1
} from 'lucide-react'

interface TabSyncState {
  tabs: Array<{
    id: string
    name: string
    items: Array<{ id: string; name: string; path: string; type: 'video' | 'image' | 'audio' }>
  }>
  activeTabId: string
  currentTabId: string | null
  currentIndex: number
  selectedIndex: number
  playerIsPlaying: boolean
  audioTabId: string | null
  audioIndex: number
  audioIsPlaying: boolean
  audioCurrentTime: number
  audioDuration: number
  audioVolume: number
  audioMuted: boolean
  audioLoopMode: 'none' | 'all' | 'one'
  queueViewMode: 'thumbnail' | 'list'
}

interface Props { tabId: string }

function TabWindow({ tabId }: Props) {
  const [state, setState] = useState<TabSyncState | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number>(-1)
  const [viewMode, setViewMode] = useState<'thumbnail' | 'list'>('thumbnail')
  const [showAudioVolumePopup, setShowAudioVolumePopup] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  useEffect(() => {
    window.electronAPI.onTabStateUpdate((data: unknown) => setState(data as TabSyncState))
  }, [])

  const sendAction = useCallback((payload: Record<string, unknown>) => {
    window.electronAPI.sendTabAction({ ...payload, tabId })
  }, [tabId])

  // 리스트 뷰 ArrowUp/Down 키보드 핸들러
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (viewMode !== 'list' || !state) return
      const pl = state.tabs.find(t => t.id === tabId)?.items || []
      if (pl.length === 0) return

      if (e.code === 'ArrowUp') {
        e.preventDefault()
        setFocusIndex(prev => {
          const newIdx = prev <= 0 ? 0 : prev - 1
          if (pl[newIdx]?.type !== 'audio') sendAction({ action: 'SELECT_AND_ACTIVATE', index: newIdx })
          return newIdx
        })
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        setFocusIndex(prev => {
          const newIdx = prev >= pl.length - 1 ? pl.length - 1 : prev + 1
          if (pl[newIdx]?.type !== 'audio') sendAction({ action: 'SELECT_AND_ACTIVATE', index: newIdx })
          return newIdx
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [viewMode, state, tabId, sendAction])

  if (!state) {
    return (
      <div className="w-full h-screen flex items-center justify-center" style={{ background: 'var(--bg-panel)' }}>
        <div className="text-center" style={{ color: 'var(--text-muted)' }}>
          <Music size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">연결 중...</p>
        </div>
      </div>
    )
  }

  const { tabs, currentTabId, currentIndex, selectedIndex, playerIsPlaying,
          audioTabId, audioIndex, audioIsPlaying, audioCurrentTime, audioDuration,
          audioVolume, audioMuted, audioLoopMode } = state

  const toggleAlwaysOnTop = async () => {
    const result = await window.electronAPI.toggleTabAlwaysOnTop(tabId)
    setAlwaysOnTop(result)
  }

  const myTab = tabs.find(t => t.id === tabId)
  if (!myTab) {
    return (
      <div className="w-full h-screen flex items-center justify-center" style={{ background: 'var(--bg-panel)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>탭을 찾을 수 없습니다</p>
      </div>
    )
  }

  const playlist = myTab.items
  const isPlayingThisTab = currentTabId === tabId && playerIsPlaying
  const isActiveTab = state.activeTabId === tabId
  const isAudioThisTab = audioTabId === tabId

  const getFileSrc = (p: string) => `file://${p}`
  const formatTime = (sec: number) => {
    if (!sec || !isFinite(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // 아이템 드래그
  const handleItemDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.setData('application/queue-item', String(index))
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    const newItems = [...playlist]
    const [item] = newItems.splice(draggedIndex, 1)
    newItems.splice(index, 0, item)
    sendAction({ action: 'REORDER_PLAYLIST', items: newItems })
    setDraggedIndex(index)
  }
  const handleItemDragEnd = () => setDraggedIndex(null)

  // 오디오 미니바 아이템
  const currentAudioItem = (isAudioThisTab && audioIndex >= 0 && audioIndex < playlist.length)
    ? playlist[audioIndex] : null

  return (
    <div className="w-full h-screen flex flex-col" style={{ background: 'var(--bg-panel)', color: 'var(--text-primary)' }}>
      {/* 헤더 (탭바 역할) */}
      <div className="tab-bar">
        <div className="tab-item active" style={{ cursor: 'default' }}>
          <span>{myTab.name} ({playlist.length})</span>
          {isPlayingThisTab && <span className="tab-live-badge">LIVE</span>}
        </div>
        <div className="flex-1" />
        <div className="view-toggle mr-2">
          <button className={`view-toggle-btn ${viewMode === 'thumbnail' ? 'active' : ''}`} onClick={() => setViewMode('thumbnail')}><Grid size={14} /></button>
          <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={14} /></button>
        </div>
        <button
          onClick={toggleAlwaysOnTop}
          className="control-btn mr-2"
          style={{ padding: '3px', color: alwaysOnTop ? '#22c55e' : 'var(--text-muted)' }}
          title={alwaysOnTop ? '고정 해제' : '항상 위에'}
        >
          <Pin size={14} style={{ transform: alwaysOnTop ? 'rotate(0deg)' : 'rotate(45deg)' }} />
        </button>
      </div>

      {/* 오디오 플레이어 바 — 항상 표시 */}
      <div style={{
        flexShrink: 0,
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '6px 12px',
      }}>
        {/* 파일명 */}
        <div className="flex items-center gap-2">
          <Music size={12} style={{ color: currentAudioItem ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }} />
          <span className="text-xs truncate flex-1" style={{ color: currentAudioItem ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 500 }}>
            {currentAudioItem ? currentAudioItem.name : '오디오 대기 중'}
          </span>
        </div>
        {/* 프로그레스 바 */}
        <div className="flex items-center gap-2" style={{ marginTop: '4px' }}>
          <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>{formatTime(currentAudioItem ? audioCurrentTime : 0)}</span>
          <div
            className="progress-track relative flex-1"
            style={{ height: '3px', cursor: currentAudioItem ? 'pointer' : 'default' }}
            onClick={(e) => {
              if (!currentAudioItem || audioDuration <= 0) return
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (e.clientX - rect.left) / rect.width
              sendAction({ action: 'AUDIO_SEEK', percent })
            }}
          >
            <div
              style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: currentAudioItem && audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : '0%',
                background: '#22c55e',
                borderRadius: '2px',
              }}
            />
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>{formatTime(currentAudioItem ? audioDuration : 0)}</span>
        </div>
        {/* 버튼 영역 */}
        <div className="flex items-center justify-center gap-2" style={{ marginTop: '4px' }}>
          <button onClick={() => sendAction({ action: 'AUDIO_PREV' })} className="control-btn" style={{ padding: '2px', opacity: currentAudioItem ? 1 : 0.3 }}>
            <SkipBack size={14} />
          </button>
          <button onClick={() => sendAction({ action: 'AUDIO_PLAY_PAUSE' })} className="control-btn" style={{ padding: '3px', opacity: currentAudioItem ? 1 : 0.3 }}>
            {audioIsPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={() => sendAction({ action: 'AUDIO_STOP' })} className="control-btn" style={{ padding: '2px', opacity: currentAudioItem ? 1 : 0.3 }}>
            <Square size={12} />
          </button>
          <button onClick={() => sendAction({ action: 'AUDIO_NEXT' })} className="control-btn" style={{ padding: '2px', opacity: currentAudioItem ? 1 : 0.3 }}>
            <SkipForward size={14} />
          </button>
          <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)', margin: '0 2px' }} />
          <button
            onClick={() => {
              const next = audioLoopMode === 'none' ? 'all' : audioLoopMode === 'all' ? 'one' : 'none'
              sendAction({ action: 'AUDIO_LOOP_MODE', mode: next })
            }}
            className="control-btn"
            style={{ padding: '2px', color: audioLoopMode !== 'none' ? '#22c55e' : undefined }}
            title={audioLoopMode === 'none' ? '반복 없음' : audioLoopMode === 'all' ? '전체 반복' : '한곡 반복'}
          >
            {audioLoopMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
          </button>
          <div
            className="relative"
            onMouseEnter={() => setShowAudioVolumePopup(true)}
            onMouseLeave={() => setShowAudioVolumePopup(false)}
          >
            <button onClick={() => sendAction({ action: 'AUDIO_MUTE_TOGGLE' })} className="control-btn" style={{ padding: '2px' }}>
              {audioMuted || audioVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            {showAudioVolumePopup && (
              <div className="volume-popup absolute top-full right-0 mt-2 w-12" style={{ zIndex: 50 }}>
                <div className="h-24 flex items-center justify-center">
                  <input
                    type="range" min="0" max="1" step="0.01" value={audioVolume}
                    onChange={(e) => sendAction({ action: 'AUDIO_VOLUME', volume: parseFloat(e.target.value) })}
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
      </div>

      {/* 플레이 큐 — 메인 창과 동일한 레이아웃 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-card)' }}>
          {playlist.length === 0 ? (
            <div className="empty-state">
              <FolderOpen size={32} className="empty-state-icon" />
              <p>큐가 비어있습니다</p>
            </div>
          ) : viewMode === 'thumbnail' ? (
            <div className="queue-grid">
              {playlist.map((item, index) => {
                const isLive = isPlayingThisTab && currentIndex === index
                const isAudioPlaying = isAudioThisTab && audioIndex === index
                const isSelected = isActiveTab && selectedIndex === index
                return (
                  <div
                    key={item.id}
                    draggable
                    onClick={() => {
                      setFocusIndex(index)
                      if (item.type !== 'audio') sendAction({ action: 'SELECT_AND_ACTIVATE', index })
                    }}
                    onDoubleClick={() => {
                      if (item.type === 'audio') sendAction({ action: 'AUDIO_PLAY', index })
                      else sendAction({ action: 'TAKE_FROM_TAB', index })
                    }}
                    onDragStart={(e) => handleItemDragStart(e, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDragEnd={handleItemDragEnd}
                    className={`queue-item ${draggedIndex === index ? 'dragging' : ''} ${isLive ? 'playing' : isSelected ? 'selected' : item.type === 'audio' && focusIndex === index ? 'selected' : ''} ${isAudioPlaying ? 'audio-playing' : ''}`}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '20%', overflow: 'hidden' }}>
                      {item.type === 'image' ? (
                        <img src={getFileSrc(item.path)} className="w-full h-full object-cover" alt="" />
                      ) : item.type === 'audio' ? (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
                          <Music size={24} style={{ color: isAudioPlaying ? '#22c55e' : 'var(--text-muted)' }} />
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
                      <button onClick={(e) => { e.stopPropagation(); sendAction({ action: 'REMOVE_ITEM', itemId: item.id }) }} className="queue-item-delete">
                        <Trash2 size={10} />
                      </button>
                      {isLive && <span className="queue-item-badge live">LIVE</span>}
                      {isAudioPlaying && (
                        <div className="audio-eq-badge">
                          <span /><span /><span />
                        </div>
                      )}
                      {isSelected && !isLive && !isAudioPlaying && <span className="queue-item-badge pvw">PVW</span>}
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%', display: 'flex', alignItems: 'center', padding: '0 6%', background: item.type === 'image' ? '#d4763b' : item.type === 'audio' ? '#22863a' : '#3b6fd4' }}>
                      <span style={{ color: '#fff', fontSize: 'clamp(7px, 1.1vw, 11px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{item.name}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-1">
              {playlist.map((item, index) => {
                const isLive = isPlayingThisTab && currentIndex === index
                const isAudioPlaying = isAudioThisTab && audioIndex === index
                const isSelected = isActiveTab && selectedIndex === index && !isLive && !isAudioPlaying
                const isAudioFocused = item.type === 'audio' && focusIndex === index && !isLive && !isAudioPlaying
                return (
                  <div
                    key={item.id}
                    draggable
                    onClick={() => {
                      setFocusIndex(index)
                      if (item.type !== 'audio') sendAction({ action: 'SELECT_AND_ACTIVATE', index })
                    }}
                    onDoubleClick={() => {
                      if (item.type === 'audio') sendAction({ action: 'AUDIO_PLAY', index })
                      else sendAction({ action: 'TAKE_FROM_TAB', index })
                    }}
                    onDragStart={(e) => handleItemDragStart(e, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDragEnd={handleItemDragEnd}
                    className={`flex items-center gap-2 cursor-grab ${draggedIndex === index ? 'opacity-50' : ''}`}
                    style={{
                      padding: '4px 8px',
                      borderLeft: `3px solid ${isLive ? 'var(--accent-red)' : isAudioPlaying ? '#22c55e' : (isSelected || isAudioFocused) ? 'var(--accent-green)' : 'transparent'}`,
                      background: isLive ? 'rgba(239,68,68,0.08)' : isAudioPlaying ? 'rgba(34,197,94,0.08)' : (isSelected || isAudioFocused) ? 'rgba(34,197,94,0.05)' : 'transparent',
                    }}
                  >
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
                    <button onClick={(e) => { e.stopPropagation(); sendAction({ action: 'REMOVE_ITEM', itemId: item.id }) }} className="control-btn" style={{ opacity: 0.3, padding: '2px' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TabWindow
