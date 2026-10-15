---
name: autoblog-testing
description: 19auto-blog 검증 방법. Use when verifying changes, running typecheck/lint/build, smoke-testing API, or adding tests.
---

# Testing

테스트 러너가 아직 없다. 아래 순서로 검증한다.

## 정적 검사
- 백엔드: `npx --prefix backend tsc --noEmit --esModuleInterop --skipLibCheck backend/src/index.ts`
  - 2026-10-15 기준 에러 0개. 새 에러가 생기면 바로 고친다.
- 프론트: `npm run lint --prefix frontend`, `npm run build --prefix frontend`

## 스모크 테스트 (서버 기동 후)
```bash
curl -s http://localhost:3001/api/stats
curl -s http://localhost:3001/api/posts | head -c 500
```
- AI 호출 라우트는 비용이 드므로 필요할 때만.
- 크론 라우트: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/daily`

## 테스트 도입 시
- 백엔드는 `vitest` + supertest로 `app`(default export)을 직접 호출하는 방식이 가장 적은 변경으로 가능.
- Anthropic SDK는 mock. 임시 스크립트는 `backend/test-*.ts`/`scratch-*.ts`(gitignore됨)로.
