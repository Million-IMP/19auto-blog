---
description: 프론트엔드 oxlint 자동 수정
allowed-tools: Bash(npm run:*), Bash(npx:*)
---

# 린트 자동 수정

1. `npx --prefix frontend oxlint --fix frontend/src`
2. `npm run lint --prefix frontend` 로 남은 경고/에러 확인
3. 자동 수정 안 된 항목은 직접 고치고, 고친 파일 목록을 보고
