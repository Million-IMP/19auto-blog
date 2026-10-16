# palette-mobile Gap Analysis

> **Feature**: palette-mobile
> **Date**: 2026-10-16
> **Branch**: feat/palette-mobile (base master a9a311f)
> **Design**: [palette-mobile.design.md](./palette-mobile.design.md)
> **Match Rate**: **99%** (runtime 포함 공식)

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

## 1. Strategic Alignment

| Check | Result |
|-------|--------|
| WHY 해결 | ✅ 모바일에서 키 안내 숨김, 위쪽 고정, 보이는 높이 기준 목록 |
| RISK 회피 | ✅ 데스크톱 1280px에서 위치 96px(12vh)·목록 400px(50vh)·Ctrl K·↓·Enter·Esc 모두 기존과 같음 |
| Design 결정(Option C) 준수 | ✅ 파일 1개 수정, 훅 분리 없음 |

## 2. Plan Success Criteria

| Criterion | Status | Evidence |
|-----------|:------:|----------|
| 390px 가로 스크롤 0 (대시보드) | ✅ | scrollWidth 390, 넘친 요소 0 |
| 390px 가로 스크롤 0 (명령창 열림) | ✅ | scrollWidth 390 |
| 키보드가 올라와도 첫 결과 보임 | ⚠️ | 390×500으로 대신 측정: 패널 bottom 482 ≤ 500. 실제 휴대폰 키보드는 미확인 |
| 1280px 데스크톱 동작 그대로 | ✅ | L2-3·L2-4 통과 |
| 검증 4단계 | ✅ | tsc OK · lint 경고 20→20 (CommandPalette 0) · build OK · test 27/27 |
| PR 생성 | ⏳ | Report 단계 이후 |

## 3. Static Gap (Design §11.2 ↔ CommandPalette.tsx)

| # | Design | Implementation | Match |
|---|--------|----------------|:-----:|
| 1 | 열려 있을 때만 visualViewport resize 구독 | `useEffect([open])`, `target: EventTarget = viewport ?? window` | ✅ |
| 2 | 바깥 틀 `px-3 pt-3 md:px-4 md:pt-[12vh]` | 같음 | ✅ |
| 3 | `--palette-vh` inline style + 목록 `max(120px, calc(vh - 88px))` / `md:max-h-[50vh]` | `panelRef.style.setProperty`로 설정 (리렌더 없음), `var(--palette-vh,100dvh)` 기본값 추가 | ✅ (개선) |
| 4 | 하단 안내 `hidden md:flex` | 같음 | ✅ |
| 4 | 안내 문구 `검색하거나 URL·메모 붙여넣기` | 같음 | ✅ |
| 4 | 하단 안내 "URL·메모를 붙여넣으면 수집함에 넣기" | "URL·메모 붙여넣기 → 수집함" (폭 맞추려 축약) | ⚠️ 문구 차이 |
| 6 | 대시보드 깨진 곳만 수정 | 깨진 곳 없음 → 수정 없음 | ✅ |

Structural 100 · Functional 97 · Contract 100 (API 변경 없음)

## 4. Runtime Verification (Chrome, iframe으로 폭 고정)

| ID | Viewport | Result |
|----|----------|--------|
| L2-1 | 390 | 🔍 → 열림, 입력칸 포커스 ✅ |
| L2-2 | 390 | "OKR" → 글 탭 → `/posts#post-36`, 대상 top 80px (상단바 57 + scroll-mt 24) ✅ |
| L2-3 | 1280 | Ctrl K → ↓ "대시보드" → Enter → `/` ✅ |
| L2-4 | 1280 | Esc → 닫힘, 포커스가 🔍 버튼으로 복귀 ✅ |
| L3-1 | 390×844 | 대시보드 scrollWidth 390 ✅ |
| L3-2 | 390×844 | 명령창 열림 scrollWidth 390, 패널 12→610 ✅ |
| L3-3 | 390×500 | 패널 bottom 482 ≤ 500, 목록 max 412px ✅ |
| L3-4 | 1280×800 | 패널 top 96 ✅ |

Runtime 100

**측정 환경 메모**: 자동화 탭이 백그라운드(`visibilityState: hidden`)라 `requestAnimationFrame`이 멈춘다. L2-2 첫 실행에서 스크롤이 안 된 원인이고, 화면 캡처 시간 초과도 같은 원인으로 보인다. 테스트 프레임 안에서만 rAF를 타이머로 바꿔 재실행해 통과했다. 실제 사용(보이는 탭)에는 해당 없음.

## 5. Match Rate

```
Overall = Structural 100×0.15 + Functional 97×0.25 + Contract 100×0.25 + Runtime 100×0.35 = 99%
```

## 6. Remaining Gaps

| Severity | Item | Note |
|----------|------|------|
| ~~Minor~~ | 하단 안내 문구가 설계서와 다름 | ✅ 해소: 설계서 v0.2에서 구현 문구로 갱신 |
| Minor (미확인) | iOS에서 키보드가 올라올 때 화면이 밀리는 현상(`visualViewport.offsetTop`) | PC Chrome으로 재현 불가. 실제 아이폰에서 확인 필요 |

Critical / Important: 없음.
