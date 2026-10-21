# ai-call-cleanup Gap Analysis

> **Feature**: ai-call-cleanup
> **Date**: 2026-10-22
> **Plan**: [ai-call-cleanup.plan.md](../01-plan/features/ai-call-cleanup.plan.md)
> **Design**: [ai-call-cleanup.design.md](../02-design/features/ai-call-cleanup.design.md) (v0.1, 설계안 C)
> **Match Rate**: **100%** (런타임 포함 공식)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 텍스트 AI 호출 반복 코드 3곳 → 호출 방식 변경 때 빠뜨림 위험 (ai-token-warning에서 실제로 발생) |
| **WHO** | 코드를 고치는 개발자(사용자 + Claude). 화면 사용자에게는 변화 없음 |
| **RISK** | 리팩터링 중 프롬프트·토큰 제한·system 문구·결과 해석이 바뀌어 수집 분류·OSMU·즉석 요약 결과가 달라짐 |
| **SUCCESS** | 직접 `messages.create`는 `askText`·`scoreImage` 2곳만 남음 + 기존 테스트 108개 통과 + 3곳의 요청 내용이 바뀌지 않음을 테스트로 고정 |
| **SCOPE** | ① askText `system` 옵션 ② 3곳 교체 ③ 요청 내용·빈 응답 테스트 |

---

## Strategic Alignment Check

### Success Criteria Status

| SC | 기준 | 상태 | 근거 |
|---|---|:---:|---|
| SC-1 | `messages.create`가 `askText`·`scoreImage` 2곳만 | ✅ | `aiService.ts` grep 2건 (askText, scoreImage) |
| SC-2 | 기존 108개 + 새 테스트 통과 | ✅ | 117/117 (새 9) |
| SC-3 | 3곳 요청 내용 테스트로 고정 | ✅ | model=`ANTHROPIC_MODEL`, max_tokens 4000/1500/1000, system 문구 그대로/없음, 프롬프트 핵심 문장, 요청 옵션 없음 — **바꾸기 전 코드에서 먼저 통과**시킨 뒤 교체 |
| SC-4 | 빈 응답 3곳 같은 오류 | ✅ | "AI 응답이 비어 있습니다." 3/3 (바꾸기 전에는 수집 분류·즉석 요약 2곳 실패 → 의도한 변경 확인) |
| SC-5 | 타입체크, 라우트·automationService 무수정 | ✅ | `tsc` 0, 변경 파일 2개(`aiService.ts`, 테스트) |

### Decision Record Verification

| 결정 | 지킴 |
|---|:---:|
| Plan: 빈 응답 오류 통일 | ✅ |
| Plan: scoreImage 제외 | ✅ 그대로 |
| Design: 설계안 C 옵션 객체 | ✅ `askText(name, prompt, max, { cachedPrefix?, system? })`, 캐시 호출 2곳만 수정 |

---

## 2. Gap Analysis (Design vs Implementation)

| 설계 항목 | 구현 | 일치 |
|---|---|:---:|
| §4.1 `AskOptions` + `...(system ? { system } : {})` | 같음 | ✅ |
| §4.2 processInboxItem: system 문구 그대로, 파싱·오류 문구 그대로, 빈 응답 디버그 로그 제거 | 같음 | ✅ |
| §4.2 generateOSMUContent: `return askText(…, 1500)` | 같음 | ✅ |
| §4.2 quickSummarizeArticle: system 문구 그대로, 태그 파싱·기본 문구 그대로 | 같음 | ✅ |
| §4.3 generateOutline·generateBody → `{ cachedPrefix }` | 같음 | ✅ |
| §6 오류 표 | 테스트 8.2-2·4·5로 확인 | ✅ |
| §8.2 L0 5종 | 9개 테스트 (1·2는 3곳씩) | ✅ |

### 2.7 Runtime Verification

| # | 확인 | 결과 |
|---|---|:---:|
| L0 | `npm test --prefix backend` | ✅ 117/117 |
| L1 | 로컬 `start:local` → `POST /api/inbox/quick-summary` 실제 AI 1회 (system + 블록 배열 content) | ✅ 200, bullets 3·takeaway·keywords 5 |
| 정적 | 백엔드 타입체크 | ✅ |

### 2.8 Match Rate

| 축 | 점수 |
|---|---:|
| Structural | 100% |
| Functional | 100% |
| Contract | 100% (호출 쪽 시그니처·반환형 그대로) |
| Runtime | 100% |
| **Overall** | **100%** |

---

## 3. Code Quality

- `aiService.ts` 순감소 16줄 (+18 / −34). 반복된 "create → checkResponse → 글 블록 찾기" 3벌 제거.
- Critical·Important 이슈 0 → Checkpoint 5 "그대로 진행" (사용자 지시: 특이사항 없으면 추천 방향).

---

## 4. 의도한 동작 차이 (1건)

| 경우 | 전 | 후 |
|---|---|---|
| AI가 글 없이 끝남 — 수집 분류 | "AI 응답을 파싱할 수 없습니다. 터미널 로그를 확인하세요." (+ 응답 전체 디버그 로그) | "AI 응답이 비어 있습니다." |
| AI가 글 없이 끝남 — 즉석 요약 | 기본 문구 3종 (가짜 요약처럼 보임) | "AI 응답이 비어 있습니다." (500) |

글이 있는데 태그가 빠진 경우는 둘 다 그대로다.
