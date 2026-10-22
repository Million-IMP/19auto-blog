# image-scene-followup Design Document

> **Summary**: 장면 규칙 2줄 + 표지 원칙 1줄 + 감지 함수 2개(`paperWord`, `isActionHeading`) → 할 일 소제목의 종이 장면, 글의 두 번째 종이 장면만 한 번 다시 계획
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-22
> **Status**: Draft
> **Planning Doc**: [image-scene-followup.plan.md](./image-scene-followup.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 종이 장면이 소제목 장면의 32%, 눈 점검에서 16장 중 11장이 약함. 채점은 4.22라 숫자로는 안 잡힌다. PR #22(글자 금지) 이후 "빈 종이"가 안전한 기본값이 됐다 |
| **WHO** | 블로그 독자(스터디원)와 운영자 |
| **RISK** | 종이가 진짜 주제인 장면(규칙 문서·HOA 서류)까지 바꾼다. 할 일 소제목 감지가 한국어 표현에 따라 빠지거나 오탐한다. 효과가 눈 점검에만 보여 판정이 주관적이다 |
| **SUCCESS** | 계획만 실측(10개 글)에서 글당 종이 anchor 평균 ≤ 1, 할 일 소제목의 종이·키보드 anchor 0. 바뀐 장면만 다시 만든 이미지의 눈 점검에서 "분명" 비율이 기준선보다 높고 읽히는 글자 0 |
| **SCOPE** | ① 장면 규칙(할 일 소제목·종이 1장·표지) ② 감지 함수(종이 anchor·할 일 소제목) + 다시 계획 이유 ③ 테스트 ④ 기준선 → 계획만 → 바뀐 장면만 이미지 (예산 확인 후) |

---

## 1. Overview

### 1.1 Design Goals

- 할 일 소제목에 행동이 보이는 장면, 한 글 안에서 종이 장면 반복 없음
- 종이가 주제인 장면은 살린다
- 5번 감지(글자 사물·키보드)와 같은 흐름(감지 → 이유 → 한 번 다시 계획)

### 1.2 Design Principles

- 종이는 "금지"가 아니라 "글당 1장 + 할 일 소제목에는 안 씀"
- 한국어 anchor가 문서를 가리키면(문서·서류·계약·규칙·보고서·공지·편지) 종이로 세지 않는다
- 표지는 감지하지 않는다(5번과 같음). 표지 반복은 규칙만

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | A: Minimal | B: Clean | C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 규칙만 추가 | 장면 검사 모듈 `sceneIssues(scene, context)`로 겹침·나열·글자 사물·키보드·종이를 모아 이유 반환 | 규칙 + 감지 함수 2개 + `planImageSet`에서 종이 사용 여부 추적 |
| **Modified Files** | 1 | 3 (+테스트, 기존 감지 이동) | 3 (+테스트) |
| **Complexity** | Low | Medium | Low |
| **Risk** | 운영에서 PR #22 규칙이 이미 "빈 종이" 쪽으로 쏠림 → 규칙만으로는 약함 | 이동 범위가 큼 | Low |

**Selected**: **C — Pragmatic** (추천안). 감지가 6개(겹침·나열·글자 사물·키보드·할 일 종이·두 번째 종이)로 늘어 B가 가까워졌지만, "글 안에서 종이를 세는" 상태가 `planImageSet` 반복문에만 있어 모듈로 빼면 오히려 넘길 값이 늘어난다. 다음에 감지가 더 늘면 B로 옮긴다.

### 2.1 Data Flow

```
계획 → paperUsed = false
소제목 장면 i:
  (기존) 겹침 · 나열 · 글자 사물 · 키보드
  paper  = paperWord(장면)               // 문서 anchor면 null
  action = isActionHeading(h2)
  paper && action      → 이유: 할 일 소제목은 실제 대상에 하는 행동으로
  paper && paperUsed   → 이유: 이미 종이 장면이 있음
  이유가 있으면 replanScene 1번 → 결과 그대로
  최종 장면이 paperWord면 paperUsed = true
```

---

## 3. Data Model / 4. API

변경 없음.

---

## 5. 규칙·감지 설계

### 5.1 SCENE_RULES 추가 (2줄, 질문형 소제목 줄 다음)

```
- 할 일 소제목("지금 무엇을 하면 되나요", "무엇을 준비/확인해야 하나요", "어떻게 해야 하나요")은 첫 번째 할 일을 그 실제 대상에 하는 장면으로 그립니다. 예: "서버라면 무엇부터 점검하나요"의 답이 "PHP 버전을 올립니다"면 서버 랙 앞에서 케이블을 다시 꽂는 손입니다. 빈 노트·체크리스트·클립보드·폴더나 책상 위 소품(머그·휴대폰)만 있는 장면은 고르지 않습니다.
- 빈 종이류(노트·종이·체크리스트·폴더·카드·봉투)는 한 글에서 1장까지, 종이 자체가 주제(규칙 문서·계약 서류·보고서·공지·편지)일 때만 씁니다. 운영 글 장면의 3분의 1이 빈 종이여서 글마다 비슷해 보였습니다.
```

### 5.2 planImages 표지 원칙 (기존 표지 줄에 이어 씀)

```
표지는 이 글만의 대상(제품의 생김새·사건 장소·사람의 행동)을 고르고, 서버 랙·데이터센터 복도는 글이 서버 자체를 다룰 때만 씁니다.
```

### 5.3 감지 함수 (`imageQuality.ts`)

```ts
// 빈 종이류. web page는 화면이라 뺀다. 한국어 anchor가 문서를 가리키면 종이가 주제라 세지 않는다.
const PAPER = /\b(notebooks?|notepads?|sticky[- ]notes?|sticky-note pads?|papers?|sheets?|clipboards?|checklists?|folders?|binders?|documents?|(?<!web )pages?|envelopes?|ledgers?|reports?|scrolls?|index cards?|printouts?)\b/i;
const DOCUMENT = /문서|서류|계약|규칙|가이드라인|보고서|공지|편지|신청서|원문|약관|논문/;
export function paperWord(scene: ImageScene): string | null  // anchor 영어에서 처음 걸린 말

// 할 일 소제목: "~하면 되나요/해야 하나요/해 두면 좋을까요", "무엇부터", "어떻게 설치·적용·확인…"
const ACTION = /(하면|해야|해 두면|봐야)\s*(되나요|하나요|할까요|좋을까요|좋나요)|무엇부터|어떻게\s*(\S+\s+)?(설치|적용|대비|준비|대응|확인|점검)|준비해야|대비하/;
export function isActionHeading(h2: string): boolean
```

- `paperWord`는 anchor 영어만 본다(종이가 배경 소품인 장면은 문제없음).
- 운영 소제목 142개 기준(Do에서 실측): 할 일 소제목 23개 감지("어떻게 관리하면 되나요", "어디서 확인하면 되나요", "무엇을 봐야 하나요", "어떻게 확인하나요" 포함). 예/아니오 질문 2개("리뷰해야 하나요?", "직접 업데이트해야 하나요?")도 걸리지만 종이 anchor일 때만 영향이 있어 둔다. "어떻게 읽나요·쓰나요·동작하나요"(설명)와 "무엇이 확인됐나요"(사실)는 안 걸림.
- Do에서 추가: 옆에 둔 소품("… beside a closed notebook")은 대상이 아니라 `beside|next to|near|behind` 앞까지만 보고, page는 "blank page", "pages of"처럼 종이로 보이는 표현만 센다(화면 web page 오탐). 코드 기준 종이 anchor는 142개 중 35개(계획서의 46개는 넓은 정규식 집계).

### 5.4 다시 계획 이유

```
- 할 일 + 종이: `할 일 소제목은 "{word}" 같은 빈 종이 대신, 첫 번째 할 일을 그 실제 대상에 하는 장면을 anchor로 고르세요.`
- 두 번째 종이: `이 글에는 이미 종이 장면이 있습니다. 종이·노트·폴더가 아닌, 소제목 아래 첫 문단의 답이 가리키는 대상을 고르세요.`
```

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| 다시 계획 결과도 종이 | 그대로 쓰고 `paperUsed = true` |
| 다시 계획 실패·시간 부족 | 원래 장면 (기존과 같음) |
| 표지 | 감지 안 함, `paperUsed`에도 안 셈 |

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| 단위 | `paperWord`, `isActionHeading` (운영 실제 사례) | Vitest | Do |
| 통합 | planImageSet: 할 일 종이, 두 번째 종이, 문서 예외, 표지 제외 | Vitest | Do |
| 일괄 | 운영 장면 142개에 감지 → 걸린 목록 확인 (AI 없음) | scratchpad | Do |
| V0·V1 | 기준선 눈 점검·채점, 계획만 10개 글 | scratchpad | Do |
| V2 | 바뀐 장면만 Ideogram 렌더 → 2회 채점 + 눈 점검 | scratchpad (예산 확인 후) | Check |

### 8.2 단위: paperWord

| # | anchor | 기대 |
|---|--------|------|
| 1 | `준비 / an open notebook with blank ruled lines lying on a wooden desk` | `notebook` |
| 2 | `확인 목록 / a hand with a pen touching one of several empty square boxes on a blank sheet` | `sheet` |
| 3 | `서버 점검 / a hand holding a clipboard with blank lines beside a server rack` | `clipboard` |
| 4 | `규칙 문서 / a hand turning the pages of a printed rulebook` | `null` (문서 예외) |
| 5 | `HOA 서류 / a pair of hands turning the blank pages of a folder` | `null` (서류 예외) |
| 6 | `일반 사용자 / a hand holding a smartphone with a blurred, unreadable web page` | `null` (web page) |
| 7 | `서버 / a rack-mounted server in a data center aisle` | `null` |

### 8.3 단위: isActionHeading

| 소제목 | 기대 |
|---|---|
| 지금 무엇을 하면 되나요? · 개발자는 지금 무엇을 준비하면 되나요? · 배포 전에 무엇을 확인하면 되나요? · 지금 기업이나 개발자는 무엇을 확인해 두면 좋을까요? · DuckDB 2.0을 써보기 전에 무엇부터 확인하면 좋을까요? · 업무용 로그인 정보는 어떻게 관리하면 되나요? · 이미 공격을 당했는지는 어떻게 확인하나요? · 어떤 환경에서 영향을 받는지 확인하려면 무엇을 봐야 하나요? | true |
| 부분 파서는 어떻게 동작하나요? · 이번 사건에서 실제로 무엇이 확인됐나요? · 분석 기법의 신뢰도 점수는 어떻게 읽나요? · 1.5도를 넘으면 일상에서 무엇이 달라지나요? | false |

### 8.4 통합: planImageSet

| # | 상황 | 기대 |
|---|------|------|
| 1 | 할 일 소제목 anchor가 빈 노트 | replanScene 1번, reason에 "할 일 소제목" |
| 2 | 설명 소제목 2개가 모두 종이 | 첫째 그대로, 둘째만 replanScene, reason에 "이미 종이 장면" |
| 3 | 할 일 소제목 anchor가 "규칙 문서" | replanScene 0번 |
| 4 | 표지가 종이, 소제목 1개가 종이 | 소제목은 첫 종이라 replanScene 0번 |

### 8.5 실측 스크립트 (scratchpad)

- **V1**: 5번 `plan-only.mts`에 종이·할 일 감지를 더해 같은 순서로 계획만. 글당 종이 anchor 수, 할 일 소제목 anchor, 다시 계획 횟수 기록
- **V2**: V1에서 종이·할 일 때문에 바뀐 소제목 장면만 `imageProvider().render`(로컬 저장) → `scoreImage` 2회 → 눈 점검. 기준선은 같은 소제목의 운영 이미지
- 실행 전 `DATABASE_URL`을 로컬 SQLite로, `BLOB_READ_WRITE_TOKEN`이 없는지 확인

---

## 11. Implementation Guide

### 11.1 File Structure

```
backend/src/services/imageQuality.ts       (paperWord, isActionHeading)
backend/src/services/draftPipeline.ts      (planImageSet: paperUsed, 이유 2줄)
backend/src/services/aiService.ts          (SCENE_RULES 2줄, planImages 표지 원칙)
backend/src/services/imageQuality.test.ts
backend/src/services/draftPipeline.test.ts
```

### 11.2 Implementation Order

1. [ ] 감지 함수 2개 + 단위 테스트 → 운영 142개 일괄 확인
2. [ ] planImageSet + 통합 테스트
3. [ ] 규칙·표지 원칙
4. [ ] 검증 4단계
5. [ ] V0 → V1 → **예산 확인** → V2

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-22 | 초안, C안 | jeh-lab + Claude |
