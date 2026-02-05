import Cocoa

// 미디어 키 코드 (NX_KEYTYPE)
let NX_KEYTYPE_PLAY: Int = 16
let NX_KEYTYPE_NEXT: Int = 17
let NX_KEYTYPE_PREVIOUS: Int = 18

// stdout 버퍼링 끄기
setbuf(stdout, nil)

// 전역 tap 참조 (재활성화용)
var globalTap: CFMachPort?

func mediaKeyName(_ keyCode: Int) -> String? {
    switch keyCode {
    case NX_KEYTYPE_PLAY: return "MediaPlayPause"
    case NX_KEYTYPE_NEXT: return "MediaNextTrack"
    case NX_KEYTYPE_PREVIOUS: return "MediaPreviousTrack"
    default: return nil
    }
}

// 디버그: 모든 시스템 키 출력
func debugKeyName(_ keyCode: Int) -> String {
    switch keyCode {
    case 0: return "SoundUp"
    case 1: return "SoundDown"
    case 7: return "Mute"
    case 16: return "Play"
    case 17: return "Next"
    case 18: return "Previous"
    case 19: return "Fast"
    case 20: return "Rewind"
    default: return "Unknown(\(keyCode))"
    }
}

// CGEventTap 콜백
let callback: CGEventTapCallBack = { proxy, type, event, refcon in
    // 탭이 비활성화되면 다시 활성화
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = globalTap {
            CGEvent.tapEnable(tap: tap, enable: true)
        }
        return Unmanaged.passRetained(event)
    }
    
    guard let nsEvent = NSEvent(cgEvent: event) else {
        return Unmanaged.passRetained(event)
    }
    
    // 시스템 이벤트 (미디어 키) - subtype 8
    if nsEvent.type == .systemDefined && nsEvent.subtype.rawValue == 8 {
        let data1 = nsEvent.data1
        let keyCode = (data1 & 0xFFFF0000) >> 16
        let keyFlags = data1 & 0x0000FFFF
        let keyState = ((keyFlags & 0xFF00) >> 8) == 0x0A  // key down
        
        if keyState, let name = mediaKeyName(keyCode) {
            print(name)  // stdout으로 Electron에 전달
            return nil    // 이벤트 소비 (Apple Music 차단)
        } else if keyState {
            fputs("DEBUG_KEY: \(debugKeyName(keyCode)) code=\(keyCode)\n", stderr)
        }
    }
    
    return Unmanaged.passRetained(event)
}

// 접근성 권한 확인 (없으면 요청 대화상자 표시)
let trusted = AXIsProcessTrustedWithOptions(
    [kAXTrustedCheckOptionPrompt.takeRetainedValue(): true] as CFDictionary
)

if !trusted {
    fputs("WAITING_ACCESSIBILITY\n", stderr)
}

// CGEventTap 생성 (14 = NX_SYSDEFINED, 시스템 이벤트)
let eventMask = CGEventMask(1 << 14)

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: eventMask,
    callback: callback,
    userInfo: nil
) else {
    fputs("ERROR:failed_to_create_tap\n", stderr)
    exit(1)
}

globalTap = tap

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)

fputs("READY\n", stderr)
CFRunLoopRun()
