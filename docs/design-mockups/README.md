# 디자인 시안 (2026-10-16)

프론트엔드 디자인 개편 2단계에서 만든 대시보드 1장짜리 HTML 시안 3개. 브라우저로 바로 열어 볼 수 있다.

| 파일 | 방향 | 결과 |
|---|---|---|
| `a-pipeline-light.html` | 흰 바탕 + 인디고 한 색, 상단 5칸 파이프라인 줄 | 보관 |
| `b-warm-editorial.html` | 종이색 + 테라코타, 명조 제목, 원형 단계 스테퍼 | 보관 |
| `c-board-console.html` | 다크 + 청록, 아이콘 레일, 5열 칸반 보드 | **채택** |

채택안 C는 `frontend/src/index.css`의 `@theme` 토큰과 `frontend/src/components/ui/`로 옮겼다.
개편 전후 화면은 `docs/screenshots/before/`, `docs/screenshots/after/`에 있다.
