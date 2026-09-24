/**
 * Presentation-only Chat message renderer — plan §16. Parses a raw AI
 * response into a restrained AST of safe node types, which
 * ChatMessageContent.tsx maps to plain React elements (never
 * `dangerouslySetInnerHTML`). This module NEVER mutates the input
 * string — it only classifies structure (paragraph/list/table/code
 * boundaries, inline code/link/label spans) and returns that structure
 * alongside the original text. The raw string itself is always kept
 * and displayed verbatim elsewhere ("Copy raw") — this parser's output
 * is discardable presentation data, never the value stored anywhere.
 *
 * Explicitly NOT reused: supabase/functions/shared/vapi-formatter.ts,
 * which rewrites content (regex substitutions + an optional LLM
 * rewrite) — the opposite of what this module does.
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'label'; value: string }
  | { type: 'bulletSep' };

export type Block =
  | { type: 'paragraph'; lines: InlineNode[][] }
  | { type: 'list'; items: InlineNode[][] }
  | { type: 'table'; rows: InlineNode[][][] }
  | { type: 'code'; text: string };

/** A short leading "Label:" token at the very start of a line — bolded, never altered. */
const LEADING_LABEL_RE = /^([A-Za-z0-9 /_-]{1,40}:)(\s+)([\s\S]*)$/;

function tokenizeInline(line: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = line;

  const labelMatch = rest.match(LEADING_LABEL_RE);
  if (labelMatch) {
    nodes.push({ type: 'label', value: labelMatch[1] });
    rest = labelMatch[2] + labelMatch[3];
  }

  // Combined scan for code spans, URLs, and mid-line bullet separators, left to right.
  const combined = /(`[^`]+`)|(https?:\/\/[^\s]+)|(\s•\s)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = combined.exec(rest)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: rest.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      nodes.push({ type: 'code', value: match[1].slice(1, -1) });
    } else if (match[2]) {
      nodes.push({ type: 'link', value: match[2], href: match[2] });
    } else if (match[3]) {
      nodes.push({ type: 'text', value: ' ' });
      nodes.push({ type: 'bulletSep' });
      nodes.push({ type: 'text', value: ' ' });
    }
    lastIndex = combined.lastIndex;
  }
  if (lastIndex < rest.length) {
    nodes.push({ type: 'text', value: rest.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', value: '' }];
}

function isBulletLine(line: string): boolean {
  return /^\s*[-*•]\s+/.test(line);
}

function isPipeLine(line: string): boolean {
  return line.includes('|') && line.trim().split('|').filter((c) => c.trim().length > 0).length >= 2;
}

export function parseChatMessage(raw: string): Block[] {
  const lines = raw.split(/\r\n|\r|\n/);
  const blocks: Block[] = [];
  let paragraphBuffer: string[] = [];
  let i = 0;

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      blocks.push({ type: 'paragraph', lines: paragraphBuffer.map(tokenizeInline) });
      paragraphBuffer = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      flushParagraph();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      i++; // skip closing fence, if present
      continue;
    }

    if (isBulletLine(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && isBulletLine(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items: items.map(tokenizeInline) });
      continue;
    }

    if (isPipeLine(line)) {
      flushParagraph();
      const rows: string[][] = [];
      while (i < lines.length && isPipeLine(lines[i])) {
        rows.push(
          lines[i]
            .split('|')
            .map((c) => c.trim())
            .filter((c) => c.length > 0),
        );
        i++;
      }
      blocks.push({ type: 'table', rows: rows.map((row) => row.map(tokenizeInline)) });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      i++;
      continue;
    }

    paragraphBuffer.push(line);
    i++;
  }
  flushParagraph();

  return blocks;
}
