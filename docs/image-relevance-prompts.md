# 이미지 관련성 개선 — bkit 진행 프롬프트

> 기능 이름: `image-relevance` · 작성 2026-10-17
> 위에서부터 하나씩 붙여넣는다. 단계가 끝나면 체크한다.

## 진행 상황

- [x] 1. 계획서 (plan) — `docs/archive/2026-10/image-relevance/image-relevance.plan.md` (2026-10-17)
- [x] 2. 설계서 (design) — `docs/archive/2026-10/image-relevance/image-relevance.design.md` (C안, 2026-10-18)
- [x] 3. 구현 + 실제 확인 (do) — 브랜치 `feat/image-relevance`, #44 실측 평균 4.0 (2026-10-18)
- [x] 4. 검수 (analyze) — 일치율 94.8% → 수정 후 99.2%, `docs/archive/2026-10/image-relevance/image-relevance.analysis.md` (2026-10-18)
- [x] 5. 보고서 + PR (report) — `docs/archive/2026-10/image-relevance/image-relevance.report.md` (2026-10-18)
- [x] 6. 머지 + 보관 (직접 요청할 때만) — PR #19 머지, #42~#44 운영 재생성(3.71·4.00·4.00), 보관 (2026-10-18)

---

## 진단: 이미지가 내용과 어긋나는 원인 (2026-10-17, 운영 글 #42~#44 기준)

1. **모든 장면을 '상징 물건 하나'로 그리도록 강제** — `backend/src/services/aiService.ts` SCENE_RULES. 중심 피사체 1개만, 손·얼굴·군중 금지, 글자·로고·도표 금지 → 열쇠·돋보기·저울·실타래 같은 은유만 남는다.
2. **글에 나오는 실제 대상을 그리라는 지시가 없음** — Home Assistant 글에 스마트홈 화면이 없고, Flipflop 글에 휴대폰·노트북이 없다.
3. **예시 문장이 결과에 섞임** — #44는 정해진 색이 남색·호박색인데 장면 prompt에 예시의 "muted teal and warm orange"가 들어갔다. 최근 3편 중 2편이 예시와 같은 점토 3D 화풍.
4. **생성 후 관련성 검사 없음** — 장면끼리 단어 겹침만 본다(`backend/src/services/draftPipeline.ts` similarity). 글이 달라도 같은 소재(돋보기 등)가 반복된다.
5. **Ideogram 설정이 속도 위주** — `magic_prompt` off, `rendering_speed` turbo (`backend/src/services/imageProvider.ts`).

---

## 1. 계획서

```
/bkit:pdca plan image-relevance
블로그 이미지가 글 내용과 어긋난다. 소제목마다 독자가 떠올릴 실제 대상(제품·화면·장소·행동)이 보이게 바꾸고 싶다.
범위: docs/image-relevance-prompts.md의 진단 원인 5가지(상징물 강제, 실제 대상 지시 없음, 예시 문장 섞임, 생성 후 관련성 검사 없음, Ideogram 설정).
완료 기준: 운영 글 #42~#44를 다시 계획했을 때 모든 장면에 글 속 고유 대상이 들어가고, 관련성 점수(1~5) 평균 4 이상.
글 1편당 추가 비용 상한과 Vercel 300초 제한 안에서 끝나는지도 계획서에 숫자로 적어줘.
```

## 2. 설계서

```
/bkit:pdca design image-relevance
설계안 3개를 비용·실행 시간·확인 방법 기준으로 표로 비교해줘.
```

## 3. 구현 + 실제 확인

```
/bkit:pdca do image-relevance
구현 후 검증 4단계를 돌리고, 운영 글 #44로 이미지 계획 전후 비교표를 만들어줘.
실제 Ideogram 생성은 1편만 하고 결과 이미지를 보여줘.
```

## 4. 검수

```
/bkit:pdca analyze image-relevance
gap-detector와 code-analyzer를 둘 다 돌려서 설계 일치율, 비용·시간 초과 위험을 같이 보여줘.
```

## 5. 보고서 + PR

```
/bkit:pdca report image-relevance
끝나면 커밋하고 PR까지 만들어줘. 머지는 내가 말할 때.
```

## 6. 머지 + 보관 (원할 때)

```
머지해줘
/bkit:pdca archive image-relevance
```

---

## 단계마다 나오는 질문 (미리 알아두기)

| 단계 | 질문 |
|---|---|
| plan | 요구사항이 맞나요? 빠진 건? |
| design | 설계안 A/B/C 중 무엇? |
| do | 이 범위로 구현을 시작할까요? |
| analyze | 모두 수정 / 심각한 것만 / 그대로 진행 |

막히면 `/bkit:pdca status`로 현재 단계를 확인한다.
