# prod-ui-check Design Document

> **Summary**: 운영자 전용 `POST /api/posts/:id/images/relink`(로컬 주소 → 같은 이름의 Blob 주소만 허용) + 1회용 `scripts/relink-local-images.js`(dry-run 기본) — 설계안 C
>
> **Project**: 19auto-blog
> **Author**: jeh-lab + Claude
> **Date**: 2026-10-21
> **Status**: Draft
> **Plan**: [prod-ui-check.plan.md](./prod-ui-check.plan.md)

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

### 1.1 Design Goals

1. 운영 DB 접속정보 없이 #37의 `content`·`imagePlan`을 함께 고친다.
2. 서버가 할 수 있는 일을 "로컬 이미지 주소 → 같은 파일 이름의 Blob 주소"로 좁힌다.
3. 기본 실행은 읽기만 한다(dry-run). 쓰기는 `--apply`일 때만.

### 1.2 Design Principles

- **같이 바꾼다**: `regenerateImage()`는 `content.split(scene.url).join(새 주소)`로 본문을 고친다. 두 필드 주소가 어긋나면 이후 다시 만들기가 본문 그림을 못 찾는다.
- **같은 이름만**: `from`의 파일 이름과 `to`의 파일 이름이 같아야 한다. 엉뚱한 그림으로 바꿀 수 없다.
- **파이프라인과 같은 잠금**: `claimPost()`로 잠그고 잠근 뒤 다시 읽는다 (`regenerateImage()`와 같은 방식).
- **비밀값은 보지 않는다**: `BLOB_READ_WRITE_TOKEN`·`APP_PASSWORD`는 사용자가 셸 환경변수로 넣는다. 스크립트는 값을 출력하지 않는다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| 항목 | A PUT 확장 | B 운영 DB 직접 | **C 좁은 운영 API (선택)** |
|---|---|---|---|
| 서버 변경 | PUT이 `imagePlan`도 받음 | 없음 | 운영자 전용 relink 라우트 1개 |
| 필요한 비밀값 | Blob 토큰 | Blob 토큰 + 운영 `DATABASE_URL` | Blob 토큰 + `APP_PASSWORD` |
| 공개 쓰기 범위 | 로그인 없이 `imagePlan` 전체 | 변화 없음 | 운영자만, 주소 교체만 |
| 로컬 Prisma | 그대로 | postgres로 다시 생성 | 그대로 |
| 배포 | 1회 | 0 | 1회 |
| 테스트 | 적음 | 스크립트 테스트 | 순수 함수 + 라우트 |
| 시간 | 약 40분 | 약 1시간 반 | 약 1시간 |

**선택: C** (사용자 결정 2026-10-21). 운영 DB 접속정보가 PC로 오지 않고, 서버는 같은 이름의 Blob 주소로 바꾸는 일만 할 수 있다.

### 2.1 Component Diagram

```
[사용자 PC]                                  [운영 Vercel]
scripts/relink-local-images.js
  ① GET /api/posts ──────────────────────▶ 목록 (#37 content·imagePlan)
  ② backend/generated-images/*.png
     └ @vercel/blob put(post-images/<이름>) ─▶ Blob (같은 이름, 덮어쓰기 허용)
  ③ POST /api/auth/login ────────────────▶ 쿠키 (APP_PASSWORD)
  ④ POST /api/posts/37/images/relink ────▶ requireAdmin
                                             └ relinkPostImages()
                                                ├ to 주소 HEAD 200 확인
                                                ├ claimPost 잠금 → 다시 읽기
                                                ├ relinkUrls() (순수 함수)
                                                └ content·imagePlan 저장
  ⑤ GET 다시 → /api/images/ 0건, Blob 6개 200 확인
```

### 2.2 Data Flow

dry-run: ① → 로컬 파일 확인 → 표 출력 → 끝 (운영 쓰기 0)
`--apply`: ① → 백업 파일 → ② → ③ → ④ → ⑤

### 2.3 Dependencies

- `@vercel/blob` 2.8.2 (루트·backend에 이미 있음, 새 의존성 0)
- 기존 `requireAdmin`(`backend/src/auth.ts`), `claimPost`·`PipelineError`(`draftPipeline.ts`)
- 전제: 운영에 `APP_PASSWORD`가 설정돼 있어야 함 (Do 시작 때 Vercel 환경변수 이름만 확인)

---

## 3. Data Model

### 3.1 Entity Definition

스키마 변경 없음. `Post.content`(문자열), `Post.imagePlan`(JSON 문자열: `cover` + `sections[]`, 각 장면에 `url`).

### 3.2 바꾸는 값

| 필드 | 바꾸기 전 | 바꾼 뒤 |
|---|---|---|
| `content` | `![…](/api/images/<이름>)` 6곳 | `![…](https://<스토어>.public.blob.vercel-storage.com/post-images/<이름>)` |
| `imagePlan.cover.url`, `sections[].url` | `/api/images/<이름>` 6개 | 같은 Blob 주소 |

그 밖의 글자·필드(`score`, `seed`, `stage` 등)는 그대로.

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/posts/:id/images/relink` | 로컬 이미지 주소를 같은 이름의 Blob 주소로 교체 | `requireAdmin` |

### 4.2 Detailed Specification

**Request**
```json
{ "pairs": [{ "from": "/api/images/1792116745241-52082a3b.png",
              "to": "https://l4ceevd8gf1mgv0u.public.blob.vercel-storage.com/post-images/1792116745241-52082a3b.png" }] }
```

**검사 (`parseRelinkPairs`)**
- `pairs`: 배열, 1~20개
- `from`: `^/api/images/[\w-]+\.(png|jpg|webp)$`
- `to`: `^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/post-images/[\w-]+\.(png|jpg|webp)$`
- `from`과 `to`의 파일 이름이 같아야 함
- `from` 중복 없음

**처리 (`relinkPostImages`)**
1. 글 없음 → 404
2. 각 `to`에 HEAD 요청(5초) → 200이 아니면 409 "Blob에 이미지가 없습니다"
3. `claimPost` 실패 → 409 (기존 `BUSY_MESSAGE`)
4. 잠근 뒤 다시 읽기. `imagePlan` 없음 → 409
5. `relinkUrls(content, plan, pairs)`: 각 `from`이 본문에 1번 이상, 계획 장면 `url`에 1번 이상 있어야 함. 하나라도 없으면 409 (아무것도 안 씀)
6. 저장 후 잠금 해제 (`finally`)

**Response 200**
```json
{ "id": 37, "replaced": { "content": 6, "imagePlan": 6 } }
```

**Errors**: 400 잘못된 요청 / 401 `AUTH_REQUIRED` / 404 글 없음 / 409 Blob 없음·주소 없음·처리 중

---

## 5. UI/UX Design

화면 변경 없음. 확인만 한다.

### 5.4 Page UI Checklist (운영 화면 확인 — 누르지 않음)

#### 글 페이지 (`/posts`)

- [ ] #37 본문 그림 6장 보임 (relink 후)
- [ ] 파이프라인 패널: 이미지 관련성 배지(점수) 보임
- [ ] 파이프라인 패널: 장면 썸네일 보임 (#37 포함)
- [ ] "이미지 세트 다시 만들기" 버튼 보임 — **클릭 금지**, 문구·위치만 기록

#### 활동 기록

- [ ] "AI 길이 경고" 배지가 해당 기록에 보임 (없으면 "해당 기록 없음"으로 기록)

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | Message | Cause | Handling |
|------|---------|-------|----------|
| 400 | 잘못된 요청입니다 | pairs 형식·주소 규칙·이름 불일치 | 스크립트가 보낸 값 확인 |
| 401 | 운영자 로그인이 필요합니다 | 쿠키 없음 | `APP_PASSWORD` 확인 |
| 409 | Blob에 이미지가 없습니다 | 업로드 실패 | ② 다시 실행 |
| 409 | 본문/계획에서 주소를 찾지 못했습니다 | 글이 그사이 바뀜 | dry-run 다시 |
| 409 | 다른 실행이 처리 중 | 잠금 | 잠시 후 다시 |

### 6.2 스크립트 오류

- 로컬 파일 없음 → dry-run 표에 "없음", `--apply` 거부
- 토큰·비밀번호 없음 → `--apply` 시작 전에 중단 (값은 출력하지 않음)

---

## 7. Security Considerations

- 라우트는 `requireAdmin` 뒤에만 있다. 운영에서 `APP_PASSWORD`가 비어 있으면 아무도 못 쓴다 (`auth.ts` 기존 동작).
- `to`는 이 프로젝트 Blob 스토어 형태의 주소만, `from`과 같은 파일 이름만 허용 → 임의 외부 주소 삽입 불가.
- HEAD 확인 대상은 검사를 통과한 Blob 주소뿐이라 임의 주소로 요청을 보내게 할 수 없다.
- 스크립트는 토큰·비밀번호·쿠키를 출력·파일 저장하지 않는다. 백업 파일에는 글 내용만 (`backend/generated-images/`는 gitignore).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| L0 단위 | `parseRelinkPairs`, `relinkUrls` | vitest |
| L1 API | relink 라우트 401·400·200 | 로컬 `start:local` + curl |
| L2 화면 | 5.4 체크리스트 | Chrome (운영, 클릭 없음) |

### 8.2 L0 Cases (`backend/src/services/imageRelink.test.ts`)

| # | Case | Expected |
|---|------|----------|
| 1 | 정상 1쌍 | 본문·계획 둘 다 교체, 개수 반환 |
| 2 | `to`가 다른 호스트 | 오류 |
| 3 | 파일 이름 불일치 | 오류 |
| 4 | `from`이 본문에 없음 | 오류, 아무것도 안 바뀜 |
| 5 | `from`이 계획에 없음 | 오류 |
| 6 | 다른 이미지 주소·글자는 그대로 | 교체 대상만 바뀜 |

### 8.3 L1 (로컬)

| # | Request | Expected |
|---|---|---|
| 1 | 로그인 없이 POST (로컬은 비밀번호 없으면 운영자로 봄 → `APP_PASSWORD=x`로 실행) | 401 |
| 2 | 로그인 후 잘못된 pairs | 400 |
| 3 | 로그인 후 존재하는 Blob 주소 쌍 (로컬 사본 #37) | 200, 로컬 DB만 바뀜 |

### 8.5 Seed Data

`npm run start:local` 사본에 #37이 그대로 들어 있다 (로컬 주소 6개 포함).

---

## 9. Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `parseRelinkPairs`, `relinkUrls` | 순수 로직 | `backend/src/services/imageRelink.ts` (신규) |
| `relinkPostImages` | 서비스 (잠금·DB) | `backend/src/services/draftPipeline.ts` (`regenerateImage` 옆) |
| 라우트 | API | `backend/src/index.ts` (`/images/rebuild` 다음) |
| 실행 스크립트 | 도구 | `scripts/relink-local-images.js` (신규) |

---

## 10. Coding Convention Reference

- 오류는 `PipelineError(메시지, 상태)` → 라우트가 그대로 응답 (기존 패턴)
- 라우트 주석 번호 체계 유지 (`// 3.0.3-2 …`)
- 스크립트: CommonJS, `root = path.resolve(__dirname, '..')`, `[relink]` 한국어 출력, `require.main === module` 가드
- 커밋·출력 한국어

### 10.3 Environment Variables

| Variable | 쓰는 곳 | 비고 |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | 스크립트 `--apply` | 사용자가 셸에서 지정 |
| `APP_PASSWORD` | 스크립트 `--apply` 로그인 | 운영 값과 같아야 함 |
| `RELINK_SOURCE_URL` | 스크립트 (선택) | 기본 `https://19auto-blog.vercel.app` |

---

## 11. Implementation Guide

### 11.1 File Structure

```
backend/src/services/imageRelink.ts        신규  parseRelinkPairs, relinkUrls
backend/src/services/imageRelink.test.ts   신규  L0 6케이스
backend/src/services/draftPipeline.ts      수정  relinkPostImages
backend/src/index.ts                       수정  POST /api/posts/:id/images/relink
scripts/relink-local-images.js             신규  dry-run / --apply
```

### 11.2 Implementation Order

1. [ ] `imageRelink.ts` + 테스트 → `npm test --prefix backend`
2. [ ] `relinkPostImages` + 라우트 → 타입체크
3. [ ] 스크립트 (dry-run 먼저) → 운영 대상 dry-run 실행 (쓰기 0)
4. [ ] 로컬 L1 (start:local)
5. [ ] 커밋·PR → 사용자 머지 → 배포
6. [ ] 사용자가 `!`로 환경변수 넣고 `--apply` 실행 → 결과 확인
7. [ ] 운영 화면 확인 (5.4) → 분석

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | 내용 | 예상 |
|---|---|---|---|
| 서버 relink | module-1 | 1~2, 4 | 30분 |
| 스크립트 | module-2 | 3 | 20분 |
| 운영 적용·확인 | module-3 | 5~7 (머지·`--apply`는 사용자) | 20분 |

#### Recommended Session Plan

한 세션. module-1·2를 한 PR로 → 머지 후 module-3.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-21 | 설계안 C | jeh-lab + Claude |
