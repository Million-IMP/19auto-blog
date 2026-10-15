const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'backend', 'prisma', 'schema.prisma');
const postgresSchemaPath = path.join(root, 'backend', 'prisma', 'schema.postgres.prisma');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function prismaBin() {
  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  if (fs.existsSync(local)) return local;
  const backend = path.join(root, 'backend', 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  return backend;
}

function run(args) {
  const result = spawnSync(prismaBin(), args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

loadEnv(path.join(root, 'backend', '.env'));

const databaseUrl = process.env.DATABASE_URL || '';
const usePostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
let schema = schemaPath;

if (usePostgres) {
  if (!process.env.DIRECT_URL) process.env.DIRECT_URL = databaseUrl;
  const source = fs.readFileSync(schemaPath, 'utf8');
  const replaced = source.replace(
    /datasource db \{[\s\S]*?\n\}/,
    `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`
  );
  fs.writeFileSync(postgresSchemaPath, replaced);
  schema = postgresSchemaPath;
  console.log('데이터베이스: Postgres');
} else {
  console.log('데이터베이스: 로컬 SQLite 파일');
}

run(['generate', '--schema', schema]);
// 로컬은 --push로, Vercel 빌드는 DB_PUSH_ON_BUILD=1일 때만 구조를 반영한다(새로 배포하는 사람용).
// 데이터가 지워지는 변경이면 prisma가 거부하므로 빌드가 실패하고 배포는 막힌다.
const pushOnVercel = process.env.VERCEL && process.env.DB_PUSH_ON_BUILD === '1';
if ((process.argv.includes('--push') && !process.env.VERCEL) || pushOnVercel) {
  run(['db', 'push', '--schema', schema, '--skip-generate']);
}
