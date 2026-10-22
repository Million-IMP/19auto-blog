# image-abstract-scenes Design Document

> **Summary**: 장면 규칙 3가지 + 감지 함수 2개(글자 사물·키보드 anchor) → 그 장면만 한 번 다시 계획
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-22
> **Status**: Draft
> **Planning Doc**: [image-abstract-scenes.plan.md](./image-abstract-scenes.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 3점 17장 중 11장이 글자 사물 장면(숫자가 그려짐)과 키보드·타이핑 장면(뜻이 안 보임)에서 나왔다. 두 장면 모두 AI가 "숫자 없는 달력"처럼 규칙을 지키려 해도 이미지 모델이 지키지 못한다 |
| **WHO** | 블로그 독자(스터디원)와 운영자. 운영자는 이미지 다시 만들기를 덜 쓴다 |
| **RISK** | 감지 오탐(market counter 같은 일반 단어)으로 좋은 장면을 다시 계획한다. 다시 계획이 늘어 IMAGES 단계 시간이 늘어난다. 채점이 ±1 흔들려 판정이 어렵다 |
| **SUCCESS** | 로컬 3세트(#77·#80·#69, 19장)에서 이전 3점 소제목 5개 중 4개 이상이 2회 채점 모두 4점 이상이고, 눈 점검에서 읽히는 글자·숫자 0장. 9개 글 계획에서 감지 anchor가 19개에서 2개 이하로 준다 |
| **SCOPE** | ① 장면 규칙 3가지 ② 감지 함수 + 다시 계획 이유 ③ 테스트 ④ 로컬 검증(계획만 6개 글, 이미지 3세트) |

---

## 1. Overview

### 1.1 Design Goals

- 이미지 모델이 지키지 못하는 장면(원래 숫자가 있는 사물, "확인하는 행동")을 계획 단계에서 고른다
- AI 규칙에는 코드 확인을 함께 둔다(v2 교훈: 색 단어, 나열 대상)
- 채점·생성·재생성은 그대로 둬서, 장면 선택 효과만 잰다

### 1.2 Design Principles

- 감지 단어는 사물 이름(명사구)만. 동사·일반어("counter", "form", "sign")는 앞말과 묶어서만 본다
- 다시 계획은 장면당 1번. 결과가 또 걸려도 그대로 쓴다(v2와 같음)
- 표지는 감지하지 않는다. 표지는 글 전체 대상이고(키보드 글의 표지는 키보드), `replanScene`은 소제목 단위다

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | A: Minimal | B: Clean | C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | `SCENE_RULES`에 규칙 3가지만 | 장면 검사 모듈 `sceneIssues(scene, earlier)`로 겹침·나열·글자 사물·키보드를 모아 이유 목록 반환, `planImageSet`은 호출만 | 규칙 3가지 + 감지 함수 2개(`imageQuality.ts`) + `planImageSet` 이유 2줄 |
| **New Files** | 0 | 0~1 | 0 |
| **Modified Files** | 1 | 3 (+테스트 2, `similarity` 이동) | 3 (+테스트 2) |
| **Complexity** | Low | Medium | Low |
| **Maintainability** | Low | High | Medium |
| **Effort** | ~10분 | ~1시간 | ~30분 |
| **Risk** | 운영에서 "숫자 없는 달력"이 이미 규칙을 어김 → 다시 샐 가능성 높음 | 겹침 감지 이동으로 기존 테스트 손봄 | Low |

**Selected**: **C — Pragmatic** (추천안, 사용자 지시 10/21 "특이사항 없으면 추천 방향"). FR-01~05를 모두 채우고 v2 나열 감지와 같은 모양이다. 감지가 4개로 늘었지만 각각 한 줄이라 모듈로 묶기는 이르다. 다음에 감지가 더 늘면 B로 옮긴다.

### 2.1 Component Diagram

```
runStage(IMAGES) / rebuildImageSet
 └─ planImageSet(post)
     ├─ aiService.planImages            ← SCENE_RULES (규칙 3가지 추가)
     ├─ [소제목 장면마다, 최대 1번]
     │    reasons = 겹침(기존) + 나열(v2)
     │            + textObjectWord(장면)  ← 신규: anchor 영어·prompt
     │            + hasTypingAnchor(장면) ← 신규: anchor 영어
     │    └─ aiService.replanScene({..., reason})   ← SCENE_RULES 공유
     └─ stripStyleWords (v1)
 └─ 렌더 → scoreScene (그대로)
```

### 2.2 Data Flow

```
계획 → 소제목 장면 i:
  similar = 앞 장면과 단어 겹침 > 0.6
  listed  = hasListedAnchor
  text    = textObjectWord   → "wall calendar" 같은 걸린 말
  typing  = hasTypingAnchor
  하나라도 있으면 replanScene 1번 (이유를 모두 전달) → 결과를 그대로 씀
→ 색·재질 단어 제거 → 저장 → 렌더 → 채점
```

### 2.3 Dependencies

변경 없음.

---

## 3. Data Model

`ImagePlan`·`ImageScene` 필드 변경 없음. 이전 계획 이어하기 그대로.

---

## 4. API Specification

변경 없음. 검증은 로컬 `POST /api/posts/:id/images/rebuild`.

---

## 5. 규칙·감지 설계

### 5.1 SCENE_RULES 추가 (3줄)

화면 속 내용 규칙(두 번째 줄) 다음에 넣는다.

```
- 질문형·추상 소제목(확인 방법·영향·위험·정도·차이·아직 모르는 것)은 소제목 단어가 아니라 그 소제목 아래 첫 문단의 답이 가리키는 구체 대상이나 결과로 anchor를 고릅니다. 예: "버전이 영향을 받나요?"의 답이 "공유 호스팅 서버가 영향을 받습니다"면 서버 랙이 anchor입니다. "확인한다·입력한다·읽는다"를 키보드 치는 손이나 화면을 보는 사람으로 그리지 않습니다.
- 숫자·글자가 원래 있는 사물(달력·시계·스톱워치·타이머·계기판·온도계·자·저울, 카드·명찰·양식·증서·라벨·태그·티켓·영수증·간판·포스터·번호판)은 anchor로도 소품으로도 쓰지 않습니다. "숫자 없는 달력"처럼 없애는 말을 붙여도 숫자가 그려집니다(운영 #69·#77). 시간·정도·신원 같은 뜻은 다른 사물이나 행동으로 보여줍니다.
- 상태 하나(닫힘·비어 있음·똑같은 두 개)에 뜻을 맡기지 않습니다. 이미지 모델은 상태를 자주 놓칩니다(닫힌 상자가 열려서, 똑같은 폴더가 다르게 그려졌다). prompt와 must에는 보여야 할 것만 쓰고 no text·no numbers·no label 같은 말은 쓰지 않습니다. 빼야 할 것은 avoid에 씁니다.
```

종이·노트 규칙(빈 줄·빈 칸)은 그대로 둔다(PR #22, 운영에서 잘 지켜짐).

### 5.2 감지 함수 (`imageQuality.ts`)

```ts
// 숫자·글자가 원래 있는 사물. "no numerals"를 붙여도 그려진다(운영 #69 달력, #77 계기판).
// counter·form·sign·tag는 일반어(market counter, forms a line, signs of wear)라 앞말과 묶어서만 본다.
const TEXT_OBJECT = /\b(calendars?|clocks?|stopwatch(?:es)?|timers?|wristwatch(?:es)?|gauges?|dials?|speedometers?|thermometers?|rulers?|tape measures?|measuring tapes?|scoreboards?|(?:mechanical|tally|digital) counters?|(?:id|access|credit|business|key|name|loyalty) cards?|badges?|(?:name|price|luggage) tags?|(?:application|approval|consent|paper|printed|blank|tax|order|registration) forms?|certificates?|labels?|tickets?|receipts?|(?:road|street|warning|store|shop|neon|exit|traffic) signs?|signage|signboards?|posters?|banners?|(?:license|number) plates?)\b/i;

export function textObjectWord(scene: ImageScene): string | null  // anchor 영어 + prompt에서 처음 걸린 말
export function hasTypingAnchor(scene: ImageScene): boolean       // anchor 영어에 typing·keyboard
```

- `textObjectWord`는 anchor 영어(`anchorEnglish`)와 `prompt`를 본다. 소품으로 나와도 숫자가 그려진다. "with no label"도 걸린다(FR-03: 이름이 나오면 그려진다)
- `hasTypingAnchor`는 anchor 영어만 본다. 노트북·키보드가 배경 소품인 장면은 많고 문제가 없다(운영 laptop anchor 다수 4~5점)
- anchor가 한국어뿐이거나 없으면(v1 계획) 영어 부분이 빈 문자열이라 prompt만 본다

### 5.3 다시 계획 이유 (`planImageSet`)

```
- 글자 사물: `"{word}"처럼 숫자·글자가 원래 있는 사물은 없애라고 써도 숫자가 그려집니다. 그 사물 없이 같은 뜻을 보여주는 다른 대상을 고르세요.`
- 키보드: `키보드 치는 손은 소제목 뜻을 보여주지 못합니다. 소제목 아래 첫 문단의 답이 가리키는 구체 대상을 anchor로 고르세요.`
```

기존 겹침·나열 이유와 함께 `reasons.join(' ')`로 전달한다.

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| 다시 계획 결과도 걸림 | 그대로 쓴다 (재시도 없음) |
| replanScene 실패·prompt 없음 | 원래 장면 유지 (v2와 같음) |
| 남은 시간 < `REPLAN_MIN_MS` | 다시 계획하지 않음 (v2와 같음) |
| 표지 | 감지하지 않는다 (§1.2) |

---

## 7. Security Considerations

해당 없음 (프롬프트·내부 함수만 변경).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| 단위 | `textObjectWord`, `hasTypingAnchor` (운영 실제 anchor 사례) | Vitest | Do |
| 통합 | planImageSet 다시 계획 횟수·이유, 표지 제외 | Vitest (aiService mock) | Do |
| 일괄 | 운영 anchor 162개에 감지 함수 → 걸린 목록 눈으로 확인, 오탐 0 | scratchpad 스크립트 (AI 호출 없음) | Do |
| 실측 V0 | #77·#80·#69 지금 이미지 19장 2회 채점 + 눈 점검 (기준선) | scratchpad 채점 스크립트 | Do |
| 실측 V1 | #66·#61·#67·#73·#78·#81 계획만 → 감지 anchor 수·다시 계획 수·시간 | scratchpad 계획 스크립트 (DB에 쓰지 않음) | Do |
| 실측 V2 | 로컬 `start:local`에서 #77·#80·#69 세트 다시 만들기 → 19장 2회 채점 + 눈 점검 | 로컬 API + 채점 스크립트 | Check |

### 8.2 단위: textObjectWord

| # | 장면 | 기대 |
|---|------|------|
| 1 | anchor `… / a hand flipping the page of a wall calendar with no visible numbers` (#69) | `"calendar"` |
| 2 | anchor `… / a round analog gauge dial with a needle …` (#77) | `"gauge"` |
| 3 | anchor `… / two people's hands reaching for one shared access card` (#66) | `"access card"` |
| 4 | anchor `… / a hand placing a blank approval form on a desk` (#66) | `"approval form"` |
| 5 | anchor `… / a closed cardboard box with no label` (#61) | `"label"` |
| 6 | anchor 없음, prompt `a desk with a stopwatch beside a laptop` | `"stopwatch"` |
| 7 | anchor `… / a tray of raw shrimp resting on crushed ice at a market counter` (#76) | `null` |
| 8 | anchor `… / a mechanical counter with drum wheels …` (#81) | `"mechanical counter"` |
| 9 | prompt `people forms a line`, `signs of wear on a door` | `null` |
| 10 | anchor `… / an unopened sealed envelope` | `null` |

### 8.3 단위: hasTypingAnchor

| # | anchor | 기대 |
|---|--------|------|
| 1 | `버전 확인 / a developer's hands typing on a laptop keyboard` (#80) | true |
| 2 | `… / a finger hovering over the Enter key of a laptop keyboard` (#73) | true |
| 3 | `… / a closed laptop on a desk` | false |
| 4 | anchor 없음, prompt에 keyboard | false (prompt는 보지 않음) |

### 8.4 통합: planImageSet

| # | 상황 | 기대 |
|---|------|------|
| 1 | 소제목 anchor가 달력 | replanScene 1번, reason에 `"calendar"` 포함 |
| 2 | 소제목 anchor가 키보드 치는 손 | replanScene 1번, reason에 "키보드" 포함 |
| 3 | 표지 anchor가 키보드 | replanScene 0번 |
| 4 | 나열 + 글자 사물 동시 | replanScene 1번, 이유 둘 다 |

### 8.5 실측 스크립트 (scratchpad, 커밋 안 함)

- **채점**: 장면마다 `aiService.scoreImage`를 2번 부른다. 운영 이미지는 Blob 주소로, 로컬 이미지는 `backend/generated-images` 파일을 base64로. 결과는 JSON으로 저장
- **계획만**: 운영 글 JSON(본문)을 읽어 `planImageSet`과 같은 순서(planImages → 감지 → replanScene)를 돈다. DB에 쓰지 않는다
- 두 스크립트 모두 실행 전에 `DATABASE_URL`을 로컬 SQLite로 고정한다(길이 경고 기록이 DB에 쓰이므로 운영 DB에 닿지 않게)

---

## 9. Clean Architecture

| Component | Layer | Location |
|-----------|-------|----------|
| SCENE_RULES | Infrastructure (AI 프롬프트) | `aiService.ts` |
| textObjectWord, hasTypingAnchor | Domain (순수 함수) | `imageQuality.ts` |
| planImageSet | Application | `draftPipeline.ts` |

---

## 10. Coding Convention Reference

| Item | Convention Applied |
|------|-------------------|
| 주석 | 한국어 한 줄, `// Design Ref: image-abstract-scenes §n` |
| 감지 정규식 | `hasListedAnchor` 옆, 근거(운영 글 번호)를 주석으로 |
| 이미지 모델 입력 | 영어만 (그대로) |

---

## 11. Implementation Guide

### 11.1 File Structure

```
backend/src/services/imageQuality.ts       (수정: textObjectWord, hasTypingAnchor)
backend/src/services/draftPipeline.ts      (수정: planImageSet 이유 2줄)
backend/src/services/aiService.ts          (수정: SCENE_RULES 3줄)
backend/src/services/imageQuality.test.ts  (테스트 추가)
backend/src/services/draftPipeline.test.ts (테스트 추가)
```

### 11.2 Implementation Order

1. [ ] 감지 함수 2개 + 단위 테스트
2. [ ] 운영 anchor 162개 일괄 감지 → 오탐 확인 (AI 호출 없음)
3. [ ] `planImageSet` 이유 2줄 + 통합 테스트
4. [ ] SCENE_RULES 3줄
5. [ ] 검증 4단계
6. [ ] V0 기준선 → V1 계획만 → V2 3세트 (예산 19장 ≈ $1.14)

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 코드 | `module-1` | 11.2의 1~5 | 3 |
| 실측 | `module-2` | 11.2의 6 | 4 |

#### Recommended Session Plan

한 세션에 다 해도 되는 크기다 (코드 약 40줄 + 테스트).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-22 | 초안, C안 선택 | jeh-lab + Claude |
