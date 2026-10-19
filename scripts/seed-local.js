// Design Ref: docs/02-design/features/local-test-db.design.md — 운영 공개 API(GET)만 읽어 로컬 SQLite(dev.db)에 사본을 넣는다.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'backend', 'prisma', 'dev.db');
const clientDir = path.join(root, 'backend', 'node_modules', '@prisma', 'client');
const clientSchemaPath = path.join(root, 'backend', 'node_modules', '.prisma', 'client', 'schema.prisma');
const DEFAULT_SOURCE = 'https://19auto-blog.vercel.app';

const PROFILE_FIELDS = ['audience', 'purpose', 'tone', 'structure', 'ctaText', 'ctaUrl', 'imageStyle', 'bannedPhrases'];
const RULE_FIELDS = ['id', 'title', 'content', 'type', 'isActive', 'createdAt', 'updatedAt'];
const MATERIAL_FIELDS = ['id', 'title', 'content', 'keyword', 'inboxId', 'isArchived', 'isActive', 'createdAt', 'updatedAt'];
const POST_FIELDS = [
  'id', 'title', 'content', 'status', 'keyword', 'publishedUrl', 'platform', 'inboxId', 'parentPostId',
  'stage', 'stageError', 'sources', 'imagePlan', 'polishNotes', 'osmuAt', 'publishCheck', 'createdAt', 'updatedAt',
];
const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'osmuAt']);

function log(message) {
  console.log(`[local] ${message}`);
}

// 스키마에 있는 필드만 고른다 (API가 붙이는 isPipeline 같은 계산 필드는 버림).
function pick(item, fields) {
  const row = {};
  for (const key of fields) {
    if (item[key] === undefined) continue;
    row[key] = DATE_FIELDS.has(key) && item[key] !== null ? new Date(item[key]) : item[key];
  }
  return row;
}

function toRows(source) {
  const ids = new Set(source.posts.map((p) => p.id));
  const parents = [];
  const children = [];
  for (const item of [...source.posts].sort((a, b) => a.id - b.id)) {
    const post = pick(item, POST_FIELDS);
    // /api/posts는 brief를 빼고 보낸다. 화면의 파이프라인 패널(이미지 관련성 배지 등)은 brief가 있어야 보이므로 빈 입력을 넣는다.
    post.brief = item.isPipeline
      ? JSON.stringify({ keyword: item.keyword ?? item.title, inboxContents: [], materialContents: [], ruleContents: [] })
      : null;
    if (post.parentPostId != null && !ids.has(post.parentPostId)) post.parentPostId = null;
    (post.parentPostId == null ? parents : children).push(post);
  }
  return {
    profile: { id: 1, ...pick(source.profile || {}, PROFILE_FIELDS) },
    rules: source.rules.map((r) => pick(r, RULE_FIELDS)),
    materials: source.materials.map((m) => pick(m, MATERIAL_FIELDS)),
    parents,
    children,
  };
}

// .env보다 먼저 넣는다. prepare-db.js의 loadEnv와 backend의 dotenv는 이미 있는 값을 덮어쓰지 않는다.
function forceLocalEnv() {
  process.env.DATABASE_URL = 'file:./dev.db';
  process.env.DISABLE_LOCAL_CRON = '1';
  delete process.env.DIRECT_URL;
  log('DB: 로컬 SQLite (backend/prisma/dev.db) · 크론 끔');
}

function sourceUrl() {
  const base = (process.env.SEED_SOURCE_URL || DEFAULT_SOURCE).replace(/\/+$/, '');
  if (/\/\/(localhost|127\.0\.0\.1):3001$/.test(base)) throw new Error('자기 자신(localhost:3001)에서 사본을 받을 수 없습니다.');
  return base;
}

async function getJson(base, route) {
  const res = await fetch(`${base}${route}`);
  if (!res.ok) throw new Error(`운영 사본을 받지 못했습니다: ${route} ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`운영 사본을 받지 못했습니다: ${route} JSON이 아닙니다.`);
  }
}

async function fetchSource(base) {
  const [profile, rules, materials, posts] = await Promise.all(
    ['/api/profile', '/api/rules', '/api/materials', '/api/posts'].map((route) => getJson(base, route))
  );
  for (const [route, value] of [['/api/rules', rules], ['/api/materials', materials], ['/api/posts', posts]]) {
    if (!Array.isArray(value)) throw new Error(`운영 사본을 받지 못했습니다: ${route} 목록이 아닙니다.`);
  }
  return { profile, rules, materials, posts };
}

// journal은 지우지 않고 백업과 함께 옮긴다. 쓰기 도중 끊긴 DB라면 journal이 있어야 백업을 열 때 롤백된다.
function backupDb() {
  const journal = `${dbPath}-journal`;
  const hasDb = fs.existsSync(dbPath);
  try {
    if (hasDb) {
      fs.renameSync(dbPath, `${dbPath}.bak`);
      fs.rmSync(`${dbPath}.bak-journal`, { force: true });
    }
    // DB 없이 journal만 남았으면 쓸 데가 없으므로 지운다 (새 dev.db에 잘못 적용되지 않게).
    if (fs.existsSync(journal)) {
      if (hasDb) fs.renameSync(journal, `${dbPath}.bak-journal`);
      else fs.rmSync(journal);
    }
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      throw new Error('로컬 서버가 dev.db를 쓰고 있습니다. 서버를 끄고 다시 실행하세요.');
    }
    throw error;
  }
  if (hasDb) log('기존 dev.db → dev.db.bak 백업');
}

// Plan SC: 운영 DB 보호 — DATABASE_URL과 생성된 클라이언트 provider를 둘 다 확인한다.
function ensureSqliteClient() {
  if (/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL이 Postgres입니다. 운영 DB 보호를 위해 중단합니다.');
  }
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-db.js'), '--push'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('prepare-db.js가 실패했습니다. 로컬 서버가 켜져 있으면 끄고 다시 실행하세요.');
  const schema = fs.existsSync(clientSchemaPath) ? fs.readFileSync(clientSchemaPath, 'utf8') : '';
  const provider = schema.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/)?.[1];
  if (provider !== 'sqlite') {
    throw new Error(`Prisma 클라이언트가 SQLite가 아닙니다(${provider || '없음'}). 운영 DB 보호를 위해 중단합니다.`);
  }
  log('Prisma 클라이언트 확인: sqlite');
}

async function insert(rows) {
  const { PrismaClient } = require(clientDir);
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction([
      prisma.blogProfile.upsert({ where: { id: 1 }, update: rows.profile, create: rows.profile }),
      prisma.rule.createMany({ data: rows.rules }),
      prisma.material.createMany({ data: rows.materials }),
      prisma.post.createMany({ data: rows.parents }),
      prisma.post.createMany({ data: rows.children }),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

// 사본을 먼저 받는다. 네트워크가 실패하면 기존 dev.db는 그대로 남는다.
async function main() {
  forceLocalEnv();
  const base = sourceUrl();
  log(`운영 사본 받는 중: ${base}`);
  const rows = toRows(await fetchSource(base));
  backupDb();
  ensureSqliteClient();
  await insert(rows);
  log(`넣음: 프로필 1 · 규칙 ${rows.rules.length} · 재료 ${rows.materials.length} · 글 ${rows.parents.length + rows.children.length}`);
}

module.exports = { toRows, forceLocalEnv, ensureSqliteClient, main };

if (require.main === module) {
  main().catch((error) => {
    console.error(`[local] ${error.message}`);
    process.exit(1);
  });
}
