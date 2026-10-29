// Design Ref: docs/02-design/features/image-jobs.design.md §11.2.1 — 서버가 내놓은 이미지 작업을 PC 폴더로 받아 채우고 올린다. 별도 API 요금 없음.
// npm run image-jobs -- pull      작업 → image-jobs/pending/<글>-<장면>.json(작업)·.txt(프롬프트만, 수동 복사용)
// npm run image-jobs -- push      image-jobs/done/<글>-<장면>.(png|jpg|jpeg|webp) → 업로드 → image-jobs/uploaded/
// npm run image-jobs -- generate  pending 작업마다 구독 로그인된 Antigravity CLI(agy)로 그림 1장 → done/
// npm run image-jobs -- run       pull → generate → push
// 셸 환경변수: IMAGE_JOBS_URL(기본 운영, 로컬 검증은 http://localhost:3001), IMAGE_JOBS_MAX(한 번에 만들 최대 장수, 기본 6),
//   IMAGE_JOBS_TIMEOUT_SEC(장면당 기다리는 시간, 기본 180), APP_PASSWORD(push 운영자 로그인. 출력하지도 파일에 남기지도 않는다)
// agy 로그인 파일·토큰은 읽지 않는다. 읽는 것은 agy가 돌려준 대화 id의 대화 기록과 그림 파일뿐이다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const JOBS_DIR = path.join(root, 'image-jobs');
const DIRS = {
  pending: path.join(JOBS_DIR, 'pending'),
  done: path.join(JOBS_DIR, 'done'),
  uploaded: path.join(JOBS_DIR, 'uploaded'),
  // agy를 실행하는 빈 폴더. 저장소 파일을 건드리지 못하게 격리한다.
  agy: path.join(JOBS_DIR, '.agy'),
};
const DEFAULT_URL = 'https://19auto-blog.vercel.app';
const DONE_FILE = /^(\d+)-(\d+)\.(png|jpe?g|webp)$/i;
// 서버 MAX_UPLOAD_BYTES(backend/src/services/imageJobs.ts)와 같게 둔다.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const AGY_BRAIN = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
const FINAL_IMAGE = /Final image path:\s*`?([^`\n]+?\.(?:png|jpe?g|webp))/i;
const QUOTA = /quota|rate.?limit|resource.?exhausted|usage limit|\b429\b/i;

function log(message) {
  console.log(`[image-jobs] ${message}`);
}

function baseUrl() {
  return (process.env.IMAGE_JOBS_URL || DEFAULT_URL).replace(/\/+$/, '');
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function ensureDirs() {
  for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });
}

function jobName(job) {
  return `${job.postId}-${job.index}`;
}

function doneFile(name) {
  return fs.readdirSync(DIRS.done).find((file) => DONE_FILE.test(file) && file.replace(/\.[^.]+$/, '') === name) || null;
}

// 파일 앞부분 서명으로 형식을 본다(서버 detectImageType과 같다). 확장자만 믿지 않는다.
function imageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// --- pull ---
async function pull(base) {
  ensureDirs();
  const res = await fetch(`${base}/api/image-jobs`);
  if (!res.ok) throw new Error(`작업 목록을 받지 못했습니다: ${res.status}`);
  const { jobs, scenes, posts } = await res.json();
  if (!Array.isArray(jobs)) throw new Error('작업 목록을 받지 못했습니다: 목록이 아닙니다.');
  const names = new Set(jobs.map(jobName));
  let added = 0;
  for (const job of jobs) {
    const file = path.join(DIRS.pending, `${jobName(job)}.json`);
    if (!fs.existsSync(file)) added += 1;
    fs.writeFileSync(file, `${JSON.stringify(job, null, 2)}\n`);
    fs.writeFileSync(path.join(DIRS.pending, `${jobName(job)}.txt`), `${job.prompt}\n`);
  }
  // 다른 곳에서 이미 채운 작업은 지운다.
  let removed = 0;
  for (const file of fs.readdirSync(DIRS.pending)) {
    // .json·.txt와 generate가 남긴 .agy(출처 표시)를 같은 작업으로 본다.
    if (names.has(file.replace(/\.[^.]+$/, ''))) continue;
    fs.rmSync(path.join(DIRS.pending, file));
    if (file.endsWith('.json')) removed += 1;
  }
  log(`작업 ${scenes}장 (글 ${posts}개), 새로 받음 ${added}, 끝나서 지움 ${removed} → ${path.relative(root, DIRS.pending)}`);
  return jobs;
}

// --- push ---
async function loginCookie(base) {
  // 비밀번호가 없는 로컬 서버는 쿠키 없이 운영자로 본다.
  if (!process.env.APP_PASSWORD) return '';
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.APP_PASSWORD }),
  });
  if (res.status === 401) throw new Error('운영자 로그인 실패: 401 비밀번호가 맞지 않습니다. 한/영 입력 상태를 확인해주세요.');
  if (!res.ok) throw new Error(`운영자 로그인 실패: ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('autoblog_session='));
  return cookie || '';
}

async function push(base) {
  ensureDirs();
  const files = fs.readdirSync(DIRS.done).filter((file) => DONE_FILE.test(file));
  if (files.length === 0) {
    log(`올릴 그림이 없습니다 (${path.relative(root, DIRS.done)}에 <글>-<장면>.png|jpg|webp)`);
    return { uploaded: 0, failed: 0 };
  }
  const cookie = await loginCookie(base);
  let uploaded = 0;
  let failed = 0;
  for (const file of files) {
    const [, postId, index] = file.match(DONE_FILE);
    const full = path.join(DIRS.done, file);
    const bytes = fs.readFileSync(full);
    if (bytes.length > MAX_UPLOAD_BYTES) {
      log(`${file} 건너뜀: ${(bytes.length / 1024 / 1024).toFixed(1)}MB — 4MB 이하로 줄여주세요 (JPEG로 저장하면 작아집니다)`);
      failed += 1;
      continue;
    }
    const type = imageType(bytes);
    if (!type) {
      log(`${file} 건너뜀: PNG·JPEG·WebP 그림이 아닙니다`);
      failed += 1;
      continue;
    }
    const source = fs.existsSync(path.join(DIRS.pending, `${postId}-${index}.agy`)) ? 'agy' : 'manual';
    const res = await fetch(`${base}/api/image-jobs/${postId}/${index}?source=${source}`, {
      method: 'POST',
      headers: { 'Content-Type': type, ...(cookie ? { Cookie: cookie } : {}) },
      body: bytes,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('운영자 로그인이 필요합니다. 별도 PowerShell 창에서 $env:APP_PASSWORD = Read-Host 로 넣고 다시 실행해주세요.');
    }
    if (!res.ok) {
      // 409: 이미 채운 장면(다음 pull이 pending을 정리한다) 또는 다른 실행이 처리 중(다음에 다시 시도). 파일은 done/에 남긴다.
      log(`${file} ${res.status === 409 ? '건너뜀' : '실패'}: ${res.status} ${body.error || ''}`);
      failed += 1;
      continue;
    }
    fs.renameSync(full, path.join(DIRS.uploaded, file));
    for (const ext of ['json', 'txt', 'agy']) fs.rmSync(path.join(DIRS.pending, `${postId}-${index}.${ext}`), { force: true });
    uploaded += 1;
    log(`${file} 올림 → 글 #${postId} 장면 ${index} · 관련성 ${body.score ?? '-'} · 이 글 남은 ${body.remaining}장${body.completed ? ' · 글 완성(READY)' : ''}`);
  }
  log(`올림 ${uploaded} · 실패/건너뜀 ${failed}`);
  return { uploaded, failed };
}

// --- generate (agy) ---
function agyInstruction(job) {
  // 장면 프롬프트는 수집 글에서 AI가 만든 문장이다. 지시를 앞에 두고 장면은 구분 기호 안에 넣는다. 실제 방어선은 agy의 권한 자동 거부다.
  return [
    'Generate exactly one image with your image generation tool.',
    'Do not run commands, edit files, or browse the web.',
    `Aspect ratio ${job.aspect} landscape.`,
    `Use this description as is: <<<${job.prompt}>>>`,
  ].join(' ');
}

// agy -p를 한 번 실행하고 마지막 JSON 줄(대화 id·상태)을 돌려준다. 응답은 그림보다 먼저 끝날 수 있다.
function runAgy(instruction, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('agy', ['-p', instruction, '--output-format', 'json', '--print-timeout', '120s', '--sandbox'], {
      cwd: DIRS.agy,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    // 이 실행이 띄운 프로세스만 끝낸다(PID 지정).
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ error: error.code === 'ENOENT' ? 'agy를 찾지 못했습니다. Antigravity CLI 설치·로그인을 확인해주세요.' : error.message, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').reverse().find((l) => l.trim().startsWith('{'));
      let result = null;
      try {
        result = line ? JSON.parse(line) : null;
      } catch {}
      resolve(result ? { result, stderr } : { error: `agy 응답이 JSON이 아닙니다 (종료 코드 ${code})`, stderr: `${stderr}\n${stdout}`.trim() });
    });
  });
}

function insideDir(dir, file) {
  const relative = path.relative(dir, path.resolve(file));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// 대화 기록에서 그림 하위 에이전트가 남긴 "Final image path"를 찾는다. 없으면 실행 뒤 생긴 그림 파일로 대신한다.
function findImage(conversationId, startedAt) {
  const dir = path.join(AGY_BRAIN, conversationId);
  const transcript = path.join(dir, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(transcript)) {
    for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
      let content = '';
      try {
        content = String(JSON.parse(line).content || '');
      } catch {
        continue;
      }
      const match = content.match(FINAL_IMAGE);
      if (match && insideDir(dir, match[1].trim()) && fs.existsSync(match[1].trim())) return match[1].trim();
    }
  }
  if (!fs.existsSync(dir)) return null;
  const images = fs
    .readdirSync(dir)
    .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
    .map((file) => ({ file: path.join(dir, file), mtime: fs.statSync(path.join(dir, file)).mtimeMs }))
    .filter((image) => image.mtime >= startedAt)
    // 그림 하위 에이전트가 여러 번 시도했으면 마지막 그림을 쓴다.
    .sort((a, b) => b.mtime - a.mtime);
  return images[0]?.file || null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateOne(job, timeoutMs) {
  const startedAt = Date.now();
  const { result, error, stderr } = await runAgy(agyInstruction(job), timeoutMs);
  if (error) return { error, stderr };
  const text = `${result.response || ''} ${stderr || ''}`;
  if (QUOTA.test(text)) return { error: `구독 한도에 걸린 것 같습니다: ${String(result.response || stderr).slice(0, 160)}`, stop: true };
  if (result.status && result.status !== 'SUCCESS') {
    return { error: `agy 상태 ${result.status}: ${String(result.response || '').slice(0, 160)}`, stop: true };
  }
  const id = result.conversation_id;
  if (!id || !/^[\w-]+$/.test(id)) return { error: 'agy가 대화 id를 돌려주지 않았습니다.' };
  // 응답이 먼저 끝나도 그림 하위 에이전트는 계속 돈다(10/26 실험). 장면당 시간 안에서 3초마다 찾는다.
  while (Date.now() - startedAt < timeoutMs) {
    const image = findImage(id, startedAt);
    if (image) return { image, id, seconds: Math.round((Date.now() - startedAt) / 1000) };
    await wait(3_000);
  }
  return { error: `${Math.round(timeoutMs / 1000)}초 안에 그림을 찾지 못했습니다 (대화 ${id} — ${path.join(AGY_BRAIN, id)})` };
}

async function generate() {
  ensureDirs();
  const max = envNumber('IMAGE_JOBS_MAX', 6);
  const timeoutMs = envNumber('IMAGE_JOBS_TIMEOUT_SEC', 180) * 1000;
  const jobs = fs
    .readdirSync(DIRS.pending)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(DIRS.pending, file), 'utf8')))
    .sort((a, b) => a.postId - b.postId || a.index - b.index)
    // 이미 done/에 있으면 다시 만들지 않는다(이중 생성 방지).
    .filter((job) => !doneFile(jobName(job)));
  if (jobs.length === 0) {
    log('만들 작업이 없습니다');
    return { made: 0 };
  }
  const targets = jobs.slice(0, max);
  log(`agy로 ${targets.length}장 만듭니다 (대기 ${jobs.length}장, 한 번에 최대 ${max}장 · 구독 사용량)`);
  let made = 0;
  let failures = 0;
  for (const job of targets) {
    const name = jobName(job);
    log(`${name} (${job.label}) 생성 중...`);
    const outcome = await generateOne(job, timeoutMs);
    if (outcome.error) {
      log(`${name} 실패: ${outcome.error}`);
      if (outcome.stderr) log(`  ${outcome.stderr.slice(0, 300).replace(/\s+/g, ' ')}`);
      failures += 1;
      // 한도·로그인 문제로 보고 멈춘다. 남은 작업은 pending/에 그대로 두고 다음 실행이 이어간다.
      if (outcome.stop || failures >= 2) {
        log('연속 실패 또는 한도로 생성을 멈춥니다');
        break;
      }
      continue;
    }
    failures = 0;
    const ext = path.extname(outcome.image).toLowerCase();
    // 원본은 agy 폴더에 두고 복사한다.
    fs.copyFileSync(outcome.image, path.join(DIRS.done, `${name}${ext}`));
    fs.writeFileSync(path.join(DIRS.pending, `${name}.agy`), `${outcome.id}\n`);
    made += 1;
    log(`${name} 완료 ${outcome.seconds}초 → ${path.relative(root, path.join(DIRS.done, `${name}${ext}`))}`);
  }
  log(`만듦 ${made} · 남은 대기 ${jobs.length - made}장`);
  return { made };
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const base = baseUrl();
  if (command === 'pull') return pull(base);
  if (command === 'push') return push(base);
  if (command === 'generate') return generate();
  if (command === 'run') {
    log(`대상 ${base}`);
    await pull(base);
    await generate();
    await push(base);
    const jobs = await pull(base);
    log(`남은 작업 ${jobs.length}장`);
    return;
  }
  throw new Error('사용법: npm run image-jobs -- pull | push | generate | run');
}

module.exports = { agyInstruction, findImage, imageType, main };

if (require.main === module) {
  main().catch((error) => {
    console.error(`[image-jobs] ${error.message}`);
    // process.exit()는 Windows에서 fetch 연결이 닫히는 중이면 libuv 경고를 찍는다. 자연 종료로 끝낸다.
    process.exitCode = 1;
  });
}
