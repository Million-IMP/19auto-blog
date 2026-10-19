# local-test-db Design Document

> **Summary**: `scripts/seed-local.js`(운영 GET → SQLite) + `scripts/start-local.js`(SQLite 강제 실행) — 설계안 C 실용형
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-19
> **Status**: Draft
> **Plan**: `docs/01-plan/features/local-test-db.plan.md`

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

### 1.1 Design Goals

- `npm run start:local` 한 번으로 운영 사본이 담긴 로컬 서버(3001)·화면(5173)
- 운영으로는 GET 4개만. Postgres 연결 0회
- 기존 `npm start`·`prepare-db.js`·Vercel 빌드 경로는 수정하지 않음

### 1.2 Design Principles

- **환경변수 우선순위 활용**: `prepare-db.js`의 `loadEnv`와 `backend/src/db.ts`의 `dotenv.config()`는 이미 있는 값을 덮어쓰지 않는다 → 스크립트가 `process.env.DATABASE_URL`을 먼저 넣으면 `.env`보다 이긴다. 새 스크립트는 `.env`를 읽지 않는다.
- **이중 확인**: 환경변수 강제 + 생성된 Prisma 클라이언트 provider 확인. 둘 중 하나만 틀려도 중단.
- **원자적 시드**: 모든 넣기를 `prisma.$transaction` 하나로. 중간 실패 시 빈 DB(스키마만)로 남는다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| 항목 | A 최소 변경 | B 구조 분리 | **C 실용형 (선택)** |
|---|---|---|---|
| 파일 | start-local.js 1개 | scripts/lib 3개 + 기존 2개 수정 | seed-local.js·start-local.js + 테스트 1개 |
| 기존 경로 영향 | 없음 | start.js·prepare-db.js 수정 | 없음 |
| 시드만 다시 | 어려움 | 쉬움 | `npm run seed:local` |
| 테스트 | 없음 | 3개 | 변환 함수 1개 |
| 예상 시간 | 40분 | 2시간 | 1시간 |

선택 이유: 기존 실행 경로를 건드리지 않으면서 시드를 따로 돌릴 수 있고, 데이터 변환(유일한 로직)은 테스트로 고정한다.

### 2.1 Component Diagram

```
npm run start:local
  └─ scripts/start-local.js
       ├─ forceLocalEnv()            DATABASE_URL=file:./dev.db, DISABLE_LOCAL_CRON=1
       ├─ (기본) seed-local.main()   ─┐
       │   (--keep) ensureSqliteClient() 만
       └─ spawn backend dev · frontend dev (env 상속)
                                      │
npm run seed:local                    │
  └─ scripts/seed-local.js main() ◄───┘
       1 forceLocalEnv()
       2 fetchSource()         GET {SEED_SOURCE_URL}/api/{profile,rules,materials,posts}
       3 toRows()              스키마 필드만 · 날짜 변환 · 부모 글 먼저 · brief 자리표시
       4 backupDb()            backend/prisma/dev.db → dev.db.bak
       5 ensureSqliteClient()  node scripts/prepare-db.js --push  → provider 확인
       6 insert()              $transaction(upsert profile, createMany ×4)
       (v0.2: 사본을 먼저 받는다 — 네트워크 실패 시 기존 dev.db 유지)
```

### 2.2 Data Flow

운영(Vercel, Postgres) —GET JSON→ seed-local.js —Prisma(SQLite)→ `backend/prisma/dev.db` ←Prisma— 로컬 backend(3001) ←Vite 프록시— frontend(5173)

### 2.3 Dependencies

- Node 25 내장 `fetch` (새 의존성 없음)
- `backend/node_modules/@prisma/client` 5.22 (SQLite `createMany` 지원)

---

## 3. Data Model

스키마 변경 없음. 복사 대상과 필드 매핑:

### 3.1 Entity Definition

| 모델 | 출처 | 넣는 필드 | 처리 |
|---|---|---|---|
| BlogProfile | `GET /api/profile` (객체) | id(=1), audience, purpose, tone, structure, ctaText, ctaUrl, imageStyle, bannedPhrases | `upsert id:1` |
| Rule | `GET /api/rules` (배열) | id, title, content, type, isActive, createdAt, updatedAt | 날짜 → `Date` |
| Material | `GET /api/materials` (배열) | id, title, content, keyword, inboxId, isArchived, isActive, createdAt, updatedAt | 날짜 → `Date`. `feeds` 관계는 넣지 않음 |
| Post | `GET /api/posts` (배열) | id, title, content, status, keyword, publishedUrl, platform, inboxId, parentPostId, stage, stageError, sources, imagePlan, polishNotes, osmuAt, publishCheck, createdAt, updatedAt + **brief** | 아래 3.2 |

API가 보내는 그 밖의 필드(`isPipeline` 등)는 버린다 (필드 화이트리스트).

### 3.2 Post 특수 처리

| 항목 | 이유 | 처리 |
|---|---|---|
| `brief` | API가 빼고 보냄. 화면은 `isPipeline`(= brief ≠ null)일 때만 파이프라인 패널(이미지 관련성 배지 등)을 보여줌 | `isPipeline=true`면 `JSON.stringify({ keyword: keyword ?? title, inboxContents: [], materialContents: [], ruleContents: [] })`, 아니면 `null` |
| `outline`·`lockedUntil` | API가 빼고 보냄 | `null` |
| `parentPostId` | 자기 참조 FK | 부모(`parentPostId=null`) 먼저, 자식 나중 — 두 번의 `createMany`. 부모가 목록에 없으면 `null`로 |
| `osmuAt`·날짜 | JSON 문자열 | `Date` 또는 `null` |
| `inboxId` | Inbox는 복사 안 함. 관계 없는 Int라 FK 오류 없음 | 그대로 |

### 3.3 Database Schema

`backend/prisma/schema.prisma` 그대로. 파일은 `backend/prisma/dev.db` (`*.db` gitignore). 백업 `dev.db.bak`도 `*.db`에 안 걸리므로 **`.gitignore`에 `*.db.bak` 추가**.

---

## 4. API Specification

새 API 없음. 사용하는 운영 API (읽기만):

| Method | Path | 응답 |
|---|---|---|
| GET | `/api/profile` | BlogProfile 객체 |
| GET | `/api/rules` | Rule[] |
| GET | `/api/materials` | Material[] |
| GET | `/api/posts` | (Post − brief·outline·lockedUntil + isPipeline)[] |

---

## 5. UI/UX Design

화면 변경 없음. 터미널 출력(한국어):

```
[local] DB: 로컬 SQLite (backend/prisma/dev.db) · 크론 끔
[local] 기존 dev.db → dev.db.bak 백업
데이터베이스: 로컬 SQLite 파일          ← prepare-db 기존 출력
[local] Prisma 클라이언트 확인: sqlite
[local] 운영 사본 받는 중: https://19auto-blog.vercel.app
[local] 넣음: 프로필 1 · 규칙 N · 재료 N · 글 N
화면: http://localhost:5173
```

---

## 6. Error Handling

| 상황 | 처리 | 종료 코드 |
|---|---|---|
| provider가 `sqlite`가 아님 | "Prisma 클라이언트가 SQLite가 아닙니다. 운영 DB 보호를 위해 중단합니다." | 1 |
| `DATABASE_URL`이 강제 후에도 postgres로 시작 | 같은 이유로 중단 (방어 코드) | 1 |
| dev.db 이름 바꾸기 실패 (EBUSY/EPERM) | "로컬 서버가 dev.db를 쓰고 있습니다. 서버를 끄고 다시 실행하세요." | 1 |
| 운영 API 실패 (상태≠200·JSON 아님·배열 아님) | "운영 사본을 받지 못했습니다: {경로} {상태}". 넣기 시작 전이라 DB는 빈 스키마 | 1 |
| 넣기 실패 | 트랜잭션 롤백 + 오류 메시지 | 1 |
| `SEED_SOURCE_URL`이 `localhost:3001` | "자기 자신에서 사본을 받을 수 없습니다" | 1 |

---

## 7. Security Considerations

- [x] 운영에 쓰기 요청 없음: 코드에 `fetch(..., { method })` 지정 없음 = GET만 (SC-4)
- [x] `.env` 읽기·수정 없음 (새 스크립트는 `.env`를 열지 않음. `prepare-db.js`가 기존대로 읽되 `DATABASE_URL`은 덮어쓰지 못함)
- [x] DB 파일·백업 gitignore
- [x] 크론 끔 → 자동 AI 호출·자동 발행 없음. 버튼 AI 호출은 허용(사용자 선택, 비용 발생)

---

## 8. Test Plan

### 8.1 Test Scope

| 종류 | 대상 | 도구 |
|---|---|---|
| L0 단위 | `toRows()` 변환 | vitest (`backend/src/seedLocal.test.ts`) |
| L1 실행 | `start:local` → 로컬 API | curl |
| L2 화면 | 5173 글·재료·규칙 | 브라우저 눈 확인 |

### 8.2 L0 단위 테스트 (`toRows`)

| # | 입력 | 기대 |
|---|---|---|
| T1 | `isPipeline: true` 글 | `brief`가 JSON 문자열, `keyword` 포함. `isPipeline` 필드 없음 |
| T2 | `isPipeline: false` 글 | `brief === null` |
| T3 | 자식 글(parentPostId=부모) + 부모 | `parents`에 부모, `children`에 자식 |
| T4 | 부모가 목록에 없는 자식 | `parentPostId === null`, parents 쪽으로 |
| T5 | `createdAt` 문자열 | `Date` 인스턴스 |
| T6 | 알 수 없는 필드(`foo`) | 결과에 없음 |

### 8.3 L1 실행 시나리오

| # | 명령 | 기대 |
|---|---|---|
| R1 | `npm run start:local` | 출력에 "데이터베이스: 로컬 SQLite 파일" + "Prisma 클라이언트 확인: sqlite" |
| R2 | `curl localhost:3001/api/stats` vs 운영 | `materialsActive`·`drafts`·`published` 같음 (`inboxUnprocessed`·`activeRss`는 복사 범위 밖이라 0) |
| R3 | `curl localhost:3001/api/posts` 길이 vs 운영 | 같음 |
| R4 | `npm run seed:local` 두 번 | 두 번 다 같은 숫자 |
| R5 | `git status` | `.db`·`.bak`·`.env` 안 잡힘 |

### 8.4 L2 화면

- 글 목록에 운영 글 · 파이프라인 글의 이미지 관련성 배지 표시
- 재료·규칙 페이지에 운영 항목

---

## 9. Clean Architecture

### 9.4 This Feature's Layer Assignment

| 파일 | 층 |
|---|---|
| `scripts/seed-local.js` | 도구 스크립트 (CommonJS, `scripts/` 기존 스타일: `fs`·`path`·`child_process`, 한국어 출력) |
| `scripts/start-local.js` | 도구 스크립트 |
| `backend/src/seedLocal.test.ts` | 테스트 |

---

## 10. Coding Convention Reference

### 10.4 This Feature's Conventions

- `scripts/start.js`·`prepare-db.js`와 같은 모양: CommonJS `require`, `root = path.resolve(__dirname, '..')`, `spawnSync(process.execPath, …)`
- `seed-local.js`는 `module.exports = { toRows, main, ensureSqliteClient, forceLocalEnv }` + `if (require.main === module) main()` (테스트에서 import 시 실행 안 됨)
- `start-local.js`는 `--keep`이면 백업·시드를 건너뛰고 `ensureSqliteClient()`만 (이전 사본 유지)
- 출력 접두사 `[local]`

---

## 11. Implementation Guide

### 11.1 File Structure

```
scripts/seed-local.js          신규 (~120줄)
scripts/start-local.js         신규 (~45줄)
backend/src/seedLocal.test.ts  신규 (~70줄)
package.json                   scripts 2줄
.gitignore                     *.db.bak 1줄
CLAUDE.md                      실행 절 1줄
```

### 11.2 Implementation Order

1. [ ] `seed-local.js`의 `toRows()` + 테스트 (T1~T6) → `npm test --prefix backend`
2. [ ] `seed-local.js`의 `forceLocalEnv`·`backupDb`·`ensureSqliteClient`·`fetchSource`·`insert`·`main`
3. [ ] `start-local.js`
4. [ ] `package.json`·`.gitignore`·`CLAUDE.md`
5. [ ] R1~R5 실행 확인

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 변환 + 테스트 | `module-1` | `toRows()` + seedLocal.test.ts | 5 |
| 시드·실행 스크립트 | `module-2` | seed-local main, start-local, package.json·문서 | 8 |
| 실행 검증 | `module-3` | R1~R5 | 5 |

#### Recommended Session Plan

한 세션에 전부 (총 약 1시간).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-19 | Initial draft (설계안 C) | jeh-lab + Claude |
