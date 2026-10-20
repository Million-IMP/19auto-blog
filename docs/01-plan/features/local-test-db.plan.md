# local-test-db Planning Document

> **Summary**: 운영 DB를 건드리지 않고, 운영 공개 API에서 받은 사본을 로컬 SQLite에 채워 서버(3001)·화면(5173)을 띄우는 `npm run start:local`
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-19
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 로컬 `backend/.env`의 `DATABASE_URL`이 운영 Postgres라서, `npm start`(자동 `db push` 포함)를 돌리면 운영 DB에 스키마·데이터가 반영될 위험이 있어 매번 로컬 서버 검사를 건너뛰었다. |
| **Solution** | `DATABASE_URL`을 실행 시점에 SQLite로 강제하는 `scripts/start-local.js` + 운영 GET API만 읽어 `dev.db`를 채우는 `scripts/seed-local.js`를 추가한다. `.env`는 수정하지 않는다. |
| **Function/UX Effect** | `npm run start:local` 한 번으로 운영과 같은 글·재료·규칙·프로필이 담긴 로컬 화면이 뜬다. 운영에는 읽기 요청만 간다. |
| **Core Value** | 화면 변경을 운영 배포 전에 실제 데이터로 확인할 수 있다 (prod-ui-check·image-abstract-scenes의 검증 기반). |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 DB 오염 위험 때문에 로컬 서버·화면 검증을 못 하고 있다 |
| **WHO** | 개발·검수하는 운영자 1명 (+ Claude 세션) |
| **RISK** | 실수로 Postgres 클라이언트가 만들어져 운영에 `db push`·쓰기가 나가는 것 |
| **SUCCESS** | `start:local` 실행 시 "로컬 SQLite" 출력, 운영 요청은 GET만, 로컬 `/api/stats` 숫자가 운영과 일치 |
| **SCOPE** | 1) SQLite 강제 실행 스크립트 2) 운영 사본 시드 스크립트 3) 안전장치·문서 |

---

## 1. Overview

### 1.1 Purpose

운영 데이터 사본으로 로컬 서버와 화면을 띄워, 운영 DB를 건드리지 않고 기능·화면을 검증한다.

### 1.2 Background

- `scripts/prepare-db.js`는 `DATABASE_URL`이 `postgres://`로 시작하면 Postgres 스키마를 생성·push 한다. `scripts/start.js`는 항상 `--push`로 호출한다.
- 두 스크립트의 `loadEnv`와 `backend/src/db.ts`의 `dotenv.config()`는 **이미 설정된 환경변수를 덮어쓰지 않는다** → 프로세스 시작 전에 `DATABASE_URL`을 지정하면 `.env` 값보다 우선한다.
- SQLite 스키마의 주소는 `file:./dev.db`로 고정 → 실제 파일은 `backend/prisma/dev.db` (gitignore `*.db`).
- 운영 사이트(https://19auto-blog.vercel.app)의 `GET /api/posts`, `/api/materials`, `/api/rules`, `/api/profile`은 로그인 없이 열린다.
- brain 기록(`projects/19auto-blog/gpters-24-lecture-applied`): Phase 3·4 스키마는 로컬 SQLite에서만 테스트, 운영 반영은 승인 대기.

### 1.3 Related Documents

- 핸드오프: `docs/bkit-next-prompts.md` 2번
- 후속: 3번 `prod-ui-check` (로컬 화면으로 먼저 점검 가능)

---

## 2. Scope

### 2.1 In Scope

- [ ] `scripts/start-local.js`: `DATABASE_URL=file:./dev.db`, `DISABLE_LOCAL_CRON=1` 강제 → 시드 → `prepare-db --push`(SQLite) → backend·frontend 실행
- [ ] `scripts/seed-local.js`: 운영 GET API 4개 → `dev.db` 채움 (기존 `dev.db`는 `dev.db.bak`으로 백업 후 새로 생성)
- [ ] 루트 `package.json`에 `start:local`, `seed:local` 스크립트 추가
- [ ] 안전장치: 시드·실행 전에 생성된 Prisma 클라이언트가 SQLite인지 확인, 아니면 중단
- [ ] `CLAUDE.md` 실행 절에 사용법 한 줄 추가

### 2.2 Out of Scope

- `.env` 읽기·수정 (사용자 지시)
- Postgres 덤프(pg_dump) 방식
- 받은 글(Inbox)·주제 카드·활동 기록·RSS·사용후기 복사 (이번 범위는 글+재료·규칙·프로필)
- `/api/images/*.png` 로컬 이미지 파일 복사 (운영 503 원인은 3번 prod-ui-check에서 확인)
- AI 호출 차단 (크론만 끄고 버튼으로 누른 AI 기능은 실제 동작 — 사용자 선택)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `npm run start:local`은 `.env`의 `DATABASE_URL` 값과 상관없이 SQLite를 쓴다 | High | Pending |
| FR-02 | 운영에서 `GET /api/posts`·`/api/materials`·`/api/rules`·`/api/profile`만 호출해 로컬 `dev.db`에 넣는다 (id·createdAt 유지) | High | Pending |
| FR-03 | 기존 `dev.db`가 있으면 `dev.db.bak`으로 백업한 뒤 새로 채운다 | High | Pending |
| FR-04 | 로컬 크론을 끈다 (`DISABLE_LOCAL_CRON=1`) | High | Pending |
| FR-05 | 시드만 따로 다시 할 수 있다 (`npm run seed:local`) | Medium | Pending |
| FR-06 | 운영 주소는 기본값 + `SEED_SOURCE_URL`로 바꿀 수 있다 | Low | Pending |
| FR-07 | Post 관계(`parentPostId`)가 있어도 넣기가 실패하지 않는다 (부모 먼저 넣기) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Safety | 운영으로 가는 요청은 GET만, Postgres 연결 0회 | 스크립트 코드 확인 + 실행 로그 "데이터베이스: 로컬 SQLite 파일" |
| Speed | 시드 1분 이내 | 실행 시간 측정 |
| Repeatable | 두 번 연속 실행해도 같은 결과 | 2회 실행 후 `/api/stats` 비교 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] SC-1: `npm run start:local` 출력에 "데이터베이스: 로컬 SQLite 파일"이 나온다
- [ ] SC-2: 로컬 `curl http://localhost:3001/api/stats`의 글·재료·규칙 수가 운영과 같다
- [ ] SC-3: `localhost:5173` 글 목록·재료·규칙 페이지에 운영 데이터가 보인다
- [ ] SC-4: 시드 스크립트에 POST/PUT/DELETE 요청이 없다 (코드 확인)
- [ ] SC-5: 실행 후 `git status`에 `.db`·`.env` 변경이 잡히지 않는다

### 4.2 Quality Criteria

- [ ] 백엔드 타입체크·테스트(`npm test --prefix backend`) 기존대로 통과
- [ ] 프론트 린트·빌드 통과 (프론트 코드는 바꾸지 않음)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Postgres 클라이언트가 생성된 상태로 시드가 돌아 운영에 쓰기 | High | Low | 시드 전에 `prepare-db`를 SQLite로 실행하고, `node_modules/.prisma/client/schema.prisma`의 provider가 `sqlite`인지 확인 후 아니면 중단 |
| 이후 `npm install`(postinstall)이 Postgres 클라이언트로 되돌림 | Medium | High | 의도된 동작. `start:local`이 매번 SQLite로 다시 생성. 문서에 명시 |
| `/api/posts`가 `brief`·`outline`을 빼서 보냄 → `isPipeline` 정보 손실 | Low | High | `isPipeline=true`면 `brief`에 빈 JSON(`"{}"`)을 넣어 화면 표시 유지. 이어하기 동작은 로컬 검증 대상 아님 |
| 상대경로 이미지(`/api/images/*.png`)가 로컬에서 404 | Low | High | 범위 밖. Blob 절대주소 이미지는 그대로 보임. prod-ui-check에서 처리 |
| 운영 API 응답 필드가 스키마와 다름 (계산 필드 등) | Medium | Medium | 스키마에 있는 필드만 골라 넣기 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `scripts/start-local.js` | Script (신규) | SQLite 강제 로컬 실행 |
| `scripts/seed-local.js` | Script (신규) | 운영 사본 → `dev.db` |
| 루트 `package.json` scripts | Config | `start:local`, `seed:local` 추가 |
| `CLAUDE.md` | Doc | 실행 절 1줄 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `scripts/prepare-db.js` | 호출만 | start-local → prepare-db --push | None (수정 없음) |
| `scripts/start.js` | — | 기존 `npm start` | None (수정 없음) |
| Vercel 빌드 | — | `postinstall` → prepare-db | None (VERCEL 환경은 새 스크립트를 안 씀) |
| `backend/src/db.ts` | READ env | dotenv 비덮어쓰기 | None |

### 6.3 Verification

- [ ] `npm start`·Vercel 빌드 경로는 바뀌지 않음 (파일 diff로 확인)
- [ ] 백엔드 테스트 통과

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic (Express + Prisma + React). 이번 작업은 스크립트만 추가.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 데이터 출처 | 공개 API / pg_dump | 공개 API | 접속정보·.env 불필요, 운영엔 읽기만 (사용자 선택) |
| 복사 범위 | 글만 / 글+재료·규칙·프로필 / 전부 | 글+재료·규칙·프로필 | 화면 검증 핵심 (사용자 선택) |
| 기존 dev.db | 백업 후 새로 / 덧붙임 | 백업 후 새로 | 매번 같은 시작 상태 (사용자 선택) |
| AI 호출 | 크론만 끔 / 전부 막음 | 크론만 끔 | 버튼 기능은 실제 검증 (사용자 선택) |
| DB 강제 방법 | `.env` 수정 / 실행 시 환경변수 | 실행 시 환경변수 | 기존 loadEnv·dotenv가 덮어쓰지 않음 |

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- `npm`만 사용, UI·커밋 메시지 한국어
- `.env`·`*.db` 커밋 금지 (`.gitignore`에 이미 있음)
- 스키마는 `schema.prisma`만 수정 (이번엔 수정 없음)

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `SEED_SOURCE_URL` | 사본 출처 (기본 https://19auto-blog.vercel.app) | 로컬 스크립트 | 선택 |
| `DATABASE_URL` | start-local이 `file:./dev.db`로 강제 | 프로세스 | 자동 |
| `DISABLE_LOCAL_CRON` | start-local이 `1`로 강제 | 프로세스 | 자동 |

---

## 9. Next Steps

1. [ ] `/bkit:pdca design local-test-db` — 시드 순서·필드 매핑·안전장치 상세
2. [ ] 구현 (예상 1시간: 스크립트 2개 + package.json + 문서)
3. [ ] 로컬 실행 검증 → Gap 분석

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-19 | Initial draft (사용자 확인 4건 반영) | jeh-lab + Claude |
