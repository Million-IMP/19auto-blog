# ai-call-cleanup Design Document

> **Summary**: `askText`의 4번째 인자를 옵션 객체 `{ cachedPrefix, system }`로 바꾸고, 직접 호출 3곳을 `askText`로 교체한다 — 설계안 C
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-22
> **Status**: Draft
> **Plan**: `docs/01-plan/features/ai-call-cleanup.plan.md`

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 텍스트 AI 호출 반복 코드 3곳 → 호출 방식 변경 때 빠뜨림 위험 (ai-token-warning에서 실제로 발생) |
| **WHO** | 코드를 고치는 개발자(사용자 + Claude). 화면 사용자에게는 변화 없음 |
| **RISK** | 리팩터링 중 프롬프트·토큰 제한·system 문구·결과 해석이 바뀌어 수집 분류·OSMU·즉석 요약 결과가 달라짐 |
| **SUCCESS** | 직접 `messages.create`는 `askText`·`scoreImage` 2곳만 남음 + 기존 테스트 108개 통과 + 3곳의 요청 내용이 바뀌지 않음을 테스트로 고정 |
| **SCOPE** | ① askText `system` 옵션 ② 3곳 교체 ③ 요청 내용·빈 응답 테스트 |

---

## 1. Overview

### 1.1 Design Goals

1. 텍스트 AI 호출을 `askText` 하나로 모은다.
2. 요청 내용(model·max_tokens·system·프롬프트)과 결과 해석은 바꾸지 않는다.
3. 바뀌지 않았다는 것을 테스트로 고정한다.

### 1.2 Design Principles

- **요청은 그대로**: system 문구·토큰 제한·프롬프트 문자열은 옮기기만 한다.
- **해석은 그대로**: XML 태그 파싱과 기본 문구는 각 메서드에 남긴다. `askText`는 "부르고, 잘림 확인하고, 글을 꺼낸다"까지만.
- **빈 응답은 한 가지 오류**: "AI 응답이 비어 있습니다." (Plan §7.2 결정)

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| 항목 | A 위치 인자 추가 | B 새 객체 인자 함수 | **C 4번째 인자를 옵션 객체로 (선택)** |
|---|---|---|---|
| 시그니처 | `askText(name, prompt, max, cachedPrefix?, system?)` | `ask({ name, prompt, maxTokens, cachedPrefix, system })` | `askText(name, prompt, max, { cachedPrefix?, system? })` |
| 기존 호출 수정 | 0 | 7곳 전부 | 2곳 (목차·본문 캐시) |
| 새 호출 모양 | `askText('processInboxItem', p, 4000, undefined, SYSTEM)` | `ask({ … })` | `askText('processInboxItem', p, 4000, { system })` |
| 읽기 쉬움 | 낮음 (`undefined` 자리 채움) | 높음 | 높음 |
| 변경량 | 가장 적음 | 가장 큼 | 적음 |

**선택: C** — 사용자 지시 "특이사항 없으면 추천 방향" (2026-10-21). `undefined` 자리 채움 없이 이름으로 읽히고, 기존 호출은 캐시를 쓰는 2곳만 바뀐다.

### 2.1 Component Diagram

```
processInboxItem ─┐                         ┌─ checkResponse(name, …)  잘림·길이 경고
generateOSMUContent ┼─▶ askText(name, prompt, max, { system?, cachedPrefix? }) ─┤
quickSummarizeArticle┘        └ messages.create({ model, max_tokens, system?, messages })
(기존) extractMaterialStructure·generateOutline·generateBody·polishBody·planImages·replanScene·evaluateTopic
scoreImage ──▶ messages.create (이미지, 그대로)
```

### 2.3 Dependencies

새 의존성 없음. `@anthropic-ai/sdk`의 `system` 파라미터(문자열)를 그대로 쓴다.

---

## 3. Data Model

변경 없음.

---

## 4. Interface Specification

### 4.1 `askText`

```ts
type AskOptions = {
  // 여러 단계가 똑같이 보내는 자료 블록. 프롬프트 맨 앞에 두고 캐시해서 다음 단계는 싸게 읽는다.
  cachedPrefix?: string;
  // 응답 형식을 지키게 하는 시스템 문구. 없으면 요청에 넣지 않는다.
  system?: string;
};
async function askText(name: string, prompt: string, maxTokens: number, options: AskOptions = {}): Promise<string>
```

- 요청: `{ model: AI_MODEL, max_tokens, ...(system ? { system } : {}), messages: [{ role: 'user', content }] }`
- 마감·캐시·잘림·빈 응답 처리: 지금과 같음

### 4.2 3곳 교체

| 메서드 | 지금 | 바뀐 뒤 |
|---|---|---|
| `processInboxItem` | `create({ max_tokens: 4000, system: 'You are a helpful assistant that only outputs strictly formatted XML.' })` + 글 찾기 + 빈 응답 디버그 로그 | `askText('processInboxItem', prompt, 4000, { system: 같은 문구 })`. 파싱·오류 문구 그대로 |
| `generateOSMUContent` | `create({ max_tokens: 1500 })` + 빈 응답 오류 | `return askText('generateOSMUContent', prompt, 1500)` |
| `quickSummarizeArticle` | `create({ max_tokens: 1000, system: 'You are an expert editorial consultant. Output strictly formatted XML tags as instructed.' })` + 빈 값이면 기본 문구 | `askText('quickSummarizeArticle', prompt, 1000, { system: 같은 문구 })`. 태그 파싱·기본 문구 그대로 |

### 4.3 기존 호출 수정

| 호출 | 지금 | 바뀐 뒤 |
|---|---|---|
| `generateOutline` | `askText('generateOutline', prompt, 3000, contextBlock(input))` | `…, { cachedPrefix: contextBlock(input) })` |
| `generateBody` | `askText('generateBody', prompt, 8000, contextBlock(input))` | `…, { cachedPrefix: contextBlock(input) })` |

---

## 5. UI/UX Design

변경 없음.

---

## 6. Error Handling

| 상황 | 지금 | 바뀐 뒤 |
|---|---|---|
| 잘림 (3곳) | 잘림 기록 + "AI 응답이 길이 제한(N 토큰)에서 잘렸습니다." | 같음 (`askText` → `checkResponse`) |
| 글 없이 끝남 — OSMU | "AI 응답이 비어 있습니다." | 같음 |
| 글 없이 끝남 — 수집 분류 | 디버그 로그 + "AI 응답을 파싱할 수 없습니다. 터미널 로그를 확인하세요." | **"AI 응답이 비어 있습니다."** |
| 글 없이 끝남 — 즉석 요약 | 기본 문구 3종을 돌려줌 | **"AI 응답이 비어 있습니다."** (라우트 500) |
| 글은 있는데 태그 누락 — 수집 분류 | 파싱 오류 | 같음 |
| 글은 있는데 태그 누락 — 즉석 요약 | 기본 문구 | 같음 |

---

## 7. Security Considerations

변경 없음 (프롬프트·입력 처리 그대로).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| L0 | 3곳 요청 내용·빈 응답·해석 유지, askText system 없음 | vitest (SDK mock, 기존 `aiService.test.ts`) |
| 회귀 | 기존 108개 | vitest |

### 8.2 L0 Cases (`aiService.test.ts`에 추가)

| # | Case | Expected |
|---|------|----------|
| 1 | 3곳 각각 호출 | `create` 1회, `model` = `ANTHROPIC_MODEL`(테스트 값), `max_tokens` 4000/1500/1000, `system` 문구 그대로/없음, 프롬프트 핵심 문장 포함, 두 번째 인자(요청 옵션) 없음 |
| 2 | 3곳 글 없이 끝남 | "AI 응답이 비어 있습니다." |
| 3 | system 없는 askText 호출(evaluateTopic) | 요청에 `system` 키 없음 |
| 4 | 수집 분류 정상 XML | `{ category, title, refinedContent, keyword }` 그대로 |
| 5 | 즉석 요약 태그 없는 글 | 기본 문구 3종 그대로 |

---

## 9. Layer Assignment

| Component | Location |
|-----------|----------|
| `askText`, 3곳 | `backend/src/services/aiService.ts` |
| 테스트 | `backend/src/services/aiService.test.ts` |

---

## 10. Coding Convention Reference

- 모델은 `AI_MODEL`(`ANTHROPIC_MODEL` + 기본값) 그대로. 테스트도 모델 ID를 쓰지 않고 환경변수 값으로 비교
- 주석 밀도·한국어 주석은 주변 코드와 같게

---

## 11. Implementation Guide

### 11.1 File Structure

```
backend/src/services/aiService.ts       수정  AskOptions, askText 옵션, 3곳 교체, 캐시 호출 2곳
backend/src/services/aiService.test.ts  수정  L0 5종
```

### 11.2 Implementation Order

1. [ ] 테스트 먼저 (요청 내용 고정) → 지금 코드에서 1·3·4·5 통과, 2는 수집 분류·즉석 요약 실패 확인
2. [ ] `askText` 옵션 객체 + 캐시 호출 2곳
3. [ ] 3곳 교체 → 전체 테스트·타입체크

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | 내용 | 예상 |
|---|---|---|---|
| 테스트 | module-1 | 11.2-1 | 15분 |
| 교체 | module-2 | 11.2-2·3 | 15분 |

#### Recommended Session Plan

한 세션, 한 PR.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-22 | 설계안 C | jeh-lab + Claude |
