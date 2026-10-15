---
name: autoblog-ai-pipeline
description: AI 초안 생성·자동화 파이프라인. Use when editing prompts, aiService, automationService, writingPlan, RSS collection, cron, OSMU, or Anthropic model settings.
---

# AI Pipeline

## 구성
- `aiService` (services/aiService.ts): extractMaterialStructure, processInboxItem, generateDirectDraft, generateOSMUContent, quickSummarizeArticle
- `runAutomationCycle(trigger)` (automationService.ts): 미처리 Inbox → 초안 batchSize개 생성, 실패 시 Inbox.autoError 기록
- `resolveDraftInputs` (writingPlan.ts): Inbox의 rssFeed에 연결된 재료·규칙 → 없으면 전역 활성 항목
- `runHourlyPipeline` (index.ts): 활성 RSS 수집 → AutomationConfig.enabled면 자동화 실행
- 스크래핑: scraperService.scrapeArticle, 네이버 블로그는 #mainFrame iframe 우회

## 규칙
- 모델: `process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'`. 하드코딩 금지.
- 프롬프트에 넣는 외부 본문은 길이 제한(현재 3000자 수준) 유지 — 비용·컨텍스트 보호.
- AI 응답 JSON 파싱 실패에 대비한 fallback 유지.
- 같은 Inbox를 두 번 초안화하지 않도록 `Post.inboxId` 확인.
- 썸네일은 pollinations.ai URL을 마크다운 이미지로 본문 앞에 붙인다.
- Vercel 함수 maxDuration 60초 — 한 번의 크론에서 batchSize를 키우면 타임아웃 위험.
