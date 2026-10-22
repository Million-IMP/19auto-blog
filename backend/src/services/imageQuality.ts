import { aiService, type ImageInput, type ImagePlan, type ImageScene } from './aiService';
import type { RenderedImage } from './imageProvider';

// Design Ref: §1.2 — 이미지 관련성 채점과 재생성 판단, 본문 속 AI 이미지 교체. 파이프라인과 떼어 단위 테스트한다.

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// 이 점수보다 낮으면 다시 만든다 (기본 3)
export function scoreMin() {
  return envNumber('IMAGE_SCORE_MIN', 3);
}

// 글 하나에서 다시 만들 수 있는 최대 장수 (기본 2). Plan: 글당 추가 비용 ≤ $0.15
export function maxRetries() {
  return envNumber('IMAGE_MAX_RETRIES', 2);
}

// 글 하나에서 24시간 안에 이미지 세트를 다시 만들 수 있는 횟수 (기본 3). 한 번에 약 $0.35가 든다.
export function maxRebuilds() {
  return envNumber('IMAGE_MAX_REBUILDS', 3);
}

// 다시 만들 때 쓰는 Ideogram 속도. 처음 생성(turbo $0.03)보다 한 단계 높은 품질(default $0.06)
export function retrySpeed(): 'turbo' | 'default' {
  return process.env.IDEOGRAM_RETRY_SPEED?.toLowerCase() === 'turbo' ? 'turbo' : 'default';
}

export function needsRetry(scene: ImageScene, plan: ImagePlan) {
  return scene.score !== undefined && scene.score < scoreMin() && !scene.retried && (plan.retries ?? 0) < maxRetries();
}

// anchor "한국어 / English" 중 영어 묘사. 이미지 모델에는 한국어를 보내지 않는다(한국어 prompt는 엉뚱한 그림이 나왔다).
export function anchorEnglish(scene: ImageScene) {
  const english = scene.anchor?.split('/').slice(1).join('/').trim();
  return english && !/[가-힣]/.test(english) ? english : '';
}

// Design Ref: v2 §8.2 — anchor 한국어 부분에 개념을 나열했는지(·, 쉼표, "및"). 여러 개면 이미지에 일부만 보여 3점이 나왔다.
// "와/과"는 "신호와 간섭의 비율"처럼 한 개념인 경우가 많아 보지 않는다.
const LIST_MARK = /[,，、]|\s및\s/;
const DOT = /[·ㆍ•∙・]/;

export function hasListedAnchor(scene: ImageScene) {
  // "TCP/IP 설정 / …"처럼 한국어에도 '/'가 있을 수 있어 ' / '로 나눈다. 한글이 없으면 형식이 다른 anchor라 보지 않는다.
  const korean = (scene.anchor ?? '').split(' / ')[0].replace(/\s*([·ㆍ•∙・])\s*/g, '$1');
  if (!/[가-힣]/.test(korean)) return false;
  if (LIST_MARK.test(korean)) return true;
  // "송·수신", "입·출력"처럼 한 글자를 묶은 말은 한 개념이다. 점 양쪽이 모두 2글자 이상일 때만 나열로 본다.
  return korean.split(/\s+/).some((word) => {
    const parts = word.split(DOT);
    return parts.length > 1 && parts.every((part) => part.replace(/[^가-힣A-Za-z0-9]/g, '').length >= 2);
  });
}

// Design Ref: image-abstract-scenes §5.2 — 숫자·글자가 원래 있는 사물. "no numerals"를 붙여도 그려졌다(운영 #69 달력, #77 계기판).
// counter·form·sign·tag는 일반어(market counter, forms a line, signs of wear)라 앞말과 묶어서만 본다. badge reader는 기기라 뺀다.
const TEXT_OBJECT =
  /\b(calendars?|clocks?|stopwatch(?:es)?|timers?|wristwatch(?:es)?|gauges?|dials?|speedometers?|thermometers?|rulers?|tape measures?|measuring tapes?|scoreboards?|(?:mechanical|tally|digital) counters?|(?:id|access|credit|business|key|name|loyalty) cards?|badges?(?!\s+readers?)|(?:name|price|luggage) tags?|(?:application|approval|consent|paper|printed|blank|tax|order|registration) forms?|certificates?|labels?|tickets?|receipts?|(?:road|street|warning|store|shop|neon|exit|traffic) signs?|signage|signboards?|posters?|banners?|(?:license|number) plates?)\b/i;

// 소품으로만 나와도 숫자가 그려지므로 anchor 영어와 prompt를 함께 본다. 걸린 말을 돌려준다.
export function textObjectWord(scene: ImageScene) {
  const match = `${anchorEnglish(scene)} ${scene.prompt ?? ''}`.match(TEXT_OBJECT);
  return match ? match[1].toLowerCase() : null;
}

// 질문형 소제목을 "키보드 치는 손"으로 그리면 뜻이 안 보였다(운영 #73·#77·#80). 배경 소품인 노트북·키보드는 문제없어 anchor만 본다.
export function hasTypingAnchor(scene: ImageScene) {
  return /\b(typing|keyboards?)\b/i.test(anchorEnglish(scene));
}

// 다시 만들 때는 대상이 분명히 보이도록 prompt에 한 번 더 못박는다.
export function retryPrompt(scene: ImageScene) {
  const subject = anchorEnglish(scene) || scene.must;
  return subject ? `${scene.prompt}. The main subject must be clearly visible and recognizable: ${subject}` : scene.prompt;
}

// Anthropic 이미지 입력이 받는 형식. 다른 형식(application/octet-stream 등)은 주소로 보내거나 채점을 건너뛴다.
const VISION_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function imageInput(image: Pick<RenderedImage, 'url' | 'data' | 'mediaType'>): ImageInput | null {
  const mediaType = (image.mediaType || 'image/png').split(';')[0].trim().toLowerCase();
  if (image.data && VISION_TYPES.includes(mediaType)) return { data: image.data.toString('base64'), mediaType };
  if (/^https?:\/\//.test(image.url)) return { url: image.url };
  return null;
}

// Design Ref: §5.1 — 장면 prompt에는 색·재질을 쓰지 않는다(화풍 style이 정한다). AI가 어긴 단어만 지운다.
const STYLE_WORDS = /\b(teal|orange|amber|indigo|sage|coral|pastel|matte|glossy|clay|claymation|muted|vibrant|neon|monochrome)\b/gi;

export function stripStyleWords(prompt: string) {
  return prompt
    .replace(STYLE_WORDS, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

// 채점 결과를 장면에 기록한다. 실패해도 이미지 생성은 막지 않는다(점수 없음으로 남김).
export async function scoreScene(scene: ImageScene, image: Pick<RenderedImage, 'url' | 'data' | 'mediaType'>) {
  scene.checked = true;
  delete scene.score;
  delete scene.scoreReason;
  const input = imageInput(image);
  if (!input) return;
  try {
    const result = await aiService.scoreImage({
      image: input,
      h2: scene.h2 || '표지 (글 전체)',
      point: scene.point,
      anchor: scene.anchor || '',
    });
    scene.score = result.score;
    scene.scoreReason = result.reason;
  } catch (err: any) {
    console.warn(`[이미지 채점] 건너뜀: ${String(err?.message || err).slice(0, 120)}`);
  }
}

// insertImages가 넣은 AI 이미지(이미지 줄 + "▲ … (AI 생성 이미지)" 설명 줄)와 그 앞뒤 빈 줄 하나를 지운다.
// 주소에 괄호가 들어 있어도(pollinations 이전 주소) 줄 끝까지를 주소로 본다.
const AI_IMAGE = /^!\[[^\]]*\(AI 생성\)\]\(\S+\)\s*$/;
const AI_CAPTION = /^\*▲ .*\(AI 생성 이미지\)\*\s*$/;

export function stripAiImages(content: string) {
  const lines = content.split('\n');
  const output: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!AI_IMAGE.test(lines[i])) {
      output.push(lines[i]);
      continue;
    }
    if (AI_CAPTION.test(lines[i + 1] ?? '')) i += 1;
    if (output.length > 0 && output[output.length - 1].trim() === '') output.pop();
    else if ((lines[i + 1] ?? '').trim() === '') i += 1;
  }
  return output.join('\n');
}
