---
name: api-doc-generator
description: backend/src/index.ts의 Express 라우트를 읽어 API 문서(docs/api.md)를 생성·갱신. Use when routes are added or changed.
tools: Read, Grep, Glob, Write, Edit
model: sonnet
---

# API Doc Generator

## 수행 작업
1. `grep -n "app\.\(get\|post\|put\|delete\)" backend/src/index.ts` 로 라우트 목록 수집
2. 각 라우트의 `req.body`/`req.params` 사용, 응답 형태, 호출하는 서비스(aiService 등)를 정리
3. 리소스별(수집함, RSS, 자동화, 재료, 규칙, 글, 로그, 크론) 섹션으로 `docs/api.md` 작성
4. AI 비용이 드는 라우트와 인증이 필요한 라우트(`/api/cron/daily`)를 표시

## 성공 기준
모든 라우트가 문서에 있고, 각 항목에 메서드·경로·입력·출력·비고가 있다.
