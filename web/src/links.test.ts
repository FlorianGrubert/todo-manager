import { describe, expect, it } from 'vitest';
import { linkTarget, linkText, safeLinks } from './links';

describe('to-do links', () => {
  it('shows the label, otherwise the host or mail address', () => {
    expect(linkText({ url: 'https://www.figma.com/file/1', label: 'Entwurf' })).toBe('Entwurf');
    expect(linkText({ url: 'https://github.com/org/repo', label: null })).toBe('github.com');
    expect(linkText({ url: 'mailto:anna@example.com?subject=x', label: '' })).toBe('anna@example.com');
  });

  it('only keeps http(s) and mailto links', () => {
    const links = [
      { url: 'javascript:alert(1)', label: null },
      { url: 'https://example.com', label: null },
      { url: 'mailto:a@example.com', label: null },
    ];
    expect(safeLinks(links).map((l) => l.url)).toEqual(['https://example.com', 'mailto:a@example.com']);
  });

  it('opens web links in a new tab without opener, mailto in the mail program', () => {
    expect(linkTarget('https://example.com')).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
    expect(linkTarget('mailto:a@example.com')).toEqual({});
  });
});
