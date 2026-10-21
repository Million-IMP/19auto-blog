# ai-call-cleanup Completion Report

> **Feature**: ai-call-cleanup (`docs/bkit-next-prompts.md` 4번)
> **Date**: 2026-10-22
> **Author**: jeh-lab + Claude
> **Match Rate**: **100%**
> **Status**: Completed

---

## Executive Summary

### 1.1 Project Overview

| 항목 | 내용 |
|---|---|
| 기능 | aiService 직접 AI 호출 3곳(processInboxItem·generateOSMUContent·quickSummarizeArticle)을 `askText`로 합치기 |
| 기간 | 2026-10-22 (Plan → Design → Do → Check → Report) |
| 설계안 | C — `askText` 4번째 인자를 옵션 객체 `{ cachedPrefix?, system? }`로 |
| 진행 방식 | 사용자 지시 "특이사항 없으면 추천 방향으로 선택하고 계속" (체크포인트는 추천안으로 자동 선택) |

### 1.2 Results Summary

| 지표 | 결과 |
|---|---|
| 성공 기준 | 5/5 |
| 테스트 | 117/117 (새 9개, 기존 108개 그대로) |
| 직접 `messages.create` | 5곳 → 2곳 (`askText`, `scoreImage`) |
| `aiService.ts` | −16줄 |
| 실제 AI 확인 | 로컬 즉석 요약 1회 200 |

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | 텍스트 AI 호출 3곳이 호출·잘림 확인·글 꺼내기를 각자 반복했다. ai-token-warning 때 이 3곳만 잘림 확인이 빠져 있었던 것처럼, 호출 방식을 바꿀 때 빠뜨리기 쉬웠다. |
| **Solution** | `askText`에 `system` 옵션을 더하고 3곳을 교체. 요청 내용(model·max_tokens·system·프롬프트)은 바꾸기 전 코드에서 테스트로 먼저 고정한 뒤 옮겼다. |
| **Function/UX Effect** | 화면·API 결과 같음. AI가 글 없이 끝나는 드문 경우만 세 곳 모두 "AI 응답이 비어 있습니다." 오류로 통일. |
| **Core Value** | 텍스트 AI 호출이 한 길(`askText`)로 모여 다음 변경 때 고칠 곳이 하나다. |

## 1.4 Success Criteria Final Status

| SC | 기준 | 상태 |
|---|---|:---:|
| SC-1 | `messages.create` 2곳만 | ✅ |
| SC-2 | 108개 + 새 테스트 통과 | ✅ 117/117 |
| SC-3 | 3곳 요청 내용 고정 | ✅ (교체 전 통과 → 교체 후 통과) |
| SC-4 | 빈 응답 같은 오류 | ✅ 3/3 |
| SC-5 | 타입체크, 다른 파일 무수정 | ✅ |

## 1.5 Decision Record Summary

| 단계 | 결정 | 결과 |
|---|---|---|
| Plan | 빈 응답 처리 통일 (추천) | 즉석 요약이 AI 무응답에 가짜 요약 대신 오류 |
| Plan | scoreImage 제외 | 이미지·30초 제한·채점 전용 문구 유지 |
| Design | 설계안 C 옵션 객체 (추천) | 기존 호출 2곳만 `{ cachedPrefix }`로 |
| Check | Critical·Important 0 → 그대로 진행 | |

---

## 2. Related Documents

- Plan: [ai-call-cleanup.plan.md](../01-plan/features/ai-call-cleanup.plan.md)
- Design: [ai-call-cleanup.design.md](../02-design/features/ai-call-cleanup.design.md)
- Analysis: [ai-call-cleanup.analysis.md](../03-analysis/ai-call-cleanup.analysis.md)

---

## 3. Completed Items

| ID | 요구사항 | 상태 |
|---|---|:---:|
| FR-01 | `askText` `system` 옵션, 없으면 요청에 없음 | ✅ |
| FR-02 | 3곳 요청 내용·경고 이름 그대로 | ✅ |
| FR-03 | 빈 응답 오류 통일 | ✅ |
| FR-04 | 태그 누락 처리 그대로 | ✅ |

### 3.3 Deliverables

| 파일 | 내용 |
|---|---|
| `backend/src/services/aiService.ts` | `AskOptions`, `askText` system 옵션, 3곳 교체, 캐시 호출 2곳 |
| `backend/src/services/aiService.test.ts` | 요청 내용 3·빈 응답 3·system 없음 1·해석 유지 2 |
| PDCA 문서 4개 | plan·design·analysis·report |

---

## 4. Incomplete Items

- 없음. `scoreImage` 통합은 의도적으로 범위 밖.

---

## 5. Quality Metrics

| 축 | 점수 |
|---|---|
| Structural · Functional · Contract · Runtime | 100% |

---

## 6. Lessons Learned

- 리팩터링은 "바꾸기 전 코드에서 요청 내용 테스트를 먼저 통과" → "교체 후 다시 통과" 순서로 하면 동작이 그대로라는 근거가 남는다.
- 의도한 동작 차이(빈 응답)는 테스트가 바꾸기 전 실패·바꾼 뒤 통과로 드러나게 했다.

---

## 8. Next Steps

- [ ] PR 머지 (사용자가 말할 때)
- 다음: 5번 `image-abstract-scenes` (추상 소제목 장면·글자 유도 장면 — 큼). ai-token-warning은 10/25쯤 기록 확인 후 정리.

---

## 9. Changelog

### v1.0.0 (2026-10-22)

- 정리: aiService 텍스트 AI 호출을 `askText` 하나로 (동작 같음, 빈 응답 오류만 통일)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-22 | 완료 보고 | jeh-lab + Claude |
