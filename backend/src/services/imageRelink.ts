import type { ImagePlan } from './aiService';

// Design Ref: docs/02-design/features/prod-ui-check.design.md §4.2 — 로컬 이미지 주소(/api/images/…)를
// 같은 파일 이름의 이 프로젝트 Blob 주소로만 바꾼다. 본문과 이미지 계획을 함께 바꿔야 장면 다시 만들기가 본문 그림을 찾는다.
export type RelinkPair = { from: string; to: string };

const FROM_PATTERN = /^\/api\/images\/([\w-]+\.(?:png|jpg|webp))$/;
const TO_PATTERN = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/post-images\/([\w-]+\.(?:png|jpg|webp))$/;
const MAX_PAIRS = 20;

export function parseRelinkPairs(raw: unknown): { pairs: RelinkPair[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_PAIRS) {
    return { error: `pairs는 1~${MAX_PAIRS}개 배열이어야 합니다.` };
  }
  const pairs: RelinkPair[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const from = typeof item?.from === 'string' ? item.from : '';
    const to = typeof item?.to === 'string' ? item.to : '';
    const fromName = from.match(FROM_PATTERN)?.[1];
    const toName = to.match(TO_PATTERN)?.[1];
    if (!fromName) return { error: `로컬 이미지 주소가 아닙니다: ${from.slice(0, 120)}` };
    if (!toName) return { error: `이 프로젝트 Blob 주소가 아닙니다: ${to.slice(0, 120)}` };
    if (fromName !== toName) return { error: `파일 이름이 다릅니다: ${fromName} → ${toName}` };
    if (seen.has(from)) return { error: `같은 주소가 두 번 있습니다: ${from}` };
    seen.add(from);
    pairs.push({ from, to });
  }
  return { pairs };
}

// 본문의 주소와 계획 장면의 url을 바꾼 결과를 돌려준다. 입력은 바꾸지 않는다.
// missing이 있으면 호출한 쪽은 아무것도 저장하지 않는다.
export function relinkUrls(content: string, plan: ImagePlan, pairs: RelinkPair[]) {
  const next = structuredClone(plan);
  const scenes = [next.cover, ...next.sections];
  const replaced = { content: 0, imagePlan: 0 };
  const missing: string[] = [];
  let text = content;
  for (const { from, to } of pairs) {
    const inContent = text.split(from).length - 1;
    const inPlan = scenes.filter((scene) => scene?.url === from);
    if (!inContent || !inPlan.length) {
      missing.push(`${from} (본문 ${inContent} · 계획 ${inPlan.length})`);
      continue;
    }
    text = text.split(from).join(to);
    for (const scene of inPlan) scene.url = to;
    replaced.content += inContent;
    replaced.imagePlan += inPlan.length;
  }
  return { content: text, plan: next, replaced, missing };
}
