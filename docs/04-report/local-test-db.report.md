# local-test-db Completion Report

> **Feature**: local-test-db (`docs/bkit-next-prompts.md` 2번)
> **Date**: 2026-10-19
> **Author**: jeh-lab + Claude
> **Match Rate**: 98% → **100%** (Act-1 1회)
> **Status**: Completed

---

## Executive Summary

### 1.1 Project Overview

| 항목 | 내용 |
|---|---|
| 기능 | 운영 DB를 건드리지 않는 로컬 실행 `npm run start:local` |
| 기간 | 2026-10-19 (하루, Plan → Design → Do → Check → Act-1 → Report) |
| 설계안 | C 실용형 (스크립트 2개 + 테스트 1개, 기존 실행 경로 무수정) |

### 1.2 Results Summary

| 지표 | 결과 |
|---|---|
| 성공 기준 | 5/5 충족 |
| Match Rate | 100% |
| 테스트 | 96/96 (새 6개) |
| 운영 ↔ 로컬 데이터 | 글 60/60 전체 필드 일치, 재료·규칙·프로필 일치 |
| 시드 시간 | 5초 |
| 운영으로 가는 쓰기 요청 | 0 |

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | `backend/.env`의 `DATABASE_URL`이 운영 Postgres라 `npm start`(자동 `db push`)로 로컬 검증을 못 했다. 실제로 10/16부터 3일간 로컬 backend가 운영 DB에 붙은 채 떠 있었다. |
| **Solution** | 실행 시점에 `DATABASE_URL=file:./dev.db`·`DISABLE_LOCAL_CRON=1`을 강제하고(기존 loadEnv·dotenv는 덮어쓰지 않음), 운영 공개 GET 4개로 받은 사본을 SQLite에 넣는다. `.env`는 열지 않는다. |
| **Function/UX Effect** | 명령 하나로 운영과 같은 60개 글(파이프라인 35·이미지 관련성 패널 포함)·재료 4·규칙 5·프로필이 담긴 로컬 화면이 5초 시드 후 뜬다. `--keep`으로 이전 사본 유지. |
| **Core Value** | 화면·기능 변경을 배포 전에 실데이터로 확인할 수 있다. 3번 prod-ui-check와 5번 image-abstract-scenes 검증의 바탕. |

## 1.4 Success Criteria Final Status

| SC | 기준 | 상태 | 근거 |
|---|---|---|---|
| SC-1 | "데이터베이스: 로컬 SQLite 파일" 출력 | ✅ | start:local·seed:local·`--keep` 로그 |
| SC-2 | 로컬 `/api/stats` = 운영 (글·재료·규칙) | ✅ | materialsActive 4·drafts 60·published 0 |
| SC-3 | 5173에 운영 데이터 | ✅ | 글 페이지 대기열 60, 관련성 평균 4.2 패널, Blob 이미지 |
| SC-4 | 시드에 쓰기 요청 없음 | ✅ | `fetch` method 미지정(GET) |
| SC-5 | `.db`·`.env` git 미검출 | ✅ | `git status` |

**Overall Success Rate: 5/5**

## 1.5 Decision Record Summary

| 단계 | 결정 | 따랐나 | 결과 |
|---|---|---|---|
| Plan | 공개 API로 읽기 (pg_dump 아님) | ✅ | 접속정보 불필요, 운영엔 GET만 |
| Plan | 글+재료·규칙·프로필 | ✅ | 받은 글·활동 기록은 로컬 0 (의도) |
| Plan | 기존 dev.db 백업 후 새로 | ✅ | 10/15 원본은 `dev.2026-10-15.db`로 따로 복사 |
| Plan | 크론만 끔, AI 허용 | ✅ | |
| Design | 설계안 C | ✅ | 기존 `npm start`·`prepare-db.js`·Vercel 빌드 무수정 |
| Do | (변경) 사본을 먼저 받고 백업 | ✅ | 네트워크 실패 시 기존 dev.db 유지. 설계 v0.2 반영 |
| Check | G1 지금 수정 | ✅ | journal을 백업과 함께 이동 |

---

## 2. Related Documents

- Plan: `docs/01-plan/features/local-test-db.plan.md`
- Design: `docs/02-design/features/local-test-db.design.md` (v0.2)
- Analysis: `docs/03-analysis/local-test-db.analysis.md`

---

## 3. Completed Items

### 3.1 Functional Requirements

| ID | 요구사항 | 상태 |
|---|---|---|
| FR-01 | `.env` 값과 상관없이 SQLite | ✅ |
| FR-02 | 운영 GET 4개 → dev.db (id·날짜 유지) | ✅ |
| FR-03 | 기존 dev.db → dev.db.bak | ✅ (journal 포함) |
| FR-04 | 로컬 크론 끔 | ✅ |
| FR-05 | `npm run seed:local` | ✅ |
| FR-06 | `SEED_SOURCE_URL` | ✅ (localhost:3001 거부) |
| FR-07 | 부모 글 먼저 | ✅ |

### 3.2 Non-Functional Requirements

| 항목 | 기준 | 결과 |
|---|---|---|
| Safety | 운영 GET만, Postgres 연결 0 | ✅ 이중 가드 (DATABASE_URL 사전 확인 + 클라이언트 provider 확인) |
| Speed | 시드 1분 이내 | ✅ 5초 |
| Repeatable | 2회 같은 결과 | ✅ |

### 3.3 Deliverables

| 파일 | 내용 |
|---|---|
| `scripts/seed-local.js` (신규) | 운영 사본 → SQLite, `toRows`·가드·백업 |
| `scripts/start-local.js` (신규) | SQLite 강제 실행, `--keep` |
| `backend/src/seedLocal.test.ts` (신규) | 변환 6케이스 |
| `package.json` | `start:local`, `seed:local` |
| `.gitignore` | `*.db.bak*` |
| `CLAUDE.md` | 실행 절 1줄 |
| PDCA 문서 4개 | plan·design·analysis·report |

---

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

| 항목 | 이유 | 다음 |
|---|---|---|
| 상대경로 이미지 `/api/images/*.png` | 로컬에도 파일이 없어 안 보임 (운영 503과 같은 뿌리) | 3번 prod-ui-check |
| 이어하기(resume) 로컬 검증 | 운영 API가 brief·outline을 주지 않음 | 필요 시 별도 |

### 4.2 Cancelled/On Hold

- 받은 글·주제 카드·활동 기록·RSS 복사 — 범위 밖 (사용자 선택)

---

## 5. Quality Metrics

### 5.1 Final Analysis Results

| 축 | 점수 |
|---|---|
| Structural | 100% |
| Functional | 100% (Act-1 후) |
| Contract | 100% |
| Runtime | 100% (R1~R8 + L2 + L0) |

### 5.2 Resolved Issues

| # | 문제 | 해결 |
|---|---|---|
| G1 | 백업 시 `dev.db-journal` 삭제 → 끊긴 DB의 백업이 불완전 | `dev.db.bak-journal`로 함께 이동, 백업 교체 시에만 이전 journal 삭제, DB 없는 journal은 삭제 |
| (검증 중) | 비교 명령에서 본문 길이 1~2자 차이 | 운영 데이터 문제가 아니라 stdin 조각을 문자열로 이어 붙여 한글이 깨진 비교 스크립트 문제. 파일 비교로 60/60 일치 확인 |

---

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well

- 기존 `loadEnv`·dotenv의 "덮어쓰지 않음" 성질을 이용해 `.env`를 열지도 고치지도 않고 DB를 바꿨다.
- 사본을 먼저 받고 백업하는 순서로 바꿔 실패해도 잃는 것이 없게 했다.
- 운영 ↔ 로컬을 API 전체 필드로 비교해 "숫자가 맞다" 이상을 확인했다.

### 6.2 What Needs Improvement

- 로컬에 운영 DB에 붙은 서버가 3일간 떠 있었다. 오래 떠 있는 로컬 프로세스를 세션 시작 때 확인하는 습관이 필요하다.
- Node에서 stdin을 `d += chunk`로 모으면 한글이 깨진다 → `Buffer.concat` 사용.

### 6.3 What to Try Next

- 3번 prod-ui-check는 먼저 `start:local`로 로컬에서 배지·버튼을 보고, 운영 확인은 차이만.

---

## 7. Process Improvement Suggestions

### 7.2 Tools/Environment

- `CLAUDE.md`에 적은 대로, `.env`가 운영 Postgres면 `npm start` 대신 `npm run start:local`을 쓴다.

---

## 8. Next Steps

### 8.1 Immediate

- [ ] PR 리뷰 후 머지 (사용자가 "PR N 머지해줘"라고 할 때)
- [ ] 머지 후 archive

### 8.2 Next PDCA Cycle

- 3번 `prod-ui-check` — 운영 `/api/images/*.png` 503 원인부터

---

## 9. Changelog

### v1.0.0 (2026-10-19)

- 추가: `npm run start:local`, `npm run seed:local` (운영 DB 안 건드리는 로컬 실행)
- 추가: 사본 변환 단위 테스트 6개

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-19 | 완료 보고 | jeh-lab + Claude |
