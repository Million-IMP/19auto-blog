# 다음 보완 작업 — bkit 프롬프트 모음 (2026-10-26 기준)

`/clear` 뒤 새 대화에서 이 파일 하나로 이어서 진행한다. 진행 방식은 지금까지와 같다:
bkit 자동화 L1(단계마다 확인) → 각 단계 끝나면 **"다음 진행"** 입력 → 머지는 내가 말할 때만.

## 지금 상태
- **✅ image-jobs 완료·PR 대기 (브랜치 `feat/image-jobs`, 10/30)** — Ideogram 취소(10/26). 서버는 그림을 만들지 않고(`IMAGE_PROVIDER=jobs`) PC에서 구독 `agy`로 채워 올린다. 로컬 SC 5/5, Match 99%, 테스트 182. 보고서 `docs/04-report/image-jobs.report.md`. **머지 전에** Vercel Production `IMAGE_PROVIDER=jobs`로 변경·`IDEOGRAM_API_KEY`·`IDEOGRAM_RENDERING_SPEED` 삭제(사용자). 머지 뒤 운영 `npm run image-jobs -- run`으로 업로드 1장 확인, 멈춘 글(10/29 기준 #97~#125, 29개)은 글마다 "이어하기". 머지 뒤 PDCA 문서 보관
- (이전 기록) 10/24 16:33 UTC부터 운영 이미지 생성 실패 — Ideogram 401(키 거부). 운영·로컬 키 모두 401(10/22엔 정상), Vercel 환경변수는 11일 전 그대로 → Ideogram 쪽에서 키가 무효화됨. #97~#108 12개 글이 IMAGES 단계에서 멈춤(본문은 완성). 새 키 발급 → Vercel·로컬 `.env` 교체 → 다시 배포 → 멈춘 글 이어하기(이미지 비용 발생, 사용자 결정). 비밀값은 사용자가 직접 입력
- master `aed2dc2` (PR #35까지 머지·배포). 운영: https://19auto-blog.vercel.app — #32 머지는 push가 Vercel에 전달되지 않아 10/23 Vercel API로 직접 운영 배포, #33·#35는 자동 배포 정상
- 개인정보처리방침·이용약관(10/26): PR #35 머지·배포 — 정적 문서 `frontend/public/privacy.html`·`terms.html` → 운영 `/privacy.html`·`/terms.html` 200, 대시보드 하단 링크. 구글 OAuth 동의 화면 등록 완료(사용자). 남은 것: 해외 위탁 표의 Neon 리전("미국 등"으로 적음) 확인, Google 연동 기능을 만들면 방침 11조를 실제 스코프로 갱신. 공개 문의 이메일은 jinkoo1.lee@gmail.com
- image-abstract-scenes(PR #32)·image-scene-followup(PR #33) 운영 적용 확인(10/26): 5+6번 적용 글 #89~#96 8개 vs 이전 #57~#84 28개 — 글자 사물·키보드 anchor 25→0, 빈 종이 글당 1.36→0.13, 할 일 소제목 종이 11→0, 3점 이하 11.2%→4.7%, 서버 랙 표지 8/28→0/8, 상자 7.9%→4.7%. 눈 점검 4장 글자 0. 새로 보이는 일반 장면: 흐린 화면의 휴대폰·태블릿
- local-test-db: PR #27 머지·배포(10/20), archive 완료 → 로컬 검증은 **`npm run start:local`** (운영 DB 안 건드림, 운영 사본 5초 시드)
- prod-ui-check: PR #29 머지·배포(10/21), 운영 #37 이미지 6개 복구, 화면 3가지 확인 완료, archive 완료. 보고서 `docs/archive/2026-10/prod-ui-check/prod-ui-check.report.md`
- (권장) `APP_PASSWORD` 교체 — 10/21 대화에 값이 남음. Vercel 환경변수 수정 후 다시 배포
- 커밋 안 된 것: `docs/gpters-presentation/script.md` (미추적, 내용 확인 전이라 커밋 안 함)
- 끝난 PDCA: palette-mobile, image-relevance(v1·v2), mobile-overflow, local-test-db, prod-ui-check, ai-call-cleanup, image-abstract-scenes, image-scene-followup, ai-token-warning → `docs/archive/2026-10/`
- ai-token-warning 관찰 끝(10/26): 10/19~10/26 경고 1건(scoreImage 87%)·잘림 0 → 제한 조정 없음, 보관
- 결정 기록: gbrain `decisions/19auto-blog-image-relevance`, `decisions/19auto-blog-ai-token-warning`, `decisions/19auto-blog-mobile-overflow`, `decisions/19auto-blog-local-test-db`, `decisions/19auto-blog-prod-ui-check`, `decisions/19auto-blog-ai-call-cleanup`, `decisions/19auto-blog-image-abstract-scenes`, `decisions/19auto-blog-image-scene-followup`, `decisions/19auto-blog-privacy-terms-pages`
- mobile-overflow: PR #25 머지·배포(10/19), archive 완료

## 보완 후보 (추천 순서)

| # | 기능 이름 | 내용 | 크기 |
|---|---|---|---|
| ~~1~~ | ~~`mobile-overflow`~~ | **완료 10/19** — 재현 안 됨(운영 14/14·실폰 잘림 없음). 점검 스니펫 `scripts/check-mobile-overflow.js` 추가. 보고서 `docs/archive/2026-10/mobile-overflow/mobile-overflow.report.md` | — |
| ~~2~~ | ~~`local-test-db`~~ | **완료 10/19** — `npm run start:local`(SQLite 강제·크론 끔·운영 GET 사본). 보고서 `docs/archive/2026-10/local-test-db/local-test-db.report.md`. 발견: 10/16부터 로컬 backend가 운영 DB에 붙은 채 떠 있었음(종료함) | — |
| ~~3~~ | ~~`prod-ui-check`~~ | **완료 10/21** — 원인: 10/16 운영 DB에 붙은 로컬 backend가 그림을 PC에 저장. 원본을 Blob에 올리고 운영자 전용 relink로 #37 주소 교체(비용 0). 배지·버튼(누르지 않음)·AI 길이 경고 모두 운영 화면에 보임. 보고서 `docs/archive/2026-10/prod-ui-check/prod-ui-check.report.md` | — |
| ~~4~~ | ~~`ai-call-cleanup`~~ | **완료 10/22** — 3곳을 askText(`{ system }` 옵션)로 통합, 직접 호출 5곳 → 2곳(askText·scoreImage). 빈 응답 오류만 통일. 보고서 `docs/archive/2026-10/ai-call-cleanup/ai-call-cleanup.report.md` | — |
| ~~5~~ | ~~`image-abstract-scenes`~~ | **완료 10/22** — 운영 162장 분석: 3점 17장 중 11장이 글자 사물(달력·계기판)·키보드 장면. 규칙 3줄 + 감지 → 한 번 다시 계획. 로컬 3세트: 숫자 결함 2→0, 3점 이하 6→3, 감지 anchor 18→0. 보고서 `docs/archive/2026-10/image-abstract-scenes/image-abstract-scenes.report.md` | — |
| ~~6~~ | ~~`image-scene-followup`~~ | **완료 10/22** — 소제목 장면의 32%가 빈 종이(눈 점검 16장 중 11장 약함). 할 일 소제목은 실제 대상에 하는 행동, 빈 종이는 글당 1장. 바뀐 소제목 14장: 분명 2→9, 계획 종이 글당 2.2→0.1. 보고서 `docs/archive/2026-10/image-scene-followup/image-scene-followup.report.md` | — |
| 0 | `image-jobs` (PR 대기) | **10/30 완료** — 작업 폴더 + 구독 `agy` 작업자로 API 요금 0. 로컬 #99 자동 6장(장면당 55~60초, 글자 0/6, 관련성 5·5·4·4·4·4). 멈춘 글은 글마다 "이어하기"를 누르면 작업 대기로 들어간다(일괄 이어하기 제외). 보고서 `docs/04-report/image-jobs.report.md` | — |
| 7 | `image-device-text` | 6번에서 남은 것: 이미지 모델이 기기·상자 표면에 엉터리 상표 글자를 넣음(Ideogram 때 관찰, 채점도 4점 — 구독 Gemini로 바뀐 뒤 다시 확인), 종이 대신 배송 상자 반복. 채점 기준·제외어를 바꾸면 채점만의 효과를 먼저 잴 것. 이미지 예산 필요 | 중 |

## 붙여 넣을 프롬프트

### 1. 휴대폰 화면 잘림
```
/bkit:pdca plan mobile-overflow
docs/bkit-next-prompts.md의 1번이다. 휴대폰 너비(390·430px)에서 대시보드 오른쪽이 잘린다.
먼저 운영 사이트를 해당 너비로 열어 실제로 잘리는지, 어느 요소가 넘치는지 확인하고 계획을 잡아줘.
```

### 2. 로컬 테스트 DB
```
/bkit:pdca plan local-test-db
docs/bkit-next-prompts.md의 2번이다. 운영 DB를 건드리지 않고 로컬 SQLite에 운영 글 사본을 넣어
서버(3001)와 화면(5173)을 띄워 검증할 수 있게 하고 싶다. .env는 읽지 말고 방법을 제안해줘.
```

### 3. 운영 화면 확인
```
/bkit:pdca qa image-relevance
docs/bkit-next-prompts.md의 3번이다. 운영 사이트에서 이미지 관련성 배지, 이미지 세트 다시 만들기 버튼(누르지는 말 것),
활동 기록의 AI 길이 경고 표시를 브라우저로 확인하고 결과를 표로 정리해줘.
```

### 4. AI 호출 코드 정리
```
/bkit:pdca plan ai-call-cleanup
docs/bkit-next-prompts.md의 4번이다. 동작은 그대로 두고 직접 호출 3곳을 askText로 합쳐줘. 테스트 90개는 그대로 통과해야 한다.
```

### 5. 추상 소제목 장면
```
/bkit:pdca plan image-abstract-scenes
docs/bkit-next-prompts.md의 5번이다. docs/archive/2026-10/image-relevance-v2/ 보고서를 먼저 읽고,
추상적인 소제목 장면과 글자 유도 장면 문제를 계획해줘. 효과 검증은 2회 채점 + 눈 점검으로.
```

### 6. 남은 약한 장면
```
/bkit:pdca plan image-scene-followup
docs/bkit-next-prompts.md의 6번이다. docs/archive/2026-10/image-abstract-scenes/ 보고서 §4를 먼저 읽고,
할 일 소제목·상태에 기댄 장면·정도 소제목을 계획해줘. 이미지 예산은 ○세트. 이번에는 세트 전체 대신 바꾼 장면만 다시 만들어 비교해줘.
```

### 7. 기기 표면 글자·소품 반복
```
/bkit:pdca plan image-device-text
docs/bkit-next-prompts.md의 7번이다. docs/archive/2026-10/image-scene-followup/ 보고서 §4를 먼저 읽고,
기기·상자 표면의 엉터리 글자와 배송 상자 반복을 계획해줘. 먼저 운영 새 글(10/24 이후)로 5·6번 효과부터 확인하고, 이미지 예산은 ○장.
```

## 매 단계 공통
- 각 단계가 끝나면 **"다음 진행"**
- 검수(analyze)에서 고칠 범위 질문이 나오면 보통 **"모두 수정"**
- 커밋·PR은 보고서 단계에서, **머지는 "PR N 머지해줘"라고 말할 때만**
