# GPTERS 24기 발표 자료 — 콘텐츠 발행 자동화 워크플로우, 그 후 4일

2026-10-19 「콘텐츠&지식」 발표회용 발표 자료(19장, 약 15분). 발표자 MJK(Million.JK, 이진구).

| 파일 | 내용 |
|---|---|
| `index.html` | 브라우저로 바로 여는 발표 자료. 슬라이드 아래에 발표 대본(스피커 노트) |
| `images/` | 슬라이드에 쓴 이미지 (최초 발표 화면, 시안 A·B·C, 최종 화면, 이미지 전후 비교) |
| `source/deck.json`, `source/slides/` | 슬라이드 원본 (Claude 아티팩트 Slides 형식) |
| `source/build-deck.js` | 원본으로 `index.html`을 다시 만드는 스크립트 |

## 보는 법
- `index.html`을 더블클릭해 브라우저로 연다. 글꼴은 Google Fonts에서 받으므로 인터넷이 연결되어 있으면 가장 깔끔하다.
- `P` 키나 슬라이드 클릭: 발표 모드(전체 화면 한 장씩) · `←` `→` 넘기기 · `Esc` 나가기

## 다시 만들기
슬라이드 원본(`source/slides/*.html`)을 고친 뒤:

```
node docs/gpters-presentation/source/build-deck.js docs/gpters-presentation
```

온라인 버전(편집·PDF/PPTX 내려받기): https://claude.ai/artifact/92nkexEYvWrPtkV2R9Phr6 (본인만 열람, 공유하려면 페이지의 공유 메뉴에서 공개)
