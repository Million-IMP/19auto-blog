# ai-token-warning Planning Document

> **Summary**: AI 응답이 길이 제한(max_tokens)의 80%를 넘으면 활동 기록에 경고를 남기고, 잘림을 확인하지 않던 3곳(수집 처리·OSMU·3줄 요약)도 잘리면 오류로 알린다.
>
> **Project**: 19auto-blog
> **Version**: master 13e49aa
> **Author**: jeh-lab (with Claude)
> **Date**: 2026-10-18
> **Status**: Draft
> **배경 사이클**: [image-relevance-v2 보고서](../../archive/2026-10/image-relevance-v2/image-relevance-v2.report.md) — 생각(thinking) 토큰 때문에 이미지 계획이 4번 중 1번 잘림

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 모델의 생각 토큰도 길이 제한에 들어가 응답이 예고 없이 잘린다. 이미지 계획은 8000에서 4번 중 1번 잘렸다. AI 호출 11곳 중 3곳(수집 처리·OSMU·3줄 요약)은 잘림을 확인하지 않아 반쯤 쓴 글이 그대로 저장될 수 있다. |
| **Solution** | 모든 AI 호출의 출력 토큰을 재서 제한의 80%를 넘으면 활동 기록(하루 1번/호출)과 서버 로그에 남긴다. 확인하지 않던 3곳은 잘리면 다른 곳처럼 오류로 알린다. |
| **Function/UX Effect** | 어느 AI 호출이 제한에 가까운지 활동 기록에서 바로 보인다. 잘린 OSMU 초안·요약이 조용히 저장되지 않는다. |
| **Core Value** | 제한을 감으로 올리지 않고, 실제 사용량 데이터를 보고 필요한 곳만 올린다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 생각 토큰 때문에 응답이 예고 없이 잘리고, 3곳은 잘린 글을 그대로 저장한다 |
| **WHO** | 블로그 운영자 1인 (활동 기록으로 상태를 보는 사람) |
| **RISK** | 경고가 너무 잦아 활동 기록을 덮음 / 잘림 오류로 바뀐 3곳이 이전엔 되던 일을 실패로 만듦 |
| **SUCCESS** | 11곳 모두 사용량 측정, 80% 초과 시 하루 1번 기록, 3곳 잘림 시 오류, 검증 4단계 통과 |
| **SCOPE** | 1) 공통 측정·경고 2) 3곳 잘림 확인 3) 활동 기록 분류 |

---

## 1. Overview

### 1.1 Purpose
AI 응답 길이 제한에 가까워지는 호출을 실패 전에 알아차리고, 잘린 응답이 조용히 저장되지 않게 한다.

### 1.2 Background

| 호출 | 위치 | 제한 | 잘렸을 때 |
|------|------|-----:|----------|
| 이미지 계획 | planImages | 16000 | 오류 |
| 본문 다듬기 | polishBody | 10000 | 오류 |
| 본문 작성 | generateBody | 8000 | 오류 |
| 재료 추출 | extractMaterialStructure | 3000/6000 | 오류 |
| 장면 다시 계획 | replanScene | 4000 | 오류 |
| 목차 | generateOutline | 3000 | 오류 |
| 글감 평가 | evaluateTopic | 2000 | 오류 |
| 이미지 채점 | scoreImage | 1024 | 오류 |
| **수집 처리** | processInboxItem | 4000 | **확인 안 함** (태그가 없으면 "파싱할 수 없습니다") |
| **OSMU 변환** | generateOSMUContent | 1500 | **확인 안 함 — 잘린 글이 초안으로 저장** |
| **3줄 요약** | quickSummarizeArticle | 1000 | **확인 안 함** |

- 운영 활동 기록(최근 100건)에 잘림 오류 없음. 운영 OSMU 초안 1건은 잘리지 않음. 위험은 실측(이미지 계획)으로 확인됐고 다른 곳은 아직 데이터가 없다.
- 실측: 이미지 계획 5,578~8,469, 채점 317~408 출력 토큰(생각 포함).

### 1.3 Related Documents
- `backend/src/services/aiService.ts` (askText와 직접 호출 4곳)
- `docs/archive/2026-10/image-relevance-v2/` (잘림 발견 경위)

---

## 2. Scope

### 2.1 In Scope
- [ ] 모든 AI 호출 11곳(askText 경유 7곳 + 직접 호출 4곳) 출력 토큰 측정
- [ ] 제한의 80% 이상이면 서버 로그 + 활동 기록 `AI_TOKEN_NEAR_LIMIT` (호출 이름·사용량·제한·비율)
- [ ] 같은 호출의 경고는 하루 1번만 활동 기록에 남김 (서버 로그는 매번)
- [ ] 수집 처리·OSMU·3줄 요약: `stop_reason === 'max_tokens'`이면 오류
- [ ] 활동 기록 분류: 경고를 "오류" 묶음에 넣을지 결정(설계에서)
- [ ] 테스트

### 2.2 Out of Scope
- 길이 제한 값 변경 (경고 데이터를 보고 다음에 결정)
- 잘림 시 자동 재시도
- 화면 변경 (활동 기록 기존 화면 그대로)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 모든 AI 호출에서 응답 `usage.output_tokens`와 제한을 비교한다. 호출마다 이름(예: `planImages`)을 붙인다 | High | Done |
| FR-02 | 출력 토큰이 제한의 80% 이상이면 `console.warn` | High | Done |
| FR-03 | 같은 조건에서 활동 기록 `AI_TOKEN_NEAR_LIMIT`을 남긴다. 메시지: `{호출} 응답 {사용}/{제한} 토큰 ({비율}%)` | High | Done |
| FR-04 | 같은 호출의 활동 기록 경고는 24시간에 1번. 기록 실패는 AI 호출을 막지 않는다 | High | Done |
| FR-05 | processInboxItem·generateOSMUContent·quickSummarizeArticle은 잘리면 `AI 응답이 길이 제한({제한} 토큰)에서 잘렸습니다.` 오류 (askText와 같은 문구) | High | Done |
| FR-06 | 기준 비율은 환경변수 `AI_TOKEN_WARN_RATIO`(기본 0.8)로 바꿀 수 있다 | Low | Done |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 성능 | 경고 기록은 드문 경우에만 기다리고 2초 안에 끝냄(서버리스 응답 뒤 끊김 방지, 설계 v0.1) | 코드 리뷰 |
| 비용 | 추가 AI 호출 없음 | 코드 리뷰 |
| 안정성 | 활동 기록 저장 실패가 AI 결과를 막지 않음 | 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done
- [ ] FR-01~06 구현
- [ ] 테스트: 80% 미만 무기록, 80% 이상 기록, 24시간 중복 방지, 3곳 잘림 오류
- [ ] 검증 4단계 통과

### 4.2 Quality Criteria

| # | 기준 | 측정 |
|---|------|------|
| SC-1 | AI 호출 11곳 모두 측정 대상 | 코드에서 `anthropic.messages.create` 호출이 공통 함수 하나를 거치는지 |
| SC-2 | 80% 이상일 때만 기록, 같은 호출은 24시간 1번 | 단위 테스트 |
| SC-3 | 3곳 잘림 시 오류, 잘린 OSMU가 저장되지 않음 | 단위 테스트 |
| SC-4 | 검증 4단계 통과, 기존 74개 테스트 유지 | tsc · lint · build · test |
| SC-5 | 배포 후 1주 활동 기록에서 경고 확인 → 제한 조정 여부 결정 | 운영 활동 기록 (보고서 이후) |

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 경고가 잦아 활동 기록을 덮음 | Medium | Medium | 호출별 24시간 1번 |
| 3곳이 잘림 오류로 바뀌어 이전엔 되던 일이 실패 | Medium | Low | 이전에도 잘린 결과는 쓸모없었음(파싱 실패·잘린 글). 오류 문구로 원인이 보이게 됨 |
| 24시간 중복 확인에 DB 조회가 추가 | Low | High | 80% 넘을 때만 조회. 평소엔 조회 없음 |
| 서버리스라 메모리 기반 중복 방지가 안 됨 | Low | High | 활동 기록 DB로 확인 (image rebuild 횟수와 같은 방식) |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| aiService.ts AI 호출 | 내부 함수 | 공통 측정 함수 경유 |
| SystemLog | 데이터 | 새 event `AI_TOKEN_NEAR_LIMIT` (스키마 변경 없음) |
| /api/system-logs 분류 | API | 경고를 어느 묶음에 보일지 (설계에서) |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| generateOSMUContent | 호출 | automationService createOsmuDrafts, index.ts /osmu | 잘리면 오류 → 채널별 실패 처리 이미 있음 |
| processInboxItem | 호출 | automationService, index.ts /inbox/:id/process | 오류 문구만 바뀜 |
| quickSummarizeArticle | 호출 | index.ts /inbox/quick-summary | 잘리면 500 |

### 6.3 Verification
- [ ] 기존 테스트 74개 통과
- [ ] aiService를 mock하는 기존 테스트에 영향 없음

---

## 7. Architecture Considerations

### 7.1 Project Level
Dynamic (Express + Prisma + React, Vercel).

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 기록 위치 | 서버 로그만 / 활동 기록 + 서버 로그 | 활동 기록 + 서버 로그 | 사용자 선택. 화면에서 바로 보임 |
| 중복 방지 | 메모리 / DB | DB(활동 기록 조회) | 서버리스 인스턴스 간 공유 |
| 측정 위치 | 호출마다 / 공통 함수 | 설계에서 선택 | — |

---

## 8. Convention Prerequisites

- 주석·문구 한국어, 모델 ID 하드코딩 금지, npm
- aiService는 prisma를 직접 쓰지 않았다 — 기록 방식은 설계에서 결정 (의존 방향)

---

## 9. Next Steps

1. [ ] `/bkit:pdca design ai-token-warning`
2. [ ] 구현 + 검증 4단계
3. [ ] 배포 후 1주 경고 확인 → 제한 조정

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-18 | Initial draft | jeh-lab (with Claude) |
