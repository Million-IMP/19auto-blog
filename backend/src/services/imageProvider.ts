// 이미지 생성 공급자. IMAGE_PROVIDER 환경변수로 바꾼다 (기본: pollinations).
export type ImageRequest = {
  prompt: string;
  style: string;
  width: number;
  height: number;
  seed: number;
};

export type RenderedImage = { url: string; provider: string };

type ImageProvider = {
  name: string;
  render(req: ImageRequest): Promise<RenderedImage>;
};

// URL을 만들면 요청 시점에 이미지가 생성된다. seed를 바꾸면 같은 프롬프트로 다른 이미지가 나온다.
const pollinations: ImageProvider = {
  name: 'pollinations',
  async render(req) {
    const prompt = encodeURIComponent(`${req.style}. ${req.prompt}. no text, no letters, no logo`);
    return {
      url: `https://image.pollinations.ai/prompt/${prompt}?width=${req.width}&height=${req.height}&seed=${req.seed}&nologo=true`,
      provider: 'pollinations',
    };
  },
};

// TODO(Ideogram): API 호출 구현. 응답 URL이 임시 주소라면 영구 저장소(예: Vercel Blob)에 올린 뒤 그 주소를 돌려줘야 한다.
const ideogram: ImageProvider = {
  name: 'ideogram',
  async render() {
    throw new Error('Ideogram 연동은 아직 구현되지 않았습니다. IMAGE_PROVIDER를 비워 두면 pollinations를 씁니다.');
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
