---
name: autoblog-api-conventions
description: Express 5 라우트 작성 규칙. Use when adding or editing routes in backend/src/index.ts, request/response shapes, or error handling.
---

# API Conventions

## 패턴
```ts
app.post('/api/<resource>/:id/<action>', async (req, res) => {
  try {
    const { field } = req.body;
    const row = await prisma.<model>.update({ where: { id: Number(req.params.id) }, data: { field } });
    res.json(row);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
```

## 규칙
- 경로는 `/api/` 접두사 + 복수형 리소스(inbox만 단수). 토글은 `PUT /:id/toggle`.
- `req.params.id`는 항상 `Number()` 변환.
- 에러 응답은 `{ error: string }`. 프론트가 `err.response.data.error`를 표시한다.
- 무거운 로직은 services/로 빼고 라우트는 얇게.
- 자동화 이벤트는 `prisma.systemLog.create({ data: { event, message } })`로 기록.
- 새 라우트 추가 후 api-doc-generator 에이전트로 문서 갱신.

## 리소스
stats · inbox(+rss, scrape, quick-summary, process, auto-retry) · rss-feeds · automation(+run) · materials(+extract) · rules · posts(+generate, publish, osmu) · system-logs · cron/daily
