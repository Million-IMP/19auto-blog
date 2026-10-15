import { describe, expect, it } from 'vitest';
import { normalizeBenchmarkUrls } from './aiService';

describe('normalizeBenchmarkUrls', () => {
  it('줄바꿈 문자열을 URL 목록으로 나눈다', () => {
    expect(normalizeBenchmarkUrls('https://a.com/1\n  https://b.com/2  \n\n')).toEqual(['https://a.com/1', 'https://b.com/2']);
  });

  it('배열 입력에서 중복과 http(s)가 아닌 값을 뺀다', () => {
    expect(normalizeBenchmarkUrls(['https://a.com', 'https://a.com', 'ftp://x.com', '메모', 'http://b.com'])).toEqual(['https://a.com', 'http://b.com']);
  });

  it('단일 URL 문자열도 받는다', () => {
    expect(normalizeBenchmarkUrls('https://a.com')).toEqual(['https://a.com']);
  });

  it('빈 입력은 빈 목록', () => {
    expect(normalizeBenchmarkUrls(undefined)).toEqual([]);
  });

  it('5개를 넘으면 오류', () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://a.com/${i}`);
    expect(() => normalizeBenchmarkUrls(urls)).toThrow('최대 5개');
  });
});
