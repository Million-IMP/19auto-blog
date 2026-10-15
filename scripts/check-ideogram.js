// Ideogram 설정 확인. dry_run이라 이미지를 만들지 않고 과금되지 않는다.
// 실행: node scripts/check-ideogram.js
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

async function main() {
  const provider = process.env.IMAGE_PROVIDER || '(비어 있음 → pollinations)';
  console.log(`IMAGE_PROVIDER: ${provider}`);
  console.log(`IDEOGRAM_API_KEY: ${process.env.IDEOGRAM_API_KEY ? `있음 (${process.env.IDEOGRAM_API_KEY.length}자)` : '없음'}`);
  console.log(`BLOB_READ_WRITE_TOKEN: ${process.env.BLOB_READ_WRITE_TOKEN ? '있음 → Vercel Blob에 저장' : '없음 → 로컬 backend/generated-images에 저장'}`);
  if (!process.env.IDEOGRAM_API_KEY) process.exit(1);

  const form = new FormData();
  form.append('prompt', 'flat illustration of a laptop on a desk');
  form.append('negative_prompt', 'text, letters, words, watermark, logo');
  form.append('aspect_ratio', '16x9');
  form.append('rendering_speed', process.env.IDEOGRAM_RENDERING_SPEED || 'TURBO');
  form.append('seed', '1234');
  form.append('num_images', '1');
  const res = await fetch('https://api.ideogram.ai/v2/image/generate/ideogram-3?dry_run=true', {
    method: 'POST',
    headers: { 'Api-Key': process.env.IDEOGRAM_API_KEY },
    body: form,
  });
  console.log(`dry_run 응답 ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
