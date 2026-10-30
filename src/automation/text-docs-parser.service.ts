import { Block, Span, Disease, Issue, GroupBlock, RecordBlock, LabeledBlock, ListBlock, ParagraphBlock, ListItem } from '../rbm/rbm.schema';
import { parseSpans } from '../rbm/rbm.parser';
import { resolveCategories } from './category-taxonomy';

export interface ParseResult {
  diseaseNumber: string;
  name: string;
  aliases: string[];
  categories: string[];
  sections: {
    overview: Block[];
    causes: Block[];
    typesSymptoms: Block[];
    diagnosis: Block[];
    lifestyle: Block[];
    research: Block[];
    faqs: Block[];
    myths: Block[];
    specialists: Block[];
    sources: Block[];
  };
  validation: Issue[];
  coverage: {
    totalChars: number;
    capturedChars: number;
    ratio: number;
  };
}

interface RawLine {
  text: string;
  spans: Span[];
  namedStyle?: string;
  isBold?: boolean;
  isBullet?: boolean;
  bulletLevel?: number;
  isHeading?: boolean;
}

export function cleanTextRunNoise(text: string): string {
  if (!text) return '';
  return text
    .replace(/\u000b/g, '\n') // vertical tab / soft break
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width spaces
    .replace(/[ \t]+/g, ' '); // collapse duplicate spaces
}

/**
 * Repairs URLs with stray spaces, adds https:// if missing.
 */
export function repairUrl(url: string): string {
  if (!url) return '';
  let cleaned = url.trim().replace(/\s+/g, '');
  if (cleaned.startsWith('www.')) {
    cleaned = 'https://' + cleaned;
  }
  return cleaned;
}

/**
 * Normalizes researcher-typed markdown links like [Title](https://...) into structured link spans.
 */
export function normalizeTypedMarkdownLinks(spans: Span[], issues: Issue[]): Span[] {
  const fullText = spans.map(s => s.t).join('');
  const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[\s\S]*?\/(?:fulltext|\S+?))\)/g;
  if (!mdLinkRegex.test(fullText)) {
    return spans;
  }

  mdLinkRegex.lastIndex = 0;
  const matches: { start: number; end: number; title: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = mdLinkRegex.exec(fullText)) !== null) {
    const rawUrl = m[2];
    const fixedUrl = repairUrl(rawUrl);
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      title: m[1].trim(),
      url: fixedUrl,
    });
    issues.push({
      severity: 'info',
      message: `Normalized researcher typed markdown link: [${m[1].trim()}](${fixedUrl})`,
    });
  }

  if (matches.length === 0) return spans;

  const result: Span[] = [];
  let currentPos = 0;

  for (const match of matches) {
    if (match.start > currentPos) {
      result.push({ t: fullText.substring(currentPos, match.start) });
    }
    result.push({ t: match.title, href: match.url });
    currentPos = match.end;
  }

  if (currentPos < fullText.length) {
    result.push({ t: fullText.substring(currentPos) });
  }

  return result;
}

/**
 * Auto-links plain text URLs inside text runs.
 */
export function autoLinkSpans(spans: Span[], issues: Issue[]): Span[] {
  const normalizedSpans = normalizeTypedMarkdownLinks(spans, issues);
  const result: Span[] = [];
  const urlRegex = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/g;

  for (const span of normalizedSpans) {
    if (span.href) {
      result.push({ ...span, href: repairUrl(span.href) });
      continue;
    }

    const text = span.t;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      const start = match.index;
      if (start > lastIndex) {
        result.push({ ...span, t: text.substring(lastIndex, start) });
      }

      const rawUrl = match[0];
      const fixedUrl = repairUrl(rawUrl);
      issues.push({
        severity: 'info',
        message: `Auto-linked plain-text URL: ${rawUrl} -> ${fixedUrl}`,
      });

      const urlSpan: Span = { t: rawUrl, href: fixedUrl };
      if (span.b) urlSpan.b = true;
      if (span.i) urlSpan.i = true;
      result.push(urlSpan);

      lastIndex = start + rawUrl.length;
    }

    if (lastIndex < text.length) {
      result.push({ ...span, t: text.substring(lastIndex) });
    }
  }

  return result;
}

/**
 * Converts Google Docs API JSON into structured lines and spans,
 * stripping reviewer red text and detecting styles.
 */
export function extractDocLines(document: any, issues: Issue[]): RawLine[] {
  const lines: RawLine[] = [];
  const bodyContent = document?.body?.content || [];

  for (const element of bodyContent) {
    if (element.paragraph) {
      const para = element.paragraph;
      const namedStyle = para.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';
      const isBullet = Boolean(para.bullet);
      const bulletLevel = para.bullet?.nestingLevel || 0;
      const isHeading = namedStyle.startsWith('HEADING_') || namedStyle === 'TITLE' || namedStyle === 'SUBTITLE';

      let paraSpans: Span[] = [];
      let fullParaText = '';

      const elements = para.elements || [];
      for (const el of elements) {
        if (!el.textRun) continue;
        const textRun = el.textRun;
        const rawContent = textRun.content || '';
        const style = textRun.textStyle || {};

        // Red text check
        const fg = style.foregroundColor?.color?.rgbColor;
        const isRed =
          fg &&
          fg.red !== undefined &&
          fg.red > 0.6 &&
          (fg.green === undefined || fg.green < 0.4) &&
          (fg.blue === undefined || fg.blue < 0.4);

        if (isRed) {
          issues.push({
            severity: 'info',
            message: `Stripped reviewer comment in red: "${rawContent.trim()}"`,
          });
          continue; // NEVER publish red text!
        }

        const cleaned = cleanTextRunNoise(rawContent);
        if (!cleaned) continue;

        const span: Span = { t: cleaned };
        if (style.bold) span.b = true;
        if (style.italic) span.i = true;
        if (style.underline && !style.link?.url) span.u = true;
        if (style.link?.url) span.href = repairUrl(style.link.url);

        const lastSpan = paraSpans[paraSpans.length - 1];
        if (
          lastSpan &&
          Boolean(lastSpan.b) === Boolean(span.b) &&
          Boolean(lastSpan.i) === Boolean(span.i) &&
          Boolean(lastSpan.u) === Boolean(span.u) &&
          lastSpan.href === span.href
        ) {
          lastSpan.t += cleaned;
        } else {
          paraSpans.push(span);
        }
        fullParaText += cleaned;
      }

      // Check if entire paragraph is bold
      const isBold =
        paraSpans.length > 0 &&
        paraSpans.every(s => !s.t.trim() || s.b);

      // Split paragraph by newline if it contains multiple lines
      const splitLineSpans: Span[][] = [[]];
      for (const sp of paraSpans) {
        const parts = sp.t.split('\n');
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
          if (pIdx > 0) {
            splitLineSpans.push([]);
          }
          if (parts[pIdx].length > 0) {
            splitLineSpans[splitLineSpans.length - 1].push({ ...sp, t: parts[pIdx] });
          }
        }
      }

      for (const rawLineSpans of splitLineSpans) {
        const lineSpans = [...rawLineSpans];
        while (lineSpans.length > 0 && !lineSpans[0].t.trim()) {
          lineSpans.shift();
        }
        if (lineSpans.length > 0 && lineSpans[0].t.startsWith(' ')) {
          lineSpans[0] = { ...lineSpans[0], t: lineSpans[0].t.trimStart() };
        }
        while (lineSpans.length > 0 && !lineSpans[lineSpans.length - 1].t.trim()) {
          lineSpans.pop();
        }
        if (lineSpans.length > 0 && lineSpans[lineSpans.length - 1].t.endsWith(' ')) {
          const last = lineSpans[lineSpans.length - 1];
          lineSpans[lineSpans.length - 1] = { ...last, t: last.t.trimEnd() };
        }

        const lineText = lineSpans.map(s => s.t).join('');
        if (lineText.trim()) {
          lines.push({
            text: lineText,
            spans: autoLinkSpans(lineSpans.length ? lineSpans : [{ t: lineText }], issues),
            namedStyle,
            isBold,
            isBullet,
            bulletLevel,
            isHeading,
          });
        }
      }
    } else if (element.table) {
      // Process tables
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellContent of cell.content || []) {
            if (cellContent.paragraph) {
              const text = (cellContent.paragraph.elements || [])
                .map((e: any) => e.textRun?.content || '')
                .join('')
                .trim();
              if (text) {
                lines.push({
                  text,
                  spans: [{ t: text }],
                  namedStyle: 'NORMAL_TEXT',
                });
              }
            }
          }
        }
      }
    }
  }

  return lines;
}

export type SectionKey =
  | 'overview'
  | 'causes'
  | 'typesSymptoms'
  | 'diagnosis'
  | 'lifestyle'
  | 'research'
  | 'faqs'
  | 'myths'
  | 'specialists'
  | 'sources';

export function matchSectionHeader(text: string, currentSection?: SectionKey | null): SectionKey | null {
  // If we are already in 'sources', numbered source items are NOT section headers
  if (currentSection === 'sources') {
    return null;
  }

  const norm = text
    .toLowerCase()
    .replace(/^[•·▪▸►→\-–—*#\s]+/, '')
    .trim();

  // 1. Numbered headers: require known section title after number!
  const numMatch = norm.match(/^([1-9])\.\s*(.*)$/);
  if (numMatch) {
    const num = numMatch[1];
    const rest = numMatch[2].trim();

    if (num === '1' && /overview|simple explanation/i.test(rest)) return 'overview';
    if (num === '2' && /cause/i.test(rest)) return 'causes';
    if (num === '3' && /types?|symptoms?|signs?/i.test(rest)) return 'typesSymptoms';
    if (num === '4' && /diagnos/i.test(rest)) return 'diagnosis';
    if (num === '5' && /lifestyle|daily\s*sup+ort/i.test(rest)) return 'lifestyle';
    if (num === '6' && /research|pharma|treatment/i.test(rest)) return 'research';
    if (num === '7' && /faq|frequently\s*asked/i.test(rest)) return 'faqs';
    if (num === '8' && /facts?|myths?/i.test(rest)) return 'myths';
    if (num === '9' && /specialist|doctor|physician|expert/i.test(rest)) return 'specialists';
    return null;
  }

  // 2. Unnumbered headers (can have trailing colon like 'Overview:' or 'Diagnosis:')
  const strippedNorm = norm.replace(/[:.]+$/, '').trim();
  if (!strippedNorm.includes(':')) {
    if (/^(?:overview|disease overview)$/i.test(strippedNorm)) return 'overview';
    if (/^(?:causes|disease causes)$/i.test(strippedNorm)) return 'causes';
    if (/^(?:types\s*(?:and|&)\s*symptoms|signs\s*(?:and|&)\s*symptoms|types\s+and\s+patterns|symptoms)$/i.test(strippedNorm)) return 'typesSymptoms';
    if (/^(?:diagnostic\s+procedures(?:\s*(?:and|&)\s*testing)?|diagnosis(?:\s*(?:and|&)\s*testing)?)$/i.test(strippedNorm)) return 'diagnosis';
    if (/^(?:lifestyle\s*(?:and|&)\s*daily\s*sup+ort(?:\s*(?:and|&|\+)\s*community)?|lifestyle)$/i.test(strippedNorm)) return 'lifestyle';
    if (/^(?:research\s*(?:and|&)\s*pharma(?:\s*directory)?|treatments\s*(?:and|&)\s*(?:clinical\s+)?trials?|treatments\s*(?:and|&)\s*pharma|research\s+directory)$/i.test(strippedNorm)) return 'research';
    if (/^(?:frequently\s+asked\s+questions(?:\s*\(faqs\))?|faqs?|fqas?)$/i.test(strippedNorm)) return 'faqs';
    if (/^(?:facts\s*(?:vs\.?|and|&)\s*myths|myths?\s*(?:vs\.?|and|&)\s*facts?)$/i.test(strippedNorm)) return 'myths';
    if (/^(?:specialists?\s+directory|specialists?|expert\s+directory)$/i.test(strippedNorm)) return 'specialists';
    if (/^(?:sources\s+used|references|research\s+sources|sources)$/i.test(strippedNorm)) return 'sources';
  }

  return null;
}

/**
 * Strips leading typed bullets [•·▪-–—*] and returns clean text and spans.
 */
export function stripLeadingBullet(line: RawLine): { text: string; spans: Span[]; wasBullet: boolean } {
  const match = line.text.match(/^([•·▪▸►→\-–—*]\s*)(.*)$/);
  if (match) {
    const newText = match[2];
    const newSpans: Span[] = [];
    let strippedBullet = false;

    for (const sp of line.spans) {
      if (!strippedBullet) {
        const cleanT = sp.t.replace(/^[•·▪▸►→\-–—*]\s*/, '');
        if (cleanT !== sp.t) {
          strippedBullet = true;
          if (cleanT.length > 0) {
            newSpans.push({ ...sp, t: cleanT });
          }
          continue;
        } else if (/^\s+$/.test(sp.t)) {
          // Skip whitespace span before or around bullet
          continue;
        } else {
          newSpans.push(sp);
        }
      } else {
        newSpans.push(sp);
      }
    }

    while (newSpans.length > 0 && !newSpans[0].t.trim()) {
      newSpans.shift();
    }
    if (newSpans.length > 0 && newSpans[0].t.startsWith(' ')) {
      newSpans[0] = { ...newSpans[0], t: newSpans[0].t.trimStart() };
    }

    return {
      text: newText.trimStart(),
      spans: newSpans.length ? newSpans : [{ t: newText.trimStart() }],
      wasBullet: true,
    };
  }
  return { text: line.text, spans: line.spans, wasBullet: line.isBullet || false };
}

/**
 * Extracts a labeled block from a line, e.g. "Label: body".
 */
export function extractLabeled(lineText: string, spans: Span[]): { label: string; body: Span[] } | null {
  const colonIndex = lineText.indexOf(':');
  if (colonIndex <= 0 || colonIndex > 60) return null;

  const label = lineText.substring(0, colonIndex).trim();
  if (!/^[A-Za-z0-9\s\/\-_()]{1,60}$/.test(label)) return null;

  const bodySpans: Span[] = [];
  let foundColon = false;

  for (const sp of spans) {
    if (!foundColon) {
      const idx = sp.t.indexOf(':');
      if (idx !== -1) {
        foundColon = true;
        const afterColon = sp.t.substring(idx + 1);
        if (afterColon.length > 0) {
          bodySpans.push({ ...sp, t: afterColon });
        }
      }
    } else {
      bodySpans.push(sp);
    }
  }

  // Trim leading whitespace from first body span to guarantee lossless formatting
  while (bodySpans.length > 0 && (!bodySpans[0].t || !bodySpans[0].t.trim())) {
    bodySpans.shift();
  }
  if (bodySpans.length > 0 && bodySpans[0].t.startsWith(' ')) {
    bodySpans[0] = { ...bodySpans[0], t: bodySpans[0].t.trimStart() };
  }

  return { label, body: bodySpans };
}

// ─────────────────────────────────────────────────────────────────────────────
// DIALECT PARSERS
// ─────────────────────────────────────────────────────────────────────────────

export function parseSpecialistsSection(lines: RawLine[]): Block[] {
  const blocks: Block[] = [];
  let currentFields: { label: string; body: Span[] }[] = [];

  function flushSpecialist() {
    if (currentFields.length > 0) {
      blocks.push({
        type: 'record',
        kind: 'specialist',
        fields: currentFields,
      });
      currentFields = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { text, spans } = stripLeadingBullet(line);

    // Trailing notes
    if (/^(?:A Few Notes for Families|How to connect|Notes?)\s*[:\-–—]?/i.test(text)) {
      flushSpecialist();
      blocks.push({
        type: 'paragraph',
        spans,
      });
      continue;
    }

    const labeled = extractLabeled(text, spans);

    if (labeled && /^(?:specialist\s+name|doctor|physician|name)$/i.test(labeled.label)) {
      flushSpecialist();
      currentFields.push({ label: 'Specialist Name', body: labeled.body });
      continue;
    }

    const numMatch = text.match(/^\d+[.)]\s*(?:Specialist\s+Name:\s*)?(.*)$/i);
    if (numMatch && (line.isHeading || line.isBold || (i + 1 < lines.length && /profession/i.test(lines[i + 1].text)))) {
      flushSpecialist();
      const nameText = numMatch[1].trim();
      currentFields.push({ label: 'Specialist Name', body: [{ t: nameText, b: true }] });
      continue;
    }

    if (/^(?:Dr\.|Prof\.)\s+/i.test(text) && (line.isHeading || line.isBold || (i + 1 < lines.length && /profession/i.test(lines[i + 1].text)))) {
      flushSpecialist();
      currentFields.push({ label: 'Specialist Name', body: spans });
      continue;
    }

    if (labeled) {
      const normLabel = labeled.label.toLowerCase();
      let canonicalLabel = labeled.label;
      if (normLabel.includes('profession')) canonicalLabel = 'Profession';
      else if (normLabel.includes('specializ')) canonicalLabel = 'Specialization';
      else if (normLabel.includes('organiza')) canonicalLabel = 'Organization';
      else if (normLabel.includes('location')) canonicalLabel = 'Location';
      else if (normLabel.includes('contact')) canonicalLabel = 'Contact Information';
      else if (normLabel.includes('publication')) canonicalLabel = 'Recent Publications';

      currentFields.push({ label: canonicalLabel, body: labeled.body });
    } else {
      if (currentFields.length > 0) {
        const last = currentFields[currentFields.length - 1];
        if (spans.length > 0) {
          const appendedText = spans.map(s => s.t).join('');
          if (last.body.length > 0 && last.body[last.body.length - 1].t && !last.body[last.body.length - 1].href) {
            last.body[last.body.length - 1].t += '; ' + appendedText;
          } else {
            last.body.push({ t: appendedText });
          }
        }
      } else {
        blocks.push({ type: 'paragraph', spans });
      }
    }
  }

  flushSpecialist();
  return blocks;
}

export function parseResearchSection(lines: RawLine[]): Block[] {
  const blocks: Block[] = [];
  let currentGroupTitle = '';
  let currentGroupBlocks: Block[] = [];
  let currentOrgFields: { label: string; body: Span[] }[] = [];

  function flushOrg() {
    if (currentOrgFields.length > 0) {
      currentGroupBlocks.push({
        type: 'record',
        kind: 'org',
        fields: currentOrgFields,
      });
      currentOrgFields = [];
    }
  }

  function flushGroup() {
    flushOrg();
    if (currentGroupBlocks.length > 0) {
      if (currentGroupTitle) {
        blocks.push({
          type: 'group',
          title: currentGroupTitle,
          blocks: currentGroupBlocks,
        });
      } else {
        blocks.push(...currentGroupBlocks);
      }
      currentGroupBlocks = [];
      currentGroupTitle = '';
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { text, spans, wasBullet } = stripLeadingBullet(line);

    // Notes such as "Note: clinical trials change constantly" stay as paragraphs
    if (/^(?:Note|Go to clinicaltrials\.gov)\b/i.test(text)) {
      flushOrg();
      currentGroupBlocks.push({
        type: 'paragraph',
        spans,
      });
      continue;
    }

    if (line.isHeading || (/^(?:treatments?|clinical\s+trials?|organizations?|active\s+research)\b/i.test(text) && !text.includes(':'))) {
      flushGroup();
      currentGroupTitle = text;
      continue;
    }

    const labeled = extractLabeled(text, spans);

    if (labeled && /^(?:pharma[\/\s]research\s+org(?:\s+name)?|research\s+organization(?:\s+name)?|organization\s+name)$/i.test(labeled.label)) {
      flushOrg();
      currentOrgFields.push({ label: 'Pharma/Research Org Name', body: labeled.body });
      continue;
    }

    if (
      (line.isBold || wasBullet || /^\d+[.)]/.test(text)) &&
      i + 1 < lines.length &&
      /focus|website/i.test(lines[i + 1].text)
    ) {
      flushOrg();
      const cleanOrgName = text.replace(/^\d+[.)]\s*/, '').trim();
      currentOrgFields.push({ label: 'Pharma/Research Org Name', body: [{ t: cleanOrgName, b: true }] });
      continue;
    }

    if (labeled && currentOrgFields.length > 0) {
      const normL = labeled.label.toLowerCase();
      let canonicalLabel = labeled.label;
      if (normL.includes('focus')) canonicalLabel = 'Focus Area';
      else if (normL.includes('website')) canonicalLabel = 'Official Website';
      else if (normL.includes('why follow')) canonicalLabel = 'Why Follow Them';

      currentOrgFields.push({ label: canonicalLabel, body: labeled.body });
      continue;
    }

    if (labeled) {
      currentGroupBlocks.push({
        type: 'labeled',
        label: labeled.label,
        body: labeled.body,
      });
      continue;
    }

    if (wasBullet) {
      currentGroupBlocks.push({
        type: 'list',
        items: [{ spans, level: line.bulletLevel || 0 }],
      });
    } else {
      currentGroupBlocks.push({
        type: 'paragraph',
        spans,
      });
    }
  }

  flushGroup();
  return blocks;
}

export function parseDiagnosisSection(lines: RawLine[], issues: Issue[]): Block[] {
  const blocks: Block[] = [];
  let currentGroupTitle = '';
  let currentGroupBlocks: Block[] = [];

  function flushGroup() {
    if (currentGroupBlocks.length > 0) {
      if (currentGroupTitle) {
        blocks.push({
          type: 'group',
          title: currentGroupTitle,
          blocks: currentGroupBlocks,
        });
      } else {
        blocks.push(...currentGroupBlocks);
      }
      currentGroupBlocks = [];
      currentGroupTitle = '';
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { text, spans, wasBullet } = stripLeadingBullet(line);

    // Specialists Involved
    const labeled = extractLabeled(text, spans);
    if (labeled && /specialists?\s+involved/i.test(labeled.label)) {
      flushGroup();
      blocks.push({
        type: 'group',
        title: 'Specialists Involved',
        blocks: [
          {
            type: 'labeled',
            label: labeled.label,
            body: labeled.body,
          },
        ],
      });
      continue;
    }

    // Pattern A: Method title AND What it is on the SAME line: e.g. "Excisional Lymph Node Biopsy What it is: A procedure..."
    const inlineMatch = text.match(/^(.*?)\s+(What it is:\s*.*)$/i);
    if (inlineMatch && !text.startsWith('What it is:')) {
      flushGroup();
      currentGroupTitle = inlineMatch[1].replace(/[:\-–—\s]+$/, '').trim();
      const whatItIsLab = extractLabeled(inlineMatch[2], [{ t: inlineMatch[2] }]);
      if (whatItIsLab) {
        currentGroupBlocks.push({
          type: 'labeled',
          label: 'What it is',
          body: whatItIsLab.body,
        });
      }
      continue;
    }

    // Pattern B: Standalone method title line followed by What it is on next line
    if (
      line.isHeading ||
      line.isBold ||
      (!wasBullet && !labeled && i + 1 < lines.length && /what it is/i.test(lines[i + 1].text))
    ) {
      flushGroup();
      currentGroupTitle = text;
      continue;
    }

    if (labeled) {
      const normL = labeled.label.toLowerCase();
      let canonicalLabel = labeled.label;
      if (normL.includes('what it is')) canonicalLabel = 'What it is';
      else if (normL.includes('how it works')) canonicalLabel = 'How it works';
      else if (normL.includes('the result') || normL.includes('result')) canonicalLabel = 'The result';

      // Look ahead for bullet list
      const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
      const nextIsBullet = nextLine ? stripLeadingBullet(nextLine).wasBullet : false;

      if (nextIsBullet && (!labeled.body || labeled.body.every(s => !s.t.trim()))) {
        const items: ListItem[] = [];
        i++;
        while (i < lines.length) {
          const bInfo = stripLeadingBullet(lines[i]);
          if (bInfo.wasBullet) {
            items.push({ spans: bInfo.spans, level: lines[i].bulletLevel || 0 });
            i++;
          } else {
            i--;
            break;
          }
        }
        currentGroupBlocks.push({
          type: 'list',
          label: canonicalLabel,
          items,
        });
      } else {
        currentGroupBlocks.push({
          type: 'labeled',
          label: canonicalLabel,
          body: labeled.body,
        });
      }
      continue;
    }

    if (wasBullet) {
      currentGroupBlocks.push({
        type: 'list',
        items: [{ spans, level: line.bulletLevel || 0 }],
      });
    } else {
      currentGroupBlocks.push({
        type: 'paragraph',
        spans,
      });
    }
  }

  flushGroup();

  if (blocks.length > 0 && !blocks.some(b => b.type === 'group' || b.type === 'labeled')) {
    issues.push({
      severity: 'warn',
      message: 'Diagnosis section contains only prose paragraphs without standard What/How/Result structure.',
    });
  }

  return blocks;
}

function parseFaqsSection(lines: RawLine[]): Block[] {
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { text, spans } = stripLeadingBullet(line);

    // Pattern 1: Q: question \n A: answer
    const qMatch = text.match(/^(?:Q\d*[:\-–—]|\*\*Q\d*[:\-–—]\*\*)\s*(.*)$/i);
    if (qMatch) {
      const question = qMatch[1].trim();
      let answerSpans: Span[] = [];
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const aMatch = nextLine.text.match(/^(?:A\d*[:\-–—]|\*\*A\d*[:\-–—]\*\*)\s*(.*)$/i);
        if (aMatch) {
          const aText = aMatch[1].trim();
          answerSpans = [{ t: aText }];
          i++;
        }
      }
      blocks.push({
        type: 'labeled',
        label: question,
        body: answerSpans,
      });
      continue;
    }

    // Pattern 2: Bold question ending with ? followed by answer paragraph
    if ((line.isBold || text.endsWith('?')) && i + 1 < lines.length) {
      const question = text.replace(/^\d+[.)]\s*/, '').trim();
      const nextLine = lines[i + 1];
      blocks.push({
        type: 'labeled',
        label: question,
        body: nextLine.spans,
      });
      i++;
      continue;
    }

    // Fallback: labeled or paragraph
    const labeled = extractLabeled(text, spans);
    if (labeled) {
      blocks.push({ type: 'labeled', label: labeled.label, body: labeled.body });
    } else {
      blocks.push({ type: 'paragraph', spans });
    }
  }

  return blocks;
}

function parseMythsSection(lines: RawLine[]): Block[] {
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { text, spans } = stripLeadingBullet(line);

    // Myth: ... \n Fact: ...
    const mythMatch = text.match(/^Myth(?:\s*\d+)?:\s*(.*)$/i);
    if (mythMatch) {
      const myth = mythMatch[1].trim();
      let factSpans: Span[] = [];
      if (i + 1 < lines.length && /^Fact(?:\s*\d+)?:/i.test(lines[i + 1].text)) {
        const factLine = lines[i + 1];
        factSpans = extractLabeled(factLine.text, factLine.spans)?.body || factLine.spans;
        i++;
      }
      blocks.push({
        type: 'group',
        title: `Myth: ${myth}`,
        blocks: [
          { type: 'labeled', label: 'Fact', body: factSpans },
        ],
      });
      continue;
    }

    const labeled = extractLabeled(text, spans);
    if (labeled) {
      blocks.push({ type: 'labeled', label: labeled.label, body: labeled.body });
    } else {
      blocks.push({ type: 'paragraph', spans });
    }
  }

  return blocks;
}

function parseLifestyleSection(lines: RawLine[]): Block[] {
  const blocks: Block[] = [];
  let currentGroupTitle = '';
  let currentGroupBlocks: Block[] = [];

  function flushGroup() {
    if (currentGroupBlocks.length > 0) {
      if (currentGroupTitle) {
        blocks.push({
          type: 'group',
          title: currentGroupTitle,
          blocks: currentGroupBlocks,
        });
      } else {
        blocks.push(...currentGroupBlocks);
      }
      currentGroupBlocks = [];
      currentGroupTitle = '';
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { text, spans, wasBullet } = stripLeadingBullet(line);

    // Sub-headings: Therapies, Diets/Nutrition, Assistive Devices, Daily Care Tips, Community Links
    if (
      line.isHeading ||
      (/^(?:therapies|diets?(?:\s*(?:and|&|\/)\s*nutrition)?|assistive\s+devices|daily\s+care\s+tips|community\s+links)\b/i.test(text) && !text.includes(':'))
    ) {
      flushGroup();
      currentGroupTitle = text;
      continue;
    }

    const labeled = extractLabeled(text, spans);
    if (labeled) {
      // Check if followed by bullets
      const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
      const nextIsBullet = nextLine ? stripLeadingBullet(nextLine).wasBullet : false;

      if (nextIsBullet && (!labeled.body || labeled.body.every(s => !s.t.trim()))) {
        const items: ListItem[] = [];
        i++;
        while (i < lines.length) {
          const bInfo = stripLeadingBullet(lines[i]);
          if (bInfo.wasBullet) {
            items.push({ spans: bInfo.spans, level: lines[i].bulletLevel || 0 });
            i++;
          } else {
            i--;
            break;
          }
        }
        currentGroupBlocks.push({
          type: 'list',
          label: labeled.label,
          items,
        });
      } else {
        currentGroupBlocks.push({
          type: 'labeled',
          label: labeled.label,
          body: labeled.body,
        });
      }
      continue;
    }

    if (wasBullet) {
      currentGroupBlocks.push({
        type: 'list',
        items: [{ spans, level: line.bulletLevel || 0 }],
      });
    } else {
      currentGroupBlocks.push({
        type: 'paragraph',
        spans,
      });
    }
  }

  flushGroup();
  return blocks;
}

function parseGeneralLabeledSection(lines: RawLine[]): Block[] {
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { text, spans, wasBullet } = stripLeadingBullet(line);

    const labeled = extractLabeled(text, spans);
    if (labeled) {
      // Look ahead for bullet list
      const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
      const nextIsBullet = nextLine ? stripLeadingBullet(nextLine).wasBullet : false;

      if (nextIsBullet && (!labeled.body || labeled.body.every(s => !s.t.trim()))) {
        const items: ListItem[] = [];
        i++;
        while (i < lines.length) {
          const bInfo = stripLeadingBullet(lines[i]);
          if (bInfo.wasBullet) {
            items.push({ spans: bInfo.spans, level: lines[i].bulletLevel || 0 });
            i++;
          } else {
            i--;
            break;
          }
        }
        blocks.push({
          type: 'list',
          label: labeled.label,
          items,
        });
      } else {
        blocks.push({
          type: 'labeled',
          label: labeled.label,
          body: labeled.body,
        });
      }
      continue;
    }

    if (wasBullet) {
      blocks.push({
        type: 'list',
        items: [{ spans, level: line.bulletLevel || 0 }],
      });
    } else {
      blocks.push({
        type: 'paragraph',
        spans,
      });
    }
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MAIN DOCUMENT PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parseRawLines(rawLines: RawLine[], issues: Issue[], defaultTitle?: string): ParseResult {
  let diseaseName = '';
  const aliases: string[] = [];
  let rawCategory = '';

  const sectionLines: Record<SectionKey, RawLine[]> = {
    overview: [],
    causes: [],
    typesSymptoms: [],
    diagnosis: [],
    lifestyle: [],
    research: [],
    faqs: [],
    myths: [],
    specialists: [],
    sources: [],
  };

  let currentSection: SectionKey | null = null;
  let totalDocChars = 0;

  for (const line of rawLines) {
    totalDocChars += line.text.length;

    // Check if line starts a section
    const matchedSec = matchSectionHeader(line.text, currentSection);
    if (matchedSec) {
      currentSection = matchedSec;
      continue; // header line consumed
    }

    if (currentSection) {
      sectionLines[currentSection].push(line);
      continue;
    }

    // Preamble metadata before section 1
    const text = line.text;
    const nameMatch = text.match(/^Disease\s+Name:\s*(.*)$/i);
    if (nameMatch) {
      diseaseName = nameMatch[1].trim();
      // Check for alias: "(also called ...)" or "(also known as ...)"
      const aliasMatch = diseaseName.match(/^(.*?)\s*\((?:also\s+(?:called|known\s+as))\s*(.*?)\)$/i);
      if (aliasMatch) {
        diseaseName = aliasMatch[1].trim();
        aliases.push(aliasMatch[2].trim());
      }
      continue;
    }

    const catMatch = text.match(/^Category:\s*(.*)$/i);
    if (catMatch) {
      rawCategory = catMatch[1].trim();
      continue;
    }

    if (!diseaseName && (line.namedStyle === 'TITLE' || line.namedStyle === 'HEADING_1')) {
      diseaseName = text.trim();
      continue;
    }
  }

  // Fallback disease name from document title
  if (!diseaseName && defaultTitle) {
    diseaseName = defaultTitle.replace(/^Disease\s+Name:\s*/i, '').trim();
  }

  // Resolve category taxonomy
  const catResolution = resolveCategories(diseaseName, rawCategory);
  const categories = catResolution.categories;
  for (const w of catResolution.warnings) {
    issues.push({ severity: 'warn', message: w });
  }

  // Parse each section using dedicated dialects
  const sections = {
    overview: parseGeneralLabeledSection(sectionLines.overview),
    causes: parseGeneralLabeledSection(sectionLines.causes),
    typesSymptoms: parseGeneralLabeledSection(sectionLines.typesSymptoms),
    diagnosis: parseDiagnosisSection(sectionLines.diagnosis, issues),
    lifestyle: parseLifestyleSection(sectionLines.lifestyle),
    research: parseResearchSection(sectionLines.research),
    faqs: parseFaqsSection(sectionLines.faqs),
    myths: parseMythsSection(sectionLines.myths),
    specialists: parseSpecialistsSection(sectionLines.specialists),
    sources: parseGeneralLabeledSection(sectionLines.sources),
  };

  // ─────────────────────────────────────────────────────────────────────────
  // COVERAGE AND VALIDATION CHECKS
  // ─────────────────────────────────────────────────────────────────────────
  let capturedChars = 0;
  for (const secKey of Object.keys(sections) as SectionKey[]) {
    for (const b of sections[secKey]) {
      capturedChars += JSON.stringify(b).length; // approximate weight
    }
  }

  const coverageRatio = totalDocChars > 0 ? Math.min(1.0, capturedChars / totalDocChars) : 1.0;

  // Check required sections: Overview, Causes, Types & Symptoms, Diagnosis
  if (sections.overview.length === 0) {
    issues.push({
      severity: 'error',
      section: 'overview',
      message: 'Required section "Overview" is empty or missing.',
    });
  }

  if (sections.causes.length === 0) {
    issues.push({
      severity: 'error',
      section: 'causes',
      message: 'Required section "Causes" is empty or missing.',
    });
  }

  if (sections.typesSymptoms.length === 0) {
    issues.push({
      severity: 'error',
      section: 'typesSymptoms',
      message: 'Required section "Types & Symptoms" is empty or missing.',
    });
  }

  if (sections.diagnosis.length === 0) {
    issues.push({
      severity: 'error',
      section: 'diagnosis',
      message: 'Required section "Diagnosis" is empty or missing.',
    });
  }

  // Check size anomaly: Batten / ALS failure mode
  const typesLen = JSON.stringify(sections.typesSymptoms).length;
  const diagLen = JSON.stringify(sections.diagnosis).length;
  if (typesLen > 4000 && diagLen === 0) {
    issues.push({
      severity: 'error',
      section: 'diagnosis',
      message: 'Types & Symptoms swallowed Diagnosis section (size anomaly detected).',
    });
  }

  return {
    diseaseNumber: '', // assigned by caller from sheet / createStableDiseaseNumber
    name: diseaseName,
    aliases,
    categories,
    sections,
    validation: issues,
    coverage: {
      totalChars: totalDocChars,
      capturedChars,
      ratio: coverageRatio,
    },
  };
}

export function parseGoogleDocJson(document: any): ParseResult {
  const issues: Issue[] = [];
  const rawLines = extractDocLines(document, issues);
  return parseRawLines(rawLines, issues, document?.title);
}

export async function extractDocxLines(input: string | Buffer, issues: Issue[]): Promise<RawLine[]> {
  const mammoth = require('mammoth');
  const result = typeof input === 'string'
    ? await mammoth.convertToHtml({ path: input })
    : await mammoth.convertToHtml({ buffer: input });
  const html = result.value;

  function unescapeHtml(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  const blockRegex = /<(h[1-6]|p|li)>([\s\S]*?)<\/\1>/gi;
  const rawLines: RawLine[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const innerHtml = match[2];
    const subParts = innerHtml.split(/<br\s*\/?>/i);
    for (const part of subParts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;

      let mdText = trimmedPart
        .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
        .replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1')
        .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
        .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
        .replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
        .replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
        .replace(/<u>([\s\S]*?)<\/u>/gi, '<u>$1</u>')
        .replace(/<[^>]+>/g, '');

      mdText = unescapeHtml(mdText);
      const spans = parseSpans(mdText);
      const text = spans.map(s => s.t).join('');
      const isBold = tag.startsWith('h') || /^\*\*[^*]+\*\*$/.test(mdText.trim());
      const isHeading = tag.startsWith('h');
      const isBullet = tag === 'li';

      rawLines.push({
        text,
        spans,
        namedStyle: tag.startsWith('h') ? `HEADING_${tag[1]}` : 'NORMAL_TEXT',
        isBold,
        isBullet,
        bulletLevel: 0,
        isHeading,
      });
    }
  }

  return rawLines;
}

export async function parseDocxFile(input: string | Buffer, defaultTitle = 'Cholangiocarcinoma'): Promise<ParseResult> {
  const issues: Issue[] = [];
  const rawLines = await extractDocxLines(input, issues);
  return parseRawLines(rawLines, issues, defaultTitle);
}
