import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// 공용 비밀번호 하나로 화면과 API를 막는다. APP_PASSWORD가 없으면(로컬 기본) 잠그지 않는다.
const COOKIE = 'autoblog_session';
const SESSION_MS = 30 * 24 * 60 * 60_000;
// 크론은 CRON_SECRET으로 따로 확인한다.
const PUBLIC_PATHS = ['/api/auth/status', '/api/auth/login', '/api/auth/logout'];

function password() {
  return process.env.APP_PASSWORD || '';
}

function sign(value: string) {
  return crypto.createHmac('sha256', password()).update(value).digest('hex');
}

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readCookie(req: Request) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function isLoggedIn(req: Request) {
  if (!password()) return true;
  const [expires, mac] = readCookie(req).split('.');
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return safeEqual(mac, sign(expires));
}

function setSession(res: Response, value: string, maxAgeSec: number) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.includes(req.path) || req.path.startsWith('/api/cron/')) return next();
  if (!req.path.startsWith('/api/') || isLoggedIn(req)) return next();
  res.status(401).json({ error: '로그인이 필요합니다.', code: 'AUTH_REQUIRED' });
}

export function authStatus(req: Request, res: Response) {
  res.json({ required: Boolean(password()), loggedIn: isLoggedIn(req) });
}

export async function login(req: Request, res: Response) {
  if (!password()) return res.json({ ok: true });
  if (!safeEqual(String(req.body?.password || ''), password())) {
    // 무차별 대입을 늦춘다.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return res.status(401).json({ error: '비밀번호가 맞지 않습니다.' });
  }
  const expires = String(Date.now() + SESSION_MS);
  setSession(res, `${expires}.${sign(expires)}`, SESSION_MS / 1000);
  res.json({ ok: true });
}

export function logout(req: Request, res: Response) {
  setSession(res, '', 0);
  res.json({ ok: true });
}
