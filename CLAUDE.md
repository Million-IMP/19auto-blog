# 19auto-blog

수집(RSS·URL·텍스트) → 재료/규칙 → AI 초안 → 발행 대기까지 자동화하는 블로그 워크플로우 도구.
백엔드는 Express 5 + Prisma, 프론트엔드는 React 19 + Vite + Tailwind 4. Vercel에 배포된다.

## 실행
- 로컬 전체 실행: `npm start` (루트) → 의존성 설치, `prisma db push`, backend(3001)·frontend(5173) 동시 기동
- 필수 환경변수: `backend/.env`의 `ANTHROPIC_API_KEY` (나머지는 선택)
- 선택 환경변수: `ANTHROPIC_MODEL`(기본 `claude-haiku-5-5`), `DATABASE_URL`(postgres면 Postgres, 없으면 SQLite), `CRON_SECRET`, `DISABLE_LOCAL_CRON=1`, `IMAGE_PROVIDER=ideogram` + `IDEOGRAM_API_KEY` (배포 시 `BLOB_READ_WRITE_TOKEN` 필요)

## 패키지 관리
- **항상 `npm` 사용** (package-lock.json). 루트·backend·frontend 세 곳에 각각 package.json이 있다.
- backend 의존성 추가: `npm install <pkg> --prefix backend` — Vercel 함수는 루트 node_modules를 쓰므로 런타임 의존성은 **루트 package.json에도** 추가한다.

## 검증 순서
1. 백엔드 타입체크: `npx --prefix backend tsc --noEmit --esModuleInterop --skipLibCheck backend/src/index.ts`
2. 프론트 린트: `npm run lint --prefix frontend`
3. 프론트 빌드(타입체크 포함): `npm run build --prefix frontend`
4. 테스트 러너는 아직 없다. 동작 확인은 `npm start` 후 화면/`curl http://localhost:3001/api/stats`로 한다.

## 구조
```
api/server.ts           Vercel 함수(vercel.json rewrite로 /api/* 전부 수신) → backend/src/index.ts의 app 재사용
api/cron/daily.ts       Vercel 크론(매일 00:00 UTC) → /api/cron/daily
backend/src/index.ts    모든 Express 라우트 + 로컬 node-cron(매시 정각)
backend/src/services/   aiService, automationService, writingPlan, scraperService
backend/prisma/         schema.prisma (SQLite 기준; Postgres 스키마는 prepare-db.js가 생성)
frontend/src/pages/     Inbox, Materials, Rules, Posts 페이지
scripts/                start.js(로컬 실행), prepare-db.js(prisma generate/push)
```

## 규칙
- 스키마는 `backend/prisma/schema.prisma`만 수정한다. `schema.postgres.prisma`는 자동 생성물(gitignore)이다.
- `index.ts`는 `export default app`을 유지해야 한다 (Vercel 진입점이 import함). `app.listen`/cron은 `!process.env.VERCEL`일 때만.
- AI 모델 ID를 하드코딩하지 않는다 — `ANTHROPIC_MODEL` 환경변수 + 기본값 패턴 유지.
- 프론트는 `axios`로 상대경로 `/api` 호출 (Vite 프록시 → 3001).
- `enum` 대신 문자열 리터럴 유니온. 상태값은 DB에 문자열(`DRAFT`, `PUBLISHED` 등)로 저장된다.
- UI 텍스트·커밋 메시지는 한국어.

## 금지
- `.env`, `.env.local`, `*.db` 커밋 금지
- `taskkill /IM node.exe` 같은 이름 기반 프로세스 kill 금지 (PID 지정만)
