# mobile-overflow Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation) + Runtime
>
> **Project**: 19auto-blog
> **Analyst**: jeh-lab
> **Date**: 2026-10-19
> **Design Doc**: [mobile-overflow.design.md](../02-design/features/mobile-overflow.design.md)

분석 방식: 구현이 파일 1개(122줄) + 문서 한 줄이라 gap-detector 에이전트 없이 설계 문서와 코드를 직접 대조했다. 런타임은 Chrome MCP로 운영 사이트에서 실행했다.

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 헤드리스 캡처에서 휴대폰 화면 오른쪽 잘림이 보고됐으나 운영 측정에서는 재현되지 않음 |
| **WHO** | 휴대폰으로 대시보드를 여는 운영자·방문자 |
| **RISK** | 실제 휴대폰(iOS Safari 글자 크기 보정, 주소창 높이 등)에서만 생기는 넘침을 데스크톱 측정이 놓쳤을 수 있음 |
| **SUCCESS** | 실제 휴대폰에서 7개 페이지 가로 스크롤 없음 + 점검 스니펫이 14개 조합 모두 0건 보고 |
| **SCOPE** | ① 실폰 확인(사용자) ② 점검 스니펫 1개 추가 ③ 결과 기록 후 종료. 화면 CSS 수정 없음 |

---

## Strategic Alignment Check

### Core Problem

| Element | Expected | Status |
|---------|----------|:------:|
| WHY | 잘림이 실제로 있는지 확인하고, 없으면 근거를 남겨 닫는다 | ✅ 실폰·운영 측정 모두 잘림 없음 |
| WHO | 휴대폰 사용자 화면 | ✅ 화면 코드 변경 없음(사용자 영향 0) |
| 가치 | 재현 안 되는 문제에 CSS를 덧대지 않고 점검 수단만 남김 | ✅ 의존성 0, 앱 코드 변경 0 |

### Success Criteria Status

| # | Criteria (from Plan) | Status | Evidence |
|---|---------------------|:------:|----------|
| SC-1 | 실제 휴대폰에서 7개 페이지 가로 스크롤·잘림 없음 | ✅ | 사용자 확인 2026-10-19 (기종 미기재) |
| SC-2 | 운영에서 스니펫 실행 시 14개 조합 넘침 0 | ✅ | 2회 실행 모두 14/14 넘침 0, 화면폭 390·430 정확 |
| SC-3 | 일부러 넣은 넓은 요소를 잡아냄 | ✅ | 자가검사 `selfTest: 'pass'` (넘침·숨김 잘림 둘 다) |
| SC-4 | 결과가 계획서와 gbrain에 기록됨 | ⚠️ | 계획서 반영 완료, gbrain은 보고서 단계에서 갱신 예정 |

**Success Rate**: 3/4 met (SC-4는 보고서 단계 작업)

### Decision Record Verification

| Source | Decision | Followed? | Deviation |
|--------|----------|:---------:|-----------|
| [Plan] | 화면 CSS 수정 없음 | ✅ | — |
| [Plan] | 새 npm 의존성 0 | ✅ | `package*.json` 변경 없음 |
| [Design] | 설계안 C: 콘솔 스니펫 + 자가검사 + CLAUDE.md 한 줄 | ✅ | — |
| [Design] | 측정 규칙은 계획 단계 측정과 동일 | ✅ | iframe `box-sizing: content-box` 추가 — 계획 단계 측정이 테두리 4px만큼 좁게(386px) 잰 문제를 바로잡음 |

---

## 1. Analysis Overview

- **Design Document**: `docs/02-design/features/mobile-overflow.design.md`
- **Implementation**: `scripts/check-mobile-overflow.js`, `CLAUDE.md` 검증 순서 5번
- **Analysis Date**: 2026-10-19

---

## 2. Gap Analysis (Design vs Implementation)

### 2.1 API Endpoints

해당 없음(새 API 없음). 스니펫 실행 중 `/api/*` 요청 40건 전부 GET 확인.

### 2.2 Data Model (스니펫 결과 형태, 설계 §3)

| Field | Design | Impl | Status |
|-------|--------|------|--------|
| `rows[]` 6개 열 (경로·너비·화면폭·문서폭·넘침·숨김잘림) | ✅ | ✅ | ✅ |
| `details['경로@너비'] = { overflow, clipped }` | ✅ | ✅ | ✅ |
| `done` | ✅ | ✅ | ✅ |
| `selfTest` 값 | `'pass' \| 'fail'` | `'pass' \| 'fail' \| 'not-app'` | ⚠️ 설계 §3에 `not-app` 누락(§6에는 동작 기술됨) |
| `error` | — | 예외 시 문자열 | ⚠️ 설계에 없음(추가 안전장치) |

### 2.3 Component Structure

| Design | Implementation | Status |
|--------|----------------|--------|
| `openFrame(path, width)` | `scripts/check-mobile-overflow.js:17` | ✅ |
| `findOverflow(doc, win)` §5.1·5.2 | `:32` | ✅ |
| `selfTest()` §5.3 | `:61` | ✅ (주입 요소를 `data-selftest` 속성 대신 객체 비교로 찾음 — 동작 동일) |
| 본체: 자가검사 → 14회 → 출력 | `:78-117` | ✅ |
| CLAUDE.md 검증 순서 5번 | `CLAUDE.md` | ✅ |

### 2.4 Functional Depth

| File | Depth Score | Placeholder | Missing |
|------|:----------:|-------------|---------|
| `scripts/check-mobile-overflow.js` | 95 | 없음 | 자가검사 단계 로딩 타임아웃 시 안내 문구가 틀림(아래 M-1) |

### 2.5 출력 체크리스트 (설계 §5.4)

| 항목 | 구현 | 런타임 확인 |
|------|:----:|:----------:|
| 진행 표시 `[n/14] 경로 너비px` | ✅ `:93` | ⚠️ 콘솔 읽기 도구가 iframe 로딩 중 로그를 놓침 |
| 자가검사 한 줄 | ✅ `:86` | ⚠️ 같은 이유 |
| `console.table` 14행 | ✅ `:111` | ⚠️ 같은 이유 (`window.__mobileOverflow.rows` 14행은 확인) |
| 0이 아닌 행 상세 | ✅ `:112` | ✅ `/posts@390 Object` |
| 결론 한 줄 | ✅ `:114` | ✅ `통과: 14개 조합 모두 넘침 0` |
| `done === true` | ✅ | ✅ |

**Functional Match Rate**: 96% (14개 항목 중 M-1 반감)

### 2.6 Contract

API 계약 없음 → 결과 형태(§2.2)로 대신 평가: 4항목 중 `selfTest` 값 반감 → **87.5%**

### 2.7 Runtime Verification Results

#### L2: 스니펫 동작

| # | Action | Expected | Actual | Pass |
|---|--------|----------|--------|:----:|
| 1 | 운영 탭에서 실행 | 자가검사 통과 | `selfTest: 'pass'` | ✅ |
| 2 | 정상 페이지 측정 | 넘침 0, 숨김잘림 0 | 넘침 0, **`/posts@390` 숨김잘림 8** | ⚠️ |
| 3 | example.com 탭에서 실행 | 안내 후 중단 | "19auto-blog 탭(운영 또는 localhost:5173)에서 실행하세요." , iframe 잔여 0 | ✅ |

#### L3: 운영 측정

| # | Scenario | Result | Pass |
|---|----------|--------|:----:|
| 1 | 7경로 × 390·430 | 14/14 넘침 0, 화면폭·문서폭 = 너비 | ✅ |
| 2 | 실행 중 네트워크 | `/api/*` 40건 모두 GET | ✅ |
| 3 | 자가검사 주입 요소 | 둘 다 잡힘 | ✅ |
| 4 | §5.4 출력 줄 | 5줄 중 2줄만 런타임 관찰 | ⚠️ |

**Runtime Match Rate**: 6/7 (⚠️ 2건 각 반감) = **85.7%**

`/posts@390` 숨김잘림 8건 상세: 초안 만들기의 재료 선택 목록(`max-h-56 overflow-y-auto`) 안 `span.line-clamp-2` 279개 중 8개. 내용이 `[RSS - TechCrunch] / Title: … / Link: https://techcrunch.com/…` 3줄 이상이고, 98자짜리 URL이 끊기지 않아 상자보다 6~9px 넓다. `line-clamp-2`라 URL이 있는 3번째 줄은 원래 화면에 안 보인다 → **사용자에게 보이는 잘림 아님**. 430px에서는 0건.

### 2.8 Match Rate Summary

```
┌─────────────────────────────────────────────┐
│  Structural Match Rate:  100%                │
│  Functional Match Rate:   96%                │
│  Contract Match Rate:     87.5%              │
│  Runtime Match Rate:      85.7%              │
│  ─────────────────────────────────────────── │
│  Overall Match Rate:      90.9%              │
│  = 15.0 + 24.0 + 21.9 + 30.0                 │
└─────────────────────────────────────────────┘
```

---

## 3. Code Quality Analysis

### 3.1 Issues

| ID | Severity | Location | Issue | Fix |
|----|----------|----------|-------|-----|
| I-1 | 🟡 Important | `check-mobile-overflow.js:47` 숨김 잘림 조건 | `line-clamp`(여러 줄 말줄임) 요소를 숨김 잘림으로 센다. 의도된 숨김이라 매번 `/posts@390`에 8건이 뜨고, 사용자가 이 열을 무시하게 된다 | `truncate`처럼 제외: `getComputedStyle().webkitLineClamp`가 `none`이 아니면 건너뜀 |
| M-1 | 🟢 Minor | `:64` `selfTest` | 첫 화면 로딩이 15초를 넘으면 빈 문서라 `not-app`이 되어 "19auto-blog 탭에서 실행하세요"가 나온다(실제로는 로딩 실패) | `ok`가 false면 `'load-fail'` + "첫 화면 로딩 실패 — 다시 실행" |
| M-2 | 🟢 Minor | 설계 §3·§5.2·§5.3 | `selfTest` 값, `error` 필드, 객체 비교 방식이 문서와 다름 | 설계 문서 갱신 |

### 3.2 Security

| Check | Result |
|-------|--------|
| 쓰기 요청 | 0건 (런타임 확인) |
| 외부 URL | 받지 않음, `location.origin + path`만 |
| 비밀 정보 | 읽지 않음 |

---

## 4. Performance

| 항목 | 측정 | 비고 |
|------|------|------|
| 전체 실행 | 약 60초 (자가검사 + 14회 × 약 3.5초) | 설계 예상과 같음 |

---

## 5. Test Coverage

백엔드·프론트 코드 변경 없음 → 기존 테스트 영향 없음. 스니펫은 자가검사가 측정기 자체 검사 역할.

---

## 6. Clean Architecture Compliance

해당 없음. 앱 코드 밖 `scripts/` 개발 도구 1개, 앱 코드를 import하지 않음.

---

## 7. Convention Compliance

| 항목 | 결과 |
|------|------|
| 파일 머리 한국어 주석(무엇 + 실행 방법) | ✅ `check-ideogram.js`와 같은 형식 |
| 출력 문구 한국어 | ✅ |
| camelCase 함수 / UPPER_SNAKE 상수 | ✅ |
| 전역 오염 | ✅ `window.__mobileOverflow` 하나 |

---

## 8. Overall Score

Match Rate **90.9%** — 기준(90%) 통과. Important 1건, Minor 2건.

---

## 9. Recommended Actions

| Priority | Item | File |
|----------|------|------|
| 🟡 1 | I-1 line-clamp 제외 | `scripts/check-mobile-overflow.js` |
| 🟢 2 | M-1 자가검사 로딩 실패 문구 | `scripts/check-mobile-overflow.js` |
| 🟢 3 | M-2 설계 문서 갱신 | `docs/02-design/features/mobile-overflow.design.md` |
| — | §5.4 출력 줄 런타임 확인: 콘솔 메서드를 감싸 로그를 배열에 모은 뒤 재실행 | 검증 방법 |

---

## 10. Design Document Updates Needed

- [x] §3 `selfTest` 값에 `'not-app'`·`'load-fail'`, `error` 필드 추가 (설계 v0.2)
- [x] §5.2 제외 조건에 `line-clamp` 추가 (설계 v0.2)
- [x] §5.3 주입 요소 식별을 객체 비교로 정정, 실패 3종 표로 정리 (설계 v0.2)

---

## 11. Separate Finding (범위 밖)

운영 `/posts`의 글 이미지 `/api/images/*.png` 6개가 측정 중 모두 **503**. 글 이미지가 운영 화면에 안 보일 가능성이 있다. `docs/bkit-next-prompts.md` 3번(prod-ui-check)과 겹친다. 이 사이클에서는 다루지 않는다.

---

## 12. Act-1 재검사 (2026-10-19, 사용자 선택: 지금 모두 수정)

### 12.1 수정 내용

| ID | 수정 | 위치 |
|----|------|------|
| I-1 | 숨김 잘림 조건에 `(style.webkitLineClamp \|\| 'none') === 'none'` 추가 | `scripts/check-mobile-overflow.js:48` |
| M-1 | 자가검사에서 `ok`가 false면 `'load-fail'` 반환, 실패 문구 3종을 `SELF_TEST_ERRORS`로 정리 | `:65`, `:80-90` |
| M-2 | 설계 문서 §3·§5.2·§5.3·§6 갱신 | 설계 v0.2 |

### 12.2 재실행 결과 (운영, 콘솔 메서드를 감싸 로그를 배열에 모아 확인)

| 항목 | 결과 |
|------|------|
| 자가검사 | `pass` (line-clamp 제외 후에도 주입한 숨김 잘림을 잡음) |
| 14개 조합 넘침 | 모두 0 |
| 14개 조합 숨김잘림 | 모두 0 (`/posts@390` 8 → 0) |
| §5.4 출력 | 자가검사 1줄 + 진행 14줄 + `console.table` 14행·6열 + 결론 "통과: 14개 조합 모두 넘침 0" 전부 확인. 상세는 0이 아닌 행이 없어 출력 없음(정상) |
| `node --check` | 통과 |

M-1(`load-fail`)은 네트워크 지연을 재현하기 어려워 코드로만 확인했다.

### 12.3 Match Rate (재계산)

```
┌─────────────────────────────────────────────┐
│  Structural Match Rate:  100%                │
│  Functional Match Rate:  100%                │
│  Contract Match Rate:    100%                │
│  Runtime Match Rate:     100%  (7/7)         │
│  ─────────────────────────────────────────── │
│  Overall Match Rate:     100%                │
└─────────────────────────────────────────────┘
```

남은 일: SC-4(gbrain 기록)는 보고서 단계에서.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-19 | 첫 분석 (90.9%) | jeh-lab |
| 0.2 | 2026-10-19 | Act-1: I-1·M-1·M-2 수정 후 재검사 (100%) | jeh-lab |
