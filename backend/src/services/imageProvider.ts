import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { remainingTime } from './aiService';

// 이미지 생성 공급자. IMAGE_PROVIDER 환경변수로 바꾼다 (기본: pollinations).
export type ImageRequest = {
  prompt: string;
  style: string;
  width: number;
  height: number;
  seed: number;
  must?: string;
  avoid?: string;
  // Ideogram 렌더링 속도. 없으면 IDEOGRAM_RENDERING_SPEED(기본 turbo). 점수가 낮아 다시 만들 때만 품질을 올린다.
  speed?: 'turbo' | 'default';
};

const BASE_NEGATIVE = 'text, letters, words, numbers, digits, handwriting, watermark, logo, signature, blurry, low quality, distorted hands, extra fingers, deformed face';

function fullPrompt(req: ImageRequest) {
  return [req.style, req.prompt, req.must ? `must include: ${req.must}` : ''].filter(Boolean).join('. ');
}

// data: 이미 내려받은 이미지(채점에 그대로 쓴다). pollinations처럼 주소만 있는 공급자는 비워 둔다.
export type RenderedImage = { url: string; provider: string; data?: Buffer; mediaType?: string };

type ImageProvider = {
  name: string;
  render(req: ImageRequest): Promise<RenderedImage>;
};

// URL을 만들면 요청 시점에 이미지가 생성된다. seed를 바꾸면 같은 프롬프트로 다른 이미지가 나온다.
const pollinations: ImageProvider = {
  name: 'pollinations',
  async render(req) {
    // 괄호까지 인코딩해야 본문 마크다운 ![..](주소)가 주소 중간에서 끊기지 않는다.
    const prompt = encodeURIComponent(`${fullPrompt(req)}. no text, no letters, no logo`).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
    return {
      url: `https://image.pollinations.ai/prompt/${prompt}?width=${req.width}&height=${req.height}&seed=${req.seed}&nologo=true`,
      provider: 'pollinations',
    };
  },
};

// --- Ideogram ---
// 응답 이미지 주소는 일정 시간 뒤 사라지므로, 받은 즉시 내려받아 영구 저장소에 올린다.
const IDEOGRAM_URL = 'https://api.ideogram.ai/v2/image/generate/ideogram-3';
const ASPECT_RATIOS = ['1x3', '3x1', '1x2', '2x1', '9x16', '16x9', '10x16', '16x10', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '1x1'];
export const LOCAL_IMAGE_DIR = path.resolve(__dirname, '../../generated-images');

function closestAspectRatio(width: number, height: number) {
  const target = width / height;
  let best = '1x1';
  let bestDiff = Infinity;
  for (const ratio of ASPECT_RATIOS) {
    const [w, h] = ratio.split('x').map(Number);
    const diff = Math.abs(Math.log(w / h / target));
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }
  return best;
}

function ideogramError(status: number, body: string) {
  let detail = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body);
    detail = String(parsed.error || parsed.detail || parsed.message || detail).slice(0, 200);
  } catch {}
  const hint: Record<number, string> = {
    401: 'IDEOGRAM_API_KEY가 올바른지 확인해주세요.',
    402: 'Ideogram 크레딧이 부족합니다. 결제 정보와 잔액을 확인해주세요.',
    422: '프롬프트가 안전 검사를 통과하지 못했습니다. 이 장면만 다시 생성해보세요.',
    429: '요청이 너무 많습니다. 잠시 후 이어하기를 눌러주세요.',
  };
  return new Error(`Ideogram ${status}: ${hint[status] || detail}`);
}

// 다운로드·저장도 남은 실행 시간 안에서 끝낸다. 시간이 넘으면 이 장면은 실패로 두고 다음 실행이 다시 만든다.
function stepTimeout(max: number) {
  const timeout = Math.min(max, remainingTime() - 2_000);
  if (timeout < 1_000) throw new Error('남은 실행 시간이 부족합니다. 다음 실행에서 이어갑니다.');
  return timeout;
}

// Vercel Blob 토큰이 있으면 Blob에, 로컬이면 backend/generated-images에 저장한다.
async function storeImage(bytes: Buffer, contentType: string) {
  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`post-images/${name}`, bytes, { access: 'public', contentType, abortSignal: AbortSignal.timeout(stepTimeout(15_000)) });
    return blob.url;
  }
  if (process.env.VERCEL) {
    throw new Error('배포 환경에서 Ideogram을 쓰려면 BLOB_READ_WRITE_TOKEN(Vercel Blob)이 필요합니다.');
  }
  fs.mkdirSync(LOCAL_IMAGE_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_IMAGE_DIR, name), bytes);
  return `/api/images/${name}`;
}

const ideogram: ImageProvider = {
  name: 'ideogram',
  async render(req) {
    const form = new FormData();
    form.append('prompt', fullPrompt(req));
    form.append('negative_prompt', [BASE_NEGATIVE, req.avoid].filter(Boolean).join(', '));
    // 계획 단계에서 이미 구체적인 prompt를 만들므로, 자동 재작성은 꺼서 한 글 안의 스타일이 흔들리지 않게 한다.
    form.append('magic_prompt', (process.env.IDEOGRAM_MAGIC_PROMPT || 'off').toLowerCase());
    form.append('aspect_ratio', closestAspectRatio(req.width, req.height));
    form.append('rendering_speed', (req.speed || process.env.IDEOGRAM_RENDERING_SPEED || 'turbo').toLowerCase());
    form.append('seed', String(req.seed));
    form.append('num_images', '1');

    // Vercel 실행 시간 안에서 다운로드·저장까지 끝낼 여유를 남긴다.
    const timeout = Math.min(40_000, remainingTime() - 8_000);
    if (timeout < 5_000) throw new Error('남은 실행 시간이 부족합니다. 다음 실행에서 이어갑니다.');
    const res = await fetch(IDEOGRAM_URL, {
      method: 'POST',
      headers: { 'Api-Key': String(process.env.IDEOGRAM_API_KEY) },
      body: form,
      signal: AbortSignal.timeout(timeout),
    });
    const body = await res.text();
    if (!res.ok) throw ideogramError(res.status, body);

    const image = JSON.parse(body).data?.[0];
    if (!image?.url) throw new Error('Ideogram이 이미지를 돌려주지 않았습니다(안전 검사 미통과일 수 있음). 이 장면만 다시 생성해보세요.');

    const download = await fetch(image.url, { signal: AbortSignal.timeout(stepTimeout(20_000)) });
    if (!download.ok) throw new Error(`Ideogram 이미지 다운로드 실패: ${download.status}`);
    const contentType = download.headers.get('content-type') || 'image/png';
    const data = Buffer.from(await download.arrayBuffer());
    const url = await storeImage(data, contentType);
    return { url, provider: 'ideogram', data, mediaType: contentType };
  },
};

export function imageProvider(): ImageProvider {
  const name = (process.env.IMAGE_PROVIDER || 'pollinations').toLowerCase();
  if (name === 'ideogram') {
    if (!process.env.IDEOGRAM_API_KEY) throw new Error('IMAGE_PROVIDER=ideogram에는 IDEOGRAM_API_KEY가 필요합니다.');
    return ideogram;
  }
  return pollinations;
}

export function randomSeed() {
  return Math.floor(Math.random() * 1_000_000);
}
