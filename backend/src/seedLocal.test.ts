import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const { toRows } = createRequire(__filename)('../../scripts/seed-local.js');

const post = (fields: Record<string, unknown>) => ({
  title: '제목',
  content: '본문',
  keyword: '키워드',
  parentPostId: null,
  isPipeline: false,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
  ...fields,
});

const source = (posts: unknown[]) => ({ profile: { id: 1, tone: '친근' }, rules: [], materials: [], posts });

describe('toRows (로컬 사본 변환)', () => {
  it('파이프라인 글에는 빈 brief를 넣고 isPipeline은 버린다', () => {
    const [row] = toRows(source([post({ id: 1, isPipeline: true })])).parents;
    expect(JSON.parse(row.brief)).toEqual({ keyword: '키워드', inboxContents: [], materialContents: [], ruleContents: [] });
    expect(row).not.toHaveProperty('isPipeline');
  });

  it('파이프라인이 아닌 글은 brief가 null이다', () => {
    expect(toRows(source([post({ id: 1 })])).parents[0].brief).toBeNull();
  });

  it('부모 글을 먼저, 파생 글을 나중에 넣는다', () => {
    const rows = toRows(source([post({ id: 2, parentPostId: 1 }), post({ id: 1 })]));
    expect(rows.parents.map((p: { id: number }) => p.id)).toEqual([1]);
    expect(rows.children.map((p: { id: number }) => p.id)).toEqual([2]);
  });

  it('부모가 목록에 없으면 parentPostId를 비운다', () => {
    const rows = toRows(source([post({ id: 2, parentPostId: 99 })]));
    expect(rows.parents[0].parentPostId).toBeNull();
    expect(rows.children).toEqual([]);
  });

  it('날짜 문자열을 Date로 바꾼다', () => {
    const [row] = toRows(source([post({ id: 1, osmuAt: '2026-10-18T00:00:00.000Z' })])).parents;
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.osmuAt).toBeInstanceOf(Date);
  });

  it('스키마에 없는 필드는 버린다', () => {
    const rows = toRows({ ...source([post({ id: 1, foo: 'x' })]), rules: [{ id: 1, title: 't', content: 'c', bar: 1 }] });
    expect(rows.parents[0]).not.toHaveProperty('foo');
    expect(rows.rules[0]).not.toHaveProperty('bar');
    expect(rows.profile).toEqual({ id: 1, tone: '친근' });
  });
});
