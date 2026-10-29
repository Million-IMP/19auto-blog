# image-jobs Planning Document

> **Summary**: Ideogram 연결을 없애고, 별도 API 없이 지금 쓰는 월 구독의 이미지 모델로 그림을 만든다. 운영 서버는 이미지를 직접 만들지 않고 "이미지 작업"(장면 프롬프트)만 남긴다. PC 작업 폴더(`image-jobs/`)로 내려받아, 사람이 Gemini 앱에서 만들어 넣거나(1단계) 구독 로그인된 Antigravity CLI(`agy`)가 Nano Banana로 채운 뒤(2단계) 올린다
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-26
> **Status**: Draft (v0.2 — 구독 CLI 방식으로 다시 설정)
> **Base**: `master` 6cfa55c (PR #34까지) — 브랜치 `feat/image-jobs`

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 10/24 16:33 UTC부터 Ideogram이 401(키 거부)을 돌려줘 운영 이미지 생성이 멈췄다. #97~#108 12개 글이 IMAGES 단계에서 멈췄다. 이미지 공급자가 서버 안에 묶여 있어 키 하나가 죽으면 파이프라인 전체가 멈추고, 대시보드에는 글마다 작은 "실패" 배지만 보여 이틀 동안 아무도 몰랐다. 사용자는 Ideogram API를 취소하고, 별도 API 없이 월 구독의 이미지 모델을 쓰기로 했다. |
| **Solution** | ① 새 공급자 `IMAGE_PROVIDER=jobs`: IMAGES 단계는 장면 계획만 저장하고 오류 없이 "이미지 대기"로 둔다(본문 단계는 계속 진행). ② 작업 목록 API + 운영자 전용 업로드 API. ③ PC 스크립트 `scripts/image-jobs.js`가 `pull`(작업 → `image-jobs/pending/`) · `push`(`image-jobs/done/`의 그림 → 업로드) · `generate`(2단계: 구독 로그인된 `agy`를 장면마다 실행해 `done/`을 채움)를 한다. ④ Ideogram 코드·스크립트·문서·환경변수를 지운다. |
| **Function/UX Effect** | 이미지 공급자가 죽어도 본문은 계속 완성되고, 대시보드에 "이미지 대기 N장"이 보인다. 그림은 손으로 만들어도, `agy`로 자동으로 만들어도 같은 폴더 구조로 들어가며 API 요금은 0이다(구독 사용량만 쓴다). 업로드된 그림은 지금처럼 채점되고 본문에 들어간다. |
| **Core Value** | 이미지 생성을 서버에서 떼어 내 공급자 고장이 글 작성을 막지 않는다. 추가 요금 없이 이미 내는 구독을 쓴다. 토큰을 빼내 다른 프로그램에 넣는 비공식 경로는 쓰지 않고, 공식 CLI를 그대로 실행한다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Ideogram 키 401로 10/24부터 이미지 중단, 12개 글 멈춤. 서버 안 공급자 하나가 죽으면 전체가 멈추고 아무도 모른다. 사용자: Ideogram 취소, 별도 API 없이 월 구독 이미지 모델 사용 |
| **WHO** | 운영자(사용자) — PC에서 작업 폴더를 채운다. 블로그 독자는 같은 형태의 이미지를 본다 |
| **RISK** | 구독 이미지 한도가 공개돼 있지 않다. `agy`가 그림을 작업 폴더가 아닌 자기 데이터 폴더에 저장하고 응답이 먼저 끝난다(10/26 실험). `agy` 안의 그림 도구가 프롬프트를 바꿔 쓸 수 있다. 업로드 API가 운영 글을 바꾸므로 운영자 세션 필수. 대기 글이 `advancePost` 반복문을 헛돌 수 있다 |
| **SUCCESS** | jobs 공급자에서 렌더 호출 0·stageError 0으로 대기 / 수동 그림으로 한 글 READY / `agy` 작업자로 한 글 자동 READY(API 요금 0) / Ideogram 참조 0 / 테스트·타입체크·린트·빌드 통과 |
| **SCOPE** | 1단계: jobs 공급자 + 작업 API + pull/push + 대시보드 대기 표시 + Ideogram 삭제. 2단계: generate(`agy` 작업자). 멈춘 12개 글 일괄 이어하기는 제외 |

---

## 1. Overview

### 1.1 Purpose

이미지를 만드는 일을 운영 서버(Vercel)에서 떼어 낸다. 서버는 "어떤 그림이 필요한지"(장면 프롬프트·크기)만 내놓고, 그림은 PC에서 채워 올린다. 채우는 방법은 두 가지이고 폴더 구조는 같다. 둘 다 별도 API를 쓰지 않는다.

- **수동**: `image-jobs/pending/<글>-<장면>.txt`의 프롬프트로 Gemini 앱에서 만들고, `image-jobs/done/<글>-<장면>.png`로 저장 → `push`
- **자동(2단계)**: `generate`가 장면마다 구독 로그인된 Antigravity CLI(`agy -p`)를 실행해 Nano Banana로 그림을 만들고 `done/`에 모음 → `push`

### 1.2 Background

- 10/24 16:33 UTC부터 Ideogram 401. 운영·로컬 키 모두 거부, Vercel 환경변수는 11일 전 그대로 → Ideogram 쪽에서 키가 무효화됐다. 사용자 판단: API를 다 써서 그런 것 같고, Ideogram 방식은 취소한다(10/26).
- 사용자 지시(10/26):
  1. "gemini oauth를 활용할거야, 특정 폴더나 구조처럼 내용을 저장하면 추후 oauth에서 돌면서 해당 이미지 생성하는 방식으로. 안되면 특정구간 폴더 등에 저장해놓고 이미지 생성 방식 사용 예정" → 선택: "둘 다, 폴더 구조 공통"
  2. "현재 월사용 요금제의 이미지 생성모델을 적용하고자 한다. 별도 api를 사용하지 않는게 목표다" → v0.1의 Vertex AI(장당 과금) 작업자를 구독 CLI 작업자로 바꿨다
- 이 PC 상태(10/26 확인): `agy` 1.4.2 (Google 계정 로그인, `agy models` 정상), `codex-cli` 0.150.1 (ChatGPT 로그인), `gemini` 0.58.0.
- 실험(10/26, 구독 사용량 1장): `agy -p "...cover-test.png로 저장..." --mode accept-edits` → "image generation task has been started" 출력 후 바로 종료. 약 1분 뒤 `~/.gemini/antigravity-cli/brain/<대화 id>/cover_test_<시각>.jpg`에 1376×768 JPEG(550KB, 16:9) 생성. 요청한 작업 폴더에는 저장되지 않았다. 글자·로고 없음, 화분 장면 정확.
- 확인한 사실:
  - Antigravity CLI는 `-p`(print) 헤드리스 실행을 공식 지원하고, 내장 그림 도구는 Nano Banana 2다. `--model`은 그림 모델을 고르지 않는다 ([asset-pipeline #21](https://github.com/prentice7725/asset-pipeline/issues/21)). 2026-10-03 변경 기록에 그림 하위 에이전트가 한 번에 최대 3번 시도할 수 있다는 내용이 있다(같은 출처, 비공식).
  - Gemini CLI·Antigravity 로그인 토큰을 빼내 다른 프로그램(OpenClaw 등)에서 쓰면 2026년 2~3월부터 계정 정지 사례가 있다. 이 계획은 토큰을 건드리지 않고 공식 `agy` 실행 파일만 부른다.
  - ChatGPT 구독도 Codex CLI의 `$imagegen`으로 API 키 없이 그림을 만들 수 있다고 알려져 있다(비공식 글). 예비 경로로만 적어 둔다.
- 운영 서버는 Vercel이라 파일을 남길 수 없다. 작업 목록은 이미 있는 글별 `imagePlan`(장면에 `url`이 없으면 미완성)에서 만들고, 폴더는 PC에만 둔다.

### 1.3 Related Documents

- 직전 기능: `docs/archive/2026-10/image-scene-followup/` (장면 규칙·채점), `docs/archive/2026-10/prod-ui-check/` (운영자 전용 relink, APP_PASSWORD 로그인 쿠키 패턴)
- 코드: `backend/src/services/imageProvider.ts`, `draftPipeline.ts`(IMAGES 단계·`renderScene`·`regenerateImage`·`rebuildImageSet`), `imageQuality.ts`(`scoreScene`·`retrySpeed`), `scripts/relink-local-images.js`(운영자 로그인 예시)
- 결정 기록: gbrain `decisions/19auto-blog-image-jobs`

---

## 2. Scope

### 2.1 In Scope

**1단계 (폴더 구조 + 수동)**
- [ ] `IMAGE_PROVIDER=jobs` 공급자: IMAGES 단계가 렌더를 부르지 않고 대기한다. 장면 계획 저장, stageError 없음
- [ ] 대기 글이 `advancePost` 반복문을 헛돌지 않게 진행이 없으면 멈춤
- [ ] 작업 목록 API: 미완성 장면(글 id, 장면 번호, 소제목, 전체 프롬프트, 크기·비율)
- [ ] 업로드 API(운영자 세션 필수): 그림 바이트 → Blob 저장 → 장면 `url` → 채점 → 모든 장면이 차면 본문에 넣고 READY
- [ ] `scripts/image-jobs.js pull | push`: `image-jobs/pending/`(`.json`+프롬프트 `.txt`), `done/`, `uploaded/`. `image-jobs/`는 gitignore
- [ ] "장면 다시 만들기"·"세트 다시 만들기"는 jobs 공급자에서 해당 장면을 다시 작업 대기로 돌린다
- [ ] 대시보드에 "이미지 대기 N장(글 M개)" 표시
- [ ] Ideogram 삭제: 공급자 코드, `retrySpeed`/`speed`, `scripts/check-ideogram.js`, README·CLAUDE.md·`.claude/skills/autoblog-ai-pipeline` 문서. Vercel `IDEOGRAM_*` 환경변수 삭제와 `IMAGE_PROVIDER=jobs` 변경(배포 때, 사용자 확인 후)

**2단계 (구독 CLI 자동 작업자)**
- [ ] `scripts/image-jobs.js generate`: `pending/` 작업마다 `agy -p`를 한 번 실행해 그림 1장을 만들고, `agy` 데이터 폴더에 새로 생긴 그림을 찾아 `done/<postId>-<index>.<확장자>`로 옮긴다. 실행당 최대 장수 제한, 장면당 시간 제한
- [ ] `run` = pull → generate → push

### 2.2 Out of Scope

- 별도 과금 API: Ideogram, Gemini API·Vertex AI(장당 과금), OpenAI 이미지 API. GCP 프로젝트·결제 연결도 필요 없다
- Vercel → Google 직접 호출(Vercel OIDC·Workload Identity). 서버가 그림을 만들지 않으므로 필요 없다
- 구독 로그인 토큰을 읽거나 다른 프로그램에 넣는 방식, Gemini 웹 브라우저 자동화 (계정 정지 위험)
- Codex CLI(ChatGPT 구독) 작업자 — `agy`가 막힐 때의 예비 경로로만 기록
- 멈춘 #97~#108 일괄 이어하기 (사용자: 넣지 않음. 글마다 기존 "이어하기"를 누르면 jobs 대기로 들어간다)
- 작업자를 상시 서버·크론으로 돌리기 (PC에서 실행할 때만 돈다)
- pollinations 삭제 (설정이 없을 때 쓰는 기본값으로 남긴다)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `IMAGE_PROVIDER=jobs`면 IMAGES 단계는 계획을 저장하고, 미완성 장면은 렌더하지 않고 대기한다. stageError를 쓰지 않는다 | High | Pending |
| FR-02 | 대기 중인 글은 `advancePost`가 같은 단계를 반복 실행하지 않는다(진행 없으면 반복 종료). 크론 이어하기 목록(`batchSize`개, 오래된 순)에서 이미지 대기 글을 빼서, 다른 글의 본문 단계를 계속 진행한다 | High | Pending |
| FR-03 | `GET /api/image-jobs`: 미완성 장면 목록. 항목마다 글 id·제목·장면 번호(0=표지)·소제목·전체 프롬프트(스타일·must·글자 금지 포함)·avoid·가로세로·비율 | High | Pending |
| FR-04 | `POST /api/image-jobs/:postId/:index`(운영자 세션 필수): PNG/JPEG/WebP, 4MB 이하만 받는다. Blob 저장 → 장면 `url`·`provider` 기록 → 채점 → 글의 모든 장면이 차면 본문에 넣고 READY. 다른 작업과 같은 잠금을 쓴다 | High | Pending |
| FR-05 | `scripts/image-jobs.js pull`: 작업을 `image-jobs/pending/<postId>-<index>.json`·`.txt`로 쓴다. 이미 끝난 작업 파일은 지운다 | High | Pending |
| FR-06 | `scripts/image-jobs.js push`: `image-jobs/done/<postId>-<index>.(png\|jpg\|jpeg\|webp)`을 올리고 성공하면 `uploaded/`로 옮긴다. 실패는 파일을 두고 이유를 출력한다. APP_PASSWORD는 셸 환경변수로만 받고 출력하지 않는다 | High | Pending |
| FR-07 | jobs 공급자에서 "장면 다시 만들기"는 그 장면을 작업 대기로, "세트 다시 만들기"는 새 계획 + 전체 대기로 돌린다. 새 그림이 올라오기 전까지 본문의 이전 그림은 그대로 둔다 | Medium | Pending |
| FR-08 | 대시보드에 이미지 대기 장수·글 수를 보인다(0이면 숨김) | Medium | Pending |
| FR-09 | Ideogram 코드·스크립트·문서 참조를 지운다(개인정보처리방침·이용약관의 외부 서비스 문구 포함). 이전 글의 `provider: 'ideogram'` 기록은 그대로 둔다 | High | Pending |
| FR-10 | (2단계) `generate`: 장면마다 `agy -p "<그림 1장 생성 지시 + 장면 프롬프트 + 비율 + 글자 금지>"`를 실행하고, 실행 시작 뒤 `agy` 데이터 폴더(`~/.gemini/antigravity-cli/brain/`)에 새로 생긴 그림을 기다렸다가(장면당 시간 제한) `done/`으로 옮긴다. 못 찾으면 그 장면은 `pending/`에 남기고 다음으로 넘어간다. 실행당 최대 장수(기본 6) 제한 | High | Pending |
| FR-11 | (2단계) `run`: pull → generate → push 한 번에 | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Security | 업로드 API는 운영자 세션 없으면 401. 이미지 형식·크기 검사. 비밀값(APP_PASSWORD)과 구독 로그인 파일을 읽거나 출력하지 않는다 | vitest(401·형식·크기), 스크립트 코드 확인 |
| Cost | API 요금 0. 서버는 그림을 만들지 않고, 작업자는 구독 사용량만 쓴다. 실행당 최대 장수 제한 | 코드에 과금 API 호출 0(grep) |
| Reliability | 공급자가 없거나 고장 나도 본문 단계는 진행. 대기 글 때문에 크론이 마감까지 헛돌지 않음. `agy`가 실패·시간 초과해도 작업 파일은 남음 | vitest(진행 없음 → 반복 종료), 로컬 크론 1회, generate 실패 시나리오 |
| Compatibility | Vercel 요청 4.5MB 제한 안(`agy` 결과 약 0.55MB). 기존 글의 이미지·채점 기록 유지 | 4MB 상한 검사, 기존 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] SC-1: jobs 공급자에서 IMAGES 단계가 렌더 호출 0·stageError 0으로 대기하고, 같은 실행에서 다른 글 진행이 막히지 않는다(vitest)
- [ ] SC-2: `npm run start:local`에서 `pull` → 손으로 만든 그림을 `done/`에 넣기 → `push`로 한 글이 READY, 본문에 이미지·설명글·채점 기록이 들어간다
- [ ] SC-3: (2단계) `run`으로 한 글(약 6장)이 자동 READY, API 요금 0. 장면당 걸린 시간과 엉터리 글자 장면 수를 눈 점검으로 기록
- [ ] SC-4: 저장소에 Ideogram 참조 0(보관 문서·이전 기록 제외), 과금 이미지 API 호출 0
- [ ] SC-5: 업로드 API 무인증 401, 형식 위반 400, 크기 위반 413 (형식 검사는 vitest, 라우트는 로컬 curl)

### 4.2 Quality Criteria

- [ ] 백엔드 테스트 전부 통과(현재 개수 유지 + 새 테스트)
- [ ] 백엔드 타입체크·프론트 린트·빌드 통과
- [ ] 대시보드를 바꾸므로 휴대폰 너비 점검(`scripts/check-mobile-overflow.js`) 넘침 0

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 구독 이미지 한도가 공개돼 있지 않아 하루 몇 장까지 되는지 모른다 | Medium | Medium | 실행당 최대 장수 제한. 한도에 걸리면 남은 작업은 `pending/`에 그대로 두고 다음 실행이 이어간다. 수동 경로가 항상 남아 있다 |
| `agy`가 지시한 폴더 대신 자기 데이터 폴더에 저장하고, 그림보다 응답이 먼저 끝난다(10/26 실험) | High | High(확인됨) | 실행 시작 시각 이후 `brain/` 아래 새 그림 파일을 기다려 옮긴다. 파일 이름이 아니라 시각으로 찾는다. Design에서 `--output-format json`으로 대화 id를 받아 그 폴더만 볼 수 있는지 확인 |
| `agy` 안의 그림 도구가 프롬프트를 바꿔 써 장면·스타일이 흔들린다. 한 번에 최대 3번 시도할 수 있다 | Medium | Medium | "그림 1장만, 이 프롬프트를 그대로"를 지시. 채점이 장면 일치를 잰다. SC-3 눈 점검 |
| Gemini 계열 모델이 글자를 잘 그려 엉터리 글자가 늘 수 있다(negative prompt 없음) | Medium | Medium | 글자 금지 문구를 프롬프트 본문에 넣는다. 10/26 시험 1장은 글자 0. 장면 규칙(5·6번)은 공급자와 무관해 그대로 쓴다 |
| `agy` 업데이트로 동작(출력·저장 위치)이 바뀐다 | Medium | Medium | 작업자는 실패해도 작업 파일을 지우지 않는다. 바뀌면 수동 경로로 계속 운영 |
| 업로드 API로 운영 글이 바뀐다 | High | Low | 운영자 세션(APP_PASSWORD 로그인 쿠키) 필수, 형식·크기 검사, 해당 장면이 미완성일 때만 받음 |
| 대기 글이 `advancePost` 반복문을 마감(280초)까지 헛돈다 | High | High(대책 없으면) | 단계 실행 뒤 단계·장면 수가 그대로면 반복 종료(FR-02) |
| PC가 꺼져 있으면 이미지가 늦어진다 | Medium | High | 의도된 동작. 대시보드 대기 표시(FR-08)로 바로 보인다 |
| 그림 비율이 계획(800×450, 표지 800×400)과 다르다(`agy`는 1376×768) | Low | High | 본문은 CSS로 맞춘다. 크기는 기록만, 거부하지 않는다 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `imageProvider()` / `ImageRequest.speed` | Service | ideogram 삭제, jobs 추가(렌더 대신 대기 신호). `speed` 삭제 |
| IMAGES 단계 (`runStage`) | Pipeline | jobs면 미완성 장면을 렌더하지 않음, 모두 차면 READY |
| `advancePost` 반복문 | Pipeline | 진행 없음 → 종료 |
| `regenerateImage`·`rebuildImageSet` | Pipeline | jobs면 대기로 되돌림 |
| `retrySpeed`·재시도 | imageQuality | `speed` 없애고, jobs면 자동 재시도 안 함(점수만 기록) |
| `/api/image-jobs` GET·POST | API (신규) | 작업 목록·업로드 |
| `/api/dashboard` 또는 `/api/stats` | API | 이미지 대기 수 추가 |
| `DashboardPage.tsx` | Frontend | 대기 표시 |
| `scripts/image-jobs.js` (신규), `scripts/check-ideogram.js` (삭제) | Script | |
| README·CLAUDE.md·`.claude/skills/autoblog-ai-pipeline/SKILL.md`·`.gitignore` | Docs/Config | Ideogram 설명 삭제, jobs·작업 폴더·`agy` 작업자 설명 |
| Vercel 환경변수 | Config | `IDEOGRAM_*` 삭제, `IMAGE_PROVIDER=jobs` (배포 때 사용자 확인) |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `imageProvider().render` | CALL | `draftPipeline.renderScene` ← IMAGES 단계·`retryScene`·`regenerateImage` | jobs 분기 필요 |
| `ImageRequest.speed` | READ | `renderScene(options.speed)` ← `retryScene(retrySpeed())` | 삭제와 함께 정리 |
| `RenderedImage.data` | READ | `scoreScene` (채점에 바이트 사용) | 업로드 바이트를 그대로 넘김 |
| `storeImage` | CALL | ideogram render 안 | 업로드 API에서 재사용(내보내기) |
| `post.imagePlan` | READ/WRITE | IMAGES 단계, regenerate, rebuild, relink, PostsPage 장면 표시 | 형식 그대로. `provider` 값만 새로 생김 |
| `stage: 'IMAGES'` 글 | READ | `automationService` 크론(stage≠READY, stageError 없음, 잠금 없음) | 대기 글이 매시간 잡히지만 FR-02로 즉시 끝남 |
| Ideogram 테스트 | TEST | `draftPipeline.test.ts` 등의 ideogram mock | 수정 필요 |

### 6.3 Verification

- [ ] 위 소비자 전부 Design에서 분기 위치 확정
- [ ] `draftPipeline.test.ts`의 ideogram 관련 테스트를 jobs 기준으로 바꾸고 전부 통과

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic (Express + Prisma + React, Vercel 배포). 기존 구조 유지.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 이미지 생성 위치 | 서버(Vercel) / PC 작업자 | PC 작업자 + 폴더 | 사용자 지시. 공급자 고장이 파이프라인을 막지 않음 |
| 작업 목록 저장 | 새 테이블 / 기존 `imagePlan` | 기존 `imagePlan` (Design에서 확정) | 장면에 `url`이 없으면 미완성이라 이미 큐 역할. 스키마 변경 없음 |
| 그림 모델 비용 | 과금 API(Vertex·Gemini API) / 월 구독 | 월 구독 | 사용자 목표: 별도 API 없이 |
| 자동 작업자 | `agy`(Google 구독) / Codex `$imagegen`(ChatGPT 구독) / 토큰 재사용·브라우저 자동화 | `agy` | 사용자가 처음부터 Gemini를 말함. 10/26 실험으로 동작 확인. 공식 CLI를 그대로 실행하므로 토큰 재사용 정지 사례와 다르다. Codex는 예비 |
| 서버 인증(Google) | Vercel OIDC / 서비스 계정 키 / 없음 | 없음 | 서버가 Google을 부르지 않는다 |
| 업로드 인증 | 새 토큰 / APP_PASSWORD 로그인 쿠키 | APP_PASSWORD 쿠키 | relink 스크립트와 같은 패턴, 새 비밀값 없음 |

### 7.3 Clean Architecture Approach

기존 층 그대로: `services/imageProvider.ts`(공급자), `services/draftPipeline.ts`(단계), `index.ts`(라우트), `scripts/`(PC 도구).

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` 규칙: 모델 ID 하드코딩 금지(환경변수+기본값), 상태값 문자열, UI·커밋 한국어, `index.ts`의 `export default app`
- [x] 운영자 전용 동작은 APP_PASSWORD 로그인 쿠키(`autoblog_session`)
- [x] 비밀값은 사용자가 별도 PowerShell 창에서 `Read-Host`로 넣는다

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 작업 파일 이름 | 없음 | `<postId>-<index>` (0=표지, 1~=소제목 순서) | High |
| 작업 폴더 | 없음 | `image-jobs/{pending,done,uploaded}` (gitignore) | High |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `IMAGE_PROVIDER` | `jobs`(신규) / 비움(pollinations) | Server | 값 변경 |
| `IDEOGRAM_API_KEY`·`IDEOGRAM_RENDERING_SPEED`·`IDEOGRAM_MAGIC_PROMPT` | 삭제 | Server | 삭제 |
| `APP_PASSWORD` | push 스크립트 로그인 (기존) | PC 셸 | - |
| `IMAGE_JOBS_URL` | 스크립트 대상(기본 운영 주소, 로컬 검증 시 `http://localhost:3001`) | PC 셸 | ☑ |
| `IMAGE_JOBS_MAX` | generate 한 번에 만들 최대 장수(기본 6) | PC 셸 | ☑ |

### 8.4 Pipeline Integration

해당 없음(9단계 파이프라인 미사용).

---

## 9. Next Steps

1. [ ] Design: 3가지 설계안 비교 → 선택 (`/bkit:pdca design image-jobs`). `agy` 출력(`--output-format json`)으로 결과 파일을 정확히 찾는 방법 확인
2. [ ] Do 1단계 → 로컬(`npm run start:local`) 수동 그림으로 SC-2 확인
3. [ ] Do 2단계 → 로컬에서 `run`으로 한 글 SC-3 (구독 사용량 약 6~7장, API 요금 0)
4. [ ] 사용자 몫: 없음(`agy`는 이미 로그인됨). 배포 때 Vercel 환경변수 변경만 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-26 | 첫 초안 (Ideogram 401 → 취소, 작업 폴더 + 공식 OAuth Vertex 작업자) | jeh-lab + Claude |
| 0.2 | 2026-10-26 | 사용자 "별도 api 없이 월 구독 이미지 모델" → 작업자를 구독 로그인된 `agy`(Nano Banana)로. GCP 프로젝트·결제·Vertex 제거. 10/26 `agy` 1장 실험 결과 반영 | jeh-lab + Claude |
| 0.3 | 2026-10-28 | Design 중 보강: FR-02에 크론 이어하기 목록 제외, FR-09에 privacy·terms 문구, SC-5 크기 위반 413. 기준 master 58f8040(PR #36) | jeh-lab + Claude |
