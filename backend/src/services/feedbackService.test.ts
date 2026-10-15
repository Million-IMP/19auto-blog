import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ prisma: {} }));

import { parseFeedback } from './feedbackService';

describe('parseFeedback', () => {
  it('앞뒤 공백을 지우고 별점을 숫자로 바꾼다', () => {
    expect(parseFeedback({ name: ' 지은 ', rating: '4', content: ' 좋아요 ' })).toEqual({
      ok: true,
      data: { name: '지은', rating: 4, content: '좋아요' },
    });
  });

  it('별점이 없으면 5점으로 둔다', () => {
    const result = parseFeedback({ name: '민수', content: '편해요' });
    expect(result.ok && result.data.rating).toBe(5);
  });

  it('이름이나 내용이 비면 거절한다', () => {
    expect(parseFeedback({ name: '', content: '내용' }).ok).toBe(false);
    expect(parseFeedback({ name: '이름', content: '   ' }).ok).toBe(false);
  });

  it('길이와 별점 범위를 넘으면 거절한다', () => {
    expect(parseFeedback({ name: 'a'.repeat(21), content: '내용' }).ok).toBe(false);
    expect(parseFeedback({ name: '이름', content: 'a'.repeat(501) }).ok).toBe(false);
    expect(parseFeedback({ name: '이름', content: '내용', rating: 0 }).ok).toBe(false);
    expect(parseFeedback({ name: '이름', content: '내용', rating: 3.5 }).ok).toBe(false);
  });
});
