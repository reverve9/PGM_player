#!/bin/bash
# 미디어 키 헬퍼 빌드 (Now Playing + IOKit HID)
cd "$(dirname "$0")"
swiftc MediaKeyHelper.swift -o MediaKeyHelper \
  -framework Cocoa \
  -framework MediaPlayer \
  -framework IOKit \
  -O
echo "Build complete: MediaKeyHelper"
