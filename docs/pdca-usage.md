# bkit PDCA 사용법

> 기능 하나를 **계획 → 설계 → 구현 → 검사 → 보고 → 보관** 순서로 진행하는 명령 모음.
> 기준 버전: bkit 2.1.38

---

## 0. 한 장 요약 (치트시트)

```
/bkit:pdca plan    <기능>                 계획서
/bkit:pdca design  <기능>                 설계서 (3안 중 선택)
/bkit:pdca do      <기능> [--scope m-1]   구현
/bkit:pdca analyze <기능>                 설계 vs 코드 일치율
/bkit:pdca iterate <기능>                 90% 미만일 때 자동 수정
/bkit:pdca report  <기능>                 완료 보고서
/bkit:pdca archive <기능> [--summary]     문서 보관

/bkit:pdca status                         지금 어디까지 왔나
/bkit:pdca next                           다음에 뭘 치나
```

---

## 1. 기본 형식

```
/bkit:pdca <action> <feature>
```

- `<action>`: 할 일 (plan, design, do …)
- `<feature>`: 기능 이름. **영어 소문자 + 하이픈** (예: `palette-mobile`, `user-auth`)
- 한 기능은 처음부터 끝까지 **같은 이름**을 쓴다. 이름이 다르면 다른 기능으로 인식한다.

---

## 2. 전체 흐름

```
pm(선택) → plan → design → do → analyze ─┬─ 90% 이상 → report → archive → cleanup(선택)
                                         └─ 90% 미만 → iterate → analyze (최대 5회)
```

| 단계 | PDCA | 명령 |
|---|---|---|
| 계획 | **P**lan | `pm`, `plan` |
| 설계 | **P**lan | `design` |
| 구현 | **D**o | `do` |
| 검사 | **C**heck | `analyze`, `qa` |
| 개선 | **A**ct | `iterate` |
| 마무리 | — | `report`, `archive`, `cleanup` |

---

## 3. 단계별 명령

### 3-1. 준비 — 무엇을 어떻게 만들지 정하기

#### `pm` (선택)
```
/bkit:pdca pm user-auth
```
- AI 팀(4명)이 시장·사용자·경쟁 서비스를 분석해 요구사항 문서(PRD)를 쓴다.
- 결과: `docs/00-pm/user-auth.prd.md`
- 조건: 환경변수 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 필요
- 작은 기능이면 **건너뛰고 plan부터** 해도 된다.

#### `plan`
```
/bkit:pdca plan user-auth
```
- 요구사항이 맞는지, 빠진 건 없는지 **질문을 먼저** 한 뒤 계획서를 쓴다.
- PRD가 있으면 자동으로 참고한다.
- 결과: `docs/01-plan/features/user-auth.plan.md`
- 팁: 요구사항이 애매하면 `/plan-plus user-auth`로 아이디어 정리 단계를 추가할 수 있다.

#### `design`
```
/bkit:pdca design user-auth
```
- 계획서가 **있어야** 실행된다.
- 설계안 3가지를 비교해 보여주고 하나를 고르게 한다.
  - **A. 최소 변경**: 빠르지만 코드가 얽힐 수 있음
  - **B. 구조 정리**: 깔끔하지만 손댈 파일이 많음
  - **C. 균형** (기본 추천)
- 설계서 안에 **Session Guide**(모듈 나누기)가 생긴다 → `do --scope`에서 쓴다.
- 결과: `docs/02-design/features/user-auth.design.md`

### 3-2. 구현 — 코드 작성

#### `do`
```
/bkit:pdca do user-auth                          # 전체
/bkit:pdca do user-auth --scope module-1         # 모듈 하나만
/bkit:pdca do user-auth --scope module-1,module-2  # 여러 개 (쉼표, 띄어쓰기 없이)
```
- 설계서를 전부 읽고 "파일 몇 개를 바꿀지" 보여준 뒤 **승인을 받아야** 시작한다.
- `--scope`: 작업을 여러 번(여러 세션)에 나눠 할 때 쓴다.
- 코드에 `// Design Ref: §1.3 — …` 같은 주석을 남겨 설계서와 연결한다.

### 3-3. 검사 — 설계대로 만들었나

#### `analyze`
```
/bkit:pdca analyze user-auth
```
- 설계서와 코드를 비교해 **일치율(%)**을 계산한다.
- 끝나면 셋 중 하나를 고르게 한다.
  - 지금 모두 수정 / 심각한 것만 수정 / 그대로 진행
- 결과: `docs/03-analysis/user-auth.analysis.md`

#### `iterate`
```
/bkit:pdca iterate user-auth
```
- 일치율이 **90% 미만일 때만** 쓴다.
- 차이 목록을 보고 자동으로 고친 뒤 다시 검사한다.
- 90% 이상이 되거나 **5번** 반복하면 멈춘다.

#### `qa` (선택)
```
/bkit:pdca qa user-auth
```
- 테스트를 단계별로 실행한다: L1 API → L2 화면 동작 → L3 전체 흐름 (L4 성능, L5 보안은 큰 프로젝트용)
- 화면 테스트는 Chrome 연결이 있어야 돈다.
- 결과: `docs/05-qa/user-auth.qa-report.md`

### 3-4. 마무리

#### `report`
```
/bkit:pdca report user-auth
```
- 계획 → 설계 → 구현 → 검사 전 과정을 완료 보고서 하나로 정리한다.
- 계획서의 완료 기준을 하나씩 ✅/❌로 판정한다.
- 일치율 90% 미만이면 경고한다.
- 결과: `docs/04-report/user-auth.report.md`

#### `archive`
```
/bkit:pdca archive user-auth             # 상태 기록에서 완전히 삭제
/bkit:pdca archive user-auth --summary   # 일치율·기간 같은 요약은 남김
```
- 문서 4개(plan, design, analysis, report)를 `docs/archive/YYYY-MM/user-auth/`로 **옮긴다**.
- ⚠️ 원래 자리의 문서는 사라진다. 보고서가 끝나기 전에는 실행되지 않는다.
- 나중에 통계를 보고 싶으면 `--summary`를 쓴다.

#### `cleanup` (선택)
```
/bkit:pdca cleanup              # 목록 보고 골라서 삭제
/bkit:pdca cleanup all          # 보관된 것 전부
/bkit:pdca cleanup user-auth    # 하나만
```
- 상태 기록(`.bkit/state/pdca-status.json`)에서 보관 끝난 기능을 지운다.
- `docs/archive/` 안의 문서는 **그대로 남는다**.
- 진행 중인 기능은 지워지지 않는다.

---

## 4. 보조 명령 (기능 이름 없이)

| 명령 | 하는 일 |
|---|---|
| `/bkit:pdca status` | 지금 기능·단계·일치율을 보여준다 (읽기만 함) |
| `/bkit:pdca next` | 현재 단계를 보고 다음 명령을 추천한다 |
| `/bkit:pdca team user-auth` | 여러 AI가 역할을 나눠 진행 (Agent Teams 설정 필요) |
| `/bkit:pdca team status` | 팀 진행 상황 |
| `/bkit:pdca team cleanup` | 팀 종료, 혼자 진행으로 복귀 |

`next`가 추천하는 순서:

| 지금 | 다음 |
|---|---|
| 없음 | `pm` 또는 `plan` |
| plan | `design` |
| design | `do` |
| do | `analyze` |
| check 90% 미만 | `iterate` |
| check 90% 이상 | `report` |
| report | `archive` |

---

## 5. 자동화 단계와의 관계 (`/bkit:control`)

PDCA가 단계를 넘어갈 때 **얼마나 물어볼지**는 자동화 단계가 정한다.

| 단계 | 이름 | 확인 질문 |
|:-:|---|---|
| L0 | Manual | 모든 동작마다 |
| L1 | Guided | **단계가 바뀔 때마다** (현재 설정) |
| L2 | Semi-Auto | do→check, check→report, report→archive 에서만 |
| L3 | Auto | report→archive 에서만 |
| L4 | Full-Auto | 처음 한 번만 |

```
/bkit:control status     # 현재 단계 확인
/bkit:control level 2    # 단계 변경 (올릴 때는 확인 질문이 나옴)
```

---

## 6. 주의할 점 5가지

1. **기능 이름은 끝까지 같게.** `user-auth`로 시작했으면 `userauth`로 바꾸지 않는다.
2. **순서를 건너뛰면 막힌다.** design은 계획서, do는 설계서, archive는 보고서가 있어야 한다.
3. **archive는 파일을 옮긴다.** 커밋하기 전에 실행하면 git에서 "삭제 + 추가"로 보인다.
4. **iterate는 90% 미만일 때만.** 이미 90% 이상이면 바로 report로 간다.
5. **pm, team은 설정이 필요하다.** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`이 없으면 실행되지 않는다.

---

## 7. 실제 예: palette-mobile (2026-10)

명령창(Ctrl/⌘K)을 휴대폰에서 쓰기 좋게 고친 작업이다.

| 순서 | 명령 | 결과 |
|:-:|---|---|
| 1 | `/bkit:control level 1` | 단계마다 확인받도록 설정 |
| 2 | `/bkit:pdca plan palette-mobile` | 범위·완료 기준·브랜치를 질문으로 정함 |
| 3 | `/bkit:pdca design palette-mobile` | "C. 균형" 선택 |
| 4 | (continue) → module-1 구현 | 명령창 코드 수정 |
| 5 | `/bkit:pdca do palette-mobile --scope module-2` | 대시보드 확인 (수정 불필요) |
| 6 | `/bkit:pdca analyze palette-mobile` | 일치율 99% |
| 7 | `/bkit:pdca report palette-mobile` | 완료 보고서 |
| 8 | 커밋 → PR #17 머지 | 코드 반영 |
| 9 | 보관 → PR #18 머지 | `docs/archive/2026-10/palette-mobile/` |

---

## 8. 처음 연습해 보기

1. `/bkit:pdca status` — 읽기만 하므로 부담 없이 실행해 본다.
2. 작은 기능 하나를 정한다 (예: 버튼 문구 바꾸기 → `button-label`).
3. `/bkit:pdca plan button-label` — 질문에 답하고 계획서를 읽어 본다.
4. `/bkit:pdca next` — 다음 명령을 추천받아 따라간다.
