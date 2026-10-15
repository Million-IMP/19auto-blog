---
description: 변경사항 검증 → 커밋 → 푸시 → PR 생성
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm run:*), Bash(npx:*)
---

# Commit → Push → PR

1. `git status`, `git diff`로 변경 범위 확인. `.env*`, `*.db`가 스테이징되지 않았는지 확인.
2. `/typecheck-all` 과 `npm run lint --prefix frontend` 실행. 새로 생긴 에러가 있으면 멈추고 보고.
3. master 브랜치라면 `feat/<짧은-이름>` 브랜치 생성.
4. 한국어 Conventional Commit 메시지로 커밋 (예: `feat: 수집함 필터 추가`).
5. `git push -u origin <branch>` (push 전 사용자 확인).
6. `gh pr create --base master` — 본문에 변경 요약과 확인 방법을 적는다.

$ARGUMENTS
