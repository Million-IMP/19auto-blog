# palette-mobile Design Document

> **Summary**: 명령창을 휴대폰에서 화면 위쪽에 붙이고, 화면 키보드를 뺀 실제 보이는 높이(visualViewport)에 맞춰 목록 높이를 정한다. 데스크톱 동작은 그대로 둔다.
>
> **Project**: 19auto-blog
> **Version**: master a9a311f
> **Author**: jeh-lab (with Claude)
> **Date**: 2026-10-16
> **Status**: Draft
> **Planning Doc**: [palette-mobile.plan.md](../../01-plan/features/palette-mobile.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 휴대폰에서 명령창이 데스크톱 전제(단축키 안내, 12vh 위치, 50vh 목록)로 그려져 쓰기 불편하고, 모바일 확인이 안 된 채 머지됐다 |
| **WHO** | 휴대폰으로 사이트를 여는 운영자 1인 (URL·메모를 바로 넣고 싶을 때) |
| **RISK** | 데스크톱 명령창 동작(Ctrl/⌘K, ↑↓, Enter)을 깨뜨림 |
| **SUCCESS** | 390px에서 가로 스크롤 0, 키보드가 올라와도 첫 결과가 보임, 검증 4단계 통과 |
| **SCOPE** | 1) 명령창 모바일 다듬기 2) 대시보드 마스트헤드·공정선 390px 점검·수정 |

---

## 1. Overview

### 1.1 Design Goals

- 768px 미만에서 명령창이 화면 키보드에 가려지지 않는다.
- 768px 이상에서는 명령창의 위치·크기·키 동작이 지금과 같다.

### 1.2 Design Principles

- 반응형은 Tailwind `md:`(768px, AppShell과 같은 기준)로 나눈다.
- JS는 높이 측정 하나만 추가한다. 키 처리 로직은 건드리지 않는다.

### 1.3 Plan 대비 변경

- Plan §7.2 "높이 단위 `dvh`" → **`visualViewport.height`** 로 바꾼다. iOS Safari·Android Chrome(108+)은 화면 키보드가 올라와도 `dvh`가 줄지 않는다. 키보드를 뺀 높이는 `window.visualViewport`만 알려 준다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | A: Minimal | B: Clean | C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | Tailwind 클래스만 | 훅 파일 분리 + 컴포넌트 분할 | 클래스 + 명령창 안 visualViewport 측정 |
| **New Files** | 0 | 2~3 | 0 |
| **Modified Files** | 1 | 2~3 | 1 (+ 대시보드는 점검 결과에 따라) |
| **Complexity** | Low | High | Low |
| **Maintainability** | Medium | High | Medium |
| **Effort** | ~15분 | ~1시간 | ~30분 |
| **Risk** | Low (키보드 가림 미해결) | Medium (구조 변경) | Low |
| **Recommendation** | 빠른 수정 | 재사용 필요 시 | **기본값** |

**Selected**: **C — Pragmatic** — 키보드 가림까지 해결하면서 바뀌는 파일이 하나다. visualViewport를 쓰는 곳이 명령창 하나뿐이라 훅을 따로 뺄 이유가 아직 없다 (YAGNI).

### 2.1 Component Diagram

```
AppShell
 ├─ MobileNav (md 미만) ── 검색 버튼 ─┐
 ├─ Rail (md 이상) ─────── 검색 버튼 ─┼─ openCommandPalette() → OPEN_PALETTE_EVENT
 └─ CommandPalette ◄─────────────────┘
      ├─ [신규] visualViewport resize 구독 (열려 있을 때만) → --palette-vh
      ├─ 바깥 틀: 모바일 pt-3 / md:pt-[12vh]
      ├─ 목록: max-h-[calc(var(--palette-vh)-88px)] / md:max-h-[50vh]
      └─ 하단 안내: hidden / md:flex
```

### 2.2 Data Flow

```
명령창 열림 → visualViewport.height 읽기 → panel style에 --palette-vh 설정
화면 키보드 올라옴 → visualViewport 'resize' → --palette-vh 갱신 → 목록 max-height 줄어듦
명령창 닫힘 → 구독 해제
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| CommandPalette | `window.visualViewport` (없으면 `innerHeight`) | 키보드를 뺀 보이는 높이 |

---

## 3. Data Model

해당 없음 (DB·타입 변경 없음).

## 4. API Specification

해당 없음 (기존 `GET /api/posts`, `POST /api/inbox` 그대로).

---

## 5. UI/UX Design

### 5.1 Screen Layout (390px, 명령창 열림)

```
┌──────────── 390 ────────────┐
│ 12px                        │
│ ┌─────────────────────────┐ │
│ │ 🔍 검색하거나 URL·메모…   │ │  입력 56px
│ ├─────────────────────────┤ │
│ │ 실행                     │ │
│ │ ▶ 지금 한 바퀴 돌리기     │ │  목록: 보이는 높이 - 88px
│ │ 이동 …                   │ │  (키보드 올라오면 같이 줄어듦)
│ └─────────────────────────┘ │
│ (하단 키 안내 없음)           │
├─────────── 화면 키보드 ───────┤
```

88px = 위 여백 12 + 입력 56 + 패널 테두리 2 + 아래 여유 18.

### 5.2 User Flow

모바일 상단 🔍 → 명령창(입력칸 포커스, 키보드 올라옴) → 입력 → 결과 탭 → 이동/수집함 넣기

### 5.3 Component List

| Component | Location | Change |
|-----------|----------|--------|
| CommandPalette | `frontend/src/components/layout/CommandPalette.tsx` | 바깥 틀 여백, 목록 높이, 하단 안내 숨김, 안내 문구, 높이 측정 effect |
| Masthead | `frontend/src/pages/DashboardPage.tsx` | 390px 측정 결과 깨질 때만 |

### 5.4 Page UI Checklist

#### 명령창 (모바일 390px)

- [ ] 상단 🔍 버튼으로 열림
- [ ] 패널이 화면 위에서 12px 아래에 붙음
- [ ] 하단 `↑↓ 고르기 / Enter 실행 / Ctrl K` 안내가 안 보임
- [ ] 입력칸 안내 문구가 한 줄에 다 보임: `검색하거나 URL·메모 붙여넣기`
- [ ] 보이는 높이 500px일 때 목록이 패널 밖으로 넘치지 않음
- [ ] 가로 스크롤 없음

#### 명령창 (데스크톱 1280px)

- [ ] Ctrl K로 열고 닫힘
- [ ] 패널 위치 12vh, 목록 최대 50vh (지금과 같음)
- [ ] 하단 키 안내 보임, 하단에 "URL·메모 붙여넣기 → 수집함" 안내가 추가로 보임 (v0.2: 한 줄 폭에 맞게 축약)

#### 대시보드 (390px)

- [ ] 날짜 줄·배지·`설정`/`지금 한 바퀴` 버튼이 줄바꿈되고 가로 스크롤 없음
- [ ] 제호 `AutoBlog 편집국`이 한 줄 또는 깨끗하게 줄바꿈
- [ ] 오늘의 헤드라인·바로가기 링크가 세로로 쌓임
- [ ] 단계 열은 가로로 넘겨 보는 방식 유지 (의도된 동작)

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| `window.visualViewport` 없음 (구형 브라우저) | `window.innerHeight` 사용 |
| 보이는 높이가 매우 작음 (가로 모드 + 키보드) | 목록 최소 높이 120px 보장 (`max(120px, …)`) |

## 7. Security Considerations

해당 없음 (입력·전송 경로 변경 없음).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L1: 정적 검증 | 타입·린트·빌드·백엔드 테스트 | CLAUDE.md 검증 4단계 | Do |
| L2: UI Action | 명령창 열기·검색·이동 | Chrome MCP | Check |
| L3: 레이아웃 | 390×844, 390×500, 1280×800 | Chrome MCP + JS 측정 | Check |

### 8.2 L1

- `npx --prefix backend tsc --noEmit --esModuleInterop --skipLibCheck backend/src/index.ts`
- `npm run lint --prefix frontend` (새 경고 0)
- `npm run build --prefix frontend`
- `npm test --prefix backend`

### 8.3 L2: UI Action

| # | Width | Action | Expected |
|---|-------|--------|----------|
| 1 | 390 | 상단 🔍 클릭 | 명령창 열림, 입력칸 포커스 |
| 2 | 390 | "OKR" 입력 → 첫 글 결과 탭 | `/posts#post-ID`로 이동, 해당 글로 스크롤 |
| 3 | 1280 | Ctrl K → ↓ → Enter | 두 번째 항목 실행 |
| 4 | 1280 | Esc | 닫힘, 포커스 원위치 |

### 8.4 L3: 레이아웃 측정

| # | Viewport | Measure | Expected |
|---|----------|---------|----------|
| 1 | 390×844 | `document.documentElement.scrollWidth` (대시보드) | ≤ 390 |
| 2 | 390×844 | 명령창 열림 상태 scrollWidth | ≤ 390 |
| 3 | 390×500 | 패널 `getBoundingClientRect().bottom` | ≤ 500 |
| 4 | 1280×800 | 패널 top | ≈ 96px (12vh) |

Chrome 창 크기 조절이 안 되면 390px 너비 iframe 안에 `localhost:5173`을 띄워 측정한다.

### 8.5 Seed Data

로컬 DB의 기존 글 사용 (제목에 "OKR" 포함 글 있음, PR #16 때 확인).

---

## 9. Clean Architecture

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| CommandPalette | Presentation | `frontend/src/components/layout/` |
| Masthead | Presentation | `frontend/src/pages/DashboardPage.tsx` |

## 10. Coding Convention Reference

### 10.4 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| 반응형 기준 | `md:` 768px (AppShell과 같음) |
| 주석 | 한국어 한 줄, 기존 파일 밀도에 맞춤 |
| UI 문구 | 한국어 |
| CSS 변수 | 컴포넌트 지역 변수 `--palette-vh` (inline style) |

---

## 11. Implementation Guide

### 11.1 File Structure

```
frontend/src/components/layout/CommandPalette.tsx   (수정)
frontend/src/pages/DashboardPage.tsx                 (점검 후 필요 시 수정)
```

### 11.2 Implementation Order

1. [ ] CommandPalette: `viewportH` state + 열려 있을 때만 `visualViewport` resize 구독
2. [ ] CommandPalette: 바깥 틀 `pt-3 px-3 md:px-4 md:pt-[12vh]`
3. [ ] CommandPalette: panel에 `style={{ '--palette-vh': `${viewportH}px` }}`, 목록 `max-h-[max(120px,calc(var(--palette-vh)-88px))] md:max-h-[50vh]`
4. [ ] CommandPalette: 하단 안내 `hidden md:flex`, 안내 문구 `검색하거나 URL·메모 붙여넣기`, 하단에 수집함 안내 추가
5. [ ] 검증 4단계
6. [ ] 대시보드 390px 측정 → 깨진 곳만 수정 → 검증 4단계

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 명령창 모바일 | `module-1` | 11.2의 1~5 | 3~4 |
| 대시보드 점검 | `module-2` | 11.2의 6 (측정 후 필요 시 수정) | 2~3 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| Session 1 | Do | `--scope module-1` | 3~4 |
| Session 2 | Do + Check | `--scope module-2`, 이후 analyze | 4~5 |

한 세션에 다 해도 되는 크기다 (약 35줄).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-16 | Initial draft (Option C) | jeh-lab (with Claude) |
| 0.2 | 2026-10-16 | §5.4 하단 안내 문구를 구현에 맞춤 (Check 결과) | jeh-lab (with Claude) |
