# image-jobs Gap Analysis

> **Feature**: image-jobs
> **Date**: 2026-10-30
> **Plan**: [image-jobs.plan.md](./image-jobs.plan.md) (v0.3)
> **Design**: [image-jobs.design.md](./image-jobs.design.md) (v0.3, 설계안 C)
> **Match Rate**: 97% → **99%** (런타임 포함 공식, Act-1 뒤 — §8)
> **구현**: 브랜치 `feat/image-jobs` (기준 master 58f8040)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Ideogram 키 401로 10/24부터 이미지 중단, 12개 글 멈춤. 서버 안 공급자 하나가 죽으면 전체가 멈추고 아무도 모른다. 사용자: Ideogram 취소, 별도 API 없이 월 구독 이미지 모델 사용 |
| **WHO** | 운영자(사용자) — PC에서 작업 폴더를 채운다. 블로그 독자는 같은 형태의 이미지를 본다 |
| **RISK** | 구독 이미지 한도 비공개. `agy`가 그림을 자기 데이터 폴더에 저장하고 응답이 먼저 끝난다. 업로드 API가 운영 글을 바꾼다. 대기 글이 `advancePost`를 헛돌 수 있다 |
| **SUCCESS** | jobs 공급자에서 렌더 0·stageError 0으로 대기 / 수동 그림으로 한 글 READY / `agy`로 한 글 자동 READY(API 요금 0) / Ideogram 참조 0 / 테스트·타입체크·린트·빌드 통과 |
| **SCOPE** | 1단계: jobs 공급자 + 작업 API + pull/push + 대시보드 대기 표시 + Ideogram 삭제. 2단계: generate(`agy`). 멈춘 글 일괄 이어하기 제외 |

---

## Strategic Alignment Check

### PRD Alignment

PRD 없음. Plan의 WHY 두 가지를 모두 다룬다.
- 공급자 고장이 글 작성을 막음 → jobs 모드는 서버가 그림을 만들지 않아 본문 단계가 이미지와 무관하게 끝난다.
- 아무도 모름 → 대시보드 "이미지 대기 N장" 알림과 장면별 "작업 대기" 배지.

사용자 목표 "별도 API 없이 월 구독 이미지 모델" → 그림은 구독 로그인된 `agy`(Nano Banana)가 만든다. 서버·스크립트에 과금 이미지 API 호출 0(§3.3).

### Success Criteria Status

| SC | 기준 | 상태 | 근거 |
|---|---|:---:|---|
| SC-1 | jobs 공급자에서 IMAGES가 렌더 0·stageError 0으로 대기, 다른 글 진행 안 막힘 | ✅ | vitest "IMAGES 단계는 렌더 없이…advancePost가 끝난다"(`render` 0회, 두 번째 호출도 계획 1번), "크론 이어하기 조건…"(`waitingForImagesWhere`). 로컬 #98 이어하기 0.1초, 오류 0. SQLite에서 크론 조회: render 모드 [99] / jobs 모드 [] |
| SC-2 | `start:local`에서 pull → 손 그림 → push로 한 글 READY, 본문에 이미지·설명글·채점 | ✅ | #98: 시험 PNG 6장 push → READY, 본문 그림 6·설명글 6, 장면마다 score(단색이라 2점) |
| SC-3 | `run`으로 한 글 자동 READY, API 요금 0, 장면당 시간·엉터리 글자 기록 | ✅ | #99: `agy` 5장 + 표지 1장, 장면당 55~60초, 1376×768 JPEG 약 0.8MB, 그림 안 글자 0/6, 관련성 5·5·4·4·4·4. 구독 사용량 6장 |
| SC-4 | Ideogram 참조 0(보관·이전 기록 제외), 과금 이미지 API 호출 0 | ✅ | §3.3 grep 결과 |
| SC-5 | 무인증 401, 형식 위반 400, 크기 위반 413 | ✅ | 로컬 curl: 401 / text/plain 400 / 5MB 413 / PNG 서명+`image/jpeg` 400 / 빈 본문 400 / 잘못된 번호 400 / 없는 글 404. 형식 검사 vitest `detectImageType` |

**Success Rate**: 5/5

### Decision Record Verification

| 결정 | 내용 | 지킴 |
|---|---|:---:|
| Plan: 그림 위치 | 서버는 만들지 않고 PC 작업자 + 폴더 | ✅ jobs 모드 IMAGES는 `waitForImages`만, `renderScene` 호출 없음 |
| Plan: 큐 | 새 테이블 없이 `imagePlan` | ✅ 스키마 변경 0. `isJob = !url \|\| pending` |
| Plan: 작업자 | 공식 `agy` 실행만, 토큰 읽지 않음 | ✅ `spawn('agy', …, { shell: false })`, 읽는 곳은 `brain/<자기 대화 id>/`뿐 |
| Plan: 업로드 인증 | APP_PASSWORD 쿠키(새 비밀값 없음) | ✅ `requireAdmin` |
| Plan: 일괄 이어하기 | 넣지 않음 | ✅ 멈춘 글(stageError)은 작업 목록·크론에 나오지 않음 |
| Design: 설계안 C | 순수 로직 `imageJobs.ts`, 모드 판단은 `imageMode()` 한 곳 | ✅ `IMAGE_PROVIDER`를 읽는 곳은 `imageMode()`뿐 |
| Design: `--dangerously-skip-permissions` 금지 | 기본 headless + `--sandbox` | ✅ |

---

## 1. Analysis Overview

### 1.2 Analysis Scope

- 서버: `imageProvider.ts`, `imageQuality.ts`, `aiService.ts`(타입), `imageJobs.ts`(신규), `draftPipeline.ts`, `automationService.ts`, `index.ts`
- 화면: `DashboardPage.tsx`, `PipelinePanel.tsx`, `ActivityPage.tsx`
- PC 도구: `scripts/image-jobs.js`(신규), `scripts/check-ideogram.js`(삭제)
- 문서·설정: README, CLAUDE.md, `.env.example`, SKILL.md, privacy·terms, `.gitignore`, `package.json`

---

## 2. Gap Analysis (Design vs Implementation)

### 2.1 API (§4)

| Design | 구현 | 상태 | 비고 |
|---|---|:---:|---|
| `GET /api/image-jobs` (공개) | `index.ts` `app.get('/api/image-jobs')` → `listImageJobs()` | ✅ | Act-1: render 모드에서는 빈 목록(§8) |
| `POST /api/image-jobs/:postId/:index` (`requireAdmin`) | `requireAdmin` → `readImageBody` → 핸들러 | ✅ | 검사 순서 차이(아래) |
| `GET /api/dashboard` + `imageJobs{scenes,posts}` | `Promise.all`에 `listImageJobs()` | ✅ | |
| regenerate jobs 분기 | `regenerateImage`: `scene.pending = true` 저장 후 반환 | ✅ | |
| 응답 `{ id, index, url, score, remaining, stage, completed }` | `attachImage` 반환값 | ✅ | `completed`는 Design v0.2에서 추가 |
| 413 JSON | `readImageBody`가 `entity.too.large`를 413 JSON으로 | ✅ | |

**검사 순서 차이**: Design §4.2는 "번호 형식 → 운영자 세션 → …"이었으나 구현은 운영자 세션을 먼저 본다(`requireAdmin`이 라우트 첫 미들웨어). 로그인 없는 요청에는 번호가 맞든 틀리든 401만 돌려줘 더 보수적이다. Design v0.3에 구현 순서로 고쳐 적었다.

### 2.2 Data Model (§3)

| 항목 | Design | 구현 | 상태 |
|---|---|---|:---:|
| `ImageScene.pending?: boolean` | ✅ | `aiService.ts` | ✅ |
| `ImageScene.source?: string` | ✅ | `aiService.ts` | ✅ |
| `plan.provider = 'jobs'` (업로드 때) | ✅ | `applyUpload` | ✅ |
| 스키마 변경 없음 | ✅ | `schema.prisma` 변경 0 | ✅ |
| `ImageJob` (표지 800×400 2:1, 소제목 800×450 16:9, `replace`) | ✅ | `jobItems` | ✅ |

### 2.3 Component Structure (§11.1)

설계의 파일 20개(신규 3, 수정 16, 삭제 1)가 모두 있다. 설계에 없던 변경은 `ActivityPage.tsx`의 `IMAGE_UPLOAD` 라벨 1줄(Design v0.2에 반영)뿐이다.

### 2.4 Functional Depth (§11.2.1 스크립트, §6.3 실패 처리)

| 항목 | 구현 | 상태 |
|---|---|:---:|
| pull: `.json`·`.txt` 쓰기, 목록에 없는 pending 지움 | ✅ `.agy` 표시 파일은 같은 작업으로 보고 남김(Do 중 수정) | ✅ |
| push: 이름 규칙·4MB·서명 검사, 401 안내, 409 남김, 성공 시 `uploaded/` | ✅ | ✅ |
| generate: 최대 장수, `done/`에 있으면 건너뜀, 연속 2번 실패·한도·상태≠SUCCESS면 중단, 시간 초과 시 대화 id 출력 | ✅ | ✅ |
| `Final image path`를 대화 기록에서 찾고 `brain/<id>/` 안인지 확인 | ✅ `insideDir` | ✅ |
| 대체 방법: 실행 뒤 생긴 그림 파일 | ⚠️ 여러 장이면 `readdir` 첫 파일 → Act-1에서 가장 늦은 파일로 | ✅ |
| run: pull → generate → push → 남은 작업 | ✅ | ✅ |

### 2.5 Page UI Checklist (§5.4)

| 화면 | 항목 | 구현 | 비율 |
|---|:---:|:---:|:---:|
| 대시보드 | 2 (Notice tone `draft` + 명령, `imageJobs?` 선택 필드) | 2 | 100% |
| PipelinePanel | 4 (작업 대기 배지, 이전 썸네일 유지, 다시 생성 버튼 조건, 주석 "구독 사용량") | 4 | 100% |

### 2.6 API Contract (Design §4 ↔ 서버 ↔ 클라이언트)

| # | Endpoint | Design | 서버 | 클라이언트 | 일치 |
|---|---|:---:|:---:|:---:|:---:|
| 1 | `GET /api/image-jobs` | `{scenes, posts, jobs[]}` | 같음 | `pull()`이 `jobs`·`scenes`·`posts` 읽음 | ✅ |
| 2 | `POST /api/image-jobs/:postId/:index?source=` | 바이트 + Content-Type | 같음 | `push()`가 서명으로 Content-Type, `.agy` 있으면 `source=agy` | ✅ |
| 3 | 응답 `score`·`remaining`·`completed` | 같음 | 같음 | `push()` 출력에 사용 | ✅ |
| 4 | `GET /api/dashboard` `imageJobs` | 같음 | 같음 | `DashboardPage` `summary.imageJobs?.scenes ?? 0` | ✅ |
| 5 | `POST /api/auth/login` (쿠키) | relink와 같음 | 기존 | `loginCookie()` | ✅ |

### 2.7 Runtime Verification Results

| 층 | 항목 | 결과 |
|---|---|---|
| L1 vitest | §8.2 시나리오 1~11 + Act-1 목록 모드 1건 | ✅ 182/182 (기존 162 + 새 20) |
| L1 API curl (로컬) | §8.3 1~6 + 빈 본문·잘못된 번호·없는 글 | ✅ 9/9 |
| L3 E2E 1 (SC-2 수동) | #98 | ✅ |
| L3 E2E 2 (SC-3 `agy`) | #99 | ✅ |
| L3 E2E 3 (크론) | `POST /api/automation/run` 전체 실행 | ⚠️ 조회 조건만 확인 — 전체 실행은 운영 사본의 다른 글 본문 단계가 Claude API를 불러 비용이 든다. vitest와 SQLite 조회(render [99] / jobs [])로 대신 |
| 화면 | 휴대폰 너비 7페이지 × 390·430px (대기 알림 보이는 상태) | ✅ 넘침 0 |

### 2.8 Match Rate Summary

| 축 | Act-1 전 | Act-1 뒤 | 근거 |
|---|:---:|:---:|---|
| Structural (×0.15) | 100 | 100 | 파일 20개 모두 |
| Functional (×0.25) | 95 | 100 | render 모드 목록, 대체 그림 순서 |
| Contract (×0.25) | 97 | 100 | 검사 순서 차이를 Design에 반영 |
| Runtime (×0.35) | 97.5 | 97.5 | E2E 3 부분(0.5/1) |
| **Overall** | **97%** | **99%** | |

---

## 3. Code Quality Analysis

### 3.1 발견과 처리

| 등급 | 내용 | 처리 |
|---|---|---|
| Important | render 모드(지금 운영 `IMAGE_PROVIDER` 값이 `jobs`가 아닐 때)에서도 `GET /api/image-jobs`가 크론이 그리는 중인 IMAGES 글 장면을 내놓았다. PC에서 `run`을 돌리면 서버(pollinations)와 `agy`가 같은 장면을 둘 다 만들어 구독 사용량을 버리고, 대시보드는 "PC에서 실행하면 채워집니다"라고 잘못 안내한다 | Act-1: `listImageJobs`가 jobs 모드가 아니면 빈 목록. vitest 1건 추가 |
| Minor | `findImage` 대체 방법이 실행 뒤 생긴 그림이 여러 장일 때(그림 하위 에이전트가 최대 3번 시도) 디렉터리 순서의 첫 파일을 골랐다 | Act-1: 수정 시각이 가장 늦은 파일 |
| Minor | 업로드 검사 순서가 Design과 다름(세션 먼저) | 더 보수적이라 구현 유지, Design v0.3 수정 |

Critical 0.

### 3.2 Code Smells

없음. `image-jobs.js`의 `MAX_UPLOAD_BYTES`는 서버 상수와 같은 값을 따로 둔다(스크립트는 TypeScript를 import하지 않는 CommonJS). 주석으로 서버 위치를 적어 두었다.

### 3.3 Security · Cost

- 업로드: `requireAdmin` → 4MB → Content-Type 허용 목록 → 서명 일치 → 작업 대기 장면만. 저장 이름은 서버가 만든다
- `agy`: `shell: false`, 프롬프트는 인자 하나, `--sandbox`, 권한 자동 거부(기본 headless). 대화 id는 `^[\w-]+$`만, 그림 경로는 `brain/<id>/` 안만
- 비밀값: `APP_PASSWORD`는 셸 환경변수로만 읽고 출력·저장하지 않는다. `.env` 미열람
- 과금 이미지 API: `backend/src`·`scripts`·`api`·`frontend/src`에서 Ideogram·Gemini API·Vertex·OpenAI 이미지 주소 0건
- Ideogram 참조: 코드·설정·README·CLAUDE.md·SKILL.md·privacy·terms 0건. 남은 곳은 이전 기록뿐 — `docs/bkit-next-prompts.md`(진행 기록), `docs/gpters-post.md`·`docs/gpters-presentation/`(지난 발표 자료), `docs/image-relevance-prompts.md`(이전 진단), `docs/archive/`

---

## 4. Operational Notes (배포 전 확인)

Vercel 환경변수 이름 확인(10/30, 값은 보지 않음): Production에 `IMAGE_PROVIDER`·`IDEOGRAM_API_KEY`·`IDEOGRAM_RENDERING_SPEED`가 있고, `BLOB_READ_WRITE_TOKEN`은 Production·Preview·Development 모두 있다.

1. **머지 전에** `IMAGE_PROVIDER`를 `jobs`로 바꾼다. 머지하면 바로 운영 배포되는데, 값이 `jobs`가 아니면 render 모드(pollinations)가 되어 새 글 그림을 서버가 직접 만든다. 환경변수는 다음 배포부터 적용되므로 "값 변경 → 머지" 순서면 다시 배포할 필요가 없다
2. `IDEOGRAM_API_KEY`·`IDEOGRAM_RENDERING_SPEED` 삭제(코드가 더 이상 읽지 않는다)
3. 배포 뒤 운영에서 1장 올려 확인: `express.raw`가 Vercel 함수에서 바이트를 그대로 받는지는 로컬에서만 확인했다
4. 멈춘 글 #97~#125(29개, 10/29 운영 사본 기준)는 글마다 "이어하기"를 누르면 작업 대기로 들어간다(일괄 이어하기 제외 — 사용자 결정)

---

## 8. Act-1 (2026-10-30)

| 변경 | 파일 |
|---|---|
| `listImageJobs`: jobs 모드가 아니면 `{ scenes: 0, posts: 0, jobs: [] }` | `backend/src/services/draftPipeline.ts` |
| vitest "작업 목록은 jobs 모드에서만" + prisma 목에 `findMany` | `backend/src/services/draftPipeline.test.ts` |
| `findImage` 대체 방법: 수정 시각이 가장 늦은 그림 | `scripts/image-jobs.js` |
| Design v0.3: 검사 순서, render 모드 빈 목록 | `docs/archive/2026-10/image-jobs/image-jobs.design.md` |

재검증: 백엔드 테스트 182/182, 타입체크 exit 0, 스크립트 로드 정상. 화면 코드는 바뀌지 않아 린트·빌드·모바일 점검은 Do 결과(통과)를 그대로 쓴다.

---

## 9. 세션 중 발견 (기능 범위 밖)

- 개인정보처리방침: 처리 위탁·국외 이전 대상을 Ideogram → Google(Gemini, 운영자가 PC에서 생성)으로 바꿨다. 방침의 "변경은 시행 7일 전 고지" 조항에 맞춰 시행일(현재 10/26)을 새로 잡을지는 사용자 결정
- `docs/gpters-presentation/index.html` 18번 슬라이드는 "이미지는 Ideogram API"라고 적혀 있다. 지난 발표 자료라 이번 PR에서 고치지 않았다
