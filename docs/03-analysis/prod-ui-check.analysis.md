# prod-ui-check Gap Analysis

> **Feature**: prod-ui-check
> **Date**: 2026-10-21
> **Plan**: [prod-ui-check.plan.md](../01-plan/features/prod-ui-check.plan.md)
> **Design**: [prod-ui-check.design.md](../02-design/features/prod-ui-check.design.md) (v0.1, 설계안 C)
> **Match Rate**: 97% → **100%** (런타임 포함 공식, 운영 `--apply` 후 — §8.2)
> **구현**: PR #29 (`23e6a3b`, 머지 `7019cc3`, 10/21 운영 배포)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 글 #37 이미지 6개 404 + 배지·버튼·경고를 운영 화면에서 확인한 적 없음 |
| **WHO** | 글을 검수하는 운영자 1명 |
| **RISK** | 운영 DB 글 1개 수정 중 본문·이미지 계획을 잘못 덮어씀 / 확인 중 "이미지 세트 다시 만들기"를 눌러 Ideogram 비용 발생 |
| **SUCCESS** | #37 이미지 6개 운영 200 + 본문·imagePlan에 `/api/images/` 0건 + 화면 3가지 확인 표 완성 |
| **SCOPE** | ① #37 이미지 Blob 이전 ② 운영 화면 3가지 확인 ③ 기록 |

---

## Strategic Alignment Check

### PRD Alignment

PRD 없음. Plan의 WHY 두 가지 중 "화면 확인"은 끝났다. "#37 복구"는 도구·서버가 운영에 있고 사용자 `--apply` 실행만 남았다.

### Success Criteria Status

| SC | 기준 | 상태 | 근거 |
|---|---|:---:|---|
| SC-1 | #37 이미지 6개 운영 주소 200 | ✅ (§8.2) | 적용 전: 로컬 원본 6개, 각각 본문 1·계획 1 |
| SC-2 | #37에 `/api/images/` 0건, 다른 글 그대로 | ✅ (§8.2) | 백업과 비교 |
| SC-3 | `/posts`에서 #37 그림 6장 보임 | ✅ (§8.2) | 적용 전 기준값: 그림 12개 모두 로컬 주소, 로드 0 → 12/12 |
| SC-4 | 화면 확인 3가지 표 완성 | ✅ | §2.7 L2 표 |
| SC-5 | Ideogram 호출 0, `.env` 미열람, git에 토큰·백업 없음 | ✅ | relink 경로에 이미지 생성 없음, 운영 환경변수는 이름만 확인, 커밋 파일 9개에 비밀값·백업 없음 |

### Decision Record Verification

| 결정 | 내용 | 지킴 |
|---|---|:---:|
| Plan: #37 처리 | 로컬 원본을 Blob에 올림 (재생성 없음) | ✅ `put(post-images/<같은 이름>, 원본 바이트)` |
| Plan: 확인 범위 | 3가지 (글자 유도 장면은 5번) | ✅ |
| Design: 설계안 C | 운영자 전용 relink, 같은 이름 Blob 주소만 | ✅ `requireAdmin` + `parseRelinkPairs` |
| 운영 규칙 | "이미지 세트 다시 만들기" 누르지 않음 | ✅ 섹션 제목 버튼만 눌러 펼침, 그 버튼은 클릭 0 |

---

## 1. Analysis Overview

### 1.2 Analysis Scope

- 서버: `backend/src/services/imageRelink.ts`, `draftPipeline.ts`(`relinkPostImages`), `index.ts`(라우트)
- 스크립트: `scripts/relink-local-images.js`
- 운영 화면: `/posts` 파이프라인 패널, `/activity`

---

## 2. Gap Analysis (Design vs Implementation)

### 2.1 API (§4)

| 항목 | 설계 | 구현 | 일치 |
|---|---|---|:---:|
| 경로·인증 | `POST /api/posts/:id/images/relink`, `requireAdmin` | 같음 (`index.ts`, `/images/rebuild` 다음, `3.0.3-2`) | ✅ |
| pairs 1~20, from·to 형식, 같은 이름, from 중복 없음 | §4.2 | `parseRelinkPairs` | ✅ |
| 글 없음 404 → Blob HEAD(5초) → 잠금 → 다시 읽기 → 계획 없음 409 → missing 409 → 저장 → `finally` 해제 | §4.2 처리 1~6 | `relinkPostImages` 순서 같음 (HEAD는 병렬) | ✅ |
| 응답 | `{ id, replaced: { content, imagePlan } }` | 같음 | ✅ |
| 400 메시지 | "잘못된 요청입니다" | 원인별 메시지 (예: "이 프로젝트 Blob 주소가 아닙니다: …") | ⚠️ 더 자세함 (의도된 차이) |

### 2.3 Component Structure (§11.1)

| 파일 | 설계 | 구현 |
|---|---|:---:|
| `imageRelink.ts` / `.test.ts` | 신규 | ✅ |
| `draftPipeline.ts` / `index.ts` | 수정 | ✅ |
| `scripts/relink-local-images.js` | 신규 | ✅ |
| (추가) `auth.ts` 주석, `CLAUDE.md` | — | `APP_PASSWORD` 쓰임새에 relink 추가 |

### 2.4 Functional Depth (스크립트 §2.2·§6.2)

| 항목 | 구현 | 확인 |
|---|---|:---:|
| 기본 dry-run, `--post N`, `--apply` | ✅ | 운영 dry-run 2회 (쓰기 0) |
| 로컬 파일 없음·한쪽에만 있음 → `--apply` 거부 | ✅ `problems()` | 코드 |
| 환경변수 없음 → 시작 전 중단 (이름만 출력) | ✅ | 실행: 백업 파일 0개 |
| 백업(git 제외 폴더) → 업로드(`allowOverwrite`) → 로그인 → 교체 → 확인 | ✅ | 로컬 L1은 라우트로 확인, 운영 실행은 대기 |
| 확인: 남은 로컬 주소·Blob 200·다른 글 변화 | ✅ (다른 글 비교는 설계보다 추가) | — |

### 2.6 API Contract

스크립트 `relink()`가 보내는 `{ pairs: [{ from, to: blob.url }] }`와 쿠키 `autoblog_session`이 서버 검사·`requireAdmin`과 맞는다. `to`는 `put()`이 돌려준 주소라 서버 형식 검사를 통과한다 (`addRandomSuffix: false`, 기존 운영 Blob 주소 형식과 같음).

### 2.7 Runtime Verification Results

**L0** — `npm test --prefix backend`: 108/108 (새 12: `parseRelinkPairs` 8, `relinkUrls` 4)

**L1 (로컬 `start:local`, `APP_PASSWORD` 임시값)**

| # | 요청 | 기대 | 결과 |
|---|---|---|:---:|
| 1 | 로그인 없음 | 401 | ✅ `AUTH_REQUIRED` |
| 2 | 다른 호스트 / pairs 없음 / 없는 글 | 400 / 400 / 404 | ✅ |
| 3 | #37 (Blob 아직 없음) | 409 | ✅ "Blob에 이미지가 없습니다" |
| 4 | 사본 #76 Blob 그림을 로컬 주소로 바꾼 뒤 relink | 200 | ✅ 본문·계획 원래와 바이트 단위 같음, `lockedUntil` null |
| 5 | 4번 다시 | 409 | ✅ "본문/계획에서 주소를 찾지 못했습니다" |

**운영 배포 확인**: 로그인 없이 relink → 401 (5/5)

**L2 운영 화면 (Chrome, 2026-10-21, 클릭 없이 확인 — 접힌 섹션 제목만 펼침)**

| # | 항목 | 결과 | 근거 |
|---|---|:---:|---|
| 1 | 이미지 관련성 배지 | ✅ 보임 | #76 "이미지 계획 · 6장 · 관련성 평균 4.2" 펼치면 장면마다 "관련성 5/5", "관련성 4/5"×5. 계획 있는 글 46개 중 점수 있는 글 24개 |
| 2 | 장면 썸네일 | ✅ 보임 | #76 그림 12/12 로드 |
| 3 | "이미지 세트 다시 만들기" 버튼 | ✅ 보임 (**누르지 않음**) | 이미지 계획 섹션 오른쪽 위, 안내 "글 내용과 맞지 않으면 이미지 세트를 통째로 다시 만들 수 있습니다." #37에도 보임 |
| 4 | 활동 기록 "AI 길이 경고" | ✅ 보임 | `/activity` → "오류": 10/20 00:35(KST) "AI 길이 경고 · scoreImage 응답 900/1024 토큰 (87%)" (운영 기록 1건) |
| 5 | #37 본문 그림 6장 | ⏳ 대기 | 현재 로드 0/12 (모두 `/api/images/…`) |

### 2.8 Match Rate Summary

| 축 | 점수 | 비고 |
|---|---:|---|
| Structural | 100% | 설계 파일 5개 모두 |
| Functional | 97% | 운영 `--apply`·#37 화면만 대기 |
| Contract | 100% | 스크립트 ↔ 라우트 ↔ 검사 |
| Runtime | 93% | L0·L1·L2 4/5, #37 화면 대기 |
| **Overall** | **97%** | 0.15·100 + 0.25·97 + 0.25·100 + 0.35·93 ≈ 96.8 |

---

## 3. Code Quality Analysis

### 3.2 Code Smells

- 없음 (Critical·Important 0). `relinkPostImages`는 `regenerateImage`와 같은 잠금·다시 읽기·`finally` 구조다.

### 3.3 Security Issues

- 쓰기 경로는 `requireAdmin` 뒤에만 있다. 운영에 `APP_PASSWORD` 설정됨 (이름만 확인).
- `to`는 이 프로젝트 Blob 형식 + 같은 파일 이름만 → 임의 주소 삽입·임의 HEAD 요청 불가.
- 스크립트는 토큰·비밀번호·쿠키를 출력하거나 파일로 남기지 않는다. 비밀값은 사용자가 별도 PowerShell 창에서 `Read-Host -AsSecureString`으로 넣는다 (`!` 명령은 명령줄이 대화에 남으므로 쓰지 않음).

---

## 4. Operational Notes

- 업로드 직후 Blob CDN 반영이 늦으면 서버 HEAD가 404일 수 있다 → 409 "Blob에 이미지가 없습니다", 아무것도 저장 안 함. 1분 뒤 같은 명령을 다시 실행하면 된다 (같은 이름으로 다시 올림).
- 교체가 끝난 뒤 다시 실행하면 dry-run 단계에서 "바꿀 주소가 없습니다"로 끝난다.

---

## 8. Overall Score

97%. Critical·Important 이슈 0 → Checkpoint 5는 "그대로 진행" (사용자 지시: 특이사항 없으면 추천 방향). 남은 일은 사용자 `--apply` 1회와 그 뒤 SC-1~3 확인.

---

## 8.1 Act-1 — 첫 `--apply` 실행 (2026-10-21 17:36)

| 단계 | 결과 | 근거 |
|---|---|---|
| 환경변수 확인 → 백업 | ✅ | `backend/generated-images/relink-backup-37-1792571771959.json` (13KB) |
| Blob 업로드 6개 | ✅ | 6개 모두 HEAD 200 `image/png` |
| 운영자 로그인 | ❌ 401 | Vercel 로그 `POST /api/auth/login` 401 (17:36:05), relink 요청 없음 |
| #37 | 그대로 | 로컬 주소 6개 남음 — 운영 글 변경 0 |

원인: 입력한 `APP_PASSWORD`가 운영 값과 다름 (값은 확인하지 않음. 한/영 입력 상태·붙여넣기 문제 가능).

수정 (`scripts/relink-local-images.js`):
- 로그인을 업로드보다 먼저 한다 → 비밀번호가 틀리면 백업·업로드 전에 멈춘다.
- 401이면 "한/영 입력 상태 확인, 대시보드 사용후기 '운영자'에서 먼저 로그인" 안내를 출력한다.
- 실패 시 `process.exit(1)` 대신 `process.exitCode = 1` — Windows Node 25에서 찍히던 `Assertion failed … async.c` 경고 제거.
- 로컬 확인: 틀린 비밀번호로 `--apply` → 401 안내, 백업 수 그대로(1), exit 1, 경고 없음.
- `--skip-upload` 추가: 이미 올린 같은 이름 Blob을 HEAD로 확인만 하고 교체 → 다시 실행할 때 `APP_PASSWORD`만 필요. 로컬 사본(`start:local`)에서 토큰 없이 끝까지 실행: 교체 본문 6·계획 6, 남은 로컬 주소 0, Blob 200 6/6, 다른 글 70개 변화 0, 다시 실행 시 "바꿀 주소가 없습니다".

---

## 8.2 운영 적용 (2026-10-21 17:48, `--apply --skip-upload`)

| SC | 결과 | 근거 |
|---|:---:|---|
| SC-1 | ✅ | Blob 주소 6개 HEAD 200 `image/png` |
| SC-2 | ✅ | `/api/images/` 0건. 백업(`relink-backup-37-1792572522958.json`)과 비교: 제목 같음, 본문 = 백업의 주소 6쌍만 바꾼 값, 계획은 url 외 같음. 다른 글 70개 중 로컬 주소 있는 글 0. `status` DRAFT·`stage` READY 그대로 |
| SC-3 | ✅ | `/posts` #37 카드 그림 12/12 로드 (본문 6·썸네일 6, Blob, 1408·1312px) |

다시 dry-run: "바꿀 주소가 없습니다". Match Rate 100% (Functional·Runtime 100).

---

## 9. 세션 중 발견 (기능 범위 밖)

- #37은 관련성 점수가 없다 (6장면 모두). 로컬 backend가 만든 글이라 채점이 돌지 않았거나 실패한 것으로 보인다. relink 뒤에도 배지는 없다 — 필요하면 장면별 "다시 생성"(비용 발생)으로 채점된다. 이번 범위에서는 하지 않는다.
