import { describe, expect, it } from 'vitest';
import { rewriteWikiLinksToTitles, collectWikiLinkIds, sanitizeFilename } from './export';

describe('export — rewriteWikiLinksToTitles', () => {
  it('rewrites bare [[id]] to [[title]]', () => {
    const map = new Map([['abc', 'عنوان']]);
    expect(rewriteWikiLinksToTitles('راجع [[abc]]', map)).toBe('راجع [[عنوان]]');
  });

  it('rewrites piped [[id|display]] to [[title]] ignoring display', () => {
    const map = new Map([['abc', 'عنوان جديد']]);
    expect(rewriteWikiLinksToTitles('راجع [[abc|قديم]]', map)).toBe('راجع [[عنوان جديد]]');
  });

  it('leaves unknown ids as [[id]]', () => {
    const map = new Map<string, string>();
    expect(rewriteWikiLinksToTitles('[[unknown]]', map)).toBe('[[unknown]]');
  });

  it('handles multiple links', () => {
    const map = new Map([
      ['a', 'ألف'],
      ['b', 'باء'],
    ]);
    expect(rewriteWikiLinksToTitles('[[a]] و [[b]]', map)).toBe('[[ألف]] و [[باء]]');
  });

  it('preserves content without links', () => {
    expect(rewriteWikiLinksToTitles('نص عادي', new Map())).toBe('نص عادي');
  });
});

describe('export — collectWikiLinkIds', () => {
  it('collects ids deduplicated', () => {
    expect(collectWikiLinkIds('[[a]] و [[b]] و [[a]]')).toEqual(['a', 'b']);
  });

  it('handles piped form', () => {
    expect(collectWikiLinkIds('[[id|display]]')).toEqual(['id']);
  });
});

describe('export — sanitizeFilename', () => {
  it('replaces forbidden chars', () => {
    expect(sanitizeFilename('a/b:c')).toBe('a_b_c');
  });
  it('falls back to export', () => {
    expect(sanitizeFilename('')).toBe('export');
  });
});
