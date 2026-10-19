# mobile-overflow Planning Document

> **Summary**: 휴대폰 너비(390·430px) 대시보드 오른쪽 잘림 — 운영에서 재현되지 않음. 실제 휴대폰 확인으로 닫고, 재발 감지용 점검 스니펫만 추가한다.
>
> **Project**: 19auto-blog
> **Author**: jeh-lab
> **Date**: 2026-10-19
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 헤드리스 크롬 캡처(430px)에서 대시보드 오른쪽("지금 한 바퀴" 버튼·5열 보드)이 잘려 보였다. 운영 사이트를 390·430px로 다시 재 보니 넘치는 요소가 하나도 없었다. |
| **Solution** | 코드는 고치지 않는다. 실제 휴대폰으로 한 번 확인해 닫고, 다음에 같은 의심이 생기면 바로 재 볼 수 있는 브라우저 콘솔용 점검 스니펫을 `scripts/`에 둔다. |
| **Function/UX Effect** | 화면 변화 없음. 가로 넘침 의심이 생기면 개발자도구 콘솔에 붙여 넣기 한 번으로 7개 페이지 × 2개 너비 결과를 받는다. |
| **Core Value** | 재현 안 되는 문제에 예방 CSS를 덧대지 않는다. 확인 근거를 남기고 점검 수단만 남긴다. |

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

## 1. Overview

### 1.1 Purpose

휴대폰 너비에서 화면이 잘리는지 실제로 확인하고, 잘리지 않으면 근거를 남겨 이 후보를 닫는다.

### 1.2 Background — 2026-10-19 운영 측정 결과

측정 방법: 운영 사이트(https://19auto-blog.vercel.app)를 크롬에서 열고, 같은 출처의 iframe을 390px·430px 너비로 띄워
화면 너비 밖으로 나가는 요소를 전부 찾았다. 가로 스크롤 영역(`overflow-x: auto` 등) 안쪽 요소는 의도된 스크롤이므로 제외했다.

| 확인 대상 | 390px | 430px |
|---|---|---|
| `/` 대시보드 | 넘침 0 | 넘침 0 |
| `/inbox`, `/activity`, `/topics` | 넘침 0 | 넘침 0 |
| `/materials`, `/rules`, `/posts` | 넘침 0 | 넘침 0 |
| 대시보드 ☰ 메뉴 열림 / 명령창 열림 | 넘침 0 | — |
| `/posts` 원문보기 3개 펼침 + `details` 전부 펼침 | 넘침 0 | — |
| 실제 휴대폰 (사용자 확인, 2026-10-19, 기종·브라우저 미기재) | 잘림 없음 | 잘림 없음 |

세부 관찰:
- **"지금 한 바퀴" 버튼**: 390px에서 x 256–355. 화면 안에 있다.
- **5열 보드**: `overflow-x-auto snap-x` 가로 스크롤 영역이다. 카드 폭 82%로 다음 열 일부가 보이게 만든 의도된 배치이며 페이지 자체는 넓어지지 않는다(문서 `scrollWidth` = 화면 너비).
- 데스크톱 iframe은 세로 스크롤바(약 15px)를 차지해 실제 휴대폰보다 오히려 좁게 측정됐다. 그래도 넘침이 없었다.
- 2026-10-16 palette-mobile 사이클에서도 "390px 대시보드 넘침 없음, 코드 변경 없음"으로 기록돼 있다.

헤드리스 캡처에서 잘려 보인 원인은 확인하지 못했다. 헤드리스 크롬의 창 크기와 실제 화면 영역(viewport) 크기가 다르게 잡혀 캡처가 잘렸을 가능성이 있으나 검증하지 않았다.

캡처: `C:\Users\JK\AppData\Local\Temp\claude-chrome-screenshots-IxYDmY\screenshot-1792399824555-0.jpg` (390px iframe, 임시 파일)

### 1.3 Related Documents

- 핸드오프: `docs/bkit-next-prompts.md` 1번
- 이전 확인: `docs/archive/2026-10/palette-mobile/`

---

## 2. Scope

### 2.1 In Scope

- [ ] 사용자가 실제 휴대폰으로 7개 페이지를 열어 가로 스크롤·잘림이 없는지 확인
- [ ] `scripts/check-mobile-overflow.js` — 개발자도구 콘솔에 붙여 넣는 점검 스니펫(의존성 없음)
- [ ] 결과를 이 문서와 gbrain에 기록하고 사이클 종료

### 2.2 Out of Scope

- 예방용 CSS 추가(`overflow-wrap`, `overflow-x: hidden` 등) — 넘치는 곳이 없어 효과를 확인할 수 없음
- Playwright 등 브라우저 테스트 도구 도입 — 의존성이 늘어남. 필요해지면 별도 후보로
- AI 호출이 생기는 버튼(인스타·숏츠·스레드, 지금 한 바퀴 등) 누른 뒤 상태 측정

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 스니펫은 7개 경로 × 390·430px를 iframe으로 열어, 가로 스크롤 영역 밖에서 화면을 벗어난 요소 목록을 표로 출력한다 | High | Pending |
| FR-02 | 스니펫은 같은 출처에서만 동작하며 버튼을 누르거나 데이터를 바꾸지 않는다(읽기 전용) | High | Pending |
| FR-03 | 스니펫 실행이 개발자도구의 45초 제한에 걸리지 않도록 비동기로 돌고 끝나면 `console.table`로 결과를 낸다 | Medium | Pending |
| FR-04 | 실폰 확인 결과(기종·브라우저·페이지별 결과)를 이 문서 §1.2에 추가한다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 의존성 | 새 npm 패키지 0개 | `git diff package*.json` 비어 있음 |
| 안전 | 쓰기 요청(POST/PUT/DELETE) 0건 | 스니펫 실행 중 네트워크 탭 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [x] SC-1: 실제 휴대폰에서 7개 페이지 모두 가로 스크롤·잘림 없음 (사용자 확인, 2026-10-19)
- [ ] SC-2: 운영 사이트에서 스니펫 실행 시 14개 조합 모두 넘침 0건
- [ ] SC-3: 일부러 넓은 요소(예: `width:600px` div)를 넣으면 스니펫이 그 요소를 잡아냄
- [ ] SC-4: 결과가 이 문서와 gbrain에 기록됨

### 4.2 Quality Criteria

- [ ] 프론트 린트·빌드 영향 없음 (프론트 코드 변경 없음)
- [ ] 백엔드 테스트 영향 없음

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 실제 휴대폰에서만 생기는 넘침(iOS 글자 크기 보정, 긴 URL이 든 글 등) | Medium | Low | SC-1 실폰 확인. 잘리면 화면 캡처를 받아 이 사이클을 수정 계획으로 전환 |
| 데이터가 바뀌면(긴 제목·URL) 나중에 넘칠 수 있음 | Low | Medium | 스니펫을 남겨 언제든 재측정 |
| 스니펫이 의도된 가로 스크롤 영역까지 넘침으로 잡음 | Low | Low | 조상 중 `overflow-x`가 visible이 아닌 요소 안쪽은 제외(측정 때 쓴 규칙 그대로) |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `scripts/check-mobile-overflow.js` | 새 파일(개발 도구) | 브라우저 콘솔용 점검 스니펫. 빌드·배포에 포함되지 않음 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `scripts/` | READ | `scripts/start.js`, `prepare-db.js`는 이 파일을 참조하지 않음 | None |

### 6.3 Verification

- [x] 프론트·백엔드 코드 변경 없음 → 기존 기능 영향 없음

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic (Express + Prisma 백엔드, React 프론트). 이번 사이클은 코드 구조 변경이 없다.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 점검 방식 | Playwright 스크립트 / 브라우저 콘솔 스니펫 | 콘솔 스니펫 | 새 의존성 없음. 이번 측정에 실제로 쓴 방법 그대로 |
| 화면 수정 | 예방 CSS / 수정 안 함 | 수정 안 함 | 넘치는 곳이 없어 효과 검증 불가 |

---

## 8. Convention Prerequisites

- [x] `CLAUDE.md` 규칙: UI 텍스트·커밋 한국어, npm 사용
- [x] ESLint(frontend) — 스니펫은 `scripts/`라 대상 아님
- 환경 변수 추가 없음

---

## 9. Next Steps

1. [ ] 사용자: 휴대폰으로 https://19auto-blog.vercel.app 의 7개 페이지 열어 보기 (약 5분)
2. [ ] `/bkit:pdca design mobile-overflow` — 스니펫 구조 확정
3. [ ] 스니펫 작성·운영 실행(SC-2·SC-3) → 보고서 → archive

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-19 | 운영 측정 결과(재현 안 됨) 반영한 초안 | jeh-lab |
| 0.2 | 2026-10-19 | SC-1 실폰 확인 통과 기록, 설계안 C 선택(CLAUDE.md 검증 순서 한 줄 추가 포함) | jeh-lab |
