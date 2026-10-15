---
name: autoblog-architecture
description: 19auto-blog 전체 구조와 데이터 흐름. Use when adding features, moving code, or asking how 수집함/재료/규칙/초안/발행 connect, or how local vs Vercel runtime differs.
---

# Architecture

## 데이터 흐름
```
RSS·URL·텍스트 → Inbox(0 수집함)
   ├─ process → Material(1 재료) / Rule(2 규칙)
   └─ generate → Post(3 초안, DRAFT) → publish(PUBLISHED) → OSMU 파생글(parentPostId)
SystemLog(4) — 크론·자동화 기록
RssFeed(5) — 채널별 rules/materials 연결, AutomationConfig(6) — 자동 작성 설정(id=1 단일 행)
```

## 런타임 두 가지
| | 로컬 (`npm start`) | Vercel |
|---|---|---|
| 진입 | backend/src/index.ts `app.listen(3001)` | api/[[...path]].ts가 app import |
| 스케줄 | node-cron 매시 정각 `runHourlyPipeline` | vercel.json crons 매일 00:00 UTC → /api/cron/daily (Bearer CRON_SECRET) |
| DB | SQLite `backend/prisma/dev.db` | DATABASE_URL(Postgres) |
| 프론트 | Vite 5173, /api 프록시 | frontend/dist 정적 + rewrite |

## 핵심 파일
- backend/src/index.ts — 라우트 전부 + runHourlyPipeline
- backend/src/services/automationService.ts — runAutomationCycle(trigger)
- backend/src/services/writingPlan.ts — resolveDraftInputs (채널별 재료·규칙 결정)
- scripts/prepare-db.js — SQLite/Postgres 스키마 선택 후 prisma generate(+push)

## 규칙
- 새 서비스는 `backend/src/services/`에 named export로.
- index.ts의 `export default app`과 `if (!process.env.VERCEL)` 가드를 깨지 말 것.
