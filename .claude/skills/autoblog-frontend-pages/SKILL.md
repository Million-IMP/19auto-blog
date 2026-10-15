---
name: autoblog-frontend-pages
description: React 페이지·UI 규칙. Use when editing frontend/src (InboxPage, MaterialsPage, RulesPage, PostsPage, App.tsx), Tailwind styling, or API calls from the UI.
---

# Frontend Pages

## 구조
- `App.tsx` — Sidebar + react-router 라우트(/, /inbox, /materials, /rules, /posts) + 대시보드
- `pages/*Page.tsx` — 각 페이지가 자체 state와 axios 호출을 가짐 (InboxPage가 가장 큼, 1200줄+)
- 아이콘 lucide-react, 마크다운 렌더 react-markdown + remark-gfm, 스타일 Tailwind 4 (+typography)

## 규칙
- API: `const API_URL = '/api'` + axios. 절대 URL 금지 (Vite 프록시·Vercel rewrite 모두 상대경로 전제).
- 에러 표시는 `err.response?.data?.error`.
- 사이드바 색 체계: slate-900 배경, blue-600 강조.
- UI 문구 한국어, 메뉴 번호 체계(0 수집함, 1 재료, 2 규칙, 3 발행) 유지.
- 큰 페이지에 기능 추가 시 컴포넌트를 같은 파일 하단이나 `components/`로 분리 고려.

## 검증
`npm run lint --prefix frontend` → `npm run build --prefix frontend`. 수정 시 PostToolUse 훅이 oxlint를 자동 실행.
