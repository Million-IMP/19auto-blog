# ai-call-cleanup Planning Document

> **Summary**: aiService에서 Anthropic을 직접 부르는 3곳(processInboxItem·generateOSMUContent·quickSummarizeArticle)을 `askText`로 합친다. 동작은 그대로 둔다
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-22
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 텍스트만 받는 AI 호출 3곳이 `messages.create` → `checkResponse` → 글 블록 찾기를 각자 반복한다. 호출 방식(마감 시간·캐시·빈 응답 처리)을 바꿀 때 4곳을 따로 고쳐야 하고, 실제로 ai-token-warning 때 3곳만 확인이 빠져 있었다. |
| **Solution** | `askText`에 `system` 옵션을 더하고 3곳을 `askText` 호출로 바꾼다. 프롬프트·모델·토큰 제한·결과 해석은 그대로 둔다. |
| **Function/UX Effect** | 화면·API 결과는 같다. 차이는 AI가 글 없이 끝나는 드문 경우 하나뿐이다: 세 곳 모두 "AI 응답이 비어 있습니다." 오류로 통일된다. |
| **Core Value** | 텍스트 AI 호출이 한 길로 모여, 다음 변경(5번 image-abstract-scenes 등)에서 고칠 곳이 하나가 된다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 텍스트 AI 호출 반복 코드 3곳 → 호출 방식 변경 때 빠뜨림 위험 (ai-token-warning에서 실제로 발생) |
| **WHO** | 코드를 고치는 개발자(사용자 + Claude). 화면 사용자에게는 변화 없음 |
| **RISK** | 리팩터링 중 프롬프트·토큰 제한·system 문구·결과 해석이 바뀌어 수집 분류·OSMU·즉석 요약 결과가 달라짐 |
| **SUCCESS** | 직접 `messages.create`는 `askText`·`scoreImage` 2곳만 남음 + 기존 테스트 108개 통과 + 3곳의 요청 내용(model·max_tokens·system·프롬프트)이 바뀌지 않음을 테스트로 고정 |
| **SCOPE** | ① askText `system` 옵션 ② 3곳 교체 ③ 요청 내용·빈 응답 테스트 |

---

## 1. Overview

### 1.1 Purpose

텍스트 AI 호출을 `askText` 한 곳으로 모은다. 기능 변화 없는 정리 작업이다.

### 1.2 Background (2026-10-22 코드 확인)

| 항목 | 내용 |
|---|---|
| 직접 호출 | `aiService.ts`의 `messages.create` 5곳: `askText`, `processInboxItem`(4000·system), `scoreImage`(1024·이미지), `generateOSMUContent`(1500), `quickSummarizeArticle`(1000·system) |
| 이번 대상 | 텍스트만 쓰는 3곳. `scoreImage`는 이미지 블록·자체 시간 제한(30초)·채점 전용 잘림 처리가 있어 제외 |
| 마감 시간 | 3곳 모두 `withDeadline` 밖에서 불린다 (`runAutomationCycle`의 수집 분류·OSMU, `/api/inbox/quick-summary`, `/api/inbox/:id/process`). `askText`는 마감이 없으면 지금처럼 SDK 기본값으로 부르므로 시간 초과·재시도 동작이 같다 |
| 빈 응답 | `askText`·OSMU: "AI 응답이 비어 있습니다." 오류 / 수집 분류: 디버그 로그 후 "AI 응답을 파싱할 수 없습니다…" 오류 / 즉석 요약: 빈 값이면 기본 문구("원문 핵심 내용을 정리 중입니다.")를 돌려줌 |
| 테스트 | `aiService.test.ts`가 3곳의 잘림·길이 경고를 이미 확인 (전체 108개) |

### 1.3 Related Documents

- `docs/bkit-next-prompts.md` 4번
- `docs/04-report/ai-token-warning.report.md` §4 (직접 호출 3곳 반복 코드 → askText system 옵션)

---

## 2. Scope

### 2.1 In Scope

- [ ] `askText`에 `system` 옵션 추가 (없으면 지금과 같은 요청)
- [ ] `processInboxItem`·`generateOSMUContent`·`quickSummarizeArticle`을 `askText`로 교체
- [ ] 테스트: 3곳의 요청 내용(model·max_tokens·system·프롬프트 일부)과 빈 응답 처리

### 2.2 Out of Scope

- `scoreImage` 통합 (이미지·시간 제한·잘림 문구가 달라 별도)
- 프롬프트 문구·토큰 제한·모델 변경
- 결과 해석(XML 태그 파싱·기본 문구) 변경 — 단, 빈 응답 오류 통일은 §3 FR-03
- 3곳에 마감 시간 적용

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `askText`에 `system`을 줄 수 있다. 주지 않으면 요청에 `system`이 없다 (지금과 같음) | High | Pending |
| FR-02 | 3곳의 요청은 model·max_tokens·system·프롬프트가 지금과 같다. 잘림·길이 경고 기록 이름도 같다 | High | Pending |
| FR-03 | AI가 글 없이 끝나면 3곳 모두 "AI 응답이 비어 있습니다." 오류 (결정: 통일 — §7.2) | Medium | Pending |
| FR-04 | 글이 있는데 태그가 빠진 경우의 처리(수집 분류 오류, 즉석 요약 기본 문구)는 그대로 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 회귀 | 기존 테스트 108개 통과 | `npm test --prefix backend` |
| 비용 | AI 호출 수·토큰 제한 변화 없음 | 요청 내용 테스트 |
| 범위 | 화면·API 응답 형식 변화 없음 | 타입체크, 라우트 무수정 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] SC-1: `aiService.ts`의 `messages.create`가 `askText`·`scoreImage` 2곳만 남는다
- [ ] SC-2: 기존 테스트 108개 + 새 테스트 통과
- [ ] SC-3: 3곳의 요청 내용(model·max_tokens·system 유무와 문구·프롬프트 핵심 문장)이 테스트로 고정된다
- [ ] SC-4: 빈 응답 처리 3곳 모두 같은 오류 (테스트)
- [ ] SC-5: 타입체크 통과, 라우트·automationService 무수정

### 4.2 Quality Criteria

- [ ] 백엔드 타입체크 통과
- [ ] 줄 수 감소 (반복 코드 제거)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| system 문구를 빠뜨리거나 바꿔 분류·요약 결과가 달라짐 | Medium | Low | 요청 내용 테스트로 system 문구를 그대로 비교 |
| `askText`의 마감 시간 처리가 3곳에 새로 적용됨 | Medium | Low | 3곳은 `withDeadline` 밖이라 적용 안 됨 (확인 완료). 테스트에서 요청 옵션이 없음을 확인 |
| 즉석 요약이 빈 응답에서 기본 문구 대신 오류를 냄 | Low | Low | 의도한 변경으로 문서화 (가짜 요약을 보여주지 않음). 태그 누락 시 기본 문구는 그대로 |
| `askText` 인자 형태 변경으로 기존 호출(목차·본문 캐시) 깨짐 | Medium | Low | 설계에서 방식 선택, 타입체크·기존 테스트 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `askText` | 내부 함수 | `system` 옵션 추가 |
| `processInboxItem`·`generateOSMUContent`·`quickSummarizeArticle` | 서비스 메서드 | 내부 호출만 `askText`로 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `processInboxItem` | AI 호출 | `automationService.runAutomationCycle`, `POST /api/inbox/:id/process` | None (빈 응답 오류 문구만) |
| `generateOSMUContent` | AI 호출 | `automationService.createOsmuDrafts` | None |
| `quickSummarizeArticle` | AI 호출 | `POST /api/inbox/quick-summary` | None (빈 응답 시 오류) |
| `askText` | AI 호출 | 목차·본문(캐시)·교정·장면·글감·자료 구조 | 설계에서 확인 |

### 6.3 Verification

- [ ] 기존 테스트 108개 + 새 테스트
- [ ] 타입체크

---

## 7. Architecture Considerations

### 7.1 Project Level

Dynamic. 서비스 파일 1개 + 테스트 1개 수정.

### 7.2 Key Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 빈 응답 처리 | 통일(오류) / 기존 유지(옵션 추가) | **통일** | 사용자 지시 "특이사항 없으면 추천 방향" (10/21). 즉석 요약의 기본 문구는 AI가 아무것도 쓰지 않았는데 요약처럼 보인다. OSMU는 이미 같은 이유로 오류. 드문 경우이고, 태그 누락 시 기본 문구는 유지 |
| `scoreImage` 포함 | 포함 / 제외 | **제외** | 이미지 블록·30초 제한·채점 전용 잘림 문구 |
| `askText` 인자 형태 | 설계에서 | — | |

---

## 8. Convention Prerequisites

- `CLAUDE.md`: 모델 ID 하드코딩 금지(`AI_MODEL` 유지), 커밋 한국어
- 테스트는 기존 `aiService.test.ts` 방식(SDK mock)

---

## 9. Next Steps

1. [ ] 설계: `askText` 인자 형태 3안 비교 → 선택
2. [ ] 구현·테스트
3. [ ] 분석·보고서

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-22 | 초안 | jeh-lab + Claude |
