# image-jobs Design Document

> **Summary**: 서버는 이미지를 만들지 않고 `imagePlan`의 빈 장면을 "이미지 작업"으로 내놓는다. PC 스크립트가 작업을 폴더로 내려받고, 사람(Gemini 앱) 또는 구독 로그인된 `agy`가 그림을 채워 운영자 업로드 API로 올린다. 설계안 C(균형): 스키마 변경 없음, 순수 로직은 `imageJobs.ts`, DB·잠금은 `draftPipeline.ts`, 라우트는 `index.ts`
>
> **Project**: 19auto-blog
> **Version**: backend 1.0.0
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-28
> **Status**: Draft
> **Planning Doc**: [image-jobs.plan.md](./image-jobs.plan.md) (v0.3)
> **Base**: `master` 58f8040 (PR #36까지) — 브랜치 `feat/image-jobs`

### Pipeline References

해당 없음(9단계 파이프라인 미사용).

---

## Context Anchor

> Copied from Plan document. Ensures strategic context survives Design→Do handoff.

| Key | Value |
|-----|-------|
| **WHY** | Ideogram 키 401로 10/24부터 이미지 중단, 12개 글 멈춤. 서버 안 공급자 하나가 죽으면 전체가 멈추고 아무도 모른다. 사용자: Ideogram 취소, 별도 API 없이 월 구독 이미지 모델 사용 |
| **WHO** | 운영자(사용자) — PC에서 작업 폴더를 채운다. 블로그 독자는 같은 형태의 이미지를 본다 |
| **RISK** | 구독 이미지 한도가 공개돼 있지 않다. `agy`가 그림을 작업 폴더가 아닌 자기 데이터 폴더에 저장하고 응답이 먼저 끝난다(10/26 실험). `agy` 안의 그림 도구가 프롬프트를 바꿔 쓸 수 있다. 업로드 API가 운영 글을 바꾸므로 운영자 세션 필수. 대기 글이 `advancePost` 반복문을 헛돌 수 있다 |
| **SUCCESS** | jobs 공급자에서 렌더 호출 0·stageError 0으로 대기 / 수동 그림으로 한 글 READY / `agy` 작업자로 한 글 자동 READY(API 요금 0) / Ideogram 참조 0 / 테스트·타입체크·린트·빌드 통과 |
| **SCOPE** | 1단계: jobs 공급자 + 작업 API + pull/push + 대시보드 대기 표시 + Ideogram 삭제. 2단계: generate(`agy` 작업자). 멈춘 12개 글 일괄 이어하기는 제외 |

---

## 1. Overview

### 1.1 Design Goals

1. `IMAGE_PROVIDER=jobs`에서 서버는 렌더 호출 0. IMAGES 단계는 계획만 저장하고 오류 없이 기다린다.
2. 기다리는 글이 크론·이어하기를 막지 않는다: `advancePost`는 진행이 없으면 바로 끝나고, 크론 이어하기 목록(`batchSize`)에서 빠진다.
3. 작업 = `imagePlan` 장면 중 `url`이 없거나 `pending`인 것. 새 테이블 없이 기존 데이터가 큐가 된다.
4. 그림이 어디서 왔든(수동·`agy`) 같은 업로드 API로 들어와 지금처럼 채점되고 본문에 들어간다.
5. 별도 과금 API 0. Ideogram 코드·문서·환경변수 0.

### 1.2 Design Principles

- **모드는 한 곳에서 판단**: `imageMode()`만 `IMAGE_PROVIDER`를 읽는다. 파이프라인은 `render`/`jobs` 두 갈래를 명시적으로 쓴다(오류로 흐름을 바꾸지 않는다).
- **순수 로직과 DB 분리**: 작업 목록·프롬프트·업로드 반영·형식 검사는 `imageJobs.ts` 순수 함수(목 없이 vitest). 잠금과 저장은 기존 `draftPipeline.ts` 패턴(`claimPost` → 다시 읽기 → 저장 → 잠금 해제)을 그대로 쓴다.
- **PC 도구는 실패해도 작업을 잃지 않는다**: 스크립트는 성공한 파일만 옮기고, 실패는 이유를 출력하고 남긴다.
- **구독 CLI는 공식 실행 파일만**: 로그인 파일·토큰을 읽지 않는다. `agy`의 출력(JSON)과 자기 대화 기록(`transcript.jsonl`)만 읽는다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | jobs 공급자가 "대기" 오류를 던지고 파이프라인 곳곳에서 잡음 | 새 `ImageJob` 테이블 + 큐 서비스 + 스크립트 4모듈 | `imagePlan`이 큐. 순수 로직 `imageJobs.ts`, 모드별 명시 분기 |
| **New Files** | 1 | 약 8 | 3 |
| **Modified Files** | 약 13 | 약 13 + 스키마 | 약 15 (+삭제 1) |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium | High | High |
| **Effort** | 약 2.5시간 | 약 5시간 | 약 3.5시간 |
| **Risk** | 숨은 흐름 — regenerate·rebuild에서 빠뜨리기 쉬움 | 운영 DB 스키마 변경, 상태가 두 곳 | Low |

**Selected**: Option C — **Rationale**: 사용자 선택(10/28, 추천안). 스키마 변경 없이 기존 `imagePlan`이 이미 미완성 장면을 기록하고 있고, 모드별 분기를 명시해 regenerate·rebuild·크론까지 한 번에 맞출 수 있다.

### 2.1 Component Diagram

```
 ┌──────────── 운영 (Vercel) ─────────────┐        ┌──────────── PC ─────────────────────────┐
 │                                        │        │                                         │
 │ 크론/이어하기 → advancePost             │        │ scripts/image-jobs.js                    │
 │   └ IMAGES(jobs): 계획 저장, 대기       │  GET   │   pull ──────────▶ image-jobs/pending/   │
 │                                        │◀───────│                    <postId>-<index>.json │
 │ GET  /api/image-jobs ──────────────────┼───────▶│                    <postId>-<index>.txt  │
 │                                        │        │   generate (agy) ─▶ image-jobs/done/     │
 │ POST /api/image-jobs/:postId/:index    │  POST  │   (또는 사람이 Gemini 앱에서 저장)        │
 │   requireAdmin → storeImage(Blob)      │◀───────│   push ──────────▶ image-jobs/uploaded/  │
 │   → scoreScene → (마지막이면) READY     │        │                                         │
 │                                        │        │ agy -p … --output-format json            │
 │ GET /api/dashboard → imageJobs{N,M}    │        │   → conversation_id                      │
 └────────────────────────────────────────┘        │   → ~/.gemini/antigravity-cli/brain/<id>/│
                                                   │      "Final image path: …"               │
                                                   └─────────────────────────────────────────┘
```

### 2.2 Data Flow

```
[새 글] SOURCES → … → POLISH → IMAGES
  IMAGES(jobs): planImageSet → imagePlan 저장 (장면 url 없음) → return (변화 없음 → advancePost 종료)
  크론: stage=IMAGES && imagePlan 있음 → 이어하기 목록에서 제외 (jobs 모드)

[PC] pull → pending/*.json·txt
     generate: 장면마다 agy 1회 → 대화 id → transcript의 Final image path → done/<postId>-<index>.jpg
     push: done/* → POST(쿠키) → uploaded/
[서버] 업로드: 잠금 → Blob 저장 → scene.url·source, pending 삭제 → scoreScene
       → 글이 IMAGES이고 남은 작업 0 → insertImages + READY + POST_READY 기록
       → 글이 READY(장면 교체)면 본문의 이전 주소를 새 주소로 바꿈

[다시 생성] regenerate(jobs): scene.pending = true (이전 url·본문 유지) → 작업 목록에 다시 나옴
[세트 다시 만들기] rebuild: 지금처럼 본문 AI 이미지 삭제 + 계획 초기화 + IMAGES → 새 계획 대기
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `draftPipeline.ts` | `imageJobs.ts`, `imageProvider.ts`(`imageMode`, `storeImage`), `imageQuality.ts`(`scoreScene`) | 모드 분기, 업로드 반영, 채점 |
| `automationService.ts` | `draftPipeline.ts`(`waitingForImagesWhere`) | 크론 이어하기에서 대기 글 제외 |
| `index.ts` | `draftPipeline.ts`(`listImageJobs`, `attachImage`), `auth.ts`(`requireAdmin`) | 라우트 |
| `scripts/image-jobs.js` | Node 22 내장 `fetch`·`fs`·`child_process`, `agy` 실행 파일 | PC 작업자 (새 의존성 없음) |

---

## 3. Data Model

### 3.1 Entity Definition

스키마 변경 없음. `Post.imagePlan`(JSON 문자열) 안의 `ImageScene`에 선택 필드 2개를 더한다.

```typescript
// backend/src/services/aiService.ts
export type ImageScene = {
  // …기존 필드 그대로 (h2, anchor, point, scene, must, avoid, prompt, caption, url, seed, score, scoreReason, checked, retried)
  // 작업 대기: 새 그림을 기다린다. url이 있으면 새 그림이 올라올 때까지 이전 그림을 그대로 쓴다.
  pending?: boolean;
  // 이 장면 그림을 만든 곳 (jobs 업로드: 'agy' | 'manual')
  source?: string;
};
```

- 작업 여부: `isJob(scene) = !scene.url || scene.pending === true`
- 장면 번호: 0 = 표지(`plan.cover`), 1.. = `plan.sections[index - 1]` (기존 regenerate와 같음)
- `plan.provider`: jobs 업로드 때 `'jobs'`로 기록(화면의 "스타일 · 공급자" 표시용). 이전 글의 `'ideogram'`은 그대로 둔다(FR-09)

### 3.2 작업 항목 (API 응답, 저장하지 않음)

```typescript
type ImageJob = {
  postId: number;
  title: string;
  index: number;          // 0=표지
  label: string;          // '표지' | 소제목
  prompt: string;         // jobPrompt(plan, scene) — 이미지 모델에 그대로 넣는 전체 문장
  width: number;          // 800
  height: number;         // 표지 400, 소제목 450
  aspect: '2:1' | '16:9';
  replace: boolean;       // true = 이미 그림이 있는 장면의 교체(다시 생성)
};
```

`jobPrompt(plan, scene)` = `fullPrompt({ style, prompt, must })` + `. Avoid: ${scene.avoid}, ${BASE_NEGATIVE}` + `. No text, no letters, no numbers, no logos, no watermarks.` (`fullPrompt`·`BASE_NEGATIVE`는 `imageProvider.ts`에서 내보낸다. Ideogram이 negative_prompt로 보내던 내용을 문장에 넣는다.)

### 3.3 PC 작업 폴더 (gitignore)

```
image-jobs/
├── pending/   <postId>-<index>.json (ImageJob 그대로), <postId>-<index>.txt (prompt만, 수동 복사용)
├── done/      <postId>-<index>.(png|jpg|jpeg|webp)  ← 사람 또는 generate가 넣는다
├── uploaded/  올리기 성공한 파일 (나중에 지워도 된다)
└── .agy/      agy 실행 작업 폴더 (비어 있음, 격리용)
```

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/image-jobs` | 미완성 장면 목록 | 없음 (다른 GET과 같이 공개) |
| POST | `/api/image-jobs/:postId/:index` | 그림 1장 업로드 | `requireAdmin` (APP_PASSWORD 쿠키) |
| GET | `/api/dashboard` | 기존 + `imageJobs: { scenes, posts }` | 없음 |
| POST | `/api/posts/:id/images/:index/regenerate` | jobs 모드: 장면을 작업 대기로 | 기존 그대로 |

### 4.2 Detailed Specification

#### `GET /api/image-jobs`

대상 글: `imagePlan`이 있고 `stageError`가 없으며 (`stage = 'IMAGES'` 또는 계획에 `"pending":true`가 있는) 글. 멈춘 #97~#108(`stageError` 있음)은 "이어하기"를 누르기 전까지 나오지 않는다(사용자 결정: 일괄 이어하기 제외). jobs 모드가 아니면 빈 목록을 돌려준다(render 모드의 IMAGES 글은 크론이 직접 그리는 중이다 — Check에서 추가).

**Response (200):**
```json
{
  "scenes": 6,
  "posts": 1,
  "jobs": [
    { "postId": 109, "title": "…", "index": 0, "label": "표지", "prompt": "…", "width": 800, "height": 400, "aspect": "2:1", "replace": false }
  ]
}
```

#### `POST /api/image-jobs/:postId/:index?source=agy|manual`

- 본문: 그림 바이트 그대로. `Content-Type: image/png | image/jpeg | image/webp`. 라우트 전용 `express.raw({ type: [...], limit: '4mb' })` (전역 `express.json()`은 그대로)
- 검사 순서: 운영자 세션(`requireAdmin`, 로그인 없으면 번호와 상관없이 401) → 크기(4MB) → 번호 형식 → Content-Type → 파일 앞부분 서명(PNG `89 50 4E 47`, JPEG `FF D8 FF`, WebP `RIFF….WEBP`)과 Content-Type 일치 → 장면이 작업 대기인지
- 처리(`attachImage`, `withDeadline(requestDeadline())` 안): `claimPost` → 다시 읽기 → `storeImage` → `applyUpload` → `scoreScene(scene, { url, data, mediaType })` → 저장 → `IMAGE_UPLOAD` 기록 → (READY가 됐으면) `POST_READY` 기록 → 잠금 해제

**Response (200):**
```json
{ "id": 109, "index": 0, "url": "https://…blob…/post-images/….jpg", "score": 4, "remaining": 5, "stage": "IMAGES", "completed": false }
```

**Error Responses:**
- `400`: 잘못된 글·장면 번호 / 지원하지 않는 형식 / 서명과 형식 불일치 / 빈 본문
- `401`: 운영자 로그인 필요 (`code: AUTH_REQUIRED`, 기존 `requireAdmin`)
- `404`: 글 또는 장면 없음
- `409`: 이미지 계획 없음 / 이 장면은 작업 대기가 아님 / 다른 실행이 처리 중(`BUSY_MESSAGE`)
- `413`: 4MB 초과 (`express.raw`의 `PayloadTooLargeError`를 이 라우트의 오류 처리에서 JSON으로 돌려준다)

---

## 5. UI/UX Design

### 5.1 Screen Layout

```
대시보드
┌──────────────────────────────────────────────────────────┐
│ Masthead (기존)                                           │
├──────────────────────────────────────────────────────────┤
│ [Notice draft] 이미지 대기 6장 (글 1개) — PC에서            │  ← 대기 0이면 숨김
│   npm run image-jobs -- run 을 실행하면 채워집니다          │
├──────────────────────────────────────────────────────────┤
│ PressLine · 5열 보드 (기존)                                │
└──────────────────────────────────────────────────────────┘

작업실 > 글 카드 > PipelinePanel > 장면 목록
┌──────────┬─────────────────────────────────┬──────────┐
│ 썸네일/빈칸│ 소제목  [점수] [작업 대기]        │ 다시 생성 │  ← isJob이면 "작업 대기" 배지
└──────────┴─────────────────────────────────┴──────────┘
```

### 5.2 User Flow

```
대시보드 "이미지 대기 N장" 확인 → PC에서 npm run image-jobs -- run
  (또는 pull → Gemini 앱에서 pending/*.txt로 그림 → done/에 저장 → push)
→ 대시보드 새로고침: 대기 0, 글은 05 발행 대기 열로
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| 이미지 대기 Notice | `frontend/src/pages/DashboardPage.tsx` | `summary.imageJobs.scenes > 0`이면 표시 |
| `ImagePlanList` 대기 배지 | `frontend/src/components/PipelinePanel.tsx` | 장면별 "작업 대기" 배지, 이전 그림은 유지 표시 |

### 5.4 Page UI Checklist

#### 대시보드 (`/`)

- [ ] Notice(tone `draft`): "이미지 대기 {scenes}장 (글 {posts}개)" + 실행 명령 `npm run image-jobs -- run` (scenes 0이면 렌더하지 않음)
- [ ] `Summary` 타입에 `imageJobs?: { scenes: number; posts: number }` (없으면 0으로 본다 — 이전 서버 응답 호환)

#### 작업실 PipelinePanel (`/posts` 글 카드)

- [ ] 장면 행: `!scene.url || scene.pending`이면 Badge(tone `draft`) "작업 대기"
- [ ] 장면 행: `scene.pending && scene.url`이면 이전 썸네일을 그대로 보인다
- [ ] "다시 생성" 버튼: 지금처럼 `scene.url`이 있을 때만. 누르면 jobs 모드에서는 "작업 대기" 배지가 생긴다(서버 응답으로 갱신)
- [ ] 세트 다시 만들기 주석: "Ideogram 비용" → "구독 사용량" (두 번 눌러 실행하는 동작은 유지)

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | Message | Cause | Handling |
|------|---------|-------|----------|
| 400 | PNG·JPEG·WebP 그림만 올릴 수 있습니다 | 형식·서명 불일치, 빈 본문 | push가 이유 출력, 파일은 `done/`에 남김 |
| 401 | 운영자 로그인이 필요합니다 | 쿠키 없음/만료 | push: "APP_PASSWORD를 셸 환경변수로 넣어주세요" |
| 409 | 이 장면은 작업 대기가 아닙니다 | 다른 곳에서 이미 채움 | push가 `uploaded/`로 옮기지 않고 `skipped` 출력 (pull이 다음에 pending을 정리) |
| 409 | 다른 실행이 이 글을 처리하고 있습니다 | 잠금 중 | push가 파일을 남기고 다음 실행에 다시 시도 |
| 413 | 4MB 이하 그림만 올릴 수 있습니다 | 큰 PNG | push가 올리기 전에 크기로 먼저 걸러 이유 출력 |

### 6.2 Error Response Format

기존 라우트와 같은 `{ "error": "한국어 메시지", "code"?: "AUTH_REQUIRED" }`.

### 6.3 PC 작업자 실패 처리 (`generate`)

| 상황 | 동작 |
|------|------|
| `agy` 실행 실패·JSON 아님 | 그 장면 건너뜀(pending 유지), 연속 2번이면 실행 중단(한도·로그인 문제로 본다) |
| `status ≠ SUCCESS` 또는 응답에 한도 문구(quota, limit, 429) | 실행 중단, 남은 작업은 pending 유지 |
| 장면당 시간 초과(기본 180초) 안에 그림을 못 찾음 | 그 장면 건너뜀, 대화 id를 출력(나중에 손으로 찾을 수 있게) |
| `done/`에 이미 같은 이름 파일 있음 | 그 작업은 만들지 않음(이중 생성 방지) |

---

## 7. Security Considerations

- [x] 업로드는 `requireAdmin`(기존 APP_PASSWORD 서명 쿠키). 새 비밀값 없음
- [x] 크기 4MB, Content-Type 허용 목록 + 파일 서명 검사. 저장 이름은 서버가 만든다(`storeImage`) — 사용자 파일 이름을 쓰지 않음
- [x] 작업 대기인 장면에만 업로드 가능 → 완성된 글의 그림을 임의로 바꿀 수 없음(바꾸려면 "다시 생성"으로 먼저 대기)
- [x] push 스크립트: `APP_PASSWORD`는 셸 환경변수로만 읽고 출력·저장하지 않는다(relink 스크립트와 같음). 사용자가 별도 PowerShell 창에서 `Read-Host`로 넣는다
- [x] `agy` 실행: `spawn('agy', args, { shell: false })` — 프롬프트는 인자 하나로 전달(셸 해석 없음). `--dangerously-skip-permissions`를 쓰지 않는다. 기본 headless는 권한이 필요한 도구를 자동 거부한다(10/28 확인: `denied_actions: RunCommand`). `--sandbox`로 터미널 제한. 작업 폴더는 빈 `image-jobs/.agy/`
- [x] 프롬프트 주입 대비: 장면 프롬프트는 수집 글에서 AI가 만든 문장이다. 지시문으로 "그림 도구만 쓰고 명령 실행·파일 수정·웹 열람 금지"를 앞에 두고, 장면 설명은 구분 기호 안에 넣는다. 권한 자동 거부가 실제 방어선
- [x] 구독 로그인 파일(`~/.gemini/…` 인증 정보)은 읽지 않는다. 읽는 것은 `brain/<자기 대화 id>/` 아래 대화 기록과 그림 파일뿐
- [ ] Rate limiting: 운영자 전용이라 두지 않음

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L1: 단위 | `imageJobs.ts` 순수 함수 | vitest (목 없음) | Do |
| L1: 파이프라인 | jobs 모드 IMAGES·advancePost·regenerate·attachImage | vitest (`draftPipeline.test.ts` 기존 prisma 목) | Do |
| L1: API | 401·400·413·200 | 로컬 `npm run start:local` + curl | Do/Check |
| L3: E2E | pull → 수동 그림 → push → READY (SC-2), run (SC-3) | 로컬 서버 + 스크립트 | Do |

### 8.2 L1: 단위·파이프라인 시나리오 (vitest)

| # | 대상 | 시나리오 | 기대 |
|---|------|----------|------|
| 1 | `isJob`/`jobItems` | url 없음·pending·완료 장면 섞인 계획 | 작업은 url 없음·pending만, index 0=표지 |
| 2 | `jobPrompt` | 장면 | style·prompt·must·avoid·글자 금지 문구 포함, 한국어 anchor 미포함 |
| 3 | `detectImageType` | PNG/JPEG/WebP 서명, 텍스트 바이트 | 맞는 형식 / null |
| 4 | `applyUpload` | READY 글의 교체 장면 | 본문의 이전 주소 → 새 주소, pending 삭제 |
| 5 | IMAGES(jobs) | 계획 없는 글, `deadline = Infinity` | `render` 0회, stageError null, imagePlan 저장, **advancePost가 끝난다** |
| 6 | `attachImage` | 장면 6개를 차례로 업로드 | 마지막 업로드에서 insertImages + READY, 각 장면 score 기록, `POST_READY` 기록 |
| 7 | `attachImage` | 작업이 아닌 장면 | 409 |
| 8 | regenerate(jobs) | READY 글의 장면 2 | `render` 0회, pending true, url·본문 그대로 |
| 9 | rebuild(jobs) | READY 글 | 본문 AI 이미지 삭제, 새 계획, 전 장면 작업, stage IMAGES |
| 10 | `waitingForImagesWhere` | jobs 모드 / render 모드 | jobs에서만 `NOT { stage: 'IMAGES', imagePlan: { not: null } }` |
| 11 | render 모드(pollinations) | 기존 IMAGES·재시도 테스트 | 기존대로 통과(`speed` 단언만 삭제) |

### 8.3 L1: API (curl, 로컬)

| # | Endpoint | Test | Expected |
|---|----------|------|:--------:|
| 1 | `GET /api/image-jobs` | 대기 글 1개 | 200, `scenes` = 장면 수 |
| 2 | `POST /api/image-jobs/1/0` | 쿠키 없음 (로컬 서버에 APP_PASSWORD 있을 때) | 401 |
| 3 | 〃 | `Content-Type: text/plain` | 400 |
| 4 | 〃 | 5MB 바이트 | 413 |
| 5 | 〃 | PNG 서명 + `image/jpeg` | 400 |
| 6 | `GET /api/dashboard` | 대기 있음 | `imageJobs.scenes > 0` |

### 8.4 L3: E2E

| # | Scenario | Steps | Success Criteria |
|---|----------|-------|-----------------|
| 1 | 수동 (SC-2) | `start:local`(IMAGE_PROVIDER=jobs) → 글 1개 IMAGES 대기 → `pull` → `pending/*.txt`로 그림(수동 또는 `agy` 1장 + 나머지 복사본) → `done/` → `push` | 글 READY, 본문에 이미지·설명글, 장면마다 score |
| 2 | 자동 (SC-3) | 새 대기 글 → `npm run image-jobs -- run` | 약 6장 자동, READY. 장면당 시간·엉터리 글자 장면 수 기록 |
| 3 | 크론 (FR-02) | 대기 글 + 본문 단계 글이 함께 있을 때 `POST /api/automation/run` | 대기 글은 목록에서 빠지고 다른 글은 진행, 응답 시간 정상 |

### 8.5 Seed Data Requirements

| Entity | Minimum Count | Key Fields Required |
|--------|:------------:|---------------------|
| Post (로컬 dev.db, `start:local` 운영 사본) | 1 | `stage: 'POLISH'` 또는 이어하기로 IMAGES에 들어갈 글 |

---

## 9. Clean Architecture

### 9.1 Layer Structure (이 프로젝트 기존 층)

| Layer | Responsibility | Location |
|-------|---------------|----------|
| Presentation | 대시보드·작업실 화면 | `frontend/src/pages/`, `frontend/src/components/` |
| Routes | Express 라우트(모두 한 파일) | `backend/src/index.ts` |
| Application | 단계 실행·잠금·저장 | `backend/src/services/draftPipeline.ts`, `automationService.ts` |
| Domain(순수) | 작업 판단·프롬프트·업로드 반영·형식 검사 | `backend/src/services/imageJobs.ts` (신규) |
| Infrastructure | 이미지 공급자·저장(Blob/로컬) | `backend/src/services/imageProvider.ts` |
| PC 도구 | 작업 폴더·`agy` 실행 | `scripts/image-jobs.js` (신규) |

### 9.2 Dependency Rules

`imageJobs.ts`는 타입(`aiService`)과 `imageProvider.ts`의 순수 함수(`fullPrompt`, `BASE_NEGATIVE`)만 import한다. prisma·draftPipeline을 import하지 않는다(순환 방지).

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `isJob`, `sceneAt`, `jobItems`, `jobPrompt`, `applyUpload`, `detectImageType`, `MAX_UPLOAD_BYTES` | Domain | `services/imageJobs.ts` |
| `listImageJobs`, `attachImage`, `waitingForImagesWhere`, IMAGES 분기, regenerate 분기 | Application | `services/draftPipeline.ts` |
| `imageMode`, `storeImage`(내보내기), `fullPrompt`·`BASE_NEGATIVE`(내보내기) | Infrastructure | `services/imageProvider.ts` |
| 라우트 2개 + 대시보드 필드 | Routes | `index.ts` |

---

## 10. Coding Convention Reference

### 10.4 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| 상태값 | 문자열(`'jobs'`, `'render'`), enum 없음 |
| 오류 | 파이프라인은 `PipelineError(message, status)`, 라우트는 `{ error }` |
| 주석 | 한국어, 핵심 결정에 `// Design Ref: image-jobs §N — …` |
| 스크립트 | CommonJS(`require`), 외부 의존성 없음, 비밀값 셸 환경변수(relink와 같음) |
| 환경변수 | 서버 `IMAGE_PROVIDER=jobs`. PC `IMAGE_JOBS_URL`(기본 `https://19auto-blog.vercel.app`), `IMAGE_JOBS_MAX`(기본 6), `IMAGE_JOBS_TIMEOUT_SEC`(기본 180), `APP_PASSWORD` |

---

## 11. Implementation Guide

### 11.1 File Structure

```
backend/src/services/
├── imageJobs.ts            (신규) 순수 로직
├── imageJobs.test.ts       (신규)
├── imageProvider.ts        ideogram·speed 삭제, imageMode·storeImage·fullPrompt·BASE_NEGATIVE 내보내기
├── imageQuality.ts         retrySpeed 삭제, 비용 주석 정리
├── draftPipeline.ts        IMAGES·advancePost·regenerate·rebuild 분기, listImageJobs·attachImage·waitingForImagesWhere
├── draftPipeline.test.ts   speed 단언 삭제, jobs 시나리오 추가
├── aiService.ts            ImageScene.pending·source
└── automationService.ts    이어하기 목록에 waitingForImagesWhere
backend/src/index.ts        GET/POST /api/image-jobs, /api/dashboard imageJobs, /api/images 주석
frontend/src/pages/DashboardPage.tsx
frontend/src/components/PipelinePanel.tsx
scripts/image-jobs.js       (신규) pull | push | generate | run
scripts/check-ideogram.js   (삭제)
package.json                "image-jobs": "node scripts/image-jobs.js"
.gitignore                  image-jobs/
backend/.env.example, README.md, CLAUDE.md, .claude/skills/autoblog-ai-pipeline/SKILL.md, docs/bkit-next-prompts.md
frontend/public/privacy.html, terms.html   Ideogram → Google Gemini(운영자가 PC에서 생성) 문구
```

### 11.2 Implementation Order

1. [ ] `imageProvider.ts`: ideogram 삭제, `imageMode()`, `storeImage`·`fullPrompt`·`BASE_NEGATIVE` 내보내기, `ImageRequest.speed` 삭제. `storeImage`의 Vercel 오류 문구를 "이미지 저장에는 BLOB_READ_WRITE_TOKEN이 필요합니다"로
2. [ ] `imageQuality.ts`: `retrySpeed` 삭제, 비용 주석을 공급자 중립으로
3. [ ] `aiService.ts`: `ImageScene.pending`·`source`
4. [ ] `imageJobs.ts` + `imageJobs.test.ts` (시나리오 1~4)
5. [ ] `draftPipeline.ts`:
   - IMAGES: 계획 저장 뒤 `imageMode() === 'jobs'`면 — url은 있고 checked 아닌 장면만 채점(이어하기 호환), 작업이 남으면 `return post`, 없으면 insertImages + READY
   - `advancePost`: `runStage` 뒤 `post.stage === current.stage && post.imagePlan === current.imagePlan`이면 반복 종료 (`// Plan FR-02`)
   - `regenerateImage`: jobs면 잠금 안에서 `scene.pending = true` 저장 후 반환(렌더 없음)
   - `rebuildImageSet`: 동작 그대로(advancePost가 새 계획을 만들고 대기). 비용 주석 정리
   - `retryScene`/`renderScene`: `speed` 제거. jobs 모드에서는 호출되지 않음
   - `listImageJobs()`, `attachImage(postId, index, { data, mediaType, source })`, `waitingForImagesWhere()`
6. [ ] `draftPipeline.test.ts`: 시나리오 5~11
7. [ ] `automationService.ts`: 이어하기 `where`에 `...waitingForImagesWhere()`
8. [ ] `index.ts`: 라우트 2개(+413 JSON 처리), `/api/dashboard`에 `imageJobs`
9. [ ] 프론트: Dashboard Notice, PipelinePanel 배지·주석
10. [ ] `scripts/image-jobs.js` pull/push, `package.json` 스크립트, `.gitignore`
11. [ ] Ideogram 문서·설정 정리, `check-ideogram.js` 삭제, privacy·terms 문구
12. [ ] 검증 1~4(+모바일 점검) → SC-2 로컬
13. [ ] `generate`/`run` (`agy`) → SC-3 로컬

### 11.2.1 `scripts/image-jobs.js` 세부

```
node scripts/image-jobs.js pull | push | generate | run
  IMAGE_JOBS_URL (기본 운영), IMAGE_JOBS_MAX (6), IMAGE_JOBS_TIMEOUT_SEC (180), APP_PASSWORD (push)
```

- **pull**: `GET /api/image-jobs` → `pending/<postId>-<index>.json`·`.txt` 쓰기. 목록에 없는 pending 파일은 지움. "작업 N장(글 M개), 새로 받음 K" 출력
- **push**: `done/`에서 `^(\d+)-(\d+)\.(png|jpe?g|webp)$`만. 4MB 초과는 건너뜀(이유 출력). `APP_PASSWORD`가 있으면 `/api/auth/login`으로 쿠키(relink의 `loginCookie`와 같은 방식), 없으면 쿠키 없이(로컬 서버에 비밀번호가 없을 때). 200 → `uploaded/`로 옮기고 pending 파일 삭제, 남은 장수 출력
- **generate** (2단계): pending 중 `done/`에 없는 것, 앞에서부터 최대 `IMAGE_JOBS_MAX`개를 하나씩:
  1. `start = Date.now()`
  2. `spawn('agy', ['-p', instruction, '--output-format', 'json', '--print-timeout', '120s', '--sandbox'], { cwd: image-jobs/.agy, shell: false })`
     - instruction: "Generate exactly one image with your image generation tool. Do not run commands, edit files, or browse the web. Aspect ratio {aspect} landscape. Use this description as is: <<<{prompt}>>>"
  3. stdout 마지막 JSON 줄 → `conversation_id`, `status`
  4. 3초마다 `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`에서 `Final image path: (.+?\.(png|jpe?g|webp))` 찾기. 없으면 `brain/<id>/`에 `mtime ≥ start`인 그림 파일(대체 방법)
  5. 찾으면 `done/<postId>-<index>.<ext>`로 **복사**(원본은 agy 폴더에 둔다). 장면당 걸린 초 출력
  6. 실패 규칙은 §6.3
- **run**: pull → generate → push. 끝에 "남은 작업 N장" 출력

> Do 확인 항목: ① `--mode` 없이(기본 headless) 그림 하위 에이전트가 권한 거부 없이 도는지. 막히면 `--mode accept-edits`(작업 폴더 `.agy/` 안 편집만 허용)로 바꾼다 ② `--sandbox`가 그림 도구를 막지 않는지 ③ `--print-timeout 120s`에서 응답이 그림보다 먼저 끝나도 그림 하위 에이전트가 계속 도는지(10/26 실험에서는 계속 돌았다)
>
> **Do 결과(10/29, agy 1.4.8, 로컬 #99 6장)**: ①②③ 모두 그대로 동작 — `--mode` 없이·`--sandbox`로 그림 도구가 돌고, 응답이 먼저 끝나도 그림이 생겼다. 장면당 55~60초(대화 기록의 "Final image path"로 찾음), 1376×768 JPEG 약 0.8MB, 그림 안 글자 0/6, 관련성 5·5·4·4·4·4. 화면(노트북·태블릿)은 흐리게 그려졌다

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 서버 jobs 모드 | `module-1` | 구현 순서 1~7 (공급자·순수 로직·파이프라인·크론 + 테스트) | 15-20 |
| API·화면 | `module-2` | 구현 순서 8~9 (라우트·대시보드·PipelinePanel) | 8-10 |
| 폴더 스크립트·정리 | `module-3` | 구현 순서 10~12 (pull/push·Ideogram 삭제·SC-2) | 10-12 |
| `agy` 작업자 | `module-4` | 구현 순서 13 (generate/run·SC-3, 구독 사용량 약 6~7장) | 8-10 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| 이번 세션 | Do | `module-1`, `module-2`, `module-3` | 35-40 |
| 다음(같은 세션 가능) | Do | `module-4` | 8-10 |
| 이후 | Check + Report + PR | 전체 | 15-20 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-28 | 첫 초안 — 설계안 C 선택. 10/28 확인: `agy --output-format json`의 `conversation_id` + transcript "Final image path"로 결과 파일 특정, headless 권한 자동 거부. 크론 batchSize를 대기 글이 차지하는 문제(FR-02 보강), privacy·terms의 Ideogram 문구 추가, 크기 위반은 413 | jeh-lab + Claude |
| 0.2 | 2026-10-29 | Do 결과 기록(§11.2.1). 업로드 응답에 `completed`(이번 업로드로 READY) 추가, 활동 기록 `IMAGE_UPLOAD` 라벨 "그림 올림" | jeh-lab + Claude |
| 0.3 | 2026-10-30 | Check 반영: 업로드 검사 순서를 구현대로(세션 먼저), `GET /api/image-jobs`는 jobs 모드가 아니면 빈 목록 | jeh-lab + Claude |
