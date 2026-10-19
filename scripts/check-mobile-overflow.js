// 휴대폰 너비(390·430px)에서 화면이 오른쪽으로 넘치거나 잘리는지 점검한다. 버튼을 누르지 않고 화면만 읽는다.
// 실행: 운영 사이트나 localhost:5173 탭의 개발자도구 콘솔에 이 파일 내용을 붙여 넣는다.
//       크롬이 붙여넣기를 막으면 콘솔에 allow pasting 을 입력한 뒤 다시 붙여 넣는다.
// 측정 규칙: docs/02-design/features/mobile-overflow.design.md §5
(async () => {
  const PATHS = ['/', '/inbox', '/activity', '/topics', '/materials', '/rules', '/posts']; // frontend/src/App.tsx 라우트와 맞춘다
  const WIDTHS = [390, 430];
  const HEIGHT = 844;
  const WAIT_MS = 3000;
  const LOAD_TIMEOUT_MS = 15000;

  const result = { done: false, selfTest: null, rows: [], details: {} };
  window.__mobileOverflow = result;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function openFrame(path, width) {
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;top:0;left:0;z-index:2147483647;box-sizing:content-box;width:${width}px;height:${HEIGHT}px;border:2px solid red;background:#fff`;
    const loaded = new Promise((resolve) => { frame.onload = () => resolve(true); });
    frame.src = location.origin + path;
    document.body.appendChild(frame);
    const ok = await Promise.race([loaded, sleep(LOAD_TIMEOUT_MS).then(() => false)]);
    if (ok) await sleep(WAIT_MS);
    let doc = null;
    try { doc = frame.contentDocument; } catch { doc = null; }
    return { frame, doc, win: frame.contentWindow, ok };
  }

  // 넘침: 화면 밖으로 나간 요소. 가로 스크롤 영역 안쪽은 의도된 배치라 뺀다.
  // 숨김 잘림: overflow hidden/clip에 가려 안 보이는 내용. 말줄임(truncate·line-clamp)과 1px 요소는 뺀다.
  function findOverflow(doc, win) {
    const viewWidth = doc.documentElement.clientWidth;
    const insideScroller = (el) => {
      for (let a = el.parentElement; a && a !== doc.body; a = a.parentElement) {
        if (win.getComputedStyle(a).overflowX !== 'visible') return true;
      }
      return false;
    };
    const overflow = [];
    const clipped = [];
    for (const el of doc.body.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > viewWidth + 1 || rect.left < -1) && !insideScroller(el)) overflow.push(el);
      if (!(el instanceof win.HTMLElement)) continue;
      const style = win.getComputedStyle(el);
      if ((style.overflowX === 'hidden' || style.overflowX === 'clip') && style.textOverflow !== 'ellipsis'
        && (style.webkitLineClamp || 'none') === 'none'
        && el.clientWidth >= 2 && el.scrollWidth > el.clientWidth + 1) clipped.push(el);
    }
    return { viewWidth, docWidth: doc.documentElement.scrollWidth, overflow, clipped };
  }

  function describe(el) {
    const rect = el.getBoundingClientRect();
    const cls = (el.getAttribute('class') || '').slice(0, 80);
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 25);
    return `${el.tagName.toLowerCase()}.${cls} [${text}] L${Math.round(rect.left)} R${Math.round(rect.right)}`;
  }

  // 일부러 넘침·숨김 잘림을 넣어 둘 다 잡히는지 확인한다. 못 잡으면 측정 결과를 내지 않는다.
  async function selfTest() {
    const { frame, doc, win, ok } = await openFrame('/', 390);
    try {
      if (!ok) return 'load-fail';
      if (!doc || !doc.getElementById('root')) return 'not-app';
      const wide = doc.createElement('div');
      wide.style.cssText = 'width:600px;height:1px';
      const box = doc.createElement('div');
      box.style.cssText = 'overflow:hidden;width:100px';
      box.innerHTML = '<div style="width:300px;height:1px"></div>';
      doc.body.append(wide, box);
      const found = findOverflow(doc, win);
      return found.overflow.includes(wide) && found.clipped.includes(box) ? 'pass' : 'fail';
    } finally {
      frame.remove();
    }
  }

  const SELF_TEST_ERRORS = {
    'load-fail': '첫 화면을 15초 안에 불러오지 못했습니다. 네트워크를 확인하고 다시 실행하세요.',
    'not-app': '19auto-blog 탭(운영 또는 localhost:5173)에서 실행하세요.',
    fail: '자가검사 실패 — 측정 결과를 믿지 마세요.',
  };
  result.selfTest = await selfTest();
  if (result.selfTest !== 'pass') {
    console.error(SELF_TEST_ERRORS[result.selfTest]);
    result.done = true;
    return;
  }
  console.log('자가검사 통과: 일부러 넣은 넘침·숨김 잘림을 모두 잡았습니다.');

  const total = PATHS.length * WIDTHS.length;
  let count = 0;
  for (const path of PATHS) {
    for (const width of WIDTHS) {
      count += 1;
      console.log(`[${count}/${total}] ${path} ${width}px`);
      const { frame, doc, win, ok } = await openFrame(path, width);
      try {
        if (!ok || !doc) {
          result.rows.push({ 경로: path, 너비: width, 화면폭: '-', 문서폭: '-', 넘침: '로딩 실패', 숨김잘림: '-' });
          continue;
        }
        const found = findOverflow(doc, win);
        result.rows.push({ 경로: path, 너비: width, 화면폭: found.viewWidth, 문서폭: found.docWidth, 넘침: found.overflow.length, 숨김잘림: found.clipped.length });
        if (found.overflow.length || found.clipped.length) {
          result.details[`${path}@${width}`] = { overflow: found.overflow.map(describe), clipped: found.clipped.map(describe) };
        }
      } finally {
        frame.remove();
      }
    }
  }

  console.table(result.rows);
  for (const [key, detail] of Object.entries(result.details)) console.log(key, detail);
  const failed = result.rows.filter((row) => row.넘침 !== 0);
  console.log(failed.length === 0
    ? `통과: ${total}개 조합 모두 넘침 0`
    : `넘침 ${failed.length}곳 — 위 상세 확인`);
  result.done = true;
})().catch((error) => {
  window.__mobileOverflow.error = String(error);
  window.__mobileOverflow.done = true;
  console.error('점검 중 오류:', error);
});
