# image-jobs Completion Report

> **Feature**: image-jobs (`docs/bkit-next-prompts.md` 0번)
> **Date**: 2026-10-30
> **Author**: jeh-lab + Claude
> **Match Rate**: 97% → **99%** (Act-1 뒤)
> **Status**: Completed (10/30 운영 배포 · 크론 jobs 대기 확인 · 운영 업로드는 사용자 `push` 대기)

---

## Executive Summary

### 1.1 Project Overview

| 항목 | 내용 |
|---|---|
| 기능 | Ideogram을 지우고, 서버는 그림을 만들지 않고 "이미지 작업"만 남긴다. PC에서 구독 로그인된 Antigravity CLI(`agy`, Nano Banana)나 사람이 그림을 채워 올린다 |
| 기간 | 2026-10-26 ~ 10-30 (Plan v0.1~0.3 → Design v0.1~0.3 → Do → Check → Act-1 → Report) |
| 설계안 | C 균형 — 스키마 변경 없이 `imagePlan`이 큐, 순수 로직 `imageJobs.ts`, 모드 판단은 `imageMode()` 한 곳 |
| PR | [#37](https://github.com/Million-IMP/19auto-blog/pull/37) — 10/30 머지(master `0bdfe2a`)·운영 배포 |

### 1.2 Results Summary

| 지표 | 결과 |
|---|---|
| 성공 기준 | 5/5 충족 |
| Match Rate | 99% (크론 전체 실행 E2E만 조회 조건 확인으로 대신) |
| 테스트 | 182/182 (새 20개) |
| 자동 생성(#99) | `agy` 6장, 장면당 55~60초, 그림 안 글자 0/6, 관련성 5·5·4·4·4·4 |
| API 요금 | 0 (구독 사용량 6장, 시험 PNG는 직접 만든 단색 그림) |
| 변경 | 27개 파일 (신규 7 — 코드 3·PDCA 문서 4, 삭제 1). 코드·설정 17개 파일 +812/−163 |

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | 10/24부터 Ideogram이 401을 돌려줘 이미지 단계에서 글이 멈췄다(10/29 운영 사본 기준 29개). 공급자가 서버 안에 묶여 키 하나가 죽으면 파이프라인이 멈추고, 대시보드에는 글마다 작은 "실패" 배지뿐이라 이틀 동안 몰랐다. 사용자는 Ideogram을 취소하고 별도 API 없이 월 구독 이미지 모델을 쓰기로 했다. |
| **Solution** | `IMAGE_PROVIDER=jobs`면 IMAGES 단계는 장면 계획만 저장하고 오류 없이 기다린다. 작업 목록 API와 운영자 전용 업로드 API를 두고, PC 스크립트 `npm run image-jobs -- run`이 작업을 받아(`pull`) `agy`로 장면마다 그림 1장을 만들고(`generate`) 올린다(`push`). 마지막 장면이 올라가면 서버가 채점·본문 삽입 뒤 READY로 바꾼다. |
| **Function/UX Effect** | 공급자가 없어도 본문은 끝까지 완성된다. 대시보드에 "이미지 대기 N장 (글 M개)"과 실행 명령이 보이고, 장면마다 "작업 대기" 배지가 붙는다. "다시 생성"은 그 장면만 대기로 돌리고, 새 그림이 오기 전까지 이전 그림을 그대로 둔다. |
| **Core Value** | 이미지 생성이 서버에서 떨어져 공급자 고장이 글 작성을 막지 않는다. 이미 내는 구독만 쓰고, 로그인 토큰을 빼내지 않고 공식 CLI를 그대로 실행한다. |

## 1.4 Success Criteria Final Status

| SC | 기준 | 상태 | 근거 |
|---|---|:---:|---|
| SC-1 | jobs에서 렌더 0·stageError 0으로 대기, 다른 글 안 막힘 | ✅ | vitest, 로컬 #98 이어하기 0.1초, 크론 조회 render [99] / jobs [] |
| SC-2 | pull → 손 그림 → push로 한 글 READY | ✅ | #98 그림 6·설명글 6·채점 |
| SC-3 | `run`으로 한 글 자동 READY, API 요금 0 | ✅ | #99 6장, 장면당 55~60초, 글자 0/6 |
| SC-4 | Ideogram 참조 0, 과금 이미지 API 0 | ✅ | 코드·설정·안내 문서 0건(이전 기록만 남음) |
| SC-5 | 401·400·413 | ✅ | 로컬 curl 9건 |

**Overall Success Rate: 5/5**

## 1.5 Decision Record Summary

| 단계 | 결정 | 따랐나 | 결과 |
|---|---|:---:|---|
| Plan | Ideogram 취소, 별도 API 없이 월 구독 (사용자 10/26) | ✅ | 서버는 그림을 만들지 않고, `agy`가 구독으로 만든다 |
| Plan | 수동·자동 둘 다, 폴더 구조 공통 | ✅ | `image-jobs/{pending,done,uploaded}` 하나로 두 경로 |
| Plan | 멈춘 글 일괄 이어하기 넣지 않음 | ✅ | 글마다 "이어하기" → 작업 대기 |
| Design | 설계안 C 균형 (사용자 10/28) | ✅ | 스키마 변경 0, 신규 파일 3 |
| Design | 토큰·로그인 파일 읽지 않음, `--dangerously-skip-permissions` 쓰지 않음 | ✅ | 기본 headless + `--sandbox`로 그림 도구가 돌았다 |
| Do | module-1~4 전부 (사용자 10/29) | ✅ | 구독 사용량 6장 |
| Check | Critical 0 → 고칠 것만 고치고 진행 | ✅ | 사용자 지시 "특이사항 없으면 추천 방향", "남은 작업 완료" |

---

## 2. Related Documents

| 단계 | 문서 |
|---|---|
| Plan | [image-jobs.plan.md](./image-jobs.plan.md) v0.3 |
| Design | [image-jobs.design.md](./image-jobs.design.md) v0.3 |
| Check | [image-jobs.analysis.md](./image-jobs.analysis.md) |
| 결정 기록 | gbrain `decisions/19auto-blog-image-jobs` |

---

## 3. Completed Items

### 3.1 Functional Requirements

| ID | 내용 | 상태 |
|---|---|:---:|
| FR-01 | jobs 모드 IMAGES: 계획 저장, 렌더 없이 대기, stageError 없음 | ✅ |
| FR-02 | 진행 없으면 `advancePost` 종료, 크론 이어하기 목록에서 대기 글 제외 | ✅ |
| FR-03 | `GET /api/image-jobs` | ✅ |
| FR-04 | `POST /api/image-jobs/:postId/:index` (운영자, PNG/JPEG/WebP, 4MB) → 채점 → 마지막이면 READY | ✅ |
| FR-05 | `pull` | ✅ |
| FR-06 | `push` | ✅ |
| FR-07 | 다시 생성 → 장면 대기, 세트 다시 만들기 → 전체 대기 | ✅ |
| FR-08 | 대시보드 대기 표시 | ✅ |
| FR-09 | Ideogram 코드·스크립트·문서·privacy·terms 정리 | ✅ (Vercel 환경변수 삭제는 §8.1) |
| FR-10 | `generate` (`agy`) | ✅ |
| FR-11 | `run` | ✅ |

### 3.2 Non-Functional Requirements

| 항목 | 결과 |
|---|---|
| Security | 무인증 401, 형식·서명·크기 검사, 작업 대기 장면만 받음. `APP_PASSWORD`는 셸 환경변수로만, 출력하지 않음 |
| Cost | 과금 이미지 API 0. 한 번에 최대 6장(`IMAGE_JOBS_MAX`), 한도 문구·연속 2번 실패에서 멈춤 |
| Reliability | 공급자 없이도 본문 단계 진행. 실패한 작업은 `pending/`·`done/`에 남아 다음 실행이 이어간다 |
| Compatibility | `agy` 결과 약 0.8MB(4MB 안). 이전 글의 `provider: 'ideogram'` 기록은 그대로 |

### 3.3 Deliverables

| 구분 | 파일 |
|---|---|
| 신규 | `backend/src/services/imageJobs.ts`, `imageJobs.test.ts`, `scripts/image-jobs.js` |
| 서버 | `imageProvider.ts`(Ideogram 삭제, `imageMode`·`storeImage`), `imageQuality.ts`, `aiService.ts`, `draftPipeline.ts`, `automationService.ts`, `index.ts` |
| 화면 | `DashboardPage.tsx`, `PipelinePanel.tsx`, `ActivityPage.tsx` |
| 삭제 | `scripts/check-ideogram.js` |
| 문서·설정 | README, CLAUDE.md, `backend/.env.example`, `.claude/skills/autoblog-ai-pipeline/SKILL.md`, `docs/bkit-next-prompts.md`, `frontend/public/privacy.html`·`terms.html`, `.gitignore`, `package.json` |

---

## 4. Incomplete Items

### 4.1 Carried Over

| 항목 | 이유 | 다음 |
|---|---|---|
| ~~운영 배포~~ | 10/30 완료 (§7) | — |
| 운영 업로드 확인 | `express.raw`가 Vercel 함수에서 바이트를 그대로 받는지는 로컬에서만 봤다. 운영 작업으로 만든 그림은 `image-jobs/done`에 있다 | 사용자가 별도 PowerShell에서 `npm run image-jobs -- push` (운영자 비밀번호) |
| ~~크론 전체 실행 E2E~~ | 10/30 00:00 UTC 크론이 만든 #128이 본문 완성 뒤 오류 없이 그림 대기 (§7) | — |
| 멈춘 글 이미지 | 30개 글은 이어하기로 작업 대기가 됐다(§7). 구독 이미지 한도 때문에 199장은 여러 번 나눠 만든다 | 한도가 풀릴 때마다 `generate` → `push` |
| 개인정보처리방침 시행일 | "시행 7일 전 고지" 조항 — 사용자 결정 | 시행일 유지 또는 새 날짜 |

### 4.2 Cancelled / On Hold

- Codex CLI(ChatGPT 구독) 작업자 — `agy`가 막힐 때의 예비 경로로만 기록
- Ideogram 새 키 발급 — 사용자가 취소(10/26)

---

## 5. Quality Metrics

### 5.1 Final Analysis Results

| 축 | 점수 |
|---|:---:|
| Structural | 100 |
| Functional | 100 |
| Contract | 100 |
| Runtime | 97.5 |
| **Overall** | **99%** |

검증: 백엔드 테스트 182/182, 타입체크 exit 0, 프론트 린트 exit 0(기존 경고만), 빌드 통과, 휴대폰 너비 7페이지 × 2폭 넘침 0.

### 5.2 Resolved Issues

| 단계 | 문제 | 처리 |
|---|---|---|
| Do | `pull`이 `.agy` 출처 표시를 지워 `agy` 그림이 `manual`로 기록됨 | 확장자와 상관없이 같은 작업으로 봄 |
| Do | 이미 READY인 글의 장면 교체에도 "글 완성(READY)" 출력 | 응답에 `completed`(이번 업로드로 READY) 추가 |
| Check | render 모드에서도 작업 목록이 크론이 그리는 중인 장면을 내놓음(구독 사용량 중복·오안내) | jobs 모드가 아니면 빈 목록 |
| Check | 대체 그림 찾기가 여러 장일 때 첫 파일을 고름 | 가장 늦게 생긴 파일 |

---

## 6. Lessons Learned

### 6.1 What Went Well

- `agy`의 `--output-format json` 대화 id + 대화 기록의 "Final image path"로 결과 파일을 정확히 찾았다. 시각만으로 찾는 방식보다 다른 대화와 섞일 일이 없다
- `imagePlan`이 이미 미완성 장면을 기록하고 있어 큐 테이블 없이 끝났다(스키마 변경 0)
- 실제 SQLite 조회로 크론 제외 조건을 확인해 prisma 목만으로는 못 보는 조건 오류 가능성을 줄였다

### 6.2 What Needs Improvement

- 모드가 둘(render·jobs)인 기능은 "다른 모드에서 이 API가 무엇을 돌려주나"를 Design 단계 표에 넣어야 한다. 작업 목록의 render 모드 동작을 Check에서야 찾았다
- 스크립트의 대체 경로(가장 늦은 파일)는 실제로 타지 않아 Do 시험에서 드러나지 않았다

### 6.3 What to Try Next

- 구독 이미지 한도가 실제로 얼마인지 며칠 운영하며 기록(`IMAGE_JOBS_MAX` 조정 근거). 첫 관찰은 §7: 10장째에 429
- 한도에 걸리면 `agy` 대화 기록의 `quotaResetTimeStamp`를 읽어 "몇 시에 풀림"을 출력하면 다음 실행 시각을 바로 알 수 있다
- 기기 화면이 흐리게 그려지는 문제는 `image-device-text`(7번)에서 함께 본다. 운영 첫 묶음에서는 반대로 화면을 돌려 달라는 장면 3장에 코드 줄이 보였다(읽히는 글자는 0)

---

## 7. 운영 적용 (2026-10-30)

| 항목 | 결과 |
|---|---|
| 환경변수 | 머지 직전 `IDEOGRAM_*`가 그대로라 사용자 선택("Claude가 env 바꾸고 머지")으로 vercel CLI가 `IMAGE_PROVIDER=jobs`로 바꾸고 `IDEOGRAM_API_KEY`·`IDEOGRAM_RENDERING_SPEED`를 지움. 이미지 관련 변수는 `IMAGE_PROVIDER`·`BLOB_READ_WRITE_TOKEN`만 남음 |
| 첫 운영 빌드 | **실패** — 빌드 postinstall `prisma db push`가 Neon에 `P1001`(약 5초). 같은 시각 운영 API는 200이지만 4~6초(Neon 깨어나는 지연). 실패 중에도 이전 배포가 계속 서비스 |
| 재배포 | `vercel redeploy <실패 배포> --target production` → 2분 만에 READY, 19auto-blog.vercel.app 연결. `/api/stats`·`/api/posts` 200, `GET /api/image-jobs` 200, 로그인 없는 업로드 401 |
| 크론 | 00:00 UTC 크론이 만든 #128(00:00:39)과 다음 #129가 본문 완성 뒤 `stageError` 없이 그림 대기 → jobs 모드 크론 동작 확인 |
| 멈춘 글 | #97은 Ideogram이 5장을 만든 뒤 멈춘 글이라 1장만 대기. #98~#127 30개는 모두 계획이 있고 그림 0장 → 이어하기(AI 호출 없음, 30/30 성공). 작업 목록 209장(글 34개) |
| 생성 | 운영 작업으로 `agy` 10장(#97 1·#128 5·#98 4), 장면당 52~102초, 읽히는 글자 0/10 |
| 구독 한도 | 10장째 다음 장면에서 `gemini-3.1-flash-image` 429 `RESOURCE_EXHAUSTED`("Your quota will reset after 1h28m"). 스크립트가 한도로 판단해 멈추고 남은 작업은 `pending/`에 남김(설계대로) |

남은 이미지 199장은 한도가 풀릴 때마다 나눠 만든다. 크론이 하루 약 5개 글(#125~#129가 18시간 사이)을 만들어 그림이 하루 약 30장씩 늘어나므로, 한도 안에서 새 글과 밀린 글을 함께 소화할 수 있는지는 며칠 관찰한다.

---

## 8. Next Steps

### 8.1 Immediate (사용자)

1. 별도 PowerShell 창에서 `$env:APP_PASSWORD = Read-Host` → `npm run image-jobs -- push` (만들어 둔 그림 올리기 — 운영 업로드 첫 확인)
2. 한도가 풀리면 `npm run image-jobs -- run` 반복 (한 번에 최대 6장, `IMAGE_JOBS_MAX`로 조정)
3. 개인정보처리방침 시행일 결정
4. (권장) `APP_PASSWORD`를 더 긴 값으로 교체 후 재배포 — 대화에 값이 남음

### 8.2 Next PDCA Cycle

- `image-device-text` (7번): 기기 표면 글자·흐린 화면, 배송 상자 반복

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-30 | 완료 보고 | jeh-lab + Claude |
| 1.1 | 2026-10-30 | §7 운영 적용(배포 실패·재배포, 크론 확인, 멈춘 글 30개 이어하기, 구독 한도 첫 관찰), §4.1·§8.1 갱신 | jeh-lab + Claude |
