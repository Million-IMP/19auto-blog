import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// 사이트는 누구나 들어온다. APP_PASSWORD는 운영자 전용 기능(사용후기 삭제, 이미지 주소 교체)에만 쓴다.
const COOKIE = 'autoblog_session';
const SESSION_MS = 30 * 24 * 60 * 60_000;

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
  // 비밀번호가 없으면 로컬에서만 운영자로 본다. 배포에서 비워두면 아무도 운영자가 아니다.
  if (!password()) return !process.env.VERCEL;
  const [expires, mac] = readCookie(req).split('.');
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return safeEqual(mac, sign(expires));
}

function setSession(res: Response, value: string, maxAgeSec: number) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (isLoggedIn(req)) return next();
  res.status(401).json({ error: '운영자 로그인이 필요합니다.', code: 'AUTH_REQUIRED' });
}

export function authStatus(req: Request, res: Response) {
  res.json({ admin: isLoggedIn(req) });
}

export async function login(req: Request, res: Response) {
  if (!password()) {
    if (!process.env.VERCEL) return res.json({ ok: true });
    return res.status(400).json({ error: '운영자 비밀번호(APP_PASSWORD)가 설정되지 않았습니다.' });
  }
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
