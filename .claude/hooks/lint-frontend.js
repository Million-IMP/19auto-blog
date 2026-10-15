// PostToolUse: frontend의 .ts/.tsx 파일을 수정하면 oxlint로 바로 검사한다.
const { spawnSync } = require('child_process');
const path = require('path');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let file = '';
  try {
    file = JSON.parse(raw).tool_input?.file_path || '';
  } catch {
    process.exit(0);
  }
  const norm = file.replace(/\\/g, '/');
  if (!/\/frontend\/src\/.*\.tsx?$/.test(norm)) process.exit(0);
  const root = path.resolve(__dirname, '..', '..');
  const bin = path.join(root, 'frontend', 'node_modules', '.bin', process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint');
  const r = spawnSync(bin, [file], { cwd: path.join(root, 'frontend'), encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status && r.status !== 0) {
    process.stderr.write((r.stdout || '') + (r.stderr || ''));
    process.exit(2);
  }
  process.exit(0);
});
