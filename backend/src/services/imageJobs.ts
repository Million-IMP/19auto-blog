import type { ImagePlan, ImageScene } from './aiService';
import { BASE_NEGATIVE, fullPrompt } from './imageProvider';

// Design Ref: image-jobs §3 — imagePlan 장면이 곧 작업 큐다(새 테이블 없음). DB·잠금 없이 순수 함수로 두어 목 없이 테스트한다.

// Vercel 요청 본문 제한(4.5MB) 안. agy 결과는 약 0.55MB다.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type ImageJob = {
  postId: number;
  title: string;
  // 0 = 표지, 1.. = 소제목 순서 (다시 생성과 같은 번호)
  index: number;
  label: string;
  // 이미지 모델에 그대로 넣는 전체 문장
  prompt: string;
  width: number;
  height: number;
  aspect: '2:1' | '16:9';
  // 이미 그림이 있는 장면의 교체(다시 생성)
  replace: boolean;
};

export function isJob(scene: ImageScene) {
  return !scene.url || scene.pending === true;
}

export function sceneAt(plan: ImagePlan, index: number): ImageScene | undefined {
  return index === 0 ? plan.cover : plan.sections[index - 1];
}

// negative prompt를 받지 않는 모델이라 피할 것과 글자 금지를 문장에 넣는다. 한국어 anchor는 넣지 않는다(엉뚱한 그림이 나왔다).
export function jobPrompt(plan: ImagePlan, scene: ImageScene) {
  const avoid = [scene.avoid?.trim(), BASE_NEGATIVE].filter(Boolean).join(', ');
  return `${fullPrompt({ style: plan.style, prompt: scene.prompt, must: scene.must })}. Avoid: ${avoid}. No text, no letters, no numbers, no logos, no watermarks.`;
}

export function jobItems(post: { id: number; title: string; imagePlan: string | null }): ImageJob[] {
  if (!post.imagePlan) return [];
  const plan = JSON.parse(post.imagePlan) as ImagePlan;
  return [plan.cover, ...plan.sections].flatMap((scene, index) => {
    if (!scene || !isJob(scene)) return [];
    const cover = index === 0;
    return [
      {
        postId: post.id,
        title: post.title,
        index,
        label: cover ? '표지' : scene.h2 || `장면 ${index}`,
        prompt: jobPrompt(plan, scene),
        width: 800,
        height: cover ? 400 : 450,
        aspect: cover ? ('2:1' as const) : ('16:9' as const),
        replace: Boolean(scene.url),
      },
    ];
  });
}

// 올린 그림을 장면에 넣는다. 교체(이미 그림이 있던 장면)면 본문의 이전 주소도 새 주소로 바꾼 본문을 돌려준다.
export function applyUpload(content: string, plan: ImagePlan, scene: ImageScene, upload: { url: string; source: string }) {
  const next = scene.url ? content.split(scene.url).join(upload.url) : content;
  scene.url = upload.url;
  scene.source = upload.source;
  delete scene.pending;
  // seed는 서버 렌더에서만 의미가 있다.
  delete scene.seed;
  plan.provider = 'jobs';
  return next;
}

export type UploadType = 'image/png' | 'image/jpeg' | 'image/webp';

// 파일 앞부분 서명으로 형식을 본다. Content-Type만 믿지 않는다.
export function detectImageType(bytes: Buffer): UploadType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
