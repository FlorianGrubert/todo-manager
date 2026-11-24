import { LINK_URL_PATTERN, type TodoLinkDto } from '@fg/shared';

/** Only http(s) and mailto links are ever rendered as clickable (§14). */
export function safeLinks(links: TodoLinkDto[]): TodoLinkDto[] {
  return links.filter((l) => LINK_URL_PATTERN.test(l.url.trim()));
}

/** Text shown for a link: its label, otherwise the host name (or the address of a mailto link). */
export function linkText(link: TodoLinkDto): string {
  if (link.label?.trim()) return link.label.trim();
  const url = link.url.trim();
  if (/^mailto:/i.test(url)) return url.slice(7).split('?')[0] || url;
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Web links open in a new tab without access to the board; mailto links open the mail program. */
export function linkTarget(url: string): Record<string, string> {
  return /^mailto:/i.test(url.trim()) ? {} : { target: '_blank', rel: 'noopener noreferrer' };
}
