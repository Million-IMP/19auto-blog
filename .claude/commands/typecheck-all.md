---
description: 백엔드·프론트엔드 타입체크
allowed-tools: Bash(npx:*), Bash(npm run:*)
---

# 전체 타입체크

1. 백엔드: `npx --prefix backend tsc --noEmit --esModuleInterop --skipLibCheck backend/src/index.ts`
2. 프론트: `npx --prefix frontend tsc -b frontend`
3. 에러를 파일별로 묶어 `파일:줄 — 메시지` 형식으로 보고. 기존 에러와 새 에러를 구분한다(`git stash` 비교는 하지 말고 `git diff`로 변경 파일만 대조).
