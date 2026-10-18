# ai-token-warning Design Document

> **Summary**: aiService의 AI 호출 11곳이 응답 직후 `checkResponse`를 거쳐 사용량을 재고, 80% 이상이면 `aiUsageLog.ts`가 서버 로그와 활동 기록(호출별 24시간 1번)에 남긴다. 잘림 확인이 없던 3곳도 잘리면 오류.
>
> **Project**: 19auto-blog
> **Version**: master 13e49aa
> **Author**: jeh-lab (with Claude)
> **Date**: 2026-10-18
> **Status**: Draft
> **Planning Doc**: [ai-token-warning.plan.md](../../01-plan/features/ai-token-warning.plan.md)

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

### 1.1 Design Goals
- AI 호출마다 같은 확인을 한 곳의 함수로 한다.
- 경고 기록은 AI 결과를 절대 막지 않는다.
- 호출 모양(인자·반환)은 바꾸지 않는다. askText에 이름 인자 하나만 더한다.

### 1.2 Design Principles
- aiService는 판단(사용량·잘림), aiUsageLog는 기록(DB·로그). DB 의존을 한 파일에 모은다.
- 경고는 드물게 생기므로 기록을 기다려도(await) 비용이 작다. 서버리스에서 응답 뒤 끊기지 않게 기다린다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | A: Minimal | B: Clean | C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 11곳에 확인 코드 직접 | 모든 호출을 `callClaude` 하나로 교체 + 기록 주입 | 확인 함수 1개 + 기록 파일 1개 |
| **New Files** | 0 | 1~2 | 1 (+테스트 2) |
| **Modified Files** | 1 | 3 | 3 (aiService, index.ts, ActivityPage) |
| **Complexity** | Low | High | Low |
| **Maintainability** | Low (11번 반복) | High | Medium |
| **Effort** | ~20분 | ~1시간 | ~30분 |
| **Risk** | 빠뜨리기 쉬움 | 호출 모양이 많이 바뀜 | Low |

**Selected**: **C — Pragmatic** (2026-10-18 사용자 선택).

### 2.1 Component Diagram

```
aiService.ts
  askText(name, prompt, maxTokens, cachedPrefix?) ─┐
  processInboxItem / generateOSMUContent /         │
  quickSummarizeArticle / scoreImage ──────────────┤
                                                   ▼
  checkResponse(name, response, maxTokens, { throwOnCut })
     ├─ isNearLimit(used, max) → await recordNearLimit(name, used, max)   ← aiUsageLog.ts
     └─ stop_reason === 'max_tokens' && throwOnCut → 오류

aiUsageLog.ts (prisma 사용)
  warnRatio()            AI_TOKEN_WARN_RATIO (기본 0.8)
  isNearLimit(used, max)
  recordNearLimit(...)   console.warn 매번 → 24시간 안 같은 호출 기록 없으면 SystemLog 생성. 오류는 삼킴
```

### 2.2 Data Flow
```
AI 응답 → used = usage.output_tokens
  used ≥ max × 0.8 → console.warn → systemLog.count(같은 호출, 24h) = 0 → systemLog.create
  stop_reason = max_tokens → 오류 (scoreImage는 기존 문구 유지)
→ 텍스트 반환
```

---

## 3. Data Model

`SystemLog` 그대로. 새 event 값:

| event | message 예 |
|---|---|
| `AI_TOKEN_NEAR_LIMIT` | `planImages 응답 13200/16000 토큰 (83%)` |

중복 확인은 `event = AI_TOKEN_NEAR_LIMIT AND message startsWith "{name} 응답 " AND createdAt ≥ 24시간 전`.

---

## 4. API Specification

| 변경 | 내용 |
|---|---|
| `GET /api/system-logs?kind=error` | `AI_TOKEN_NEAR_LIMIT`도 포함 (LOG_KINDS.error에 추가) |

---

## 5. UI

`ActivityPage.tsx` EVENT_STYLE에 한 줄 추가:

| event | label | tone | icon |
|---|---|---|---|
| `AI_TOKEN_NEAR_LIMIT` | AI 길이 경고 | draft | AlertTriangle |

`hasFailure`는 `ERROR`로 끝나는 event만 실패로 보므로 경고는 실패 표시가 되지 않는다.

---

## 6. Error Handling

| 상황 | 처리 |
|---|---|
| 응답에 usage 없음 | used = 0, 경고 없음 |
| 기록(DB) 실패 | console.warn만, AI 결과는 그대로 반환 |
| 3곳 잘림 | `AI 응답이 길이 제한({max} 토큰)에서 잘렸습니다.` — OSMU는 채널별 실패 처리로, 수집 처리·요약은 기존 오류 경로로 |
| scoreImage 잘림 | 기존 문구 `이미지 채점 응답이 길이 제한에서 잘렸습니다.` 유지 (throwOnCut: false 후 자체 오류) |
| 잘린 응답도 80% 이상 | 경고 기록 후 오류 (둘 다 남음) |

---

## 7. Security Considerations

해당 없음. 기록 메시지에 프롬프트·응답 내용은 넣지 않는다(호출 이름과 숫자만).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| 단위 | aiUsageLog (비율, 기록, 중복 방지, DB 실패) | Vitest, `../db` mock |
| 단위 | aiService 3곳 잘림 오류 + 경고 호출 | Vitest, `@anthropic-ai/sdk` mock |

### 8.2 aiUsageLog

| # | 상황 | 기대 |
|---|------|------|
| 1 | 7999/10000 | isNearLimit false |
| 2 | 8000/10000 | true |
| 3 | `AI_TOKEN_WARN_RATIO=0.5`, 5000/10000 | true |
| 4 | 첫 경고 | SystemLog 1건, 메시지 `x 응답 8000/10000 토큰 (80%)` |
| 5 | 같은 호출 두 번째 | 추가 기록 없음 |
| 6 | 다른 호출 | 기록됨 |
| 7 | DB 오류 | 예외 없이 끝남 |

### 8.3 aiService

| # | 호출 | 응답 | 기대 |
|---|------|------|------|
| 1 | generateOSMUContent | stop_reason max_tokens | 잘림 오류 |
| 2 | quickSummarizeArticle | max_tokens | 잘림 오류 |
| 3 | processInboxItem | max_tokens | 잘림 오류 |
| 4 | generateOSMUContent | end_turn, 1300/1500 | 텍스트 반환 + recordNearLimit('generateOSMUContent', 1300, 1500) |
| 5 | generateOSMUContent | end_turn, 500/1500 | recordNearLimit 호출 없음 |

---

## 9. Clean Architecture

| Component | Layer | Location |
|-----------|-------|----------|
| checkResponse | Infrastructure (AI 클라이언트) | `aiService.ts` |
| aiUsageLog | Infrastructure (기록) | `aiUsageLog.ts` (신규) |
| LOG_KINDS | Presentation (API) | `index.ts` |
| EVENT_STYLE | Presentation (UI) | `ActivityPage.tsx` |

---

## 10. Coding Convention Reference

| Item | Convention |
|------|-----------|
| 호출 이름 | aiService 메서드 이름 그대로 (`planImages`, `generateBody` …) |
| 환경변수 | `AI_TOKEN_WARN_RATIO` (선택, 0 < 값 ≤ 1) |
| 문구 | 한국어 |

---

## 11. Implementation Guide

### 11.1 File Structure
```
backend/src/services/aiUsageLog.ts        (신규)
backend/src/services/aiUsageLog.test.ts   (신규)
backend/src/services/aiService.test.ts    (신규)
backend/src/services/aiService.ts         (수정: checkResponse, askText 이름 인자, 4곳 직접 호출)
backend/src/index.ts                      (수정: LOG_KINDS.error)
frontend/src/pages/ActivityPage.tsx       (수정: EVENT_STYLE 한 줄)
```

### 11.2 Implementation Order
1. [ ] aiUsageLog.ts + 테스트
2. [ ] checkResponse + askText 이름 인자 (7곳 호출 수정)
3. [ ] 직접 호출 4곳에 checkResponse
4. [ ] aiService 테스트
5. [ ] LOG_KINDS, EVENT_STYLE
6. [ ] 검증 4단계

### 11.3 Session Guide

| Module | Scope Key | Description | Turns |
|--------|-----------|-------------|:-----:|
| 기록 | `module-1` | 11.2의 1 | 1 |
| 확인 연결 | `module-2` | 11.2의 2~4 | 2 |
| 화면 | `module-3` | 11.2의 5~6 | 1 |

한 세션에 다 해도 되는 크기다 (약 70줄 + 테스트).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-18 | Initial draft (Option C). 계획서 NFR "기록을 기다리지 않음"을 "드문 경우라 기다림"으로 변경(서버리스 응답 후 끊김 방지) | jeh-lab (with Claude) |
