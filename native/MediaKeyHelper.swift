import Cocoa
import MediaPlayer
import IOKit.hid

// stdout 버퍼링 끄기
setbuf(stdout, nil)

class MediaKeyHelper: NSObject, NSApplicationDelegate {
    var hidManager: IOHIDManager?
    var lastEventTimes: [String: TimeInterval] = [:]
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        setupNowPlaying()
        setupHIDManager()
        fputs("READY\n", stderr)
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        // Now Playing 해제 → 미디어키가 시스템(Apple Music 등)으로 돌아감
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        MPNowPlayingInfoCenter.default().playbackState = .stopped
        
        if let manager = hidManager {
            IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        }
    }
    
    // ============================================================
    // MARK: - Now Playing API (키보드 미디어키 수신)
    // ============================================================
    // macOS가 "현재 재생 중인 앱"으로 인식 → 키보드 미디어키를 이 앱으로 라우팅
    // 접근성 권한 불필요, 공식 API
    
    func setupNowPlaying() {
        let center = MPRemoteCommandCenter.shared()
        
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.emitKey("MediaPlayPause")
            return .success
        }
        center.playCommand.addTarget { [weak self] _ in
            self?.emitKey("MediaPlayPause")
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.emitKey("MediaPlayPause")
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.emitKey("MediaNextTrack")
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.emitKey("MediaPreviousTrack")
            return .success
        }
        
        // 사용하지 않는 커맨드 비활성화
        center.stopCommand.isEnabled = false
        center.seekForwardCommand.isEnabled = false
        center.seekBackwardCommand.isEnabled = false
        center.skipForwardCommand.isEnabled = false
        center.skipBackwardCommand.isEnabled = false
        center.changePlaybackPositionCommand.isEnabled = false
        
        // Now Playing 활성화 → 미디어키 수신 시작
        let info: [String: Any] = [
            MPMediaItemPropertyTitle: "PGM Player",
            MPNowPlayingInfoPropertyPlaybackRate: 1.0,
            MPMediaItemPropertyPlaybackDuration: 9999,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: 0
        ]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = .playing
    }
    
    // ============================================================
    // MARK: - IOKit HID (USB 오디오 디바이스 컨트롤 - DAC-22 등)
    // ============================================================
    // USB 디바이스가 보내는 HID Consumer Control 이벤트를 직접 읽음
    // CGEventTap보다 로우레벨, 비표준 미디어키도 잡을 수 있음
    // 접근성 권한 불필요 (Consumer Control은 키보드/마우스가 아님)
    
    func setupHIDManager() {
        hidManager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        guard let manager = hidManager else {
            fputs("ERROR:failed_to_create_hid_manager\n", stderr)
            return
        }
        
        // Consumer Control 디바이스 매칭 (usage page 0x0C)
        // DAC-22 같은 USB 오디오 디바이스의 미디어 버튼이 이 카테고리
        let matching: [String: Any] = [
            kIOHIDDeviceUsagePageKey as String: 0x0C  // Consumer
        ]
        
        IOHIDManagerSetDeviceMatching(manager, matching as CFDictionary)
        
        // 디바이스 연결/해제 디버그 로그
        let context = Unmanaged.passUnretained(self).toOpaque()
        
        IOHIDManagerRegisterDeviceMatchingCallback(manager, { context, result, sender, device in
            if let product = IOHIDDeviceGetProperty(device, kIOHIDProductKey as CFString) as? String {
                fputs("HID_CONNECTED: \(product)\n", stderr)
            }
        }, context)
        
        IOHIDManagerRegisterDeviceRemovalCallback(manager, { context, result, sender, device in
            if let product = IOHIDDeviceGetProperty(device, kIOHIDProductKey as CFString) as? String {
                fputs("HID_DISCONNECTED: \(product)\n", stderr)
            }
        }, context)
        
        // HID 입력값 콜백 등록
        IOHIDManagerRegisterInputValueCallback(manager, { context, result, sender, value in
            guard let ctx = context else { return }
            let helper = Unmanaged<MediaKeyHelper>.fromOpaque(ctx).takeUnretainedValue()
            
            let element = IOHIDValueGetElement(value)
            let usagePage = IOHIDElementGetUsagePage(element)
            let usage = IOHIDElementGetUsage(element)
            let intValue = IOHIDValueGetIntegerValue(value)
            
            // Consumer 페이지 + 키 다운(value > 0)만 처리
            guard usagePage == 0x0C && intValue > 0 else { return }
            
            // HID Consumer Control Usage ID 매핑
            switch UInt32(usage) {
            case 0xCD:  // Play/Pause
                helper.emitKey("MediaPlayPause")
            case 0xB5:  // Next Track
                helper.emitKey("MediaNextTrack")
            case 0xB6:  // Previous Track
                helper.emitKey("MediaPreviousTrack")
            case 0xB7:  // Stop
                helper.emitKey("MediaStop")
            case 0xE2:  // Mute
                break  // 무시
            case 0xE9, 0xEA:  // Volume Up/Down
                break  // 볼륨은 시스템에 맡김
            default:
                // 알 수 없는 usage는 디버그 출력
                fputs("DEBUG_HID: usage=0x\(String(usage, radix: 16)) value=\(intValue)\n", stderr)
            }
        }, context)
        
        // 런루프에 등록 & 열기
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetCurrent(), CFRunLoopMode.commonModes.rawValue)
        
        let result = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        if result != kIOReturnSuccess {
            fputs("ERROR:hid_manager_open_failed(\(result))\n", stderr)
        }
    }
    
    // ============================================================
    // MARK: - 출력 (중복 제거 포함)
    // ============================================================
    // Now Playing과 IOKit HID 양쪽에서 같은 이벤트가 올 수 있으므로
    // 300ms 내 중복 이벤트는 무시
    
    func emitKey(_ name: String) {
        let now = ProcessInfo.processInfo.systemUptime
        if let lastTime = lastEventTimes[name], now - lastTime < 0.3 {
            return  // 중복 무시
        }
        lastEventTimes[name] = now
        print(name)  // stdout → Electron main process
    }
}

// ============================================================
// MARK: - 앱 시작
// ============================================================

let app = NSApplication.shared
app.setActivationPolicy(.accessory)  // Dock에 안 보임
let helper = MediaKeyHelper()
app.delegate = helper
app.run()
