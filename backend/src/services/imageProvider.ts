import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { remainingTime } from './aiService';

// 이미지 생성 공급자. IMAGE_PROVIDER 환경변수로 바꾼다 (기본: pollinations, jobs: 서버는 그림을 만들지 않고 PC 작업자가 올린다).
export type ImageRequest = {
  prompt: string;
  style: string;
  width: number;
  height: number;
  seed: number;
  must?: string;
  avoid?: string;
};

// 그림에 들어가면 안 되는 것. negative prompt를 받지 않는 모델에는 프롬프트 문장에 붙인다(image-jobs 작업 프롬프트).
export const BASE_NEGATIVE = 'text, letters, words, numbers, digits, handwriting, watermark, logo, signature, blurry, low quality, distorted hands, extra fingers, deformed face';

export function fullPrompt(req: Pick<ImageRequest, 'style' | 'prompt' | 'must'>) {
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

export const LOCAL_IMAGE_DIR = path.resolve(__dirname, '../../generated-images');

// 저장도 남은 실행 시간 안에서 끝낸다. 시간이 넘으면 이 장면은 실패로 두고 다음 실행이 다시 한다.
function stepTimeout(max: number) {
  const timeout = Math.min(max, remainingTime() - 2_000);
  if (timeout < 1_000) throw new Error('남은 실행 시간이 부족합니다. 다음 실행에서 이어갑니다.');
  return timeout;
}

// Vercel Blob 토큰이 있으면 Blob에, 로컬이면 backend/generated-images에 저장한다. 파일 이름은 서버가 만든다.
export async function storeImage(bytes: Buffer, contentType: string) {
  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`post-images/${name}`, bytes, { access: 'public', contentType, abortSignal: AbortSignal.timeout(stepTimeout(15_000)) });
    return blob.url;
  }
  if (process.env.VERCEL) {
    throw new Error('이미지 저장에는 BLOB_READ_WRITE_TOKEN(Vercel Blob)이 필요합니다.');
  }
  fs.mkdirSync(LOCAL_IMAGE_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_IMAGE_DIR, name), bytes);
  return `/api/images/${name}`;
}

// Design Ref: image-jobs §1.2 — IMAGE_PROVIDER는 여기서만 읽는다. jobs면 파이프라인은 렌더하지 않고 장면을 작업으로 남긴다.
export function imageMode(): 'jobs' | 'render' {
  return (process.env.IMAGE_PROVIDER || '').trim().toLowerCase() === 'jobs' ? 'jobs' : 'render';
}

// render 모드의 공급자. 과금 API 없이 pollinations 하나만 둔다.
export function imageProvider(): ImageProvider {
  return pollinations;
}

export function randomSeed() {
  return Math.floor(Math.random() * 1_000_000);
}
