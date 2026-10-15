---
name: autoblog-database
description: Prisma 스키마와 SQLite/Postgres 이중 운용. Use when changing backend/prisma/schema.prisma, adding models/fields, or debugging DB/migration issues.
---

# Database

## 파일
- `backend/prisma/schema.prisma` — 유일한 원본 (provider sqlite)
- `backend/prisma/schema.postgres.prisma` — prepare-db.js가 DATABASE_URL이 postgres일 때 생성 (gitignore, 직접 수정 금지)
- `backend/src/db.ts` — PrismaClient 싱글톤 `prisma`

## 스키마 변경 절차
1. schema.prisma 수정
2. `node scripts/prepare-db.js --push` (generate + 로컬 db push)
3. 운영 Postgres 반영은 Vercel 빌드에서 generate만 하므로 push는 별도로 해야 함 — 사용자 확인 후 진행

## 규칙
- 마이그레이션 파일 없이 `db push` 방식. 컬럼 삭제/타입 변경은 데이터 손실 위험 → 반드시 사용자 확인.
- 양쪽 DB 호환: `@db.*` 네이티브 타입, Json 타입(SQLite 미지원) 금지. 상태값은 String + 주석으로 허용값 표시.
- 새 필드는 optional(`?`) 또는 `@default`로 추가해 기존 행과 호환.
- `binaryTargets`에 `rhel-openssl-3.0.x` 유지 (Vercel).
