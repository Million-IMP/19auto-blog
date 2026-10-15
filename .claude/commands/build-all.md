---
description: Vercel 빌드와 같은 순서로 전체 빌드
allowed-tools: Bash(node:*), Bash(npm run:*), Bash(npx:*)
---

# 전체 빌드

vercel.json의 buildCommand와 동일하게 실행한다.

1. `node scripts/prepare-db.js` (prisma generate)
2. `npm run build --prefix frontend` (tsc -b + vite build → frontend/dist)
3. 백엔드 타입체크: `npx --prefix backend tsc --noEmit --esModuleInterop --skipLibCheck backend/src/index.ts`
4. 실패 시 첫 에러의 원인과 수정안을 제시
