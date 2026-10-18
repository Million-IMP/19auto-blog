# image-relevance Planning Document

> **Summary**: 블로그 이미지를 '상징 물건'이 아니라 글 속 실제 대상이 보이는 장면으로 바꾸고, 만든 뒤 관련성을 채점해 낮으면 다시 만든다.
>
> **Project**: 19auto-blog
> **Version**: 1.0.0
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-17
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 이미지 계획 규칙이 "중심 물건 1개·사람 금지·도표 금지"를 강제해 열쇠·돋보기·저울 같은 은유만 나오고, 글 속 실제 대상(Home Assistant, Flipflop 앱, 기기)이 보이지 않는다. 예시 문장 색이 결과에 섞이고, 만든 뒤 내용과 맞는지 검사하지 않는다. |
| **Solution** | 장면마다 '글 속 고유 대상(anchor)'을 먼저 뽑고 그것이 화면에 보이게 계획한다. 화풍은 글 종류에 맞춰 고르고 예시 누수를 없앤다. 생성 후 Claude가 이미지를 보고 1~5점 채점, 3점 미만은 1번 다시 만든다. |
| **Function/UX Effect** | 독자가 소제목을 읽고 떠올리는 대상(제품·화면·장소·행동)이 이미지에 나온다. 이미지 아래에 점수가 기록되어 낮은 장면을 바로 찾을 수 있다. |
| **Core Value** | 이미지가 글의 신뢰도를 깎지 않고 내용 이해를 돕는다. 글 1편당 추가 비용 $0.15 이하. |

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

### 1.1 Purpose

IMAGES 단계가 만드는 표지 1장 + 소제목당 1장이 그 글·그 소제목의 실제 내용을 보여주게 한다.

### 1.2 Background

2026-10-17 운영 글 #42~#44의 `imagePlan`을 조사한 결과 (`docs/image-relevance-prompts.md`):

1. **상징물 강제** — `aiService.ts` SCENE_RULES: 중심 피사체 1개, 손·얼굴·군중 금지, 글자·로고·도표 금지. 예: #43 "관리자는 어떻게 설명했나" → 유리판 더미.
2. **실제 대상 지시 없음** — Home Assistant 글에 스마트홈 화면 없음, Flipflop 글에 휴대폰·노트북 없음.
3. **예시 누수** — #44 정해진 색은 indigo·amber인데 장면 prompt에 예시의 "muted teal and warm orange". 3편 중 2편이 예시와 같은 점토 3D.
4. **생성 후 검사 없음** — `draftPipeline.ts` similarity는 장면끼리 영어 단어 겹침만 본다. 글이 달라도 돋보기가 반복.
5. **Ideogram 속도 위주** — `magic_prompt` off, `rendering_speed` turbo.

### 1.3 Related Documents

- 진단·프롬프트: `docs/image-relevance-prompts.md`
- 이전 결정: gbrain `projects/19auto-blog/gpters-24-lecture-applied` (이미지 세트: 스타일 1개, 표지+H2당 1장)

---

## 2. Scope

### 2.1 In Scope

- [ ] **S1 계획 프롬프트 개편** — 장면마다 `anchor`(글 속 고유 대상: 제품명·기기·화면·장소·행동) 추출 후 그것이 보이게 장면 작성. 은유는 anchor가 정말 추상일 때만.
- [ ] **S2 그림 규칙 완화** — 사람 허용(뒷모습·옆모습·기기를 다루는 손, 얼굴 클로즈업·군중은 계속 피함). 화면·UI는 "읽히지 않는 흐린 UI"로 허용. 글자·로고·실제 인물·상표는 계속 금지.
- [ ] **S3 화풍 자동 선택 + 예시 누수 제거** — 글 종류(기술 뉴스·제품 소개 / 개념 해설 / 방법 안내)에 맞춰 화풍 선택. 블로그 프로필 `imageStyle`이 있으면 그것 우선. 예시 문장에서 구체 색·재질 제거.
- [ ] **S4 생성 후 관련성 채점·재생성** — 이미지 생성 직후 Claude(이미지 입력)가 소제목·anchor 기준 1~5점 채점, 이유 1줄 기록. 3점 미만이면 채점 이유를 반영해 그 장면만 1번 다시 생성. 글당 재생성 최대 2장.
- [ ] **S5 Ideogram 설정** — 품질 우선 기본값 검토(`rendering_speed`), 환경변수로 계속 조정 가능.
- [ ] **S6 기존 글 이미지 세트 재생성** — 본문의 기존 AI 이미지 줄을 지우고 새 계획으로 다시 만드는 기능. #42~#44에 적용.

### 2.2 Out of Scope

- 원문 기사 이미지(og:image) 가져오기 — 저작권 문제
- 이미지 공급자 추가·교체(Ideogram 유지, pollinations는 그대로)
- 네이버 발행 연동, 프론트 화면 개편(점수 표시는 기존 PipelinePanel에 최소 추가만 검토)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `planImages`가 장면마다 `anchor`(한국어 원문 표현 + 영어)를 출력하고, `must`에 anchor가 들어간다 | High | Done |
| FR-02 | SCENE_RULES에서 "중심 피사체 1개"를 "anchor 중심"으로 바꾸고, 사람(뒷모습·옆모습·손)과 흐린 UI 화면을 허용 | High | Done |
| FR-03 | 예시 문장에 구체 색·재질이 없고, 장면 prompt에 화풍·색을 다시 쓰지 않는다 (style과 prompt 분리 유지) | High | Done |
| FR-04 | 글 종류별 화풍 선택. 프로필 `imageStyle`이 있으면 그대로 사용 | Medium | Done |
| FR-05 | 생성 직후 이미지 채점(1~5, 이유)을 `ImageScene`에 저장(`score`, `scoreReason`) | High | Done |
| FR-06 | 점수 < 3이면 대상(anchor 영어 묘사)을 못박은 prompt로 1회 재생성, 글당 최대 2회. 재생성 후 점수도 저장. (채점 이유는 한국어라 prompt에 넣지 않음 — Check에서 변경) | High | Done |
| FR-07 | 채점 실패(API 오류·이미지 접근 실패)는 이미지 생성을 막지 않는다(점수 없음으로 기록) | High | Done |
| FR-08 | 기존 글 이미지 세트 재생성 API: 본문에서 기존 AI 이미지 2줄(이미지+캡션)을 제거 → 새 계획 → IMAGES 단계 재실행 | High | Done |
| FR-09 | 이어하기: 장면마다 url·점수 저장, 시간 부족 시 다음 실행이 남은 장면부터 이어간다 | High | Done |
| FR-10 | AI 모델 ID 하드코딩 금지(`ANTHROPIC_MODEL` 사용). 채점 모델을 따로 둘 경우에도 환경변수 + 기본값 | High | Done |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 비용 | 글 1편당 **추가** 비용 ≤ **$0.15** (채점 7회 ≤ $0.03 + 재생성 최대 2장 ≤ $0.12) | 실행 로그의 채점·재생성 횟수 × 단가 |
| 시간 | IMAGES 단계 1회 실행이 Vercel 마감 **280초** 안에서 멈추거나 끝난다. 7장 기준 예상 ≈ 계획 30초 + 장면 7 × (생성 15초 + 채점 4초) + 재생성 2 × 19초 ≈ **200초** | 로컬 실행 시간 측정, 운영 활동 기록 |
| 신뢰성 | 채점 실패·재생성 실패가 있어도 글은 READY까지 간다 | 단위 테스트(mock) |
| 호환성 | 기존 `imagePlan`(anchor·score 없음)도 그대로 읽고 다시 생성할 수 있다 | 단위 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] SC-1: 운영 글 #42~#44를 새 방식으로 다시 계획했을 때 **모든 장면의 `must`·`prompt`에 글 속 고유 대상(anchor)**이 들어간다 (3편, 약 20장면 전수 확인)
- [ ] SC-2: #42~#44 재생성 이미지의 **관련성 점수 평균 ≥ 4.0** (채점 결과 표로 기록)
- [ ] SC-3: 장면 prompt에 정해진 style과 다른 색·재질 문구가 없다 (예시 누수 0건)
- [ ] SC-4: 글 1편당 추가 비용 ≤ $0.15, IMAGES 단계가 280초 마감 안에서 멈추거나 완료
- [ ] SC-5: 검증 4단계 통과(백엔드 타입체크, 프론트 린트 경고 증가 없음, 프론트 빌드, 백엔드 테스트 + 새 테스트)

### 4.2 Quality Criteria

- [ ] 새 로직(채점·재생성·본문 이미지 교체) 단위 테스트 추가
- [ ] 린트 오류 0, 경고 수 증가 없음
- [ ] bkit gap-detector 일치율 ≥ 90%, code-analyzer 지적 중 Critical 0

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 채점·재생성으로 비용 증가 | Medium | High | 재생성 글당 최대 2장, 채점은 작은 이미지 1장 입력 |
| IMAGES 단계 시간 초과 | High | Medium | 장면마다 저장 후 이어하기(기존 구조), 재생성 전에도 남은 시간 확인 |
| 사람·UI 허용으로 왜곡(손가락·가짜 글자) 증가 | Medium | Medium | 얼굴 클로즈업·군중 금지 유지, UI는 "흐린·읽히지 않는" 지시 + negative에 text 유지, 채점에서 왜곡도 감점 |
| 채점 모델이 너그럽게 채점 | Medium | Medium | 채점 기준을 구체화(anchor가 보이는가 / 소제목 뜻과 맞는가 / 왜곡·글자 있는가), #42~#44 결과를 직접 눈으로 대조 |
| 기존 글 재생성 시 본문 손상 | High | Low | AI 이미지 줄(`![...](url)` + `*▲ ... (AI 생성 이미지)*`)만 정확히 제거, 테스트로 확인, 재생성 전 본문 백업 필드 또는 활동 기록 |
| Ideogram 실제 단가가 예상과 다름 | Low | Medium | Ideogram 요금표 확인 후 설계서에 확정 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `aiService.planImages` / `replanScene` / `SCENE_RULES` | Service | anchor 필드, 규칙 완화, 화풍 선택, 예시 수정 |
| `aiService` 새 함수 (이미지 채점) | Service | 이미지 URL + 소제목 + anchor → 점수·이유 |
| `ImageScene` 타입 | Type (JSON in `Post.imagePlan`) | `anchor?`, `score?`, `scoreReason?`, `retried?` 추가 (선택 필드, 스키마 변경 없음) |
| `draftPipeline` IMAGES 단계 | Service | 생성 후 채점·재생성 |
| `draftPipeline` 새 함수 (이미지 세트 재생성) + 라우트 | Service / API | 기존 이미지 제거 후 재실행 |
| `imageProvider` Ideogram 기본값 | Config | rendering_speed 기본값 검토 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `Post.imagePlan` | READ | `draftPipeline.regenerateImage` (장면 1개 재생성) | Needs verification — 새 필드 유지 |
| `Post.imagePlan` | READ | `frontend/src/components/PipelinePanel.tsx` (장면 목록·다시 생성 버튼) | Needs verification — 새 필드 무시해도 동작 |
| `Post.imagePlan` | WRITE | `draftPipeline` IMAGES 단계 | 변경 대상 |
| `Post.content` | UPDATE | `insertImages` | 재생성 시 기존 이미지 제거 후 다시 삽입 |
| `planImages` | CALL | `draftPipeline.planImageSet` | 변경 대상 |
| `POST /api/posts/:id/images/:index/regenerate` | API | `index.ts:592` | 유지 (채점 포함 여부는 설계에서 결정) |
| `draftPipeline.test.ts` | TEST | imagePlan mock | 갱신 필요 |

### 6.3 Verification

- [ ] 기존 imagePlan(새 필드 없음) 글의 단일 장면 재생성이 계속 동작
- [ ] PipelinePanel이 새 필드가 있어도 깨지지 않음
- [ ] DB 스키마 변경 없음 (`imagePlan`은 JSON 문자열)

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, backend | Web apps with backend | ☑ |
| **Enterprise** | Strict layer separation | High-traffic systems | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 관련성 검사 | 이미지 채점+재생성 / 계획만 채점 / 기록만 | 이미지 채점+재생성 | 사용자 선택 (2026-10-17). 실제 그림이 어긋나는 것을 잡는 유일한 방법 |
| 화풍 | 주제별 자동 / 고정 | 주제별 자동 (프로필 우선) | 사용자 선택 |
| 기존 글 | 새 글만 / #42~#44 재생성 | #42~#44 재생성 | 사용자 선택 → S6 추가 |
| 사람 등장 | 금지 유지 / 허용 | 허용(뒷모습·옆모습·손) | 요구사항 확인에서 확정 |
| 채점 모델 | 같은 `ANTHROPIC_MODEL` / 별도 env | 설계에서 결정 | 하드코딩 금지 규칙 |
| Backend | 기존 Express + Prisma | 유지 | 스키마 변경 없음 |

### 7.3 Folder Structure

기존 구조 유지: `backend/src/services/{aiService,draftPipeline,imageProvider}.ts`, `backend/src/index.ts` 라우트 1개 추가, 테스트는 `backend/src/services/*.test.ts`.

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` 규칙 (npm, 한국어 UI·커밋, 모델 ID 환경변수, enum 대신 문자열 유니온)
- [x] TypeScript 설정, ESLint(frontend)
- [x] vitest (backend, DB·AI mock)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| AI 프롬프트 출력 | `<plan>`/`<scene>` JSON 태그 | 채점 출력 `<score>` 태그 | High |
| 오류 처리 | 단계별 오류 → POST_STAGE_ERROR 기록 | 채점 실패는 오류로 올리지 않음 | High |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `IMAGE_SCORE_MIN` (선택) | 재생성 기준 점수, 기본 3 | Server | ☐ |
| `IMAGE_MAX_RETRIES` (선택) | 글당 재생성 상한, 기본 2 | Server | ☐ |
| `IDEOGRAM_RENDERING_SPEED` | 기존. 기본값만 검토 | Server | — |

---

## 9. Next Steps

1. [ ] 설계서 작성 `/bkit:pdca design image-relevance` (설계안 3개 비교: 비용·시간·확인 방법)
2. [ ] 구현 + #44 전후 비교, Ideogram 실제 생성
3. [ ] 검수(gap-detector + code-analyzer) → 보고서 → PR

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-17 | Initial draft (요구사항 확인 4문항 반영) | jeh-lab + Claude |
