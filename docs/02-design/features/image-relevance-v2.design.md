# image-relevance-v2 Design Document

> **Summary**: 장면 규칙(SCENE_RULES)과 채점 기준을 고치고, anchor에 개념이 나열된 소제목 장면만 코드로 찾아 한 번 다시 계획한다.
>
> **Project**: 19auto-blog
> **Version**: master 49a2ead
> **Author**: jeh-lab (with Claude)
> **Date**: 2026-10-18
> **Status**: Draft
> **Planning Doc**: [image-relevance-v2.plan.md](../../01-plan/features/image-relevance-v2.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 대상이 여러 개거나 흐린 화면 속 내용이면 이미지로 보여줄 수 없어 3점이 나온다. 흐림 규칙과 채점 기준도 서로 부딪힌다 |
| **WHO** | 블로그 운영자 1인 (자동 생성 초안의 이미지를 그대로 발행하고 싶은 사람) |
| **RISK** | 채점 기준을 바꿔 점수만 오르고 실제 이미지는 그대로인 것 (지표 부풀리기) |
| **SUCCESS** | 운영 #42 다시 만들기: 2회 채점 평균 ≥ 4.2, 3점 이하 0장, 사람 눈 점검 통과. 검증 4단계 통과 |
| **SCOPE** | 1) 대상 규칙 + 개념 여러 개 감지·재계획 2) 채점 기준 정리 3) 운영 #42 검증 |

---

## 1. Overview

### 1.1 Design Goals
- anchor가 "그릴 수 있는 것 하나"가 되게 한다.
- 규칙끼리 부딪히는 감점(흐린 화면 글자, 화풍 색)을 채점에서 뺀다.
- 이미지 생성 수·비용은 v1과 같게 둔다.

### 1.2 Design Principles
- AI 지시 + 코드 확인을 같이 둔다 (v1: 지시만으로 색 단어 3/19 혼입).
- 채점 완화는 "우리가 일부러 만든 특징"에만. 대상이 안 보이면 여전히 감점.
- 다시 계획은 장면당 최대 1번. 기존 유사 장면 다시 계획과 합친다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | A: Minimal | B: Clean | C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 프롬프트만 수정 | anchor 검사 모듈 + 규칙 목록 + 사유 기록 | 프롬프트 + 나열 감지 함수 1개 + replanScene 사유 인자 |
| **New Files** | 0 | 1~2 | 0 |
| **Modified Files** | 1 | 4~5 | 3 (+테스트 2) |
| **Complexity** | Low | High | Low |
| **Maintainability** | Medium | High | Medium |
| **Effort** | ~10분 | ~1시간 | ~30분 |
| **Risk** | 나열 anchor가 다시 샐 수 있음 | 규칙 1개에 비해 과함 | Low |

**Selected**: **C — Pragmatic** (2026-10-18 사용자 선택). 계획서 FR을 모두 채우면서 바뀌는 곳이 작다. 감지 규칙이 1개뿐이라 모듈 분리는 이르다(YAGNI).

### 2.1 Component Diagram

```
runStage(IMAGES)
 └─ planImageSet(post)
     ├─ aiService.planImages        ← SCENE_RULES (수정: anchor 1개, 화면 속 내용 금지)
     ├─ [소제목 장면마다, 최대 1번]
     │    reason = 유사 장면(기존) 또는 hasListedAnchor(신규)
     │    └─ aiService.replanScene({..., reason})   ← 사유 인자 추가
     └─ stripStyleWords (v1)
 └─ scoreScene → aiService.scoreImage   ← 채점 기준 (수정: 감점 제외 명시)
```

### 2.2 Data Flow
```
계획 → 소제목 장면 i:
  similar = 앞 장면과 단어 겹침 > 0.6
  listed  = hasListedAnchor(장면 i)
  similar 또는 listed → replanScene 1번 (사유 전달) → 결과를 그대로 씀
→ 색·재질 단어 제거 → 저장 → 렌더 → 채점
```

### 2.3 Dependencies
변경 없음 (Anthropic SDK, Ideogram 그대로).

---

## 3. Data Model

`ImagePlan`·`ImageScene` 필드 변경 없음. v1 imagePlan 이어하기 그대로.

---

## 4. API Specification

변경 없음. `POST /api/posts/:id/images/rebuild`로 검증한다.

---

## 5. 프롬프트 설계

### 5.1 SCENE_RULES 첫 줄 교체

현재:
> 먼저 anchor를 정합니다: 그 소제목 본문에 실제로 나오는 고유 대상(제품·서비스·기기·앱 화면·장소·사람의 행동). …

변경:
> 먼저 anchor를 정합니다: 그 소제목의 핵심 개념 **하나**를 대표하는, 눈에 보이는 사물이나 사람의 행동(제품·기기·장소·손으로 하는 동작)입니다. 소제목에 개념이 여러 개면 본문에서 가장 먼저 설명하는 하나만 고르고, 나머지는 caption에 남깁니다. 형식은 "한국어 원문 표현 / English visual description"이고, 한국어 부분에 `·`나 쉼표로 여러 개를 나열하지 않습니다. 제품은 상표 대신 생김새로 묘사합니다.
> 화면 속 내용(설정 항목·검사 결과·로그·문서 글)은 anchor가 될 수 없습니다. 화면은 흐리게 그리므로 알아볼 수 없기 때문입니다. 그 기능을 쓰는 손·기기·주변 사물로 보여주고, 화면은 배경에 둡니다.

"앱 화면"은 anchor 예시 목록에서 뺀다.

### 5.2 replanScene 사유

`replanScene(input: { …; reason?: string })`. 사유가 있으면 프롬프트에 추가:
```
[다시 계획하는 이유] {reason}
```
- 유사 장면: `앞 장면과 구도·소재가 겹쳤습니다.`
- 나열: `이전 anchor "{한국어 부분}"에 개념이 여러 개였습니다. 본문에서 가장 먼저 설명하는 하나만 고르세요.`

### 5.3 scoreImage 기준 추가

채점 기준 아래에 추가:
```
[감점하지 않는 것]
- 화면·문서의 글자와 숫자가 흐리거나 읽히지 않는 것 (일부러 흐리게 그립니다)
- 색·재질이 대상 묘사와 다른 것 (화풍이 정합니다)
대상이 보이는지, 소제목 뜻과 맞는지만 봅니다.
```
5~1점 정의는 그대로 둔다.

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| 다시 계획 결과도 나열 | 그대로 쓴다 (재시도 없음) |
| replanScene 실패(파싱·API) | 기존과 같이 단계 오류 → 이어하기. v1 유사 장면 다시 계획과 동일 |
| anchor 없음(v1 계획) | `hasListedAnchor` false |
| 표지 | 감지하지 않는다. 표지는 글 전체를 대표하고 replanScene은 소제목 단위다 |

---

### 6.1 Do에서 찾은 문제 (설계 추가)

| 상황 | 원인 | 처리 |
|------|------|------|
| `이미지 계획` 단계가 `AI 응답이 길이 제한(8000 토큰)에서 잘렸습니다`로 실패 | 응답 앞의 생각(thinking) 토큰이 max_tokens에 포함. #42(7장면) 응답 5,578~8,469 토큰 | planImages 16000, replanScene 4000. 실제로 쓴 만큼만 과금되어 비용 변화는 작다 |

## 7. Security Considerations

해당 없음 (프롬프트·내부 함수만 변경).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| 단위 | `hasListedAnchor` | Vitest | Do |
| 통합 | planImageSet 다시 계획 횟수·사유 | Vitest (aiService mock) | Do |
| 실측 1 | #42 계획만 (DB 안 씀, 이미지 생성 없음) → anchor 나열 0 | scratchpad 스크립트 | Do |
| 실측 2 | 운영 #42 다시 만들기 → 7장 2회 채점 평균(기준선 3.93)·눈 점검 | 운영 API + 채점 스크립트 + 이미지 직접 열기 | Check(배포 후) |

### 8.2 단위: hasListedAnchor

| # | anchor | 기대 |
|---|--------|------|
| 1 | `블루투스·LAN·인터넷 연결 / …` | true |
| 2 | `암호화, 기기 인증 / …` | true |
| 3 | `암호화 및 기기 인증 / …` | true |
| 4 | `노트북에 꽂힌 LAN 케이블 / a laptop, a cable` | false (영어 쉼표는 보지 않음) |
| 5 | `신호와 간섭의 비율 / …` | false (`와/과`는 보지 않음 — 한 개념인 경우가 많음) |
| 6 | 없음 | false |

계획서의 `와/과` 감지는 오탐(신호와 간섭의 비율, 키와 값)이 많아 코드에서 빼고 5.1 프롬프트 규칙에 맡긴다.

### 8.3 통합: planImageSet

| # | 상황 | 기대 |
|---|------|------|
| 1 | 소제목 1개 anchor가 나열 | replanScene 1번, reason에 "개념이 여러 개" 포함, 결과 장면 사용 |
| 2 | 다시 계획 결과도 나열 | replanScene 여전히 1번 |
| 3 | 표지 anchor가 나열 | replanScene 0번 |
| 4 | 유사 + 나열 동시 | replanScene 1번 |

### 8.4 Seed Data
기존 테스트 fixture(planImages mock)를 장면별로 덮어쓴다.

---

## 9. Clean Architecture

| Component | Layer | Location |
|-----------|-------|----------|
| SCENE_RULES, replanScene, scoreImage | Infrastructure (AI 프롬프트) | `aiService.ts` |
| hasListedAnchor | Domain (순수 함수) | `imageQuality.ts` |
| planImageSet | Application | `draftPipeline.ts` |

---

## 10. Coding Convention Reference

| Item | Convention Applied |
|------|-------------------|
| 주석 | 한국어 한 줄, `// Design Ref: §n` (v2 문서 기준) |
| 모델 ID | `ANTHROPIC_MODEL` 그대로 |
| 이미지 모델 입력 | 영어만 |

---

## 11. Implementation Guide

### 11.1 File Structure
```
backend/src/services/aiService.ts         (수정: SCENE_RULES, replanScene reason, scoreImage 기준)
backend/src/services/imageQuality.ts      (수정: hasListedAnchor)
backend/src/services/draftPipeline.ts     (수정: planImageSet 다시 계획 조건)
backend/src/services/imageQuality.test.ts (테스트 추가)
backend/src/services/draftPipeline.test.ts(테스트 추가)
```

### 11.2 Implementation Order
1. [ ] `hasListedAnchor` + 단위 테스트
2. [ ] `replanScene` reason 인자
3. [ ] `planImageSet` 조건 합치기 + 통합 테스트
4. [ ] SCENE_RULES·scoreImage 프롬프트 수정
5. [ ] 검증 4단계
6. [ ] 실측 1: #42 계획만 (anchor 확인)

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 코드 감지 | `module-1` | 11.2의 1~3 | 2 |
| 프롬프트 | `module-2` | 11.2의 4~6 | 2 |

#### Recommended Session Plan
한 세션에 다 해도 되는 크기다 (약 60줄).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-18 | Initial draft (Option C) | jeh-lab (with Claude) |
| 0.2 | 2026-10-18 | Do 실측 반영: planImages 응답이 생각(thinking) 토큰 포함 5.5~8.5천 토큰이라 8000에서 잘림(4번 중 1번) → max_tokens 16000, replanScene 1500 → 4000 | jeh-lab (with Claude) |
