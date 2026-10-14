import { Block, Span, ListItem, LabeledField } from './rbm.schema';

export const RBM_HEADER = '<!--rbm:1-->';
export const MAX_CELL_CHAR_LIMIT = 50000;
export const CELL_SPLIT_THRESHOLD = 45000;

export function mergeAdjacentSpans(spans: Span[]): Span[] {
  if (!spans || spans.length === 0) return [];

  const merged: Span[] = [];
  for (const span of spans) {
    if (!span.t) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      Boolean(last.b) === Boolean(span.b) &&
      Boolean(last.i) === Boolean(span.i) &&
      Boolean(last.u) === Boolean(span.u) &&
      last.href === span.href
    ) {
      last.t += span.t;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

export function serializeSpan(span: Span): string {
  const text = span.t;
  if (!text) return '';

  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return text;
  const [, leadingWs, core, trailingWs] = match;
  if (!core) return text;

  let formatted = core;
  if (!span.href) {
    formatted = formatted.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    if (span.u) formatted = `<u>${formatted}</u>`;
  }
  if (span.i) formatted = `*${formatted}*`;
  if (span.b) formatted = `**${formatted}**`;
  if (span.href) formatted = `[${formatted}](${span.href})`;

  return leadingWs + formatted + trailingWs;
}

export function serializeSpans(spans: Span[]): string {
  if (!spans || spans.length === 0) return '';
  const merged = mergeAdjacentSpans(spans);
  return merged.map(serializeSpan).join('');
}

function escapeLineStart(line: string): string {
  if (/^(\#{1,6}\s|\-\s|@@|\*\*|\\[#\-@*])/.test(line)) {
    return '\\' + line;
  }
  return line;
}

export function serializeBlock(block: Block, indentLevel = 0): string {
  switch (block.type) {
    case 'paragraph': {
      const serialized = serializeSpans(block.spans);
      const lines = serialized.split('\n');
      return lines.map((l, idx) => (idx === 0 ? escapeLineStart(l) : l)).join('\n');
    }
    case 'labeled': {
      const bodySerialized = serializeSpans(block.body);
      return `**${block.label}:**${bodySerialized ? (bodySerialized.startsWith(' ') ? '' : ' ') + bodySerialized : ''}`;
    }
    case 'list': {
      const parts: string[] = [];
      if (block.label) {
        parts.push(`**${block.label}:**`);
      }
      for (const item of block.items) {
        const itemIndent = '  '.repeat(item.level || 0);
        const itemText = serializeSpans(item.spans);
        parts.push(`${itemIndent}- ${itemText}`);
      }
      return parts.join('\n');
    }
    case 'group': {
      const titleLine = `## ${block.title}`;
      const innerBlocks = block.blocks.map(b => serializeBlock(b, indentLevel)).join('\n\n');
      return innerBlocks ? `${titleLine}\n\n${innerBlocks}` : titleLine;
    }
    case 'record': {
      const lines: string[] = [`@@${block.kind}`];
      for (const field of block.fields) {
        const bodyText = serializeSpans(field.body);
        lines.push(`**${field.label}:**${bodyText ? (bodyText.startsWith(' ') ? '' : ' ') + bodyText : ''}`);
      }
      lines.push('@@end');
      return lines.join('\n');
    }
    default:
      return '';
  }
}

export function serializeRbm(blocks: Block[]): string {
  if (!blocks || blocks.length === 0) {
    return `${RBM_HEADER}\n`;
  }

  const serializedBody = blocks.map(b => serializeBlock(b)).join('\n\n');
  const fullContent = `${RBM_HEADER}\n${serializedBody}`;

  if (fullContent.length > CELL_SPLIT_THRESHOLD) {
    if (fullContent.length > MAX_CELL_CHAR_LIMIT) {
      throw new Error(
        `RBM serialized block exceeds cell character limit (${fullContent.length} > ${MAX_CELL_CHAR_LIMIT}). Splitting required.`
      );
    }
  }

  return fullContent;
}

export function spansToPlainText(spans: Span[]): string {
  if (!spans || spans.length === 0) return '';
  return spans.map(s => s.t).join('');
}

export function blocksToPlainText(blocks: Block[]): string {
  if (!blocks || blocks.length === 0) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph') {
      parts.push(spansToPlainText(b.spans));
    } else if (b.type === 'labeled') {
      parts.push(`${b.label}: ${spansToPlainText(b.body)}`);
    } else if (b.type === 'list') {
      const listLines: string[] = [];
      if (b.label) listLines.push(b.label);
      listLines.push(...b.items.map(it => `• ${spansToPlainText(it.spans)}`));
      parts.push(listLines.join('\n'));
    } else if (b.type === 'group') {
      parts.push(b.title);
      const inner = blocksToPlainText(b.blocks);
      if (inner) parts.push(inner);
    } else if (b.type === 'record') {
      parts.push(b.fields.map(f => `${f.label}: ${spansToPlainText(f.body)}`).join('\n'));
    }
  }
  return parts.filter(Boolean).join('\n\n');
}
