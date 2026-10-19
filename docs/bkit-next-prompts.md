# 다음 보완 작업 — bkit 프롬프트 모음 (2026-10-19 기준)

`/clear` 뒤 새 대화에서 이 파일 하나로 이어서 진행한다. 진행 방식은 지금까지와 같다:
bkit 자동화 L1(단계마다 확인) → 각 단계 끝나면 **"다음 진행"** 입력 → 머지는 내가 말할 때만.

## 지금 상태
- master `d7ee451` (PR #23까지 머지·배포). 운영: https://19auto-blog.vercel.app
- 커밋 안 된 것: `docs/gpters-presentation/` (발표 자료), 이 파일
- 끝난 PDCA: palette-mobile, image-relevance(v1·v2) → `docs/archive/2026-10/`
- 관찰 중: ai-token-warning (문서는 `docs/01-plan~04-report/ai-token-warning.*`) — 10/25쯤 활동 기록 "AI 길이 경고" 확인 후 제한 조정 → archive
- 결정 기록: gbrain `decisions/19auto-blog-image-relevance`, `decisions/19auto-blog-ai-token-warning`, `decisions/19auto-blog-mobile-overflow`
- mobile-overflow: 보고서까지 완료(브랜치 `feat/mobile-overflow`), archive 남음

## 보완 후보 (추천 순서)

| # | 기능 이름 | 내용 | 크기 |
|---|---|---|---|
| ~~1~~ | ~~`mobile-overflow`~~ | **완료 10/19** — 재현 안 됨(운영 14/14·실폰 잘림 없음). 점검 스니펫 `scripts/check-mobile-overflow.js` 추가. 보고서 `docs/04-report/mobile-overflow.report.md` | — |
| 2 | `local-test-db` | 로컬 `backend/.env`의 DATABASE_URL이 운영 DB일 수 있어 매번 로컬 서버 검사를 건너뜀. 운영 글 사본을 로컬 SQLite에 넣어 서버·화면을 띄우는 방법 | 중간 |
| 3 | `prod-ui-check` | 운영 화면 실제 확인: 이미지 관련성 배지·"이미지 세트 다시 만들기" 버튼·"AI 길이 경고" 배지 (v1부터 화면 확인 못 함). **10/19 발견: `/posts` 글 이미지 `/api/images/*.png` 6개가 503** — 먼저 원인 확인 | 작음 |
| 4 | `ai-call-cleanup` | aiService의 직접 호출 3곳(processInboxItem·generateOSMUContent·quickSummarizeArticle) 반복 코드를 askText(system 옵션)로 합치기 | 작음 |
| 5 | `image-abstract-scenes` | 추상적인 소제목("무엇이 달라졌나", "신호와 간섭") 장면이 약함. 글자 유도 장면 금지 규칙(PR #22)도 운영 미확인 | 큼 |

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

## 매 단계 공통
- 각 단계가 끝나면 **"다음 진행"**
- 검수(analyze)에서 고칠 범위 질문이 나오면 보통 **"모두 수정"**
- 커밋·PR은 보고서 단계에서, **머지는 "PR N 머지해줘"라고 말할 때만**
