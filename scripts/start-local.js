// Design Ref: docs/archive/2026-10/local-test-db/local-test-db.design.md — 운영 DB를 건드리지 않는 로컬 실행 (SQLite + 운영 사본).
// npm run start:local            → 운영 사본으로 dev.db를 새로 채우고 실행
// npm run start:local -- --keep  → 지금 dev.db를 그대로 두고 실행
const path = require('path');
const { spawn } = require('child_process');
const { ensureSqliteClient, forceLocalEnv, main: seed } = require('./seed-local');

const root = path.resolve(__dirname, '..');

async function run() {
  if (process.argv.includes('--keep')) {
    forceLocalEnv();
    ensureSqliteClient();
  } else {
    await seed();
  }

  const children = ['backend', 'frontend'].map((prefix) => spawn('npm', ['run', 'dev', '--prefix', prefix], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }));

  function stop() {
    for (const child of children) {
      if (!child.killed) child.kill();
    }
  }

  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });

  console.log('화면: http://localhost:5173');
}

run().catch((error) => {
  console.error(`[local] ${error.message}`);
  process.exit(1);
});
