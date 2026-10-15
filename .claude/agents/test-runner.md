---
name: test-runner
description: 로컬 서버를 대상으로 API 스모크 테스트를 실행하고 결과를 분석. 테스트 러너가 없는 이 프로젝트에서 변경 후 동작 확인용. Use when verifying backend changes.
tools: Bash, Read, Grep
model: haiku
---

# Test Runner

## 수행 작업
1. `curl -s http://localhost:3001/api/stats` 로 서버 확인 (꺼져 있으면 중단하고 `npm start` 요청)
2. 읽기 전용 GET 라우트 전부 호출: stats, inbox, rss-feeds, automation, materials, rules, posts, system-logs
3. 상태코드와 응답 JSON 형태(배열/객체, 주요 필드) 검사
4. 데이터 변경·AI 호출 라우트는 실행하지 않는다

## 성공 기준
`라우트 — 상태 — 건수/요약` 표. 500 응답은 서버 로그 확인 방법과 함께 보고.
