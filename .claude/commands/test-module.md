---
description: 특정 모듈(라우트/서비스)을 로컬 서버로 동작 확인
argument-hint: <inbox|materials|rules|posts|rss-feeds|automation|stats>
allowed-tools: Bash(curl:*), Bash(npm:*)
---

# 모듈 동작 확인

테스트 러너가 없으므로 실제 API 호출로 확인한다.

1. `curl -s http://localhost:3001/api/stats` 로 서버 기동 여부 확인. 안 떠 있으면 사용자에게 `npm start`를 요청.
2. `backend/src/index.ts`에서 `/api/$ARGUMENTS` 라우트 목록을 찾는다.
3. GET 라우트는 직접 호출해 응답 형태를 확인. POST/PUT/DELETE는 데이터를 바꾸므로 실행 전 사용자 확인.
4. AI를 호출하는 라우트(`/posts/generate`, `/inbox/:id/process`, `/automation/run` 등)는 API 비용이 든다고 알린 뒤 실행.
5. 결과를 `라우트 — 상태코드 — 요약`으로 보고.
