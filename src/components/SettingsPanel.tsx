import { useEffect, useState, useCallback } from 'react'
import { X, Monitor, Upload } from 'lucide-react'
import { usePlayerStore } from '../stores/playerStore'
import type { Display } from '../types/electron'
import type { PGMCommand, Shortcuts, PresenterKeys } from '../types'

interface SettingsPanelProps {
  onClose: () => void
}

const keyCodeToDisplay = (code: string): string => {
  const map: Record<string, string> = {
    'Space': 'Space',
    'Enter': 'Enter',
    'Escape': 'Esc',
    'Delete': 'Delete',
    'Backspace': 'Backspace',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
  }
  if (map[code]) return map[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

const shortcutLabels: Record<keyof Shortcuts, string> = {
  playPause: '재생/일시정지',
  playSelected: '선택 영상 재생',
  prev: '이전 영상',
  next: '다음 영상',
  stop: '정지',
  fullscreen: '전체화면',
  togglePGM: 'PGM 열기/닫기',
  delete: '선택 삭제',
}

function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings } = usePlayerStore()
  const [displays, setDisplays] = useState<Display[]>([])
  const [selectedDisplay, setSelectedDisplay] = useState(0)
  const [editingKey, setEditingKey] = useState<keyof Shortcuts | null>(null)
  const [editingPresenterKey, setEditingPresenterKey] = useState<keyof PresenterKeys | null>(null)

  useEffect(() => {
    window.electronAPI.getDisplays().then((displayList) => {
      setDisplays(displayList)
      const pgmDisplay = displayList.findIndex((d: Display) => !d.primary)
      setSelectedDisplay(pgmDisplay >= 0 ? pgmDisplay : 0)
    })
  }, [])

  const handleAutoPlayToggle = () => {
    updateSettings({ autoPlay: !settings.autoPlay })
  }

  const handleFadeToggle = () => {
    const newEnabled = !settings.fadeEnabled
    updateSettings({ fadeEnabled: newEnabled })
    const command: PGMCommand = { 
      type: 'SET_FADE_DURATION', 
      duration: newEnabled ? settings.fadeDuration : 0 
    }
    window.electronAPI.sendToPGM(command)
  }

  const handleFadeDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const duration = parseInt(e.target.value, 10)
    updateSettings({ fadeDuration: duration })
    const command: PGMCommand = { 
      type: 'SET_FADE_DURATION', 
      duration: settings.fadeEnabled ? duration : 0 
    }
    window.electronAPI.sendToPGM(command)
  }

  const handleSelectStandbyImage = useCallback(async () => {
    const imagePath = await window.electronAPI.selectImage()
    if (imagePath) {
      updateSettings({ standbyImage: imagePath })
      const command: PGMCommand = { type: 'SET_STANDBY_IMAGE', path: imagePath }
      window.electronAPI.sendToPGM(command)
    }
  }, [updateSettings])

  const handleClearStandbyImage = useCallback(() => {
    updateSettings({ standbyImage: null })
    const command: PGMCommand = { type: 'SET_STANDBY_IMAGE', path: null }
    window.electronAPI.sendToPGM(command)
  }, [updateSettings])


  const handleShortcutEdit = (key: keyof Shortcuts) => {
    setEditingKey(key)
    setEditingPresenterKey(null)
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const code = e.code
    if (code === 'Escape') {
      setEditingKey(null)
      setEditingPresenterKey(null)
      return
    }
    
    if (editingKey) {
      const newShortcuts = { ...settings.shortcuts, [editingKey]: code }
      updateSettings({ shortcuts: newShortcuts })
      setEditingKey(null)
    } else if (editingPresenterKey) {
      const newPresenterKeys = { ...settings.presenterKeys, [editingPresenterKey]: code }
      updateSettings({ presenterKeys: newPresenterKeys })
      // main process에 새 키 알림
      window.electronAPI.setPresenterKeys(newPresenterKeys)
      setEditingPresenterKey(null)
    }
  }, [editingKey, editingPresenterKey, settings.shortcuts, settings.presenterKeys, updateSettings])

  useEffect(() => {
    if (editingKey || editingPresenterKey) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [editingKey, editingPresenterKey, handleKeyDown])

  const handleDisplayChange = (displayIndex: number) => {
    setSelectedDisplay(displayIndex)
    window.electronAPI.movePGMToDisplay(displayIndex)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">설정</h2>
          <button onClick={onClose} className="settings-close">
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          {/* 재생 설정 */}
          <section className="settings-section">
            <h3 className="settings-section-title">재생</h3>
            
            <div className="settings-row">
              <div>
                <p className="settings-label">자동 재생</p>
                <p className="settings-desc">영상 종료 시 다음 영상 자동 재생</p>
              </div>
              <button onClick={handleAutoPlayToggle} className={`toggle-switch ${settings.autoPlay ? 'active' : ''}`}>
                <span className="toggle-switch-knob" />
              </button>
            </div>

            {settings.autoPlay && (
              <div style={{ paddingTop: '8px' }}>
                <p className="settings-label" style={{ marginBottom: '8px' }}>순환 모드</p>
                <div className="btn-group">
                  {[
                    { value: 'none', label: '없음' },
                    { value: 'loop', label: '전체 순환' },
                    { value: 'shuffle', label: '랜덤' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => updateSettings({ loopMode: mode.value as 'none' | 'loop' | 'shuffle' })}
                      className={`btn-group-item ${settings.loopMode === mode.value ? 'active' : ''}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 효과 설정 */}
          <section className="settings-section">
            <h3 className="settings-section-title">효과</h3>
            
            <div className="settings-row">
              <div>
                <p className="settings-label">페이드 효과</p>
                <p className="settings-desc">영상 전환 시 페이드 인/아웃</p>
              </div>
              <button onClick={handleFadeToggle} className={`toggle-switch ${settings.fadeEnabled ? 'active' : ''}`}>
                <span className="toggle-switch-knob" />
              </button>
            </div>

            {settings.fadeEnabled && (
              <div style={{ paddingTop: '8px' }}>
                <div className="flex items-center justify-between">
                  <span className="settings-label">페이드 시간</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{settings.fadeDuration}ms</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="100"
                  value={settings.fadeDuration}
                  onChange={handleFadeDurationChange}
                  style={{ width: '100%', marginTop: '8px' }}
                />
              </div>
            )}
          </section>

          {/* 대기 화면 */}
          <section className="settings-section">
            <h3 className="settings-section-title">대기 화면</h3>
            
            <div className="settings-row">
              <div>
                <p className="settings-label">대기 이미지</p>
                <p className="settings-desc">재생 중이 아닐 때 표시될 이미지</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSelectStandbyImage} className="browser-btn">
                  <Upload size={14} />
                  <span>선택</span>
                </button>
                {settings.standbyImage && (
                  <button onClick={handleClearStandbyImage} className="browser-btn">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            
            {settings.standbyImage && (
              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: '64px', height: '36px', background: '#000', borderRadius: '4px', overflow: 'hidden' }}>
                    <img src={`file://${settings.standbyImage}`} alt="" className="w-full h-full object-contain" />
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }} className="truncate flex-1">
                    {settings.standbyImage.split('/').pop()}
                  </span>
                </div>
              </div>
            )}
          </section>


          {/* 디스플레이 설정 */}
          <section className="settings-section">
            <h3 className="settings-section-title">디스플레이</h3>
            
            <div className="grid grid-cols-2 gap-2">
              {displays.map((display, index) => (
                <button
                  key={index}
                  onClick={() => handleDisplayChange(index)}
                  className="p-3 rounded-lg text-left transition-all"
                  style={{
                    background: selectedDisplay === index ? 'var(--accent-blue-dim)' : 'var(--bg-elevated)',
                    border: `1px solid ${selectedDisplay === index ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor size={14} style={{ color: selectedDisplay === index ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 500 }}>
                      디스플레이 {index + 1}
                    </span>
                    {display.primary && (
                      <span style={{ fontSize: '9px', padding: '2px 4px', background: 'var(--bg-card)', borderRadius: '3px', color: 'var(--text-muted)' }}>
                        메인
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                    {display.bounds.width} × {display.bounds.height}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* 프리젠터 키 매핑 */}
          <section className="settings-section">
            <h3 className="settings-section-title">프리젠터</h3>
            <p className="settings-desc" style={{ marginBottom: '12px' }}>프리젠터 리모컨의 버튼을 등록합니다. 버튼을 클릭 후 리모컨을 눌러주세요.</p>
            
            <div className="space-y-1">
              <div className="settings-row" style={{ padding: '6px 0' }}>
                <span className="settings-label" style={{ fontSize: '12px' }}>다음 (Next)</span>
                <button
                  onClick={() => { setEditingPresenterKey('next'); setEditingKey(null) }}
                  className="shortcut-hint"
                  style={{
                    minWidth: '60px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: editingPresenterKey === 'next' ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                    color: editingPresenterKey === 'next' ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {editingPresenterKey === 'next' ? '입력...' : keyCodeToDisplay(settings.presenterKeys.next)}
                </button>
              </div>
              <div className="settings-row" style={{ padding: '6px 0' }}>
                <span className="settings-label" style={{ fontSize: '12px' }}>이전 (Prev)</span>
                <button
                  onClick={() => { setEditingPresenterKey('prev'); setEditingKey(null) }}
                  className="shortcut-hint"
                  style={{
                    minWidth: '60px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: editingPresenterKey === 'prev' ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                    color: editingPresenterKey === 'prev' ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {editingPresenterKey === 'prev' ? '입력...' : keyCodeToDisplay(settings.presenterKeys.prev)}
                </button>
              </div>
            </div>
          </section>

          {/* 단축키 설정 */}
          <section className="settings-section">
            <h3 className="settings-section-title">단축키</h3>
            
            <div className="space-y-1">
              {(Object.keys(shortcutLabels) as Array<keyof Shortcuts>).map((key) => (
                <div key={key} className="settings-row" style={{ padding: '6px 0' }}>
                  <span className="settings-label" style={{ fontSize: '12px' }}>{shortcutLabels[key]}</span>
                  <button
                    onClick={() => handleShortcutEdit(key)}
                    className="shortcut-hint"
                    style={{
                      minWidth: '60px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: editingKey === key ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                      color: editingKey === key ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {editingKey === key ? '입력...' : keyCodeToDisplay(settings.shortcuts[key])}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
