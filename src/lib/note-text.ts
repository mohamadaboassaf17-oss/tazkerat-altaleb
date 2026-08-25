/**
 * Pure text helpers for notes (AGENTS.md "Note title is derived" and the
 * wiki-link `[[` syntax). No database access, no side effects.
 */

const NO_TITLE_FALLBACK = 'بدون عنوان';

/** Matches a complete `[[...]]` token; unclosed brackets never match. */
const WIKI_LINK_PATTERN = /\[\[([^\][\n]*)\]\]/g;

/** Matches a piped `[[target|display]]` token and captures the display. */
const WIKI_LINK_WITH_DISPLAY_PATTERN = /\[\[([^\][|\n]*)\|([^\][\n]*)\]\]/g;

/** Collapse whitespace runs to single spaces and trim both ends. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Sanitize one candidate title line: piped wiki-links keep their display
 * text wrapped in spaces, bare wiki-links are dropped entirely, then
 * whitespace is normalized. Returns '' when nothing readable remains.
 */
function sanitizeTitleLine(line: string): string {
  const withDisplayKept = line.replace(
    WIKI_LINK_WITH_DISPLAY_PATTERN,
    (_match: string, _target: string, display: string) => ` ${display} `,
  );
  const markupFree = withDisplayKept.replace(WIKI_LINK_PATTERN, ' ');
  return collapseWhitespace(markupFree);
}

/**
 * Extract the note title from its content: the first non-blank line whose
 * sanitized form is non-empty (wiki-link markup stripped), whitespace
 * normalized and trimmed. Lines that reduce to nothing (blank or pure
 * markup) fall through to the next one. Falls back to 'بدون عنوان' when no
 * line qualifies. Tashkeel is preserved here — stripping happens only at
 * label render time.
 */
export function extractTitle(content: string): string {
  for (const line of content.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    const sanitized = sanitizeTitleLine(line);
    if (sanitized.length > 0) {
      return sanitized;
    }
  }
  return NO_TITLE_FALLBACK;
}

/**
 * Parse all wiki-link tokens of the form `[[target_id|display]]`
 * (`|display` optional). Returns the deduplicated target ids in order of
 * appearance, with whitespace trimmed. Tokens without a usable id are
 * ignored. Self-references cannot be filtered here (no current id known) —
 * that happens during link rebuilding.
 */
export function parseWikiLinks(content: string): string[] {
  const targets: string[] = [];
  for (const match of content.matchAll(WIKI_LINK_PATTERN)) {
    const captured = match[1];
    if (captured === undefined) {
      continue;
    }
    const idPart = captured.split('|')[0]?.trim() ?? '';
    if (idPart.length === 0 || targets.includes(idPart)) {
      continue;
    }
    targets.push(idPart);
  }
  return targets;
}
