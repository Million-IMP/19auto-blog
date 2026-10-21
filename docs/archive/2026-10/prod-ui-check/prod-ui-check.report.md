# prod-ui-check Completion Report

> **Feature**: prod-ui-check (`docs/bkit-next-prompts.md` 3번)
> **Date**: 2026-10-21
> **Author**: jeh-lab + Claude
> **Match Rate**: 97% → **100%** (운영 `--apply` 후)
> **Status**: Completed

---

## Executive Summary

### 1.1 Project Overview

| 항목 | 내용 |
|---|---|
| 기능 | 운영 글 #37의 깨진 이미지 6개 복구 + 운영 화면 3가지(관련성 배지·이미지 세트 다시 만들기 버튼·AI 길이 경고) 확인 |
| 기간 | 2026-10-21 (하루, Plan → Design → Do → Check → Act-1 → Report) |
| 설계안 | C 좁은 운영 API (운영자 전용 relink 라우트 + 1회용 스크립트) |
| PR | #29 서버·스크립트 (머지 `7019cc3`), 이 보고서 PR (스크립트 보완 + 문서) |

### 1.2 Results Summary

| 지표 | 결과 |
|---|---|
| 성공 기준 | 5/5 충족 |
| Match Rate | 100% |
| 테스트 | 108/108 (새 12개) |
| #37 이미지 | 404 6개 → Blob 200 6/6, 화면 12/12 로드 |
| 운영 글 변경 | #37 한 개, `content`·`imagePlan`의 주소 6쌍만 (백업과 비교) |
| 이미지 생성 비용 | 0 (Ideogram 호출 0) |

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | 운영 글 #37의 그림 6장이 404였다. 10/16 운영 DB에 붙은 로컬 backend가 Blob 토큰 없이 그림을 PC에 저장하고 `/api/images/…` 주소만 운영 DB에 넣었다. 또 v1부터 배지·버튼·경고를 운영 화면에서 본 적이 없었다. |
| **Solution** | PC에 남은 원본을 같은 이름으로 Blob에 올리고, 운영자만 쓰는 relink 라우트로 본문·이미지 계획 주소를 함께 바꿨다. 서버는 "같은 파일 이름의 이 프로젝트 Blob 주소"로 바꾸는 일만 받는다. 운영 DB 접속정보는 PC로 오지 않았다. |
| **Function/UX Effect** | #37 그림 6장(본문·썸네일 12개)이 운영에서 다시 보인다. 배지·버튼·경고 3가지가 운영 화면에 보이는 것을 근거와 함께 확인했다. |
| **Core Value** | 이미지 비용 0으로 깨진 글을 복구했고, "화면 확인 못 함"으로 남아 있던 image-relevance v1·v2와 ai-token-warning의 화면 확인을 닫았다. |

## 1.4 Success Criteria Final Status

| SC | 기준 | 상태 | 근거 |
|---|---|:---:|---|
| SC-1 | #37 이미지 6개 운영 200 | ✅ | Blob 주소 6개 HEAD 200 `image/png` |
| SC-2 | #37에 `/api/images/` 0건, 다른 글 그대로 | ✅ | 남은 로컬 주소 0. 백업과 비교: 제목·본문(주소 외)·계획(url 외) 같음. 다른 글 70개 중 로컬 주소 있는 글 0 |
| SC-3 | `/posts`에서 #37 그림 보임 | ✅ | #37 카드 그림 12/12 로드 (Blob, 원본 1408·1312px) |
| SC-4 | 화면 확인 3가지 표 | ✅ | §3.4 |
| SC-5 | Ideogram 0, `.env` 미열람, git에 토큰·백업 없음 | ✅ | relink 경로에 생성 없음, 운영 환경변수는 이름만 확인, 백업은 git 제외 폴더 |

**Overall Success Rate: 5/5**

## 1.5 Decision Record Summary

| 단계 | 결정 | 따랐나 | 결과 |
|---|---|:---:|---|
| Plan | #37은 로컬 원본을 Blob에 올림 (재생성 안 함) | ✅ | 원본 바이트 그대로, 비용 0 |
| Plan | 확인 범위 3가지 (글자 유도 장면은 5번) | ✅ | |
| Design | 설계안 C 좁은 운영 API | ✅ | `requireAdmin` + 같은 이름 Blob 주소만 |
| Do | 비밀값은 사용자가 직접 입력 | ✅ | `!` 대신 별도 PowerShell 창 (명령줄이 대화에 남지 않게). Claude는 운영 로그인을 대신하지 않음 |
| Check | Critical·Important 0 → 그대로 진행 | ✅ | 사용자 지시 "특이사항 없으면 추천 방향" |
| Act-1 | 첫 `--apply` 401 → 로그인 먼저·`--skip-upload` | ✅ | 두 번째 실행에서 비밀번호만으로 완료 |

---

## 2. Related Documents

- Plan: [prod-ui-check.plan.md](./prod-ui-check.plan.md)
- Design: [prod-ui-check.design.md](./prod-ui-check.design.md)
- Analysis: [prod-ui-check.analysis.md](./prod-ui-check.analysis.md)

---

## 3. Completed Items

### 3.1 Functional Requirements

| ID | 요구사항 | 상태 |
|---|---|:---:|
| FR-01 | #37 이미지 6개를 원본 그대로 Blob에 | ✅ `post-images/<같은 이름>` |
| FR-02 | 본문·계획 주소 6쌍만 교체 | ✅ 백업과 비교로 확인 |
| FR-03 | 바꾸기 전 백업 (git 제외) | ✅ `backend/generated-images/relink-backup-37-*.json` |
| FR-04 | `.env` 안 읽음, 비밀값은 사용자 입력 | ✅ |
| FR-05 | 화면 3가지 Chrome 확인, 버튼 누르지 않음 | ✅ |

### 3.2 Non-Functional Requirements

| 항목 | 기준 | 결과 |
|---|---|---|
| Safety | 운영 변경은 글 1개·필드 2개 | ✅ |
| Cost | Ideogram 0 | ✅ |
| Security | 토큰이 대화·로그·git에 없음 | ✅ (스크립트는 값을 출력하지 않음) |

### 3.3 Deliverables

| 파일 | 내용 |
|---|---|
| `backend/src/services/imageRelink.ts` (신규) | `parseRelinkPairs`, `relinkUrls` |
| `backend/src/services/imageRelink.test.ts` (신규) | 12케이스 |
| `backend/src/services/draftPipeline.ts` | `relinkPostImages` (HEAD 확인 → 잠금 → 다시 읽기 → 저장) |
| `backend/src/index.ts` | `POST /api/posts/:id/images/relink` (운영자 전용) |
| `scripts/relink-local-images.js` (신규) | dry-run 기본, `--apply`, `--skip-upload` |
| `CLAUDE.md`, `auth.ts` 주석 | `APP_PASSWORD` 쓰임새 |
| PDCA 문서 4개 | plan·design·analysis·report |

### 3.4 운영 화면 확인 (2026-10-21, Chrome, 클릭 없음)

| 항목 | 결과 | 근거 |
|---|:---:|---|
| 이미지 관련성 배지 | ✅ | #76 장면마다 "관련성 5/5"·"4/5", 섹션 제목 "관련성 평균 4.2". 계획 있는 글 46개 중 점수 있는 글 24개 |
| "이미지 세트 다시 만들기" 버튼 | ✅ (누르지 않음) | 이미지 계획 섹션 오른쪽 위, 안내 문구와 함께. #37에도 보임 |
| 활동 기록 "AI 길이 경고" | ✅ | `/activity` "오류": 10/20 00:35 "scoreImage 응답 900/1024 토큰 (87%)" |
| #37 그림 | ✅ | 0/12 → 12/12 |

---

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

| 항목 | 이유 | 다음 |
|---|---|---|
| #37 관련성 점수 없음 | 로컬 backend가 만든 글이라 채점이 돌지 않음. 배지는 안 보임 | 필요하면 장면별 "다시 생성"(비용 발생) — 사용자 판단 |
| `APP_PASSWORD` 교체 | 대화에 비밀번호가 남음 | 사용자가 Vercel에서 바꾸고 다시 배포 (권장) |
| ai-token-warning 제한 조정·archive | 경고 1건(scoreImage 87%) 확인됨 | 10/25쯤 기록 더 보고 결정 |

### 4.2 Cancelled/On Hold

- Ideogram 재생성, `storeImage()` 변경, 로컬 `generated-images/` 정리 — 범위 밖

---

## 5. Quality Metrics

### 5.1 Final Analysis Results

| 축 | 점수 |
|---|---|
| Structural | 100% |
| Functional | 100% |
| Contract | 100% |
| Runtime | 100% (L0 108/108, L1 5/5, L2 화면 5/5, 운영 적용·확인) |

### 5.2 Resolved Issues

| # | 문제 | 해결 |
|---|---|---|
| A1 | 첫 `--apply`: 업로드 후 로그인 401 → 그림만 올라가고 글은 그대로 | 로그인을 업로드보다 먼저, 401이면 확인 방법 안내 |
| A2 | 다시 실행에 Blob 토큰까지 필요 | `--skip-upload`: 이미 올린 같은 이름 Blob을 확인만 하고 교체 |
| A3 | 실패 시 Windows Node 25 `Assertion failed … async.c` 경고 | `process.exit(1)` → `process.exitCode = 1` |

---

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well

- 원인을 먼저 좁혔다 (503/404 → 로컬 디스크 저장 → 원본이 PC에 있음) → 재생성 비용 없이 복구.
- 서버 쓰기 권한을 "같은 이름 Blob 주소로 바꾸기"로만 좁혀 운영자 계정이 있어도 엉뚱한 주소를 넣을 수 없게 했다.
- 로컬 사본(`start:local`)에서 사용자가 실행할 명령과 같은 경로를 끝까지 돌려 보고 넘겼다.

### 6.2 What Needs Improvement

- 외부 확인(로그인)을 비용·부작용 있는 단계(업로드)보다 먼저 두지 않아 첫 실행이 반쯤 진행됐다.
- `!` 명령은 명령줄이 대화에 남는다. 비밀값은 처음부터 별도 터미널 + `Read-Host`로 안내해야 한다.

### 6.3 What to Try Next

- 운영에 쓰는 1회용 스크립트는 "인증 확인 → 백업 → 부작용" 순서를 기본으로.

---

## 7. Process Improvement Suggestions

### 7.2 Tools/Environment

- Chrome 확장 스크린샷이 이 PC에서 자주 30초 시간 초과. 화면 확인 근거는 DOM 값(로드 수·문구)으로 남기고 스크린샷은 보조로.

---

## 8. Next Steps

### 8.1 Immediate

- [ ] 이 보고서 PR 머지 (사용자 위임) → archive
- [ ] (권장) `APP_PASSWORD` 교체

### 8.2 Next PDCA Cycle

- 4번 `ai-call-cleanup` — aiService 직접 호출 3곳을 askText로

---

## 9. Changelog

### v1.0.0 (2026-10-21)

- 추가: `POST /api/posts/:id/images/relink` (운영자 전용, 로컬 이미지 주소 → 같은 이름 Blob 주소)
- 추가: `scripts/relink-local-images.js` (dry-run / `--apply` / `--skip-upload`)
- 복구: 운영 글 #37 이미지 6개

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-21 | 완료 보고 | jeh-lab + Claude |
