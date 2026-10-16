# 프론트엔드 디자인 개편 설계 (2026-10-16)

## 목표
GPTERS 스터디원이 처음 접속해도 "수집 → 글감 → 재료/규칙 → 초안 → 발행 대기" 흐름이 한눈에 보이고,
화면마다 모양이 들쭉날쭉하지 않은 일관된 UI. 모바일에서도 쓸 수 있어야 한다.
디자인 방향: 시안 C(Board Console, `docs/design-mockups/c-board-console.html`) — 다크 + 청록 포인트.

## 요구사항
### R1. 디자인 토큰 (`frontend/src/index.css` `@theme`)
- 색: canvas, surface, surface-2, surface-3, line, line-strong, ink, ink-2, ink-3, accent, accent-strong, accent-ink
- 상태색: draft(DRAFT), published(PUBLISHED), danger(실패), info(진행 중)
- 라운드 2단계(card, control), 그림자(card, pop), 간격(gutter, section)
- 페이지 코드에서 slate/blue 등 팔레트 클래스를 직접 쓰지 않는다. 12px 미만 글자 크기(text-[10px] 등) 없음.

### R2. 공통 컴포넌트 (`frontend/src/components/ui/`)
Button(primary/secondary/ghost/danger, sm/md), Card(+CardHeader/CardBody), Badge(상태: StatusBadge, StageBadge),
PageHeader(+Page 컨테이너), EmptyState, Input(+Textarea/Select/Field). 보조: Segmented, Switch, Notice.

### R3. 레이아웃 (`frontend/src/components/layout/AppShell.tsx`)
- 768px 이상: 토큰 기반 아이콘 레일 사이드바, 메뉴는 글 만드는 순서대로 + 단계 번호(01~04)
- 768px 미만: 상단바 + 햄버거 → 드로어(ESC·바깥 클릭·링크 클릭으로 닫힘)

### R4. 페이지 적용 (대시보드 → Inbox → Topics → Materials → Rules → Posts → Activity)
- 모든 페이지가 Page/PageHeader/Card/Button/EmptyState를 쓴다.
- 대시보드: 5열 보드(01 수집 · 02 글감 · 03 재료·규칙 · 04 초안 · 05 발행 대기), 각 열 건수 + 최근 항목 + 빈 열엔 다음 행동 버튼.
  초안 = DRAFT이면서 stage≠READY인 블로그 글, 발행 대기 = DRAFT이면서 stage=READY인 블로그 글.
  자동 작성 설정·지금 한 바퀴·최근 봇 활동·사용후기 기능은 그대로 동작.
- 빈 상태는 "무엇이 비었는지 + 어떻게 채우는지 (+버튼)"를 보여준다.
- 기존 기능(API 호출, 상태 변경, 수정/삭제, RSS 모달, 기사 리더, 파이프라인 이어하기, OSMU, 발행 처리, 공개 확인, 서식 복사)은 동작이 바뀌지 않아야 한다.

### R5. 검증
- `npm run lint --prefix frontend`, `npm run build --prefix frontend` 통과
- 데스크톱·모바일(390px) 전후 스크린샷: `docs/screenshots/before/`, `docs/screenshots/after/`
- 390px에서 가로 넘침 없음
