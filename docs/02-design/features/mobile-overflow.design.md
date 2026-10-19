# mobile-overflow Design Document

> **Summary**: 휴대폰 너비 가로 넘침·잘림을 개발자도구 콘솔에서 한 번에 재는 점검 스니펫(자가검사 포함)과 검증 순서 한 줄.
>
> **Project**: 19auto-blog
> **Author**: jeh-lab
> **Date**: 2026-10-19
> **Status**: Draft
> **Planning Doc**: [mobile-overflow.plan.md](../../01-plan/features/mobile-overflow.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 헤드리스 캡처에서 휴대폰 화면 오른쪽 잘림이 보고됐으나 운영 측정에서는 재현되지 않음 |
| **WHO** | 휴대폰으로 대시보드를 여는 운영자·방문자 |
| **RISK** | 실제 휴대폰(iOS Safari 글자 크기 보정, 주소창 높이 등)에서만 생기는 넘침을 데스크톱 측정이 놓쳤을 수 있음 |
| **SUCCESS** | 실제 휴대폰에서 7개 페이지 가로 스크롤 없음 + 점검 스니펫이 14개 조합 모두 0건 보고 |
| **SCOPE** | ① 실폰 확인(사용자) ② 점검 스니펫 1개 추가 ③ 결과 기록 후 종료. 화면 CSS 수정 없음 |

SC-1(실폰 확인)은 2026-10-19 사용자 확인으로 통과. 기종·브라우저는 기록되지 않았다.

---

## 1. Overview

### 1.1 Design Goals

- 같은 의심이 다시 생겼을 때 콘솔에 붙여 넣기 한 번으로 7개 페이지 × 390·430px 결과를 받는다.
- 스니펫이 넘침을 실제로 잡아내는지 매번 스스로 확인한다. 자가검사가 실패하면 측정 결과를 내지 않는다.
- 화면 밖으로 나간 요소(문서가 넓어짐)와 `overflow: hidden`에 가려 잘린 내용(문서는 그대로) 두 가지를 모두 본다.

### 1.2 Design Principles

- **읽기 전용**: 버튼을 누르지 않고 입력하지 않는다. 페이지 로딩 때 나가는 GET 요청 외에는 요청이 없다.
- **의존성 0**: 브라우저 표준 API만 쓴다. npm 패키지·빌드 대상 아님.
- **측정 규칙은 오늘 측정과 동일**: 2026-10-19 계획 단계에서 쓴 규칙을 그대로 옮겨 결과를 비교할 수 있게 한다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | A: 스니펫만 | B: Playwright 테스트 | C: 스니펫+자가검사 |
|----------|:-:|:-:|:-:|
| **Approach** | 오늘 측정 코드를 파일로 | `tests/e2e/*.spec.ts` + 명령 실행 | A + 넘침 주입 자가검사 + 검증 순서 문서화 |
| **New Files** | 1 | 2 | 1 |
| **Modified Files** | 0 | 2 (package.json ×2) | 1 (CLAUDE.md) |
| **Complexity** | Low | High | Low |
| **Maintainability** | Medium (잊히기 쉬움) | High | High |
| **Effort** | 약 15분 | 약 1시간 | 약 25분 |
| **Risk** | 측정기 고장을 모름 | 새 의존성·브라우저 내려받기, 계획 NFR 위반 | 손으로 실행해야 함 |

**Selected**: C — **Rationale**: 의존성 0을 지키면서 측정기가 망가졌을 때 스스로 알린다. 검증 순서에 한 줄 넣어 잊히지 않게 한다.

### 2.1 Component Diagram

```
┌──────────────── 개발자도구 콘솔 (운영 또는 localhost:5173 탭) ────────────────┐
│ check-mobile-overflow.js                                                     │
│   selfTest() ──▶ openFrame('/', 390) ──▶ 넘침 요소 2개 주입 ──▶ findOverflow  │
│        │ 실패 → console.error, 중단                                          │
│        ▼ 통과                                                                │
│   for path × width: openFrame(path, w) ──▶ 3초 대기 ──▶ findOverflow ──▶ 제거 │
│        ▼                                                                     │
│   console.table(요약) + 0이 아닌 행 상세 + window.__mobileOverflow           │
└──────────────────────────────────────────────────────────────────────────────┘
          │ iframe(같은 출처) GET 로딩만
          ▼
   19auto-blog 프론트 (/, /inbox, /activity, /topics, /materials, /rules, /posts)
```

### 2.2 Data Flow

```
붙여넣기 → 자가검사 → (경로, 너비) 14개를 하나씩 iframe으로 열기 → 데이터 로딩 대기 → DOM 측정 → iframe 제거 → 표 출력
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `PATHS` 상수 | `frontend/src/App.tsx`의 `<Route path>` 7개 | 라우트가 늘면 함께 고친다 |
| `findOverflow` | `getBoundingClientRect`, `getComputedStyle` | 위치·overflow 측정 |

---

## 3. Data Model

DB 변경 없음. 스니펫 안의 결과 형태만 정한다.

```js
// 행 하나 = (경로, 너비) 하나
{
  경로: '/posts',
  너비: 390,          // iframe 너비
  화면폭: 375,        // documentElement.clientWidth (데스크톱 세로 스크롤바만큼 좁을 수 있음)
  문서폭: 375,        // documentElement.scrollWidth — iframe을 지우기 전에 읽는다
  넘침: 0,            // overflow 목록 길이
  숨김잘림: 0,        // clipped 목록 길이
}
// 상세: window.__mobileOverflow = { done, selfTest: 'pass'|'fail'|'not-app'|'load-fail', rows: [...], details: { '/posts@390': { overflow: [...], clipped: [...] } }, error? }
// error: 예상 못 한 예외가 나면 문자열로 남기고 done = true
// 상세 항목: '태그.클래스(80자) [글자 25자] L왼쪽 R오른쪽'
```

---

## 4. API Specification

새 API 없음. 스니펫은 페이지가 원래 로딩 때 부르는 GET `/api/*`만 일으킨다.
확인: 프론트의 `axios.post/put/patch/delete` 34곳은 모두 클릭·제출 핸들러 안에 있고 마운트 시 실행되는 곳은 없다(`useRssChannels.ts`, `CommandPalette.tsx` 포함 확인).

---

## 5. 측정 규칙 (UI 대신)

### 5.1 넘침 (overflow)

요소 `el`이 다음을 모두 만족하면 넘침으로 센다.

1. `getBoundingClientRect().width > 0`
2. `right > 화면폭 + 1` 또는 `left < -1`
3. `el`과 `body` 사이 조상 중 `overflow-x`가 `visible`이 아닌 것이 없음 — 가로 스크롤 영역(5열 보드 등) 안쪽은 의도된 배치라 뺀다. 그 영역 자체가 화면 밖으로 나가면 영역이 잡힌다.

### 5.2 숨김 잘림 (clipped)

HTML 요소 `el`이 다음을 모두 만족하면 숨김 잘림으로 센다.

1. `overflow-x`가 `hidden` 또는 `clip` (`auto`/`scroll`은 스크롤로 볼 수 있으니 제외)
2. `scrollWidth > clientWidth + 1`
3. `text-overflow`가 `ellipsis`가 아님 — `truncate` 말줄임은 의도된 것
4. `-webkit-line-clamp`가 `none` — `line-clamp-2` 같은 여러 줄 말줄임도 의도된 숨김 (분석 I-1: 재료 목록의 3번째 줄 URL이 매번 8건씩 잡혀 추가)
5. `clientWidth >= 2` — `sr-only` 같은 1px 요소 제외

### 5.3 자가검사

`/` 를 390px로 연 iframe에 아래 두 요소를 넣고 `findOverflow`를 돌린다.

| 주입 | 기대 |
|---|---|
| `<div style="width:600px;height:1px">` (body 끝) | overflow 목록에 잡힘 |
| `<div style="overflow:hidden;width:100px"><div style="width:300px;height:1px"></div></div>` (body 끝) | clipped 목록에 잡힘 |

주입한 요소는 속성 표시 없이 만든 요소 객체를 그대로 결과 목록과 비교해 찾는다.

| 결과 | `selfTest` | 출력 후 중단 |
|---|---|---|
| 첫 화면 15초 안에 로딩 못 함 | `load-fail` | "첫 화면을 15초 안에 불러오지 못했습니다. 네트워크를 확인하고 다시 실행하세요." |
| iframe 문서 접근 불가 또는 `#root` 없음 | `not-app` | "19auto-blog 탭(운영 또는 localhost:5173)에서 실행하세요." |
| 둘 중 하나라도 안 잡힘 | `fail` | "자가검사 실패 — 측정 결과를 믿지 마세요." |

### 5.4 Page UI Checklist

화면 변경 없음. 스니펫 출력 체크리스트:

- [ ] 진행 표시: `[3/14] /inbox 390px` 형식
- [ ] 자가검사 결과 한 줄 (통과/실패)
- [ ] `console.table` 요약 14행 (경로·너비·화면폭·문서폭·넘침·숨김잘림)
- [ ] 0이 아닌 행만 상세 목록 `console.log`
- [ ] 마지막 한 줄: 모두 0이면 "통과", 아니면 "넘침 N곳 — 위 상세 확인"
- [ ] `window.__mobileOverflow.done === true`

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| 다른 사이트 탭에서 실행 | iframe `#root` 없음 → 안내 문구 출력 후 중단 (`not-app`) |
| 자가검사 단계 첫 화면 로딩 15초 초과 | 네트워크 확인 안내 후 중단 (`load-fail`) |
| 자가검사 실패 | `console.error` 후 중단, `selfTest: 'fail'` |
| 한 경로 로딩 실패(onload 15초 초과) | 그 행 `넘침: '로딩 실패'`로 기록하고 다음 경로 계속 |
| 크롬이 붙여넣기 차단 | 파일 머리 주석에 "`allow pasting` 입력 후 다시 붙여 넣기" 안내 |

---

## 7. Security Considerations

- [x] 쓰기 요청 없음 (§4 근거)
- [x] 같은 출처 iframe만 연다 (`location.origin + path`) — 외부 URL을 받지 않는다
- [x] 비밀번호·환경 변수를 읽지 않는다

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L1: API | 해당 없음 (API 변경 없음) | — | — |
| L2: 스니펫 동작 | 자가검사·출력 형식 | Chrome MCP `javascript_tool` | Do |
| L3: 운영 측정 | 14개 조합 결과, 요청 종류 | Chrome MCP + `read_network_requests` | Check |

### 8.2 L2 시나리오

| # | 동작 | 기대 결과 |
|---|------|----------|
| 1 | 운영 탭에서 스니펫 실행 | 자가검사 "통과" 출력 |
| 2 | `findOverflow`에 넘침 주입 대신 정상 페이지 | 넘침 0, 숨김잘림 0 |
| 3 | `about:blank` 탭에서 실행 | "19auto-blog 탭에서 실행하세요" 후 중단 |

### 8.3 L3 시나리오

| # | 대상 | 기대 결과 |
|---|------|----------|
| 1 | 운영 7경로 × 390·430 | 14행 모두 넘침 0 (SC-2) |
| 2 | 같은 실행 중 네트워크 | POST/PUT/PATCH/DELETE 0건 (NFR 안전) |
| 3 | 자가검사 주입 요소 | 두 요소 모두 잡힘 (SC-3) |

숨김잘림은 참고값이다. 0이 아니면 상세를 보고 의도된 것인지 판단해 분석 문서에 적는다(실패로 치지 않음).

### 8.4 측정 한계 (분석 문서에 그대로 적는다)

- 데스크톱 iframe은 세로 스크롤바만큼 화면폭이 좁다(390 → 약 375). 실제 휴대폰보다 엄격한 쪽이다.
- 터치 전용 미디어 쿼리(`pointer: coarse` 등)와 iOS 글자 크기 자동 보정은 재현하지 않는다 → 실폰 확인(SC-1)으로 보완.

---

## 9. Clean Architecture

해당 없음. 앱 코드 밖의 개발 도구 파일 하나다.

| Component | Layer | Location |
|-----------|-------|----------|
| 점검 스니펫 | 개발 도구 | `scripts/check-mobile-overflow.js` |

---

## 10. Coding Convention Reference

| Item | Convention Applied |
|------|-------------------|
| 파일 머리 | `scripts/check-ideogram.js`처럼 한국어 두 줄: 무엇을 하는지 + 실행 방법 |
| 출력 문구 | 한국어 |
| 함수 이름 | camelCase (`openFrame`, `findOverflow`, `selfTest`) |
| 상수 | UPPER_SNAKE_CASE (`PATHS`, `WIDTHS`, `WAIT_MS`) |
| 실행 형태 | 붙여넣기 실행이 되도록 전체를 async 즉시실행 함수 하나로 감싼다(전역 오염 최소화, 결과만 `window.__mobileOverflow`) |

---

## 11. Implementation Guide

### 11.1 File Structure

```
scripts/
└── check-mobile-overflow.js   (새 파일, 약 90줄)
CLAUDE.md                      (검증 순서에 5번 한 줄 추가)
docs/01-plan/features/mobile-overflow.plan.md (SC-1 결과 기록)
```

### 11.2 Implementation Order

1. [ ] `scripts/check-mobile-overflow.js`
   - 상수: `PATHS`(App.tsx 7개), `WIDTHS = [390, 430]`, `HEIGHT = 844`, `WAIT_MS = 3000`, `LOAD_TIMEOUT_MS = 15000`
   - `openFrame(path, width)` → iframe 생성(fixed, 왼쪽 위, 최상단) → onload 또는 타임아웃 → `WAIT_MS` 대기 → `{ frame, doc, win }`
   - `findOverflow(doc, win)` → `{ overflow: [...], clipped: [...] }` (§5.1·5.2 규칙)
   - `selfTest()` (§5.3)
   - 본체: 자가검사 → 14회 측정(문서폭은 iframe 제거 전에 읽음) → 표·상세·결론 출력
2. [ ] `CLAUDE.md` 검증 순서 5번:
   `5. 화면을 바꿨으면 휴대폰 너비 점검: 운영 또는 localhost:5173 탭 개발자도구 콘솔에 scripts/check-mobile-overflow.js 내용을 붙여 넣는다 (7개 페이지 × 390·430px, 넘침 0이면 통과).`
3. [ ] 계획서 §1.2에 실폰 확인 결과 행 추가, SC-1 체크
4. [ ] L2 시나리오 3개를 Chrome MCP로 확인

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 점검 스니펫 | `module-1` | 11.2의 1·4 | 3~4 |
| 문서 반영 | `module-2` | 11.2의 2·3 | 1 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| Session 1 | Do | 전체 (`module-1`, `module-2`) | 4~5 |
| Session 2 | Check + Report | 전체 | 3~4 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-19 | 설계안 C 선택, 측정 규칙·자가검사 확정 | jeh-lab |
| 0.2 | 2026-10-19 | 분석 반영: line-clamp 제외(I-1), 자가검사 load-fail(M-1), 결과 형태·식별 방식 정정(M-2) | jeh-lab |
