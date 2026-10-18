# image-relevance Design Document

> **Summary**: 장면마다 글 속 실제 대상(anchor)을 그리게 계획하고, 생성 직후 Claude가 이미지를 보고 채점해 낮으면 품질을 올려 1번 다시 만든다. 기존 글은 이미지 세트를 통째로 다시 만든다.
>
> **Project**: 19auto-blog
> **Version**: 1.0.0
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-18
> **Status**: Draft
> **Planning Doc**: [image-relevance.plan.md](../../01-plan/features/image-relevance.plan.md)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 | Schema Definition | N/A (DB 스키마 변경 없음, `Post.imagePlan` JSON만 확장) |
| Phase 2 | Coding Conventions | N/A (`CLAUDE.md` 규칙 사용) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 이미지가 은유 물건뿐이라 글 내용과 어긋나 보인다 (운영 글 #42~#44에서 확인) |
| **WHO** | 블로그 운영자(초안 검토), 블로그 독자, 스터디원(자동 작성 사용) |
| **RISK** | 채점·재생성으로 비용·시간 증가 → 재생성 상한 2장/글, 장면 단위 저장으로 이어하기 |
| **SUCCESS** | #42~#44 재계획 시 모든 장면에 글 속 고유 대상 포함, 관련성 점수 평균 ≥ 4.0 |
| **SCOPE** | ① 계획 프롬프트 개편 ② 화풍 선택 ③ 생성 후 채점·재생성 ④ Ideogram 설정 ⑤ 기존 글 이미지 세트 재생성 |

---

## 1. Overview

### 1.1 Design Goals

1. 장면 계획의 출발점을 '은유'에서 '글 속 고유 대상(anchor)'으로 바꾼다.
2. 생성된 이미지를 실제로 보고 채점해, 어긋난 장면만 비용 상한 안에서 다시 만든다.
3. 채점이 실패해도 파이프라인은 멈추지 않는다 (채점은 품질 보조 장치).
4. 이미 READY인 글도 버튼 하나로 새 방식 이미지 세트로 바꿀 수 있다.

### 1.2 Design Principles

- **프롬프트는 한곳에**: 모든 AI 프롬프트는 기존처럼 `aiService.ts`에 둔다.
- **판단은 순수 함수로**: 재생성 여부·재생성 prompt·본문 이미지 제거는 새 파일 `imageQuality.ts`의 순수 함수로 두고 단위 테스트한다.
- **하위 호환**: 새 필드는 모두 선택(optional). 예전 `imagePlan`도 그대로 읽힌다.
- **모델 ID 하드코딩 금지**: 채점도 `ANTHROPIC_MODEL`(+기본값) 사용.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 기존 파일 안에 모두 추가 | `imageSet/` 폴더 5개 파일로 분리·이동 | 프롬프트는 aiService, 판단 로직만 새 파일 |
| **New Files** | 0 | 6 | 2 (`imageQuality.ts`, `.test.ts`) |
| **Modified Files** | 5 | 5 | 6 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium | High | High |
| **Effort** | ~1h | ~3h | ~1.5–2h |
| **Risk** | 테스트 어려움 | 기존 동작 깨짐 | Low |
| **화면** | 없음 | 점수 + 세트 재생성 버튼 | 점수 + 세트 재생성 버튼 |

**Selected**: **Option C — Pragmatic** — **Rationale**: 사용자 선택(2026-10-18). 테스트 가능한 경계(순수 함수)를 만들면서 기존 파이프라인 구조(장면 단위 저장·이어하기)는 그대로 둔다.

### 2.1 Component Diagram

```
PipelinePanel (점수 배지, 세트 다시 만들기)
        │ POST /api/posts/:id/images/rebuild
        ▼
index.ts route ──▶ draftPipeline.rebuildImageSet ─┐
                                                   ▼
                     draftPipeline IMAGES 단계 (advancePost)
                       │ planImageSet ──▶ aiService.planImages (anchor·kind·style)
                       │ imageProvider.render ──▶ Ideogram (turbo / 재생성은 default)
                       │ imageQuality.scoreScene ──▶ aiService.scoreImage (vision)
                       │ imageQuality.needsRetry / retryPrompt
                       ▼
                    Post.imagePlan (JSON) · Post.content
```

### 2.2 Data Flow (IMAGES 단계, 장면 하나)

```
render(turbo) → 저장(url) → 채점(score, reason, checked=true) → 저장
   └─ needsRetry? ─ yes → 남은 시간 ≥ 20초? → render(default, retryPrompt) → 재채점 → retried=true, plan.retries++ → 저장
                  └ no → 다음 장면
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `imageQuality.ts` | `aiService.scoreImage`, 타입 `ImageScene`/`ImagePlan` | 채점 호출·판단 |
| `draftPipeline` IMAGES | `imageQuality`, `imageProvider`, `aiService` | 생성·채점·재생성 조율 |
| `aiService.scoreImage` | Anthropic Messages API (image block) | 이미지 관련성 채점 |

---

## 3. Data Model

### 3.1 Entity Definition (`Post.imagePlan` JSON, 스키마 변경 없음)

```typescript
export type ImageScene = {
  h2?: string;
  anchor?: string;       // NEW 글 속 고유 대상. "한국어 원문 표현 / English visual description"
  point: string;
  scene: string;
  must: string;          // anchor의 영어 묘사를 반드시 포함
  avoid: string;
  prompt: string;
  caption?: string;
  url?: string;
  seed?: number;
  score?: number;        // NEW 1~5. 채점 실패면 없음
  scoreReason?: string;  // NEW 한국어 1문장
  checked?: boolean;     // NEW 채점을 시도했는지 (이어하기에서 다시 채점하지 않기 위함)
  retried?: boolean;     // NEW 이 장면을 재생성했는지
};

export type ImagePlan = {
  style: string;
  kind?: 'news' | 'concept' | 'howto';  // NEW 글 종류 (화풍 선택 근거)
  provider?: string;
  retries?: number;                     // NEW 이 글에서 재생성한 장수
  cover: ImageScene;
  sections: ImageScene[];
};
```

### 3.2 RenderRequest / RenderedImage 확장 (`imageProvider.ts`)

```typescript
export type ImageRequest = { ...기존, speed?: 'turbo' | 'default' };  // 없으면 IDEOGRAM_RENDERING_SPEED || turbo
export type RenderedImage = { url: string; provider: string; data?: Buffer; mediaType?: string };
// Ideogram은 이미 내려받은 bytes를 data로 돌려준다 → 채점이 URL을 다시 받지 않는다.
// pollinations는 data 없음 → 채점은 url로 시도, 실패하면 점수 없음.
```

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/posts/:id/images/rebuild` | **NEW** 이미지 세트 다시 만들기 | 없음 (사이트 공개 운영 결정에 따름) |
| POST | `/api/posts/:id/images/:index/regenerate` | 기존. 장면 1개 재생성 + **채점 추가** | 없음 |

### 4.2 `POST /api/posts/:id/images/rebuild`

동작:
1. 글 조회. 없으면 404.
2. `status === 'PUBLISHED'`면 409 (`이미 발행한 글은 이미지 세트를 다시 만들 수 없습니다.`).
3. `content = stripAiImages(content)`, `imagePlan = null`, `stage = 'IMAGES'`로 저장.
4. 기존 단계 실행 함수(`advancePost`/`resumePost`, 잠금 포함)로 IMAGES 단계 실행. 마감까지 못 끝나면 IMAGES로 남고 이어하기·크론이 이어간다.

**Response (200)**: 갱신된 Post (기존 regenerate와 같은 형태)

**Errors**: 400 잘못된 글 번호 · 404 글 없음 · 409 발행된 글 / 다른 실행이 잠금 중 · 429 24시간에 `IMAGE_MAX_REBUILDS`(기본 3)번 초과 · 500 예상하지 못한 오류. 단계 실행 중 실패는 기존 이어하기와 같이 200 + `stageError`로 돌려준다(Check에서 확정).

**Check 반영 (2026-10-18)**: 초기화와 잠금을 한 `updateMany`로 잡고 `advancePost(..., { claimed: true })`로 넘긴다. 다시 만들 때마다 활동 기록 `IMAGE_REBUILD`(이전 관련성 평균 포함)를 남기고 이 기록으로 횟수를 센다. 장면별 재생성(`regenerateImage`)도 같은 잠금을 잡고 409를 돌려준다.

---

## 5. Prompt Design (aiService.ts)

### 5.1 SCENE_RULES (교체)

- prompt는 영어 한 단락, 순서: **anchor(글 속 실제 대상)와 그 행동/상태 → 장소·맥락 → shot type·angle·lens → 조명 → 분위기**. 스타일·색·재질은 쓰지 않는다(style에서 정함).
- 예시(색·재질 없음): `"a person seen from behind adjusting settings on a laptop at a home desk, the screen showing a blurred unreadable dashboard, a small smart home hub on the shelf beside it, medium shot, eye level, 35mm lens, soft window light from the left, calm focused mood, negative space on the right"`
- **사람 허용**: 뒷모습·옆모습·기기를 다루는 손. 얼굴 클로즈업·군중은 피한다.
- **화면 허용**: 화면·앱은 "blurred, unreadable interface"로. 글자·숫자·로고·실제 상표·실제 인물은 그리지 않는다. 제품은 상표 대신 생김새로 묘사.
- **은유는 마지막 수단**: anchor가 순수 개념(예: 신호 대 간섭 비율)일 때만. 그때도 글에 나오는 구체 사물·상황을 함께 둔다.
- must에는 anchor의 영어 묘사를 반드시 넣는다. avoid는 영어 쉼표 목록.
- 같은 글 안에서 같은 소재(돋보기·열쇠·저울 등) 반복 금지.
- caption 규칙은 기존 유지.

### 5.2 planImages 변경

- 출력에 `kind`(news/concept/howto)와 장면별 `anchor` 추가.
- 화풍 지침(정해진 스타일 없을 때):
  - news(제품·서비스·사건) → 사실적인 에디토리얼 사진풍 (realistic editorial photography, natural light)
  - howto(설치·설정·방법) → 실제 작업 환경 사진풍 (hands-on setup, realistic)
  - concept(개념 해설) → 깔끔한 에디토리얼 일러스트
  - 색·재질은 글의 톤에 맞게 새로 고르되, **고정 예시 문장(clay, teal/orange) 제거**.
- 프로필 `imageStyle`이 있으면 그대로 사용(기존 유지).
- replanScene도 같은 SCENE_RULES + anchor 출력.

### 5.3 scoreImage (NEW)

```typescript
async scoreImage(input: { image: { data: string; mediaType: string } | { url: string }; h2: string; point: string; anchor: string })
  : Promise<{ score: number; reason: string }>
```
- 메시지: image block(base64 또는 url) + 텍스트. 모델 `AI_MODEL`, max_tokens 1024(실측: 300은 한국어 이유가 잘려 JSON이 깨짐), 마감 시간 확인은 askText와 같은 방식.
- 채점 기준(프롬프트에 명시):
  - 5: anchor가 분명히 보이고 소제목 뜻과 맞음
  - 4: anchor가 보이고 뜻이 대체로 맞음
  - 3: 주제는 관련 있으나 anchor가 흐림
  - 2: 일반적인 그림·은유뿐, anchor 없음
  - 1: 무관하거나 왜곡(손·얼굴)·글자가 크게 보임
- 출력 `<score>{"score": n, "reason": "한국어 1문장"}</score>`. 1~5 정수가 아니면 오류.

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| 채점 API 오류·시간 부족·형식 오류 | `checked = true`, score 없음. 파이프라인 계속 (FR-07) |
| 재생성 render 실패 | 기존 이미지 유지, 재시도 횟수는 쓰지 않음(실패한 요청은 비용 없음), 단계 실패로 올리지 않음 |
| 남은 시간 < 20초 | 재생성하지 않고 다음 실행으로 넘김 (장면은 checked 상태로 저장되어 재생성 기회 없음 → 단순성을 위해 허용) |
| rebuild: 발행된 글 | 409 |
| rebuild: 잠금 중 | 기존 잠금 오류와 동일하게 409 |

---

## 7. Security Considerations

- [x] 새 API는 기존 regenerate와 같은 공개 수준 (2026-10-16 공개 운영 결정). 비용 남용 위험 → 발행 글 차단 + 프론트 2단계 확인 버튼.
- [x] 채점에 보내는 것은 생성 이미지와 소제목 텍스트뿐 (개인정보 없음).
- [x] API 키는 기존 환경변수만 사용, 출력·로그 금지.

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| Unit | `imageQuality` 순수 함수 | vitest | Do |
| Unit | IMAGES 단계 채점·재생성·실패 흐름 (AI·Ideogram mock) | vitest (`draftPipeline.test.ts`) | Do |
| L1 API | `/images/rebuild` 404·409·200 | curl (로컬) | Do/Check |
| Runtime | 운영 글 #44 본문으로 새 계획 → anchor 전수 확인, 실제 Ideogram 1편 생성·채점 | 로컬 스크립트 | Do |
| L2 UI | PipelinePanel 점수 배지·세트 다시 만들기 버튼 | Chrome | Check |

### 8.2 Unit 시나리오

| # | 대상 | 기대 |
|---|------|------|
| 1 | `needsRetry` | score 2 & retried 없음 & retries 0 → true |
| 2 | `needsRetry` | score 없음(채점 실패) → false |
| 3 | `needsRetry` | plan.retries 2 → false (상한) |
| 4 | `retryPrompt` | 원래 prompt + anchor + reason 포함 |
| 5 | `stripAiImages` | 표지·소제목 AI 이미지와 `*▲ … (AI 생성 이미지)*` 줄 제거, 사용자가 넣은 일반 이미지·본문은 그대로 |
| 6 | IMAGES 단계 | 점수 2인 장면 → render 2회, 두 번째 speed `default` |
| 7 | IMAGES 단계 | scoreImage throw → READY 도달, score 없음 |
| 8 | IMAGES 단계 | 저점수 장면 3개 → 재생성 2개만 |

### 8.3 L1 API

| # | Endpoint | Test | Expected |
|---|----------|------|:--------:|
| 1 | POST `/api/posts/999999/images/rebuild` | 없는 글 | 404 |
| 2 | POST `/api/posts/{PUBLISHED}/images/rebuild` | 발행 글 | 409 |
| 3 | POST `/api/posts/{READY}/images/rebuild` | 정상 | 200, `imagePlan.sections[*].anchor` 존재 |

### 8.4 Runtime 검증 (Plan SC 대응)

| SC | 방법 |
|----|------|
| SC-1 | 운영 #42~#44 본문으로 `planImages` 실행 → 장면별 anchor가 must·prompt에 있는지 표 |
| SC-2 | 머지·배포 후 운영 #42~#44 `rebuild` → 장면별 점수 표, 평균 ≥ 4.0 |
| SC-3 | 새 계획의 모든 prompt에 style 외 색·재질 단어(teal, orange, clay 등) 0건 |
| SC-4 | 실행 로그로 채점 횟수·재생성 장수 → 비용 계산, IMAGES 1회 실행 시간 |

### 8.5 Seed Data

| Entity | Minimum | Key Fields |
|--------|:------:|-----------|
| Post (로컬) | 1 | READY, content에 H2 3개 이상 — 운영 #44 본문 복사 사용 |

---

## 9. Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| PipelinePanel 점수·버튼 | Presentation | `frontend/src/components/PipelinePanel.tsx` |
| rebuild 라우트 | API | `backend/src/index.ts` |
| IMAGES 단계·rebuildImageSet | Application | `backend/src/services/draftPipeline.ts` |
| needsRetry·retryPrompt·stripAiImages·scoreScene | Application (순수) | `backend/src/services/imageQuality.ts` |
| planImages·scoreImage·SCENE_RULES | Infrastructure (AI) | `backend/src/services/aiService.ts` |
| Ideogram speed·bytes 반환 | Infrastructure | `backend/src/services/imageProvider.ts` |

---

## 10. Coding Convention Reference

| Item | Convention Applied |
|------|-------------------|
| 상태값 | 문자열 리터럴 유니온 (`'news' \| 'concept' \| 'howto'`), enum 금지 |
| 환경변수 | `IMAGE_SCORE_MIN`(기본 3), `IMAGE_MAX_RETRIES`(기본 2), `IDEOGRAM_RETRY_SPEED`(기본 default), `IMAGE_MAX_REBUILDS`(기본 3) — 모두 선택 |
| 재시도 시간 조건 | 남은 시간 60초 이상일 때만(렌더 40초 + 채점 30초 상한). 다운로드·Blob 저장도 남은 시간 안으로 제한 |
| 재생성 prompt | 채점 이유(한국어)는 넣지 않고 anchor 영어 묘사로 대상을 못박는다 — 한국어가 이미지 모델에 들어가지 않게 하기 위함(Check에서 확정) |
| 색·재질 단어 | 계획 후 `stripStyleWords`로 장면 prompt에서 지운다(AI 지시만으로는 3/19건 혼입) |
| AI 출력 | `<score>` JSON 태그 + `parseJsonTag` 재사용 |
| 주석 | `// Design Ref: §N — …`, `// Plan SC: …` |
| UI 텍스트 | 한국어 |

---

## 11. Implementation Guide

### 11.1 File Structure

```
backend/src/services/
├── aiService.ts          (수정) SCENE_RULES, planImages, replanScene, scoreImage, 타입
├── imageProvider.ts      (수정) speed, data 반환
├── imageQuality.ts       (NEW)  needsRetry, retryPrompt, stripAiImages, scoreScene
├── imageQuality.test.ts  (NEW)
├── draftPipeline.ts      (수정) IMAGES 채점·재생성, regenerateImage 채점, rebuildImageSet
└── draftPipeline.test.ts (수정)
backend/src/index.ts      (수정) POST /api/posts/:id/images/rebuild
frontend/src/components/PipelinePanel.tsx (수정) 점수 배지, 세트 다시 만들기(2단계 확인)
```

### 11.2 Implementation Order

1. [ ] 타입 확장 + SCENE_RULES·planImages·replanScene 프롬프트 (aiService)
2. [ ] scoreImage (aiService) + imageProvider speed/data
3. [ ] imageQuality.ts + 테스트
4. [ ] draftPipeline IMAGES 채점·재생성 + regenerateImage 채점 + rebuildImageSet + 테스트
5. [ ] index.ts 라우트
6. [ ] PipelinePanel 점수 배지·세트 다시 만들기
7. [ ] 검증 4단계 → 운영 #44 본문으로 계획 비교 + 실제 Ideogram 1편 (로컬)

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 프롬프트·채점 | `module-1` | 구현 순서 1~2 (aiService, imageProvider) | 10–15 |
| 파이프라인·API | `module-2` | 구현 순서 3~5 (imageQuality, draftPipeline, index.ts, 테스트) | 15–20 |
| 화면·실측 | `module-3` | 구현 순서 6~7 (PipelinePanel, #44 비교, Ideogram 1편) | 10–15 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| Session 1 | Plan + Design | 전체 | 완료 |
| Session 2 | Do | `module-1,module-2,module-3` (한 번에 가능한 크기) | 35–50 |
| Session 3 | Check + Report | 전체 + 배포 후 #42~#44 rebuild | 20–30 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-18 | Initial draft — Option C 선택, Ideogram 단가 반영(turbo $0.03 / default $0.06) | jeh-lab + Claude |
