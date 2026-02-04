# PGM Player

현장 송출용 듀얼 윈도우 영상 플레이어

## 특징

- **듀얼 윈도우**: 컨트롤 윈도우와 PGM 출력 윈도우 분리
- **PGM 출력**: 확장 모니터에 영상만 풀스크린, 커서/UI 없음
- **플레이리스트**: 드래그앤드롭으로 순서 변경
- **전환 효과**: Fade in/out 지원
- **대기 화면**: 영상 없을 때 표시할 이미지 설정 가능

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 모드
npm run electron:dev

# 빌드
npm run build
```

## 단축키

| 키 | 기능 |
|---|---|
| Space | 재생/일시정지 |
| Enter | 선택 영상 재생 |
| ↑ ↓ | 리스트 이동 |
| N | 다음 영상 |
| Delete | 선택 삭제 |
| Esc | 정지 |

## 설정

- **자동 재생**: 영상 종료 시 다음 영상 자동 재생
- **Fade in/out**: 영상 전환 시 페이드 효과 (100ms ~ 2000ms)
- **대기 화면**: 영상 없을 때 PGM에 표시할 이미지

## 기술 스택

- Electron
- React 18
- Vite
- TypeScript
- Tailwind CSS
- Zustand
- dnd-kit
