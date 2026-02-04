import { useEffect, useRef, useState, useCallback } from 'react'
import type { PGMCommand, ControlMessage, PlaylistItem } from '../types'

function PGMWindow() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentItem, setCurrentItem] = useState<PlaylistItem | null>(null)
  const [standbyImage, setStandbyImage] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // useRef로 페이드 상태 관리 (클로저 문제 방지)
  const fadeDurationRef = useRef(500)
  const isTransitioningRef = useRef(false)
  const currentItemRef = useRef<PlaylistItem | null>(null)
  
  // currentItem 변경 시 ref도 업데이트
  useEffect(() => {
    currentItemRef.current = currentItem
  }, [currentItem])

  // 비디오/이미지 타입 체크
  const isVideoType = (item: PlaylistItem | null) => item?.type === 'file' || item?.type === 'video'
  const isImageType = (item: PlaylistItem | null) => item?.type === 'image'

  // Control 윈도우로 메시지 전송
  const sendToControl = useCallback((message: ControlMessage) => {
    window.electronAPI.sendToControl(message)
  }, [])

  // 전체화면 상태 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = !!document.fullscreenElement
      setIsFullscreen(fullscreen)
      sendToControl({ type: 'FULLSCREEN_CHANGED', isFullscreen: fullscreen })
    }

    const checkFullscreen = async () => {
      try {
        const fs = await window.electronAPI.getPGMFullscreen()
        if (fs !== isFullscreen) {
          setIsFullscreen(fs)
          sendToControl({ type: 'FULLSCREEN_CHANGED', isFullscreen: fs })
        }
      } catch {}
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    const interval = setInterval(checkFullscreen, 500)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      clearInterval(interval)
    }
  }, [isFullscreen, sendToControl])

  // 페이드 아웃
  const fadeOut = useCallback(() => {
    return new Promise<void>((resolve) => {
      const duration = fadeDurationRef.current
      if (duration <= 0 || !containerRef.current) {
        resolve()
        return
      }
      
      containerRef.current.style.transition = `opacity ${duration}ms ease-in-out`
      containerRef.current.style.opacity = '0'
      
      setTimeout(resolve, duration)
    })
  }, [])

  // 페이드 인
  const fadeIn = useCallback(() => {
    const duration = fadeDurationRef.current
    if (!containerRef.current) return
    
    containerRef.current.style.transition = `opacity ${duration}ms ease-in-out`
    containerRef.current.style.opacity = '1'
  }, [])

  // 비디오 재생 시작
  const startVideo = useCallback((item: PlaylistItem) => {
    if (!videoRef.current) return
    
    videoRef.current.src = `file://${item.path}`
    videoRef.current.play().then(() => {
      sendToControl({ type: 'PLAYING' })
      fadeIn()
      setTimeout(() => {
        isTransitioningRef.current = false
      }, fadeDurationRef.current)
    }).catch((err) => {
      console.error('Play error:', err)
      sendToControl({ type: 'ERROR', message: err.message })
      fadeIn()
      isTransitioningRef.current = false
    })
  }, [sendToControl, fadeIn])

  // Control에서 오는 명령 수신
  useEffect(() => {
    const handleCommand = async (data: unknown) => {
      const command = data as PGMCommand

      switch (command.type) {
        case 'PLAY': {
          if (isTransitioningRef.current) return
          
          const item = command.item
          const hasCurrentItem = currentItemRef.current !== null
          const duration = fadeDurationRef.current
          
          console.log('PLAY command received, fade duration:', duration, 'hasCurrentItem:', hasCurrentItem)
          
          if (hasCurrentItem && duration > 0) {
            // 페이드 아웃 → 전환 → 페이드 인
            isTransitioningRef.current = true
            await fadeOut()
            
            // 기존 비디오 정지
            if (videoRef.current) {
              videoRef.current.pause()
              videoRef.current.src = ''
            }
            
            setCurrentItem(item)
            
            if (item.type === 'image') {
              sendToControl({ type: 'PLAYING' })
              sendToControl({ type: 'TIME_UPDATE', currentTime: 0, duration: 0 })
              setTimeout(() => {
                fadeIn()
                setTimeout(() => {
                  isTransitioningRef.current = false
                }, duration)
              }, 50)
            } else {
              setTimeout(() => startVideo(item), 50)
            }
          } else {
            // 바로 재생 (첫 재생 또는 페이드 비활성화)
            if (videoRef.current) {
              videoRef.current.pause()
              videoRef.current.src = ''
            }
            
            setCurrentItem(item)
            
            if (containerRef.current) {
              containerRef.current.style.opacity = '1'
            }
            
            if (item.type === 'image') {
              sendToControl({ type: 'PLAYING' })
              sendToControl({ type: 'TIME_UPDATE', currentTime: 0, duration: 0 })
            } else {
              setTimeout(() => {
                if (videoRef.current) {
                  videoRef.current.src = `file://${item.path}`
                  videoRef.current.play().then(() => {
                    sendToControl({ type: 'PLAYING' })
                  }).catch((err) => {
                    console.error('Play error:', err)
                  })
                }
              }, 50)
            }
          }
          break
        }

        case 'PAUSE':
          if (videoRef.current) {
            videoRef.current.pause()
          }
          sendToControl({ type: 'PAUSED' })
          break

        case 'RESUME':
          if (videoRef.current) {
            videoRef.current.play().then(() => {
              sendToControl({ type: 'PLAYING' })
            }).catch(() => {})
          }
          break

        case 'STOP': {
          if (isTransitioningRef.current) return
          
          const duration = fadeDurationRef.current
          
          if (duration > 0 && currentItemRef.current) {
            isTransitioningRef.current = true
            await fadeOut()
            
            if (videoRef.current) {
              videoRef.current.pause()
              videoRef.current.src = ''
            }
            setCurrentItem(null)
            sendToControl({ type: 'PAUSED' })
            window.electronAPI.resizePGMWindow(1920, 1080)
            
            if (containerRef.current) {
              containerRef.current.style.opacity = '1'
            }
            isTransitioningRef.current = false
          } else {
            if (videoRef.current) {
              videoRef.current.pause()
              videoRef.current.src = ''
            }
            setCurrentItem(null)
            sendToControl({ type: 'PAUSED' })
            window.electronAPI.resizePGMWindow(1920, 1080)
          }
          break
        }

        case 'SEEK':
          if (videoRef.current) {
            videoRef.current.currentTime = command.time
          }
          break

        case 'SET_VOLUME':
          if (videoRef.current) {
            videoRef.current.volume = command.volume
          }
          break

        case 'SET_STANDBY_IMAGE':
          setStandbyImage(command.path ? `file://${command.path}` : null)
          break

        case 'SET_FADE_DURATION':
          console.log('SET_FADE_DURATION:', command.duration)
          fadeDurationRef.current = command.duration
          break

        case 'SET_FULLSCREEN':
          window.electronAPI.setPGMFullscreen(command.fullscreen)
          break
      }
    }

    window.electronAPI.onFromControl(handleCommand)
  }, [sendToControl, fadeOut, fadeIn, startVideo])

  // 비디오 이벤트 핸들러
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      sendToControl({
        type: 'TIME_UPDATE',
        currentTime: video.currentTime,
        duration: video.duration || 0,
      })
    }

    const handleEnded = () => {
      sendToControl({ type: 'ENDED' })
    }

    const handleError = () => {
      sendToControl({ type: 'ERROR', message: video.error?.message || 'Unknown error' })
    }

    const handleLoadedMetadata = () => {
      const { videoWidth, videoHeight } = video
      if (videoWidth > 0 && videoHeight > 0) {
        window.electronAPI.resizePGMWindow(videoWidth, videoHeight)
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', handleError)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [sendToControl])

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') {
        window.electronAPI.togglePGMFullscreen()
      } else if (e.code === 'Escape' && isFullscreen) {
        window.electronAPI.setPGMFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
      {/* 콘텐츠 컨테이너 - 페이드 적용 */}
      <div 
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ opacity: 1 }}
      >
        {/* 비디오 */}
        <video
          ref={videoRef}
          className="pgm-video"
          style={{ display: isVideoType(currentItem) ? 'block' : 'none' }}
          playsInline
        />

        {/* 이미지 */}
        {isImageType(currentItem) && currentItem && (
          <img
            src={`file://${currentItem.path}`}
            alt={currentItem.name}
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* 대기 화면 */}
        {!currentItem && (
          <div className="w-full h-full flex items-center justify-center">
            {standbyImage ? (
              <img src={standbyImage} alt="Standby" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-black" />
            )}
          </div>
        )}
      </div>

      {/* 전체화면 힌트 */}
      {!isFullscreen && !currentItem && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <p className="text-xs text-gray-600">F: 전체화면</p>
        </div>
      )}
    </div>
  )
}

export default PGMWindow
