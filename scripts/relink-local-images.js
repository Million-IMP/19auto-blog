// Design Ref: docs/02-design/features/prod-ui-check.design.md — 로컬(backend/generated-images)에만 저장된 글 이미지를 Blob에 올리고 운영 글 주소를 바꾼다.
// node scripts/relink-local-images.js --post 37          → 읽기만 (dry-run, 운영 쓰기 0)
// node scripts/relink-local-images.js --post 37 --apply  → 백업 → Blob 업로드 → 운영자 로그인 → 주소 교체 → 확인
// --apply에는 셸 환경변수 BLOB_READ_WRITE_TOKEN·APP_PASSWORD가 필요하다. 값은 출력하지도 파일에 남기지도 않는다.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const imageDir = path.join(root, 'backend', 'generated-images');
const DEFAULT_SOURCE = 'https://19auto-blog.vercel.app';
const LOCAL_URL = /^\/api\/images\/[\w-]+\.(?:png|jpg|webp)$/;
const LOCAL_URLS = /\/api\/images\/[\w-]+\.(?:png|jpg|webp)/g;
const BLOB_STORE = /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com(?=\/post-images\/)/;
const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

function log(message) {
  console.log(`[relink] ${message}`);
}

function parseArgs(argv) {
  const index = argv.indexOf('--post');
  const postId = index >= 0 ? Number(argv[index + 1]) : NaN;
  if (!Number.isInteger(postId) || postId < 1) throw new Error('글 번호가 필요합니다: --post 37');
  return { postId, apply: argv.includes('--apply') };
}

function sourceUrl() {
  return (process.env.RELINK_SOURCE_URL || DEFAULT_SOURCE).replace(/\/+$/, '');
}

async function getPosts(base) {
  const res = await fetch(`${base}/api/posts`);
  if (!res.ok) throw new Error(`글 목록을 받지 못했습니다: ${res.status}`);
  const posts = await res.json();
  if (!Array.isArray(posts)) throw new Error('글 목록을 받지 못했습니다: 목록이 아닙니다.');
  return posts;
}

function scenesOf(post) {
  const plan = post.imagePlan ? JSON.parse(post.imagePlan) : null;
  return plan ? [plan.cover, ...(plan.sections || [])] : [];
}

// 본문·계획의 로컬 이미지 주소를 모은다. 주소마다 본문 개수·계획 장면 위치·로컬 파일 크기를 붙인다.
function localImages(post) {
  const scenes = scenesOf(post);
  const urls = new Set(post.content.match(LOCAL_URLS) || []);
  for (const scene of scenes) if (LOCAL_URL.test(scene?.url || '')) urls.add(scene.url);
  return [...urls].map((from) => {
    const name = from.split('/').pop();
    const file = path.join(imageDir, name);
    return {
      from,
      name,
      file,
      inContent: post.content.split(from).length - 1,
      inPlan: scenes.map((scene, i) => (scene?.url === from ? (i === 0 ? '표지' : `소제목${i}`) : null)).filter(Boolean),
      size: fs.existsSync(file) ? fs.statSync(file).size : null,
    };
  });
}

// 다른 글에 이미 있는 Blob 주소에서 스토어 주소를 찾는다 (dry-run 표시용).
function blobStore(posts) {
  for (const post of posts) {
    const match = `${post.content}\n${post.imagePlan || ''}`.match(BLOB_STORE);
    if (match) return match[0];
  }
  return null;
}

function printTable(images, store) {
  images.forEach((image, i) => {
    const plan = image.inPlan.length ? image.inPlan.join('·') : '없음';
    const local = image.size === null ? '없음' : `${(image.size / 1024 / 1024).toFixed(1)}MB`;
    console.log(`  ${i + 1}. ${image.name}  본문 ${image.inContent} · 계획 ${plan} · 로컬 파일 ${local}`);
  });
  if (store) log(`바꿀 주소: ${store}/post-images/<같은 이름>`);
}

function problems(images) {
  return images
    .filter((image) => image.size === null || !image.inContent || !image.inPlan.length)
    .map((image) => image.name);
}

function snapshot(posts, postId) {
  return new Map(posts.filter((p) => p.id !== postId).map((p) => [p.id, JSON.stringify([p.content, p.imagePlan])]));
}

function backup(post) {
  const file = path.join(imageDir, `relink-backup-${post.id}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ id: post.id, title: post.title, content: post.content, imagePlan: post.imagePlan }, null, 2));
  log(`백업: ${path.relative(root, file)} (git 제외 폴더)`);
}

async function upload(images) {
  const { put } = require('@vercel/blob');
  const pairs = [];
  for (const image of images) {
    const ext = image.name.split('.').pop();
    // 원본 바이트 그대로, 같은 이름으로 올린다. 다시 실행해도 같은 주소가 되도록 덮어쓰기를 허용한다.
    const blob = await put(`post-images/${image.name}`, fs.readFileSync(image.file), {
      access: 'public',
      contentType: CONTENT_TYPES[ext],
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    log(`올림: ${image.name}`);
    pairs.push({ from: image.from, to: blob.url });
  }
  return pairs;
}

async function loginCookie(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.APP_PASSWORD }),
  });
  if (!res.ok) throw new Error(`운영자 로그인 실패: ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('autoblog_session='));
  if (!cookie) throw new Error('운영자 로그인 실패: 세션 쿠키가 없습니다.');
  return cookie;
}

async function relink(base, postId, pairs, cookie) {
  const res = await fetch(`${base}/api/posts/${postId}/images/relink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ pairs }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`주소 교체 실패: ${res.status} ${body.error || ''}`);
  return body;
}

// Plan SC-1·SC-2 — 교체 뒤 운영을 다시 읽어 로컬 주소 0건, Blob 200, 다른 글 변화 없음을 확인한다.
async function verify(base, postId, pairs, before) {
  const posts = await getPosts(base);
  const post = posts.find((p) => p.id === postId);
  const left = post ? localImages(post).length : -1;
  const statuses = await Promise.all(pairs.map(({ to }) => fetch(to, { method: 'HEAD' }).then((r) => r.status, () => 0)));
  const after = snapshot(posts, postId);
  const changed = [...before.keys()].filter((id) => before.get(id) !== after.get(id));
  log(`확인: 남은 로컬 주소 ${left}건 · Blob 200 ${statuses.filter((s) => s === 200).length}/${pairs.length} · 다른 글 ${before.size}개 중 바뀐 글 ${changed.length}개${changed.length ? ` (#${changed.join(', #')})` : ''}`);
  return left === 0 && statuses.every((s) => s === 200);
}

async function main(argv = process.argv.slice(2)) {
  const { postId, apply } = parseArgs(argv);
  const base = sourceUrl();
  const posts = await getPosts(base);
  const post = posts.find((p) => p.id === postId);
  if (!post) throw new Error(`글 #${postId}이 없습니다: ${base}`);
  const images = localImages(post);
  log(`${base} · 글 #${post.id} "${post.title}"`);
  log(`로컬 이미지 주소 ${images.length}개`);
  printTable(images, blobStore(posts));
  if (!images.length) return log('바꿀 주소가 없습니다.');
  const bad = problems(images);
  if (bad.length) log(`진행 불가 (로컬 파일 없음 또는 본문·계획 한쪽에만 있음): ${bad.join(', ')}`);
  if (!apply) return log('dry-run: 운영에 쓰지 않았습니다. 실제로 바꾸려면 --apply');

  if (bad.length) throw new Error('--apply 중단: 위 주소를 먼저 확인하세요.');
  const missingEnv = ['BLOB_READ_WRITE_TOKEN', 'APP_PASSWORD'].filter((key) => !process.env[key]);
  if (missingEnv.length) throw new Error(`--apply 중단: 환경변수가 없습니다: ${missingEnv.join(', ')}`);

  const before = snapshot(posts, postId);
  backup(post);
  const pairs = await upload(images);
  const cookie = await loginCookie(base);
  const result = await relink(base, postId, pairs, cookie);
  log(`교체: 본문 ${result.replaced.content}곳 · 계획 ${result.replaced.imagePlan}장면`);
  if (!(await verify(base, postId, pairs, before))) throw new Error('확인 실패: 위 결과를 보세요.');
  log('완료');
}

module.exports = { parseArgs, localImages, blobStore, problems, main };

if (require.main === module) {
  main().catch((error) => {
    console.error(`[relink] ${error.message}`);
    process.exit(1);
  });
}
