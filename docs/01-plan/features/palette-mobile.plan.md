# palette-mobile Planning Document

> **Summary**: 휴대폰(390px)에서 명령창을 손가락으로 제대로 쓸 수 있게 다듬고, PR #16에서 남은 모바일 화면 점검을 끝낸다.
>
> **Project**: 19auto-blog
> **Version**: master a9a311f
> **Author**: jeh-lab (with Claude)
> **Date**: 2026-10-16
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 명령창이 데스크톱 키보드 기준으로 만들어져, 휴대폰에서는 쓸 수 없는 단축키 안내가 보이고 가상 키보드가 목록을 가릴 수 있다. PR #16의 모바일 폭 확인도 비어 있다. |
| **Solution** | 터치 화면에서는 키보드 안내를 숨기고, 명령창을 화면 위쪽에 붙여 키보드가 올라와도 목록이 보이게 한다. 대시보드 마스트헤드·공정선을 390px에서 점검해 깨지는 곳만 고친다. |
| **Function/UX Effect** | 휴대폰에서 상단 검색 버튼 → 검색/이동/수집함 넣기가 가로 스크롤·가림 없이 된다. |
| **Core Value** | 이동 중에도 URL·메모를 바로 수집함에 넣을 수 있다 (수집이 이 도구의 첫 단계). |

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

### 1.1 Purpose

휴대폰에서 명령창(검색·이동·수집함 넣기)을 불편 없이 쓰게 하고, PR #16의 미확인 항목(모바일 폭)을 닫는다.

### 1.2 Background

- PR #16(편집국 디자인)에서 Ctrl/⌘K 명령창과 모바일 상단 검색 버튼을 추가했다.
- 당시 Chrome 창 크기 조절이 적용되지 않아 모바일 폭 확인을 못 했다 (PR 체크리스트 미완료).
- 코드 검토로 찾은 문제 후보 (`frontend/src/components/layout/CommandPalette.tsx`):
  1. 하단 `↑↓ 고르기 / Enter 실행 / Ctrl K 언제든 열기` 안내가 터치 화면에도 보인다.
  2. 창이 `pt-[12vh]`에서 시작하고 목록이 `max-h-[50vh]`라, 가상 키보드가 올라오면 목록 아래쪽이 가려질 수 있다.
  3. 입력칸 안내 문구가 길어 390px에서 잘린다.

### 1.3 Related Documents

- PR #16: https://github.com/Million-IMP/19auto-blog/pull/16
- gbrain: `decisions/19auto-blog-editorial-design`

---

## 2. Scope

### 2.1 In Scope

- [ ] 명령창: 터치(좁은 화면)에서 키보드 안내 숨김
- [ ] 명령창: 모바일에서 화면 위쪽에 붙고, 목록 높이가 가상 키보드를 고려 (`dvh` 기준)
- [ ] 명령창: 모바일 입력칸 안내 문구 짧게
- [ ] 대시보드 마스트헤드(날짜 줄·제호·헤드라인) 390px 점검, 깨지면 수정
- [ ] 모바일 상단바·명령창 버튼 390px 점검

### 2.2 Out of Scope

- 모바일 전용 새 진입점(하단 빠른 넣기 버튼 등)
- 대시보드 외 페이지 레이아웃 개편
- 백엔드 변경
- 명령창 '지금 한 바퀴' 실제 실행 (AI 비용)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 768px 미만에서 명령창 하단 키보드 안내(↑↓·Enter·단축키)를 숨긴다. 데스크톱은 그대로 | High | Pending |
| FR-02 | 768px 미만에서 명령창을 화면 위쪽 가까이 띄우고, 목록 최대 높이를 가상 키보드가 올라와도 첫 결과들이 보이도록 잡는다 | High | Pending |
| FR-03 | 768px 미만에서 입력칸 안내 문구를 한 줄에 들어가는 짧은 문구로 바꾼다 | Medium | Pending |
| FR-04 | 390px에서 대시보드 마스트헤드·헤드라인·액션 버튼이 가로 스크롤 없이 줄바꿈된다 | High | Pending |
| FR-05 | 데스크톱 명령창 동작(Ctrl/⌘K 토글, ↑↓, Enter, Esc, 클릭)은 바뀌지 않는다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Layout | 390px 폭에서 `document.documentElement.scrollWidth <= 390` | Chrome에서 390px로 열고 JS로 측정 |
| Accessibility | 기존 combobox/listbox/option 역할과 aria 속성 유지 | 코드 diff 확인 |
| Motion | 기존 reduced-motion 처리 유지 | index.css diff 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-05 구현
- [ ] 390px 화면 확인: 대시보드·명령창 열린 상태에서 가로 스크롤 없음, 명령창 첫 결과가 보임
- [ ] 1280px 화면 확인: 명령창 데스크톱 동작 그대로
- [ ] PR 생성, PR #16 미확인 항목(모바일 폭) 결과 기록

### 4.2 Quality Criteria (CLAUDE.md 검증 순서)

- [ ] 백엔드 타입체크 통과
- [ ] 프론트 린트: 새 경고·오류 0 (기존 경고 1건은 유지)
- [ ] 프론트 빌드 통과
- [ ] 백엔드 테스트 통과

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 데스크톱 명령창 동작이 바뀜 | High | Low | Tailwind `md:` 반응형 클래스만 추가, 키 처리 로직은 건드리지 않음. 1280px에서 재확인 |
| Chrome 창 크기 조절이 또 적용 안 됨 (PR #16 때) | Medium | Medium | `resize_window` 실패 시 DevTools 없이 iframe(390px) 안에 페이지를 띄워 측정 |
| 가상 키보드는 데스크톱 Chrome에서 재현 불가 | Medium | High | `dvh` 단위로 높이를 잡고, 낮은 높이(390×500)로 창을 줄여 대신 확인 |
| 다른 Claude 창이 같은 폴더에서 브랜치를 바꿈 | Medium | Medium | 이 작업은 `feat/palette-mobile`에서만, 커밋 전 `git branch --show-current` 확인 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `CommandPalette.tsx` | UI Component | 반응형 클래스·안내 문구 분기 추가 |
| `DashboardPage.tsx` (Masthead) | UI Component | 390px 점검 결과에 따라 줄바꿈 클래스 수정 (필요 시만) |
| `AppShell.tsx` (MobileNav) | UI Component | 점검만, 필요 시 수정 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| CommandPalette | READ | `AppShell.tsx` → `<CommandPalette />` (전 페이지) | Needs verification (데스크톱 동작) |
| openCommandPalette | READ | `AppShell.tsx` Rail·MobileNav 검색 버튼 | None (이벤트 이름 그대로) |
| Masthead | READ | `DashboardPage.tsx` 한 곳 | Needs verification |

### 6.3 Verification

- [ ] 데스크톱 1280px: Ctrl K → 검색 → Enter 이동 확인
- [ ] 모바일 390px: 검색 버튼 → 명령창 → 글 검색 → 이동 확인
- [ ] API·DB 변경 없음

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, backend | Web apps with backend | ☑ |
| **Enterprise** | Strict layer separation | High-traffic systems | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | React 19 + Vite | 기존 유지 | 변경 없음 |
| 반응형 처리 | CSS(Tailwind `md:`) / JS `matchMedia` | Tailwind `md:` 우선 | 기존 코드가 `md:` 768px 기준으로 모바일을 나눔 (AppShell) |
| 높이 단위 | `vh` / `dvh` | `dvh` | 모바일 주소창·키보드에 따라 바뀌는 실제 보이는 높이 |
| Styling | Tailwind 4 + `index.css` 토큰 | 기존 유지 | 디자인 토큰 그대로 |
| Testing | vitest(백엔드) + Chrome 화면 확인 | 기존 유지 | 프론트 단위 테스트 없음 |

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` 규칙 (UI 텍스트·커밋 한국어, npm, 검증 순서)
- [x] ESLint 설정 (`frontend/eslint.config.js`)
- [x] TypeScript 설정

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 모바일 기준 폭 | exists (`md:` = 768px) | 그대로 사용 | High |

### 8.3 Environment Variables Needed

없음.

---

## 9. Next Steps

1. [ ] `/bkit:pdca design palette-mobile` — 설계안 3가지 비교 후 선택
2. [ ] `/bkit:pdca do palette-mobile` — 파일 하나씩 수정, 매번 확인
3. [ ] `/bkit:pdca analyze palette-mobile` — 설계 대비 검증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-16 | Initial draft | jeh-lab (with Claude) |
