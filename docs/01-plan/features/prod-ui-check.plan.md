# prod-ui-check Planning Document

> **Summary**: 운영 글 #37의 깨진 이미지 6개를 Vercel Blob으로 옮기고, 운영 화면의 배지·버튼·경고 3가지를 브라우저로 확인한다
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-21
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 운영 글 #37의 이미지 6개가 404로 깨진다. 10/16 운영 DB에 붙은 로컬 backend가 Blob 토큰 없이 그림을 PC(`backend/generated-images/`)에 저장하고 로컬 주소만 운영 DB에 넣었다. 또 image-relevance v1부터 배지·버튼·경고를 운영 화면에서 본 적이 없다. |
| **Solution** | PC에 남은 원본 6개를 Blob에 올리고 #37의 `content`·`imagePlan` 주소만 바꾼다(Ideogram 재생성 없음). 그다음 운영 화면 3가지를 브라우저로 확인해 표로 남긴다. |
| **Function/UX Effect** | #37 그림 6장이 운영에서 다시 보인다. 배지·버튼·경고가 실제로 보이는지 근거(스크린샷·표)가 생긴다. |
| **Core Value** | 이미지 비용 0으로 깨진 글을 복구하고, "화면 확인 못 함" 상태로 남아 있던 v1·v2·ai-token-warning 결과를 닫는다. |

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

## 1. Overview

### 1.1 Purpose

1. 운영 글 #37의 깨진 이미지 6개를 원본 그대로 복구한다.
2. 운영 화면에서 이미지 관련성 배지, "이미지 세트 다시 만들기" 버튼, 활동 기록의 "AI 길이 경고"가 보이는지 확인한다.

### 1.2 Background — 원인 조사 결과 (2026-10-21)

| 항목 | 확인 내용 |
|---|---|
| 깨진 글 | #37 "맥에서 SSH·SFTP·시리얼 콘솔을 한 창에서? PortButler 등장 소식과 확인할 점" (2026-10-16 11:11 KST, READY·DRAFT) |
| 깨진 주소 | `/api/images/1792116745241-52082a3b.png` 외 5개. 운영 응답 `404 {"error":"이미지를 찾을 수 없습니다."}` (10/19에 본 503도 같은 주소) |
| 들어 있는 필드 | `content` 6개, `imagePlan` 6개 |
| 원인 | `imageProvider.ts`의 `storeImage()`는 `BLOB_READ_WRITE_TOKEN`이 없고 `VERCEL`도 아니면 로컬 디스크에 저장한다. 10/16부터 운영 DB에 붙어 떠 있던 로컬 backend(local-test-db 보고서 §9)가 이 글을 만들었다. |
| 원본 | `backend/generated-images/`에 6개 모두 남아 있음 (10/16 11:12~11:13, 0.7~1.2MB) |
| 다른 글 | 나머지 59개는 `/api/images/` 주소 없음 (Blob 주소 또는 이미지 없음) |
| 재발 | `npm run start:local`(PR #27)이 SQLite를 강제해 같은 경로는 막힘 |

### 1.3 Related Documents

- `docs/bkit-next-prompts.md` 3번
- `docs/archive/2026-10/local-test-db/local-test-db.report.md` §4.1·§9
- `docs/archive/2026-10/image-relevance/`, `docs/archive/2026-10/image-relevance-v2/`
- `docs/04-report/ai-token-warning.report.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] #37 이미지 6개를 Vercel Blob(`post-images/`)에 올림 (원본 파일 그대로)
- [ ] #37의 `content`·`imagePlan` 안 `/api/images/…` 주소를 Blob 주소로 교체 (다른 필드·다른 글은 건드리지 않음)
- [ ] 운영 화면 확인 3가지: 이미지 관련성 배지 / "이미지 세트 다시 만들기" 버튼(보이기만, **누르지 않음**) / 활동 기록 "AI 길이 경고"
- [ ] 확인 결과를 표로 정리 (분석 문서 + gbrain)

### 2.2 Out of Scope

- Ideogram으로 이미지 새로 만들기 (비용 발생, 사용자 결정)
- 글자 유도 장면 금지 규칙(PR #22) 운영 확인 → 5번 image-abstract-scenes
- `storeImage()` 동작 변경 (재발 경로는 PR #27로 막혔음. 필요하면 설계에서 재검토)
- 로컬 `generated-images/` 정리·삭제

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | #37 이미지 6개를 원본 바이트 그대로 Blob에 올린다 | High | Pending |
| FR-02 | #37 `content`·`imagePlan`의 로컬 주소 6쌍을 Blob 주소로 바꾼다. 그 밖의 글자는 그대로 둔다 | High | Pending |
| FR-03 | 바꾸기 전 #37의 `content`·`imagePlan`을 로컬 파일로 백업한다 (git 미포함) | High | Pending |
| FR-04 | `.env`를 열지 않는다. 토큰·DB 주소가 필요하면 사용자가 직접 넣는 방식으로 한다 | High | Pending |
| FR-05 | 운영 화면 3가지를 Chrome으로 확인하고 스크린샷·표로 남긴다. 버튼은 누르지 않는다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Safety | 운영 DB 변경은 글 #37 한 개, 필드 2개뿐 | 변경 전후 `/api/posts` 비교 (#37 외 59개 동일) |
| Cost | Ideogram 호출 0 | 활동 기록·코드 경로 확인 |
| Security | 토큰이 대화·로그·git에 남지 않음 | 출력 확인, `git status` |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] SC-1: #37 이미지 6개 운영 주소 모두 200 (image/png)
- [ ] SC-2: 운영 `/api/posts`의 #37 `content`·`imagePlan`에 `/api/images/` 0건, 59개 다른 글은 변경 전과 같음
- [ ] SC-3: 운영 `/posts`에서 #37 그림 6장이 화면에 보임
- [ ] SC-4: 화면 확인 3가지 결과 표 완성 (보임/안 보임 + 근거)
- [ ] SC-5: Ideogram 호출 0, `.env` 미열람, git에 토큰·백업 파일 없음

### 4.2 Quality Criteria

- [ ] 백엔드 테스트 96/96 유지 (스크립트를 추가하면 그 테스트 포함)
- [ ] 타입체크·린트 통과 (코드 변경이 있을 때)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `imagePlan`은 기존 `PUT /api/posts/:id`로 못 바꿈 (title·content만 받음) | Medium | High | 설계에서 방법 선택: 운영 API 확장 / 사용자가 운영 DB 주소를 넣고 실행하는 1회용 스크립트 등 |
| 운영 DB 글을 잘못 덮어씀 | High | Low | 바꾸기 전 백업(FR-03), 주소 문자열만 치환, 6쌍 개수 확인 후 쓰기 |
| Blob 토큰·DB 주소 노출 | High | Low | 사용자가 `!` 명령으로 직접 환경변수 지정, 출력에 값 안 찍음 |
| 화면 확인 중 버튼을 눌러 비용 발생 | Medium | Low | 버튼은 위치·문구만 읽고 클릭 금지 (Chrome 도구에서 click 안 씀) |
| 글 #37이 그사이 수정·삭제됨 | Low | Low | 쓰기 직전 다시 읽고 주소 6개가 그대로일 때만 진행 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| 운영 Post #37 `content`, `imagePlan` | DB 데이터 | 이미지 주소 6쌍 교체 |
| Vercel Blob `post-images/` | 저장소 | 파일 6개 추가 |
| (선택) 1회용 스크립트 | 코드 | 설계에서 결정 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `content` | READ | 글 페이지 본문 렌더 (`frontend/src/pages/Posts`) | 그림이 보이게 됨 |
| `imagePlan` | READ | 파이프라인 패널 관련성 배지·장면 목록 | 주소만 바뀜, 점수·장면은 그대로 |
| `imagePlan` | UPDATE | `/api/posts/:id/images/:index/regenerate`, `/images/rebuild` | 기존 Blob 주소와 같은 형태라 영향 없음 (확인 필요) |
| `/api/images/:file` 라우트 | READ | 로컬 전용 | 변경 없음 |

### 6.3 Verification

- [ ] 교체 후 글 페이지·파이프라인 패널이 #37을 정상 표시
- [ ] 다른 글 59개 변화 없음

---

## 7. Architecture Considerations

### 7.1 Project Level

Dynamic (Express + Prisma + React, Vercel 배포). 이번 작업은 데이터 복구 + 확인이라 구조 변경 없음.

### 7.2 Key Decisions (설계 단계에서 확정)

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| #37 처리 | Blob 이전 / 그대로 / 재생성 | **Blob 이전** | 사용자 선택 (10/21). 비용 0, 원본 유지 |
| 확인 범위 | 3가지 / 3가지 + 글자 유도 장면 | **3가지** | 사용자 선택 (10/21). 글자 유도는 5번 |
| 운영 쓰기 경로 | API 확장 / 1회용 스크립트 / 기타 | 설계에서 | `imagePlan` 쓰기 경로가 없음 |

---

## 8. Convention Prerequisites

- `CLAUDE.md` 규칙 적용: `.env` 커밋 금지, 이름 기반 kill 금지, UI·커밋 한국어, `npm` 사용
- 스크립트를 추가하면 `scripts/` 기존 스타일(CommonJS, `[local]`류 한국어 출력)을 따른다

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | 넣는 사람 |
|----------|---------|-------|:---------:|
| `BLOB_READ_WRITE_TOKEN` | Blob 업로드 | 1회 실행 | 사용자 (`!` 명령) |
| (경로에 따라) 운영 `DATABASE_URL` | `imagePlan` 쓰기 | 1회 실행 | 사용자 |

---

## 9. Next Steps

1. [ ] 설계: 운영 쓰기 경로 3안 비교 → 선택
2. [ ] 구현·실행: 백업 → Blob 업로드 → 주소 교체 → 확인
3. [ ] 운영 화면 3가지 확인 → 분석·보고서

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-21 | 초안 (원인 조사 결과 포함) | jeh-lab + Claude |
