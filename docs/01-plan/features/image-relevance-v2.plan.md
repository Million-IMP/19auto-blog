# image-relevance-v2 Planning Document

> **Summary**: 장면의 대상(anchor)을 "개념 1개 + 눈에 보이는 사물·행동"으로 좁히고, 채점 기준에서 의도적으로 흐리게 한 화면 글자와 색 차이를 감점하지 않게 정리한다.
>
> **Project**: 19auto-blog
> **Version**: master 49a2ead
> **Author**: jeh-lab (with Claude)
> **Date**: 2026-10-18
> **Status**: Draft
> **선행 사이클**: [image-relevance 보고서](../../archive/2026-10/image-relevance/image-relevance.report.md)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | v1 후 운영 #42가 3.71로 목표(4.0)에 못 미쳤다. 3점 장면 4장 중 3장은 대상이 개념 여러 개이거나(블루투스·LAN·인터넷) 흐리게 그려야 하는 화면 속 내용(암호화 설정, 유출 검사 패널)이었다. |
| **Solution** | 대상 규칙: 개념 1개, 손에 잡히는 사물·행동 우선, 화면은 배경으로만. 개념 여러 개인 대상은 코드로 잡아 그 장면만 다시 계획한다. 채점 기준: 흐린 화면 글자·색 차이는 감점하지 않는다고 명시한다. |
| **Function/UX Effect** | 소제목마다 한눈에 알아보는 장면이 나온다. 운영 #42 평균 3.71 → 4.0 이상, 3점 이하 0장 목표. |
| **Core Value** | 점수를 후하게 만드는 게 아니라, 그릴 수 있는 대상을 고르고 규칙끼리 부딪히는 감점을 없앤다. 사람 눈 점검을 함께 해 점수 부풀리기를 막는다. |

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

### 1.1 Purpose
v1이 남긴 #42의 3점 장면 원인(대상 선택, 규칙 충돌)을 고쳐 소제목마다 대상이 분명한 이미지를 만든다.

### 1.2 Background
운영 다시 만들기(2026-10-18) 3점 장면:

| 글 | 소제목 | 대상(anchor) | 채점 이유 요약 | 원인 |
|---|---|---|---|---|
| #42 | 어떤 연결 방식을 지원하나요? | 블루투스·LAN·인터넷 연결 | LAN만 보임 | 개념 3개 |
| #42 | 연결한 파일은 안전한가요? | 암호화와 기기 인증 확인 | 화면이 흐려 식별 불가 | 화면 속 내용 + 개념 2개 |
| #43 | 비밀번호 유출 검사는 어떻게 | 비밀번호 유출 검사 기능 화면 | 흐린 패널, 뜻 불명 | 화면 속 내용 |
| #44 | 저장 용량은 어떻게 정의하나요? | 신호와 간섭의 비율 | 신호·간섭 구분 안 됨 | 순수 개념 (이번 범위 밖) |

4점 이유에도 "상자가 검은색이 아닌 청록색", "글자는 흐려 읽히지 않음"처럼 의도한 규칙·화풍 때문인 감점이 있다.

### 1.3 Related Documents
- v1 보고서·설계: `docs/archive/2026-10/image-relevance/`
- 코드: `backend/src/services/aiService.ts` (SCENE_RULES, planImages, replanScene, scoreImage), `draftPipeline.ts` (planImageSet), `imageQuality.ts`

---

## 2. Scope

### 2.1 In Scope
- [ ] SCENE_RULES: anchor는 개념 1개, 손에 잡히는 사물·사람의 행동 우선. 화면은 배경·맥락으로만 두고 화면 속 내용을 anchor로 삼지 않는다
- [ ] 개념 여러 개 감지: anchor 한국어 부분에 나열 기호(`·` 등 가운뎃점, 쉼표, `및`)가 있으면 그 장면만 한 번 다시 계획. `와/과`는 오탐이 많아 프롬프트 규칙에 맡김(설계 §8.2)
- [ ] scoreImage 채점 기준: 흐리게 처리한 화면 글자, 화풍이 정한 색·재질 차이는 감점하지 않는다고 명시
- [ ] 단위·통합 테스트
- [ ] 운영 #42 다시 만들기 + 점수표 + 사람 눈 점검

### 2.2 Out of Scope
- 재생성 기준을 3 → 4로 올리기 (비용 증가, 이번엔 선택 안 함)
- 순수 개념 장면(도식형) 전용 규칙 (#44 3점 1장)
- #43·#44 다시 만들기
- 화면(배지·버튼) 변경

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | SCENE_RULES: anchor는 소제목의 핵심 개념 **하나**를 대표하는 눈에 보이는 사물 또는 사람의 행동. 여러 개가 나오면 본문에서 가장 먼저 설명하는 것 하나만 고른다 | High | Done |
| FR-02 | SCENE_RULES: 화면 속 내용(설정 항목, 검사 결과, 로그)을 anchor로 삼지 않는다. 화면은 "blurred interface"로 배경에만 두고, 그 기능을 쓰는 손·기기·주변 사물로 보여준다 | High | Done |
| FR-03 | 계획 후 anchor 한국어 부분에 나열(`·`, `,`, ` 및 `)이 있으면 그 장면만 `replanScene`으로 한 번 다시 계획. 다시 계획해도 나열이면 그대로 둔다 | High | Done |
| FR-04 | replanScene 프롬프트에도 FR-01·02 규칙과 "이전 anchor는 개념이 여러 개였다"는 사유를 전달 | Medium | Done |
| FR-05 | scoreImage 기준: 흐리게 처리한 화면 글자·숫자, 화풍이 정한 색·재질 차이는 감점 사유가 아니다. 대상이 보이는지와 소제목 뜻과 맞는지만 본다 | High | Done |
| FR-06 | 비용·시간: 다시 계획은 글당 최대 장면 수만큼 AI 호출이 늘 수 있으나 이미지 생성 수는 같다 | Medium | Done |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 비용 | 추가 비용 글당 ≤ $0.01 (다시 계획 AI 호출만) | 다시 계획 횟수 × 호출 단가 |
| 시간 | 계획 단계 + 다시 계획 ≤ 60초 | 운영 #42 다시 만들기 소요 시간 |
| 호환 | 기존 imagePlan(v1) 읽기·이어하기 그대로 | 기존 테스트 통과 |

---

## 4. Success Criteria

### 4.1 Definition of Done
- [ ] FR-01~06 구현
- [ ] 단위 테스트: 나열 감지, 다시 계획 1회 제한
- [ ] 검증 4단계 통과
- [ ] 운영 #42 다시 만들기 결과 기록

### 4.2 Quality Criteria

| # | 기준 | 측정 |
|---|------|------|
| SC-1 | 운영 #42 관련성 평균 ≥ 4.2 (새 이미지를 2번씩 채점한 평균, 새 기준 기준선 3.93 대비 +0.27) | 다시 만들기 후 이미지 7장을 스크립트로 2회 채점 |
| SC-2 | 운영 #42 3점 이하 0장 (2회 채점 모두) | 위와 같음 |
| SC-3 | 사람 눈 점검: 7장 모두 소제목 대상이 한눈에 보임 | Claude가 이미지를 직접 열어 확인 + 사용자 확인 |
| SC-4 | #42 새 계획의 anchor 중 나열 0개 | imagePlan anchor 검사 |
| SC-5 | 검증 4단계 통과, 기존 테스트 깨짐 없음 | tsc · lint · build · test |

---

### 4.3 채점 기준 효과 분리 (Do 실측, 2026-10-18)

운영 #42의 지금 이미지 7장(v1)을 새 채점 기준으로 2번씩 다시 채점했다. 이미지는 그대로다.

| 장면 | 이전 | 새 기준 (2회) |
|---|:-:|:-:|
| 표지 | 4 | 5, 4 |
| 무엇이 달라졌나 | 4 | 4, 4 |
| 연결 방식 | 3 | 4, 3 |
| 멀리 있는 가족 기기 | 4 | 4, 3 |
| 기존 앱과 차이 | 4 | 4, 4 |
| 안전한가요 | 3 | 4, 4 |
| 설치하고 써보기 | 4 | 4, 4 |
| **평균** | **3.71** | **3.93** |

- 채점 기준만으로 +0.22. "안전한가요"는 흐린 화면 감점이 빠져 3 → 4 (의도한 변화).
- 같은 이미지도 1점씩 흔들린다(표지 5/4, 가족 기기 4/3). 한 번 채점한 평균은 ±0.2 정도 흔들린다.
- 따라서 SC-1의 비교 기준은 3.71이 아니라 **새 기준 3.93**이다.

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 채점 기준 완화로 점수만 오름 | High | Medium | 완화 범위를 "의도한 흐림·화풍 색"으로 한정. SC-3 사람 눈 점검을 필수로 |
| 대상을 하나로 줄여 소제목 뜻 일부가 빠짐 | Medium | Medium | 본문에서 먼저 설명하는 개념을 고르고, 나머지는 caption에 남김 |
| 나열 감지 오탐 (예: "Wi-Fi·블루투스 겸용 공유기" 같은 단일 사물) | Low | Medium | 다시 계획 1회만, 결과가 또 나열이면 그대로 둠 |
| #42 다시 만들기 횟수 | Low | Low | 오늘 1/3 사용. 검증 1회 + 여유 1회 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| SCENE_RULES | AI 프롬프트 | anchor 선택 규칙 2줄 수정·추가 |
| scoreImage 프롬프트 | AI 프롬프트 | 감점 제외 규칙 1줄 추가 |
| planImageSet | 파이프라인 | 나열 anchor 다시 계획 루프 추가 |
| imageQuality.ts | 순수 함수 | `hasListedAnchor(scene)` 추가 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| planImageSet | IMAGES 단계 첫 진입 | runStage → planImageSet | 다시 계획 호출이 늘 수 있음 |
| replanScene | 유사 장면 다시 계획 | planImageSet | 사유 인자 추가 (기존 호출 호환) |
| scoreImage | 채점 | scoreScene, regenerateImage, retryScene | 프롬프트만 변경 |

### 6.3 Verification
- [ ] 기존 55개 테스트 통과
- [ ] v1 imagePlan(anchor 없음) 이어하기 동작 유지

---

## 7. Architecture Considerations

### 7.1 Project Level Selection
Dynamic (Express + Prisma + React, Vercel) — v1과 같음.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 개념 여러 개 처리 | 프롬프트만 / 코드 감지 + 다시 계획 | 코드 감지 + 다시 계획 | v1 교훈: AI 지시만으로는 샌다(색 단어 3/19) |
| 채점 기준 | 그대로 / 감점 제외 명시 | 감점 제외 명시 + 사람 눈 점검 | 흐림 규칙과 충돌 해소, 부풀리기 방지 |
| 테스트 | Vitest | Vitest | 기존과 같음 |

---

## 8. Convention Prerequisites

- 주석·UI·커밋 한국어, AI 모델 ID 하드코딩 금지(`ANTHROPIC_MODEL`), npm
- 이미지 모델에는 영어만 보낸다(anchor 영어 부분)
- 운영 DB를 건드리는 실측은 운영 API로만, 로컬 서버는 띄우지 않는다

---

## 9. Next Steps

1. [ ] `/bkit:pdca design image-relevance-v2`
2. [ ] 구현 + 검증 4단계
3. [ ] 머지·배포 후 운영 #42 다시 만들기

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-18 | Initial draft | jeh-lab (with Claude) |
| 0.2 | 2026-10-18 | 채점 기준 효과 분리 실측(3.71 → 3.93) 반영, SC-1을 2회 평균 ≥ 4.2로 상향 | jeh-lab (with Claude) |
