const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

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

function npmInstall(prefix) {
  const args = prefix ? ['install', '--prefix', prefix] : ['install'];
  const result = spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status || 1);
}

const envFile = path.join(root, 'backend', '.env');
loadEnv(envFile);
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('backend/.env 파일에 ANTHROPIC_API_KEY를 넣어 주세요.');
  console.log('예시 파일: backend/.env.example');
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'node_modules'))) npmInstall();
if (!fs.existsSync(path.join(root, 'backend', 'node_modules'))) npmInstall('backend');
if (!fs.existsSync(path.join(root, 'frontend', 'node_modules'))) npmInstall('frontend');

const prepare = spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-db.js'), '--push'], {
  cwd: root,
  stdio: 'inherit',
});
if (prepare.status !== 0) process.exit(prepare.status || 1);

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
