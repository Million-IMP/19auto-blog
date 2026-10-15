---
name: autoblog-ai-pipeline
description: AI 초안 생성·자동화 파이프라인. Use when editing prompts, aiService, draftPipeline, automationService, topicService, imageProvider, publishService, RSS collection, cron, OSMU, or Anthropic model settings.
---

# AI Pipeline

## 흐름
```
수집함 ─(글감 평가)→ TopicCard(글감 보드) ─(초안)┐
수집함 ─(ALL_RSS 자동 / 수동 생성)────────────────┴→ Post 단계형 파이프라인
  SOURCES → OUTLINE → DRAFT → POLISH → IMAGES → READY → (발행 처리 → 공개 확인)
```

## 구성
- `draftPipeline.ts`
  - `createPipelinePost`, `advancePost(id, deadline)`, `resumePost`, `regenerateImage`, 블로그 프로필
  - 단계 결과는 Post 컬럼에 저장한다: `sources`, `outline`, `polishNotes`, `imagePlan`
  - 실패하면 `stageError`가 남고, 이어하기는 같은 단계부터 재시작한다.
- `aiService.ts`
  - `generateOutline`, `generateBody`, `polishBody`, `planImages`, `replanScene`, `evaluateTopic`
  - 모든 함수가 `askText`를 거친다. 토큰 제한에 걸리거나 시간 초과가 나면 오류를 던진다.
- `imageProvider.ts`
  - `IMAGE_PROVIDER`로 고른다. 기본값은 pollinations, `ideogram`은 `IDEOGRAM_API_KEY`가 필요하다.
  - Ideogram 응답 주소는 만료되므로 받은 즉시 저장한다: `BLOB_READ_WRITE_TOKEN`이 있으면 Vercel Blob, 로컬은 `backend/generated-images` → `/api/images/:file`.
  - 설정 확인(과금 없음): `node scripts/check-ideogram.js`
- `topicService.ts`
  - `evaluateInbox`, `draftFromTopic` (카드 1개당 초안 1개)
- `publishService.ts`
  - `markPublished`: 중복 발행을 막는다.
  - `verifyPublished`: 공개 화면에서 제목과 이미지를 확인한다.
- `automationService.ts`
  - `runAutomationCycle(trigger, deadline)` 실행 순서: 멈춘 글 이어가기 → 새 수집 처리 → 선택한 글감 초안 → OSMU(글마다 1회)

## 규칙
- 모델은 `process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'`을 쓴다. 하드코딩하지 않는다.
- 근거를 지어내지 않는다.
  - 출처 없는 수치·경험담은 쓰지 않는다.
  - 검색량·경쟁도는 측정 도구가 없으므로 항상 `UNVERIFIED`로 둔다.
- Vercel 실행 시간 제한:
  - `requestDeadline()`(50초)은 요청이 시작될 때 만들어 끝까지 전달한다.
  - 새 단계는 20초 이상 남았을 때만 시작한다.
- 동시 실행:
  - `lockedUntil` 잠금(`claimPost`)을 거쳐야 단계를 실행할 수 있다.
  - OSMU는 `osmuAt`을 먼저 선점한 글만 실행한다.
- 작성 중인 글(stage ≠ READY)은 수정·발행·OSMU를 하지 않는다.
- 서버가 가져오는 URL은 `isPublicUrl`로 내부망 주소를 걸러낸다.
- 새 단계를 추가할 때는 `STAGES`, `runStage`, 프론트의 `PipelinePanel` STAGES를 함께 고친다.
