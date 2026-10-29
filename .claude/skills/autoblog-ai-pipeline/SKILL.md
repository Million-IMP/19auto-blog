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
  - `imageMode()`만 `IMAGE_PROVIDER`를 읽는다. `jobs`면 서버는 그림을 만들지 않고, 비우면 pollinations로 렌더한다(과금 API 없음).
  - `storeImage`: `BLOB_READ_WRITE_TOKEN`이 있으면 Vercel Blob, 로컬은 `backend/generated-images` → `/api/images/:file`.
  - prompt = style + 장면 prompt + must (`fullPrompt`).
  - 이미지 아래에는 `*▲ caption (AI 생성 이미지)*` 설명글이 붙는다(`imageMarkdown`).
- `imageJobs.ts` + `scripts/image-jobs.js` (`IMAGE_PROVIDER=jobs`)
  - 작업 = `imagePlan` 장면 중 url이 없거나 `pending`인 것(새 테이블 없음). IMAGES 단계는 계획만 저장하고 기다린다. `advancePost`는 진행이 없으면 멈추고, 크론 이어하기 목록에서 대기 글을 뺀다(`waitingForImagesWhere`).
  - `GET /api/image-jobs` 목록, `POST /api/image-jobs/:postId/:index` 업로드(운영자 전용, PNG·JPEG·WebP 4MB 이하, 파일 서명 검사) → 채점 → 마지막 장면이면 본문에 넣고 READY.
  - 작업 프롬프트 = `fullPrompt` + avoid + 기본 금지어 + 글자 금지 문장(`jobPrompt`). negative prompt를 받지 않는 모델용이다.
  - 다시 생성은 장면을 `pending`으로 두고 이전 그림을 유지한다. 세트 다시 만들기는 새 계획의 전 장면을 작업으로 둔다.
  - PC: `npm run image-jobs -- pull | push | generate | run`. generate는 구독 로그인된 `agy -p … --output-format json`을 장면마다 1번 실행하고, 돌려준 대화 id의 transcript에서 "Final image path"를 찾아 `image-jobs/done/`으로 복사한다(최대 `IMAGE_JOBS_MAX`장).
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
  - `requestDeadline()`(Vercel 280초, vercel.json maxDuration 300초와 짝)은 요청이 시작될 때 만들어 끝까지 전달한다.
  - 새 단계는 20초 이상 남았을 때만 시작한다.
- 동시 실행:
  - `lockedUntil` 잠금(`claimPost`)을 거쳐야 단계를 실행할 수 있다.
  - OSMU는 `osmuAt`을 먼저 선점한 글만 실행한다.
- 작성 중인 글(stage ≠ READY)은 수정·발행·OSMU를 하지 않는다.
- 서버가 가져오는 URL은 `isPublicUrl`로 내부망 주소를 걸러낸다.
- 새 단계를 추가할 때는 `STAGES`, `runStage`, 프론트의 `PipelinePanel` STAGES를 함께 고친다.
