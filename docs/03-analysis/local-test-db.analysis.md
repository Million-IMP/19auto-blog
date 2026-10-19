# local-test-db Gap Analysis

> **Feature**: local-test-db
> **Date**: 2026-10-19
> **Plan**: `docs/01-plan/features/local-test-db.plan.md`
> **Design**: `docs/02-design/features/local-test-db.design.md` (v0.2, 설계안 C)
> **Match Rate**: **98% → 100%** (Act-1 후, 런타임 포함 공식)

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

## Strategic Alignment Check

### PRD Alignment

PRD 없음. 핸드오프 `docs/bkit-next-prompts.md` 2번의 목적("운영 DB를 건드리지 않고 로컬 SQLite에 운영 글 사본 → 3001·5173 검증")을 그대로 충족.

### Success Criteria Status

| SC | 기준 | 상태 | 근거 |
|---|---|---|---|
| SC-1 | 출력에 "데이터베이스: 로컬 SQLite 파일" | ✅ | start:local·seed:local·`--keep` 로그 모두 |
| SC-2 | 로컬 `/api/stats` 글·재료·규칙 수 = 운영 | ✅ | materialsActive 4·drafts 60·published 0 일치 (inbox·rss는 범위 밖이라 0) |
| SC-3 | 5173 글·재료·규칙에 운영 데이터 | ✅ | 글 페이지: 대기열 60, 이미지 관련성 패널, 왼쪽 재료 4·규칙 5. API 응답 전체 필드 일치 |
| SC-4 | 시드에 POST/PUT/DELETE 없음 | ✅ | `scripts/seed-local.js`의 `fetch(...)`는 method 지정 없음 (GET) |
| SC-5 | `git status`에 `.db`·`.env` 안 잡힘 | ✅ | `.db`·`.bak`·`.env` 미검출 |

5/5 충족.

### Decision Record Verification

| 결정 | 따랐나 | 비고 |
|---|---|---|
| 공개 API로 읽기 | ✅ | GET 4개 |
| 글+재료·규칙·프로필 | ✅ | |
| 기존 dev.db 백업 후 새로 | ✅ | 10/15 원본은 `dev.2026-10-15.db`로 따로 복사 |
| 크론만 끔, AI 허용 | ✅ | "로컬 스케줄러는 꺼져 있습니다" 출력 |
| 설계안 C | ✅ | 스크립트 2개 + 테스트 1개, 기존 경로 무수정 |
| (변경) 사본 먼저 받고 백업 | ✅ | 설계 v0.2에 반영 |

---

## 1. Analysis Overview

### 1.2 Analysis Scope

`scripts/seed-local.js`, `scripts/start-local.js`, `backend/src/seedLocal.test.ts`, `package.json`, `.gitignore`, `CLAUDE.md`

---

## 2. Gap Analysis (Design vs Implementation)

### 2.1 API (사용하는 운영 GET)

| 설계 | 구현 | 상태 |
|---|---|---|
| `/api/profile`·`/api/rules`·`/api/materials`·`/api/posts` | `fetchSource()` | ✅ |

### 2.2 Data Model (필드 매핑 §3.1·3.2)

| 항목 | 상태 |
|---|---|
| 모델별 필드 화이트리스트 | ✅ `PROFILE/RULE/MATERIAL/POST_FIELDS` |
| 날짜 → Date | ✅ `DATE_FIELDS` |
| brief 자리표시 (isPipeline) | ✅ 로컬 파이프라인 35 = 운영 35 |
| outline·lockedUntil null | ✅ 화이트리스트에서 제외 |
| 부모 먼저·자식 나중, 없는 부모는 null | ✅ |
| `*.db.bak` gitignore | ✅ |

### 2.3 Component Structure

| 설계 | 구현 | 상태 |
|---|---|---|
| `forceLocalEnv`·`ensureSqliteClient`·`toRows`·`main` export | ✅ | |
| `require.main === module` 가드 | ✅ | 테스트 import 시 실행 안 됨 확인 |
| `start-local.js --keep` | ✅ | |
| npm `start:local`·`seed:local` | ✅ | |
| CLAUDE.md 1줄 | ✅ | |

### 2.4 Functional Depth

| # | 항목 | 심각도 | 확신 | 내용 |
|---|---|---|---|---|
| G1 | `backupDb()`가 `dev.db-journal`을 지움 | Minor | 85% | 앞선 실행이 트랜잭션 도중 끊겨 hot journal이 남아 있으면, journal 없이 옮긴 `dev.db.bak`은 롤백되지 않은 상태로 남는다. 지우지 말고 `dev.db.bak-journal`로 함께 옮겨야 백업이 온전하다 (SQLite는 `<파일>-journal`을 찾음). gitignore도 `*.db.bak*`로 넓혀야 함. dev.db가 없고 journal만 남은 경우도 같은 처리 필요 |

Placeholder·TODO 없음.

### 2.6 API Contract

운영 응답 → 로컬 응답 3-way 비교 (`/api/posts` 60건 전체 필드, materials·rules·profile 전체): **불일치 0**.

### 2.7 Runtime Verification Results

| # | 시나리오 | 결과 |
|---|---|---|
| R1 | `start:local` 출력 | ✅ SQLite·provider sqlite·크론 끔 |
| R2 | `/api/stats` 비교 | ✅ |
| R3 | `/api/posts` 전체 필드 비교 | ✅ 60/60 |
| R4 | `seed:local` 2회 | ✅ 두 번 다 1·5·4·60 |
| R5 | `git status` | ✅ |
| R6 | `start:local -- --keep` | ✅ 백업·시드 없이 기동, 글 60 유지 |
| R7 | 서버 켜진 채 `seed:local` | ✅ "로컬 서버가 dev.db를 쓰고 있습니다", 종료 1, dev.db 보존 |
| R8 | `DATABASE_URL=postgres://…` 가드 | ✅ prepare-db 실행 전 중단 |
| L2 | 화면 | ✅ 글 페이지·파이프라인 패널·Blob 이미지 |
| L0 | 단위 테스트 | ✅ 96/96 (새 6개) |

### 2.8 Match Rate Summary

| 축 | 점수 |
|---|---|
| Structural | 100% |
| Functional | 95% (G1) |
| Contract | 100% |
| Runtime | 100% (10/10) |
| **Overall** | 0.15·100 + 0.25·95 + 0.25·100 + 0.35·100 = **98.8% → 98%** |

---

## 3. Code Quality Analysis

### 3.2 Code Smells

- `spawn(..., { shell: true })`가 Node 25에서 DEP0190 경고를 낸다. 기존 `scripts/start.js`와 같은 패턴이라 이번 범위에서는 그대로 둠 (Info).

### 3.3 Security Issues

- 운영으로 쓰기 요청 없음. `.env` 미열람. 이중 가드(DATABASE_URL 사전 확인 + 생성 클라이언트 provider 확인). 이슈 없음.

---

## 4. Performance

- 시드 1회 5초 (기준 1분 이내) ✅

---

## 5. Test Coverage

- 변환 로직 `toRows()` 6케이스. 파일·프로세스를 다루는 함수는 런타임 R1~R8로 검증.

---

## 7. Convention Compliance

- `scripts/` 기존 스타일(CommonJS, `root = path.resolve(__dirname, '..')`, 한국어 출력) ✅
- 테스트 이름 한국어, vitest 패턴 ✅
- `.env`·`*.db` 커밋 없음 ✅

---

## 8. Overall Score

**98%** — Critical 0, Important 0, Minor 1 (G1).

## 8.1 Act-1 (사용자 결정: 지금 모두 수정)

| Gap | 수정 | 검증 | 결과 |
|---|---|---|---|
| G1 | `backupDb()`: journal을 지우지 않고 `dev.db.bak-journal`로 함께 옮김. 백업을 교체할 때만 이전 bak-journal 삭제. DB 없이 남은 journal은 삭제(새 dev.db에 잘못 적용 방지). `.gitignore` `*.db.bak` → `*.db.bak*` | ① 가짜 journal + dev.db → `dev.db.bak-journal` 생성 ② journal만 있고 dev.db 없음 → journal 삭제, 기존 bak-journal 보존("keep" 유지) ③ 일반 실행 → dev.db·dev.db.bak만 ④ git에 bak·journal 안 잡힘 ⑤ 테스트 96/96·tsc 통과 | ✅ |

**Match Rate after Act-1**: Functional 95 → 100, **Overall 100%**.

## 9. 세션 중 발견 (기능 범위 밖)

- 10/16부터 떠 있던 로컬 backend(PID 327004)가 **운영 DB에 연결된 상태**였다 (`/api/stats`가 마지막 활동 기록 시각까지 운영과 동일). 사용자 승인 후 PID 지정 종료. 이 기능(`start:local`)이 같은 상황의 재발을 막는 경로다.
