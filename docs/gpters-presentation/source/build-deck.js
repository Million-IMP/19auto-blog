// docs/gpters-presentation/source 의 슬라이드를 오프라인에서 열리는 index.html 하나로 묶는다.
// 사용: node build-deck.js <gpters-presentation 폴더>
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
const src = path.join(out, 'source');
const deck = JSON.parse(fs.readFileSync(path.join(src, 'deck.json'), 'utf8'));

// 아티팩트에 올린 이미지 id → docs 안의 파일
const IMAGES = {
  ee2c02bf757e3dedc255ae00121748d5: 'then-dashboard.png',
  '1ac8052313990358849dfef3b56ad63d': 'then-posts.png',
  '2259c030732a349189d89f8a5b916dba': 'then-image-plan.png',
  d17e3507484ef05ce04c2ce788829476: 'c-after-dashboard.jpg',
  '7bfed21a71b5bf998c7f2449ac8895ef': 'mock-a.png',
  '1ea9d8653812ac642b21ccaa2359cc50': 'mock-b.png',
  '1f3d5c2a33ddcd938469ecb3b923e97e': 'mock-c.png',
  '863b6061fdf059d065ddebeef2adbadb': 'final-dashboard.png',
  fb612f18555ee610e71585ab35a5541e: 'before-42.png',
  '9ed564b30d26e5a2741be9165fe51ed5': 'after-42.png',
  bf2e11725d2d01258784b23e74e29b1a: 'before-43.png',
  d83f75205cd53bda7ea160cd5a70a250: 'after-43.png',
};

// 슬라이드 전용 태그(x-shape, x-icon)를 일반 브라우저용 SVG로 바꾼다.
const ICONS = {
  Verified: '<circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.2 3.2L17 9"/>',
  Chart: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
  Search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  Chat: '<path d="M4 5h16v11H9l-5 4z"/>',
};

function styleValue(style, name) {
  const m = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : '';
}

function convert(html) {
  return html
    .replace(/\/_blob\/([0-9a-f]{32})/g, (_, id) => {
      if (!IMAGES[id]) throw new Error(`이미지 없음: ${id}`);
      return `images/${IMAGES[id]}`;
    })
    .replace(/<x-shape kind="arrow-right" style="([^"]*)"><\/x-shape>/g, (_, style) => {
      const w = styleValue(style, 'width');
      const h = styleValue(style, 'height');
      const fill = styleValue(style, 'background');
      return `<svg style="width:${w};height:${h};flex:none" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,15 60,15 60,0 100,25 60,50 60,35 0,35" fill="${fill}"/></svg>`;
    })
    .replace(/<x-icon name="(\w+)" style="([^"]*)"><\/x-icon>/g, (_, name, style) => {
      const w = styleValue(style, 'width');
      const h = styleValue(style, 'height');
      const color = styleValue(style, 'color');
      return `<svg style="width:${w};height:${h};flex:none" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.Verified}</svg>`;
    });
}

const slides = deck.order.map((id, i) => {
  const raw = fs.readFileSync(path.join(src, 'slides', `${id}.html`), 'utf8');
  const notes = (raw.match(/<aside>([\s\S]*?)<\/aside>/) || [])[1] || '';
  const body = convert(raw.replace(/<aside>[\s\S]*?<\/aside>/, ''));
  return `<div class="item" id="s${i + 1}"><div class="frame"><div class="scale">${body}</div></div><p class="notes"><b>${i + 1}.</b> ${notes.trim()}</p></div>`;
});

const fontLinks = Object.values(deck.faces)
  .map((f) => `<link rel="stylesheet" href="${f.href}">`)
  .join('\n');

const page = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${deck.title}</title>
${fontLinks}
<style>
  :root { --paper:#EBE2D3; --ink:#2A211C; }
  * { box-sizing: border-box; }
  body { margin:0; background:#3A2F28; color:#F3EADF; font-family:'IBM Plex Sans KR', Arial, sans-serif; }
  header { padding:24px 32px; display:flex; flex-wrap:wrap; gap:12px 24px; align-items:center; justify-content:space-between; }
  header h1 { margin:0; font-size:20px; font-weight:700; }
  header p { margin:0; font-size:14px; color:#D9CBBB; }
  main { display:flex; flex-direction:column; gap:40px; padding:0 32px 64px; max-width:1280px; margin:0 auto; }
  .frame { position:relative; width:100%; aspect-ratio:16/9; overflow:hidden; border-radius:8px; box-shadow:0 12px 32px rgba(0,0,0,.35); }
  .scale { position:absolute; left:0; top:0; width:1920px; height:1080px; transform-origin:0 0; word-break:keep-all; }
  .scale section { position:relative; width:1920px; height:1080px; overflow:hidden; }
  .scale h1, .scale h2, .scale h3, .scale p, .scale table { margin:0; }
  .scale table { border-collapse:collapse; width:100%; }
  .scale th, .scale td { padding:.35em .6em; border-top:1px solid #DDD0BE; text-align:left; }
  .scale a { color:inherit; }
  .notes { margin:14px 4px 0; font-size:15px; line-height:1.7; color:#D9CBBB; }
  body.present { overflow:hidden; background:#000; }
  body.present header, body.present .notes { display:none; }
  body.present main { padding:0; max-width:none; gap:0; }
  body.present .item { display:none; }
  body.present .item.on { display:flex; align-items:center; justify-content:center; width:100vw; height:100vh; }
  body.present .frame { width:min(100vw, calc(100vh * 16 / 9)); border-radius:0; box-shadow:none; }
</style>
</head>
<body>
<header>
  <h1>${deck.title}</h1>
  <p>P 또는 슬라이드 클릭: 발표 모드 · ← → 넘기기 · Esc 나가기 · 아래 글은 발표 대본</p>
</header>
<main>
${slides.join('\n')}
</main>
<script>
  const items = [...document.querySelectorAll('.item')];
  let current = 0;
  function fit() {
    document.querySelectorAll('.frame').forEach((f) => {
      f.querySelector('.scale').style.transform = 'scale(' + f.clientWidth / 1920 + ')';
    });
  }
  function show(i) {
    current = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((it, k) => it.classList.toggle('on', k === current));
    fit();
  }
  function present(on) {
    document.body.classList.toggle('present', on);
    if (on) show(current); else { fit(); items[current].scrollIntoView(); }
  }
  items.forEach((it, k) => it.querySelector('.frame').addEventListener('click', () => {
    if (!document.body.classList.contains('present')) { current = k; present(true); } else show(current + 1);
  }));
  document.addEventListener('keydown', (e) => {
    const on = document.body.classList.contains('present');
    if (e.key === 'p' || e.key === 'P') present(!on);
    else if (on && (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown')) show(current + 1);
    else if (on && (e.key === 'ArrowLeft' || e.key === 'PageUp')) show(current - 1);
    else if (on && e.key === 'Escape') present(false);
  });
  window.addEventListener('resize', fit);
  document.fonts && document.fonts.ready.then(fit);
  fit();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(out, 'index.html'), page);
console.log(`index.html: 슬라이드 ${slides.length}장`);
