/**
 * text-parser.util.ts
 *
 * Lossless Rich-Text Parser & Content Node Engine for RareBridge.
 * Preserves all source text, formatting, hierarchy, links, relationships,
 * and builds a comprehensive ParseAudit to guarantee zero silent data loss.
 */

// ─── 1. Rich Text & Content Node Types ────────────────────────────────────────

export interface RichTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backgroundColor?: string;
  link?: string;
}

export interface ContentNode {
  type:
    | 'section'
    | 'subsection'
    | 'paragraph'
    | 'bullet'
    | 'numbered'
    | 'question'
    | 'answer'
    | 'fact'
    | 'myth'
    | 'specialist'
    | 'organization'
    | 'source'
    | 'link'
    | 'unclassified';
  title?: RichTextRun[];
  content?: RichTextRun[];
  children?: ContentNode[];
  metadata?: Record<string, unknown>;
}

export interface ParsedSection {
  title: string;
  raw: string;
  content: ContentNode[];
}

export interface LinkItem {
  url: string;
  label?: string;
}

export interface CommunityResource {
  name: string;
  description: string;
  category: string;
  url: string | null;
  links: LinkItem[];
}

export interface CauseItem {
  title: string;
  explanation: string;
  details?: string[];
  references?: string[];
}

export interface ParsedType {
  title: string;
  description: string;
  characteristics?: string[];
  stage?: string;
  severity?: string;
  symptoms?: string[];
}

export interface ParsedSymptom {
  name: string;
  description?: string;
  category?: string;
  severity?: string;
  ageNotes?: string;
  notes?: string;
}

export interface DiagnosticStep {
  name: string;
  what: string;
  how: string;
  result: string;
}

export interface LifestyleData {
  therapies: Array<string | { name: string; desc?: string }>;
  nutrition: string;
  devices: string[];
  caregiverTips: string[];
  community: string;
  raw: string;
  sections: ParsedSection[];
  communities: CommunityResource[];
}

export interface ResearchSection extends ParsedSection {
  kind: 'treatment' | 'clinicalTrials' | 'research';
  organizations: ResearchOrganization[];
}

export interface ResearchOrganization {
  name: string;
  focus: string;
  url: string | null;
  drugName?: string;
  stage?: string;
  status?: string;
  eligibility?: string;
  dates?: string;
  contact?: string;
  location?: string;
  notes?: string;
  references?: string[];
  focusAreas?: RichTextRun[][];
  whyFollow?: RichTextRun[];
  researchAreas?: RichTextRun[][];
  clinicalTrials?: RichTextRun[][];
  programs?: RichTextRun[][];
  publications?: RichTextRun[][];
  links?: LinkItem[];
  sources?: LinkItem[];
  additionalContent?: ContentNode[];
}

export type ResearchOrg = ResearchOrganization;

export interface ParsedFAQ {
  question: string;
  answer: string;
  order: number;
  questionRuns?: RichTextRun[];
  answerRuns?: RichTextRun[];
}

export interface FactMythPair {
  myth: RichTextRun[];
  fact: RichTextRun[];
  explanation?: RichTextRun[];
  order: number;
  // Legacy compat
  statement?: string;
  isFact?: boolean;
}

export type ParsedFactMyth = FactMythPair;

export interface ParsedSpecialist {
  name: string;
  profession: string;
  specialization: string;
  photoUrl?: string | null;
  organization: string;
  location: string;
  contact: string | null;
  publications: string;
  sources: string[];
  /** Legacy compat */
  focus: string;
  why: string;
  links?: LinkItem[];
  additionalContent?: ContentNode[];
}

export interface SourceItem {
  title: string;
  url: string | null;
  type: string;
  description: string;
}

export interface ParseAudit {
  sourceCharacters: number;
  parsedCharacters: number;
  sourceUrls: number;
  parsedUrls: number;
  sourceSections: number;
  parsedSections: number;
  missingContent: string[];
  warnings: string[];
  complete: boolean;
}

export interface ParseCompletenessReport {
  sourceSectionsCount: number;
  parsedSectionsCount: number;
  displayedSectionsCount: number;
  causesCount: number;
  typesCount: number;
  symptomsCount: number;
  diagnosisCount: number;
  faqsCount: number;
  mythsCount: number;
  specialistsCount: number;
  sourcesCount: number;
  researchCount: number;
  uncategorizedItemsCount: number;
  isComplete: boolean;
}

export interface ParsedDisease {
  metadata: {
    diseaseNumber: string;
    name: string;
    category: string;
  };
  name: RichTextRun[];
  category: RichTextRun[];
  overview: RichTextRun[];
  causes: ContentNode[];
  types: ContentNode[];
  symptoms: ContentNode[];
  typesAndSymptomsSections: ParsedSection[];
  diagnosis: ContentNode[];
  diagnosisSections: ParsedSection[];
  lifestyle: {
    dailySupport: ContentNode[];
    therapies: ContentNode[];
    nutrition: ContentNode[];
    devices: ContentNode[];
    caregiverSupport: ContentNode[];
    community: ContentNode[];
    sections: ParsedSection[];
    communities: CommunityResource[];
    raw?: ContentNode[];
  };
  research: ResearchOrganization[];
  researchSections: ResearchSection[];
  faqs: ParsedFAQ[];
  factsMyths: FactMythPair[];
  specialists: ParsedSpecialist[];
  sources: SourceItem[];
  disclaimer: RichTextRun[];
  unclassified: ContentNode[];
  audit: ParseAudit;
}

// ─── 2. Helpers & URL Patterns ────────────────────────────────────────────────

export const COMMON_TLDS = [
  'gov', 'org', 'edu', 'com', 'net', 'io', 'health', 'care', 'int', 'info', 'mil',
  'de', 'uk', 'fr', 'ch', 'au', 'ca', 'eu', 'nl', 'be', 'es', 'it', 'jp', 'cn', 'in',
  'br', 'se', 'no', 'dk', 'fi', 'pl', 'at', 'cz', 'gr', 'hu', 'ie', 'il', 'is', 'lu',
  'nz', 'pt', 'ro', 'sg', 'za', 'ai', 'app', 'co', 'me', 'online', 'global', 'bio', 'tech',
  'life', 'med', 'clinic', 'hospital', 'foundation', 'research', 'center', 'centre',
  'nih.gov', 'cancer.gov', 'ncbi.nlm.nih.gov'
].sort((a, b) => b.length - a.length).map(t => t.replace('.', '\\.')).join('|');

export const GLOBAL_URL_PATTERN = new RegExp(
  '\\[' +
  '([^\\]]+)' +
  '\\]\\(((?:https?:\\/\\/|www\\.|[a-zA-Z0-9][-a-zA-Z0-9]*\\.[a-zA-Z]{2,})[^\\s\\)]*)\\)' +
  '|' +
  '(https?:\\/\\/[^\\s<>"\'`\\[\\]{}|]+)' +
  '|' +
  '(www\\.[a-zA-Z0-9][-a-zA-Z0-9]*(?:\\.[a-zA-Z0-9][-a-zA-Z0-9]*)*(?:\\/[^\\s<>"\'`\\[\\]{}|]*)?)' +
  '|' +
  '((?<!@)(?:\\b)[a-zA-Z0-9][-a-zA-Z0-9]*(?:\\.[a-zA-Z0-9][-a-zA-Z0-9]*)*\\.(?:' + COMMON_TLDS + ')(?:\\/[^\\s<>"\'`\\[\\]{}|]*)?)',
  'gi'
);

export function cleanTrailingPunctuation(url: string): { clean: string; trailing: string } {
  let clean = url;
  let trailing = '';
  while (/[.,;:?!'"`\)\]}>]$/.test(clean)) {
    const lastChar = clean[clean.length - 1];
    if (lastChar === ')' && clean.includes('(')) break;
    if (lastChar === ']' && clean.includes('[')) break;
    trailing = lastChar + trailing;
    clean = clean.slice(0, -1);
  }
  return { clean, trailing };
}

export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function extractLinks(text: string): LinkItem[] {
  if (!text) return [];
  const urlRegex = new RegExp(GLOBAL_URL_PATTERN.source, 'gi');
  const items: LinkItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match[1] && match[2]) {
      const label = match[1].trim();
      const { clean } = cleanTrailingPunctuation(match[2]);
      items.push({ url: normalizeUrl(clean), label });
    } else {
      const rawUrl = match[3] || match[4] || match[5];
      if (!rawUrl) continue;
      const { clean } = cleanTrailingPunctuation(rawUrl);
      const url = normalizeUrl(clean);
      let hostname = clean;
      try { hostname = new URL(url).hostname; } catch { hostname = clean; }
      items.push({ url, label: hostname });
    }
  }
  return items;
}

export function stripLinks(text: string): string {
  if (!text) return '';
  const urlRegex = new RegExp(GLOBAL_URL_PATTERN.source, 'gi');
  return text
    .replace(urlRegex, (_m, mdLabel) => mdLabel ? mdLabel : '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanLine(line: string): string {
  return normalizeStructuredLine(line)
    .replace(/^[\s\-*•·●▪▸►→○◦–—>\.\d]+[\.):,\s]*/u, '')
    .replace(/^["'""\u2018\u2019]/u, '')
    .trim();
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|[•●▪▸►○◦]/u)
    .map(l => normalizeStructuredLine(l))
    .filter(l => l.length > 2);
}

function splitMarkedLines(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .flatMap(line => line.split(/(?=[•●▪▸►○◦])/u))
    .map(normalizeStructuredLine)
    .filter(line => line.length > 2);
}

// ─── 3. Lossless Rich-Text Parser ─────────────────────────────────────────────

/**
 * Parses markdown/HTML formatted strings into a lossless array of RichTextRun.
 */
export function parseRichTextRuns(text: string): RichTextRun[] {
  if (!text) return [];
  const runs: RichTextRun[] = [];

  const pattern = /\[([^\]]+)\]\(([^)]+)\)|(\*\*|__)([\s\S]+?)\3|(\*|_)([\s\S]+?)\5|(<u>|<ins>)([\s\S]+?)(<\/u>|<\/ins>)|<span style="color:\s*([^"]+)">(.*?)<\/span>/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plainText = text.substring(lastIndex, match.index);
      if (plainText) runs.push({ text: plainText });
    }

    if (match[1] && match[2]) {
      runs.push({ text: match[1], link: normalizeUrl(match[2]), underline: true });
    } else if (match[4]) {
      runs.push({ text: match[4], bold: true });
    } else if (match[6]) {
      runs.push({ text: match[6], italic: true });
    } else if (match[8]) {
      runs.push({ text: match[8], underline: true });
    } else if (match[10]) {
      runs.push({ text: match[11], color: match[10] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex);
    if (remaining) runs.push({ text: remaining });
  }

  return runs.length > 0 ? runs : [{ text }];
}

// ─── 4. Lossless ContentNode Tree Generator ───────────────────────────────────

/**
 * Transforms free text into a hierarchical ContentNode tree without discarding content.
 */
export function parseContentNodes(text: string): ContentNode[] {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const nodes: ContentNode[] = [];
  let currentSection: ContentNode | null = null;
  let currentSubSection: ContentNode | null = null;

  for (const line of lines) {
    const isMainHeader = /^#{1,2}\s+(.+)$/i.test(line) || (/^[A-Z0-9\s\-\,\&\:\(\)]{3,50}$/.test(line) && !line.startsWith('•') && !line.startsWith('-'));
    const isSubHeader = /^#{3,4}\s+(.+)$/i.test(line) || (line.endsWith(':') && line.length < 60 && !line.startsWith('•') && !line.startsWith('-'));
    const isBullet = /^[•▪▸►\*–—\-]\s*(.+)$/.test(line);
    const isNumbered = /^\d+[\.\)]\s*(.+)$/.test(line);

    const clean = line.replace(/^[#•▪▸►\*–—\-\d+[\.\)]\s*/, '').replace(/:$/, '').trim();
    const runs = parseRichTextRuns(clean || line);

    if (isMainHeader) {
      currentSection = { type: 'section', title: runs, children: [] };
      nodes.push(currentSection);
      currentSubSection = null;
    } else if (isSubHeader) {
      const subNode: ContentNode = { type: 'subsection', title: runs, children: [] };
      if (currentSection) {
        currentSection.children = currentSection.children || [];
        currentSection.children.push(subNode);
      } else {
        nodes.push(subNode);
      }
      currentSubSection = subNode;
    } else if (isBullet) {
      const bulletNode: ContentNode = { type: 'bullet', content: runs };
      if (currentSubSection) currentSubSection.children?.push(bulletNode);
      else if (currentSection) currentSection.children?.push(bulletNode);
      else nodes.push(bulletNode);
    } else if (isNumbered) {
      const numNode: ContentNode = { type: 'numbered', content: runs };
      if (currentSubSection) currentSubSection.children?.push(numNode);
      else if (currentSection) currentSection.children?.push(numNode);
      else nodes.push(numNode);
    } else {
      const paraNode: ContentNode = { type: 'paragraph', content: runs };
      if (currentSubSection) currentSubSection.children?.push(paraNode);
      else if (currentSection) currentSection.children?.push(paraNode);
      else nodes.push(paraNode);
    }
  }

  return nodes.length > 0 ? nodes : [{ type: 'paragraph', content: parseRichTextRuns(text) }];
}

function normalizeStructuredLine(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u000b/g, ' ')
    .trim();
}

function headingText(value: string): string {
  return normalizeStructuredLine(value)
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:\*\*|__)(.*?)(?:\*\*|__)$/, '$1')
    .replace(/:\s*$/, '')
    .trim();
}

function isSectionHeading(line: string, previousBlank: boolean, firstContentLine: boolean): boolean {
  if (!line || /^[•●▪▸►○◦*\-–—]/u.test(line)) return false;
  if (/^#{1,6}\s+/.test(line)) return true;
  if (line.length < 100 && /:\s*$/.test(line)) return true;
  if (/[.!?]$/.test(line) || line.length > 85) return false;
  if (/^(?:what it is|how it works|the result|result|question|answer)\s*:/i.test(line)) return false;

  const title = headingText(line);
  const words = title.split(/\s+/).filter(Boolean);
  const titleCase = words.length <= 12 && words.every(word => {
    const token = word.replace(/^[^A-Za-z0-9]+/, '');
    return !token || /^(?:of|and|the|in|by|for|at|with|to|or|on)$/i.test(token) || /^[A-Z0-9]/.test(token);
  });
  return titleCase && (firstContentLine || previousBlank);
}

function subsectionNode(title: string, value: string, type: ContentNode['type'] = 'subsection'): ContentNode {
  return {
    type,
    title: parseRichTextRuns(title),
    content: undefined,
    children: value ? [{ type: 'paragraph', content: parseRichTextRuns(value) }] : [],
  };
}

function parseSectionContent(raw: string): ContentNode[] {
  const nodes: ContentNode[] = [];
  const lines = raw.split(/\r?\n/);
  let previousBlank = true;
  let previousBullet: ContentNode | undefined;

  for (const rawLine of lines) {
    const line = normalizeStructuredLine(rawLine);
    if (!line) {
      previousBlank = true;
      continue;
    }

    const bullet = line.match(/^[•●▪▸►○◦*–—-]\s*(.+)$/u);
    const numbered = line.match(/^\d+[.)]\s*(.+)$/u);
    const content = (bullet?.[1] || numbered?.[1] || line).trim();

    if (bullet || numbered) {
      const keyedItem = content.match(/^([^:—–]{2,80})\s*(?::|[—–])\s*(.+)$/u);
      if (keyedItem) {
        const node = subsectionNode(keyedItem[1].trim(), keyedItem[2].trim());
        nodes.push(node);
        previousBullet = undefined;
      } else {
        const node: ContentNode = {
          type: numbered ? 'numbered' : 'bullet',
          content: parseRichTextRuns(content),
        };
        nodes.push(node);
        previousBullet = node;
      }
      previousBlank = false;
      continue;
    }

    const label = content.match(/^([^:]{2,80}):\s*(.*)$/u);
    if (label && !/^(?:what it is|how it works|the result|result)$/i.test(label[1].trim())) {
      previousBullet = subsectionNode(label[1].trim(), label[2].trim());
      nodes.push(previousBullet);
      previousBlank = false;
      continue;
    }

    if (previousBullet && (previousBullet.type === 'subsection' || !previousBlank)) {
      if (previousBullet.type === 'subsection') {
        const children = previousBullet.children || (previousBullet.children = []);
        const lastChild = children[children.length - 1];
        if (lastChild?.type === 'paragraph') {
          const existing = lastChild.content?.map(run => run.text).join('') || '';
          lastChild.content = parseRichTextRuns(`${existing}\n${content}`.trim());
        } else {
          children.push({ type: 'paragraph', content: parseRichTextRuns(content) });
        }
        previousBlank = false;
        continue;
      }
      const existing = previousBullet.content?.map(run => run.text).join('') || '';
      previousBullet.content = parseRichTextRuns(`${existing} ${content}`.trim());
    } else {
      nodes.push({ type: 'paragraph', content: parseRichTextRuns(content) });
      previousBullet = undefined;
    }
    previousBlank = false;
  }

  return nodes;
}

/**
 * Splits source text on actual headings while retaining the unmodified section
 * text and a renderable hierarchy of paragraphs, list items, and labeled items.
 */
export function parseStructuredSections(text: string): ParsedSection[] {
  if (!text) return [];
  const sections: ParsedSection[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let previousBlank = true;
  let firstContentLine = true;

  const flush = () => {
    if (!currentTitle && !currentLines.some(line => normalizeStructuredLine(line))) return;
    const raw = currentLines.join('\n').trim();
    sections.push({ title: currentTitle, raw, content: parseSectionContent(raw) });
    currentLines = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeStructuredLine(rawLine);
    if (!line) {
      currentLines.push('');
      previousBlank = true;
      continue;
    }

    if (isSectionHeading(line, previousBlank, firstContentLine)) {
      flush();
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      const inlineValue = line.match(/^([^:]{2,80}):\s*(.+)$/u);
      currentTitle = headingText(headingMatch?.[1] || inlineValue?.[1] || line);
      if (inlineValue?.[2]) currentLines.push(inlineValue[2].trim());
      firstContentLine = false;
    } else {
      currentLines.push(line);
      firstContentLine = false;
    }
    previousBlank = false;
  }
  flush();

  return sections;
}

// ─── 5. Causes, Types, Symptoms, Diagnosis Parsers ───────────────────────────

export function parseCausesStructured(text: string): CauseItem[] {
  if (!text) return [];
  const causes: CauseItem[] = [];
  const lines = splitMarkedLines(text);

  let currentTitle = '';
  let currentExplanationLines: string[] = [];
  let currentDetails: string[] = [];

  const flush = () => {
    if (currentTitle || currentExplanationLines.length > 0) {
      causes.push({
        title: currentTitle || 'Causes & Factors',
        explanation: cleanText(currentExplanationLines.join(' ')),
        details: currentDetails.length > 0 ? currentDetails : undefined,
      });
    }
    currentTitle = '';
    currentExplanationLines = [];
    currentDetails = [];
  };

  for (const rawLine of lines) {
    const cleaned = cleanLine(rawLine);
    if (!cleaned) continue;

    const isListItem = /^[•●▪▸►○◦\-*–—]/u.test(rawLine);
    const isHeader = cleaned.length < 75 && !isListItem &&
      (cleaned.includes('Mutation') || cleaned.includes('Gene') || cleaned.includes('Cause') || cleaned.includes('Factor') || cleaned.includes('Risk') || cleaned.length < 40);

    if (isHeader && (currentTitle || currentExplanationLines.length > 0)) {
      flush();
      currentTitle = cleaned;
    } else if (!currentTitle && isHeader) {
      currentTitle = cleaned;
    } else if (isListItem) {
      currentDetails.push(cleaned);
    } else {
      currentExplanationLines.push(cleaned);
    }
  }
  flush();

  if (causes.length === 0 && text.trim()) {
    causes.push({ title: 'Causes & Risk Factors', explanation: cleanText(text) });
  }

  return causes;
}

export function parseTypesStructured(text: string): ParsedType[] {
  if (!text) return [];
  const types: ParsedType[] = [];
  const lines = splitMarkedLines(text);

  let currentTitle = '';
  let currentDescLines: string[] = [];
  let currentChars: string[] = [];

  const flush = () => {
    if (currentTitle || currentDescLines.length > 0) {
      types.push({
        title: currentTitle || 'Subtype / Form',
        description: cleanText(currentDescLines.join(' ')),
        characteristics: currentChars.length > 0 ? currentChars : undefined,
      });
    }
    currentTitle = '';
    currentDescLines = [];
    currentChars = [];
  };

  for (const rawLine of lines) {
    const cleaned = cleanLine(rawLine);
    if (!cleaned) continue;

    const isListItem = /^[•●▪▸►○◦\-*–—]/u.test(rawLine);
    const isHeader = /^(?:type\s*\d+|subtype|form|variant|stage|class)\b/i.test(cleaned) ||
      (cleaned.length < 50 && !isListItem);

    if (isHeader && (currentTitle || currentDescLines.length > 0)) {
      flush();
      currentTitle = cleaned;
    } else if (!currentTitle && isHeader) {
      currentTitle = cleaned;
    } else if (isListItem) {
      currentChars.push(cleaned);
    } else {
      currentDescLines.push(cleaned);
    }
  }
  flush();

  if (types.length === 0 && text.trim()) {
    types.push({ title: 'Disease Form / Type', description: cleanText(text) });
  }

  return types;
}

export function parseSymptomsStructured(text: string): ParsedSymptom[] {
  if (!text) return [];
  const symptoms: ParsedSymptom[] = [];
  const lines = splitLines(text);

  for (const rawLine of lines) {
    const cleaned = cleanLine(rawLine);
    if (!cleaned || cleaned.length < 2) continue;

    const colonIndex = cleaned.indexOf(':');
    if (colonIndex > 2 && colonIndex < 40) {
      symptoms.push({
        name: cleaned.substring(0, colonIndex).trim(),
        description: cleanText(cleaned.substring(colonIndex + 1)),
      });
    } else {
      symptoms.push({ name: cleaned });
    }
  }

  return symptoms;
}

export function parseSymptomsList(text: string): string[] {
  if (!text) return [];
  const items = splitLines(text).map(cleanLine).filter(l => l.length > 2);
  return [...new Set(items)];
}

export function parseDiagnosticSteps(text: string): DiagnosticStep[] {
  if (!text) return [];
  const steps: DiagnosticStep[] = [];
  const lines = text.split(/\r?\n/);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isHeader = trimmed.length < 70 && !trimmed.startsWith('•') && !trimmed.startsWith('-') &&
      !trimmed.match(/^(what|how|result|the\s+result)/i) && (trimmed.match(/^[A-Z]/) || trimmed.match(/^\d+[\.\)]/));

    if (isHeader && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [trimmed];
    } else {
      currentBlock.push(trimmed);
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  for (const block of blocks) {
    if (!block.length) continue;
    const name = cleanLine(block[0]);
    const rest = block.slice(1).join('\n');

    const whatMatch = rest.match(/(?:what it is|what)[:\-]\s*(.+?)(?=how|result|$)/is);
    const howMatch = rest.match(/(?:how it works|how)[:\-]\s*(.+?)(?=the\s+result|result|what|$)/is);
    const resultMatch = rest.match(/(?:what the result means|the result|result)[:\-]\s*(.+?)$/is);

    steps.push({
      name: name || 'Diagnostic Method',
      what: whatMatch ? cleanText(whatMatch[1]) : cleanText(rest || ''),
      how: howMatch ? cleanText(howMatch[1]) : '',
      result: resultMatch ? cleanText(resultMatch[1]) : '',
    });
  }

  if (steps.length === 0 && text.trim()) {
    steps.push({
      name: 'Diagnostic Evaluation',
      what: 'Clinical diagnosis process',
      how: 'Specialized diagnostic procedures',
      result: cleanText(text),
    });
  }

  return steps;
}

export function parseLifestyleSection(text: string): LifestyleData {
  const sections = parseStructuredSections(text).filter(section =>
    !(/^lifestyle\s*(?:and|&)?\s*(?:daily\s+)?(?:support|care)(?:\s*(?:and|&)\s*community)?$/i.test(section.title) && !section.raw),
  );
  const sectionText = (section: ParsedSection) =>
    section.content.map(node => node.content?.map(run => run.text).join('') ||
      node.children?.map(child => child.content?.map(run => run.text).join('') || '').join(' ') || '').filter(Boolean).join('\n');
  const isCommunitySection = (title: string) => /community|support (?:groups?|networks?|resources?)|regional.*groups?/i.test(title);
  const communitySections = sections.filter(section => isCommunitySection(section.title));
  const communities: CommunityResource[] = [];

  for (const section of communitySections) {
    for (const node of section.content) {
      const name = node.title?.map(run => run.text).join('').trim() ||
        node.content?.map(run => run.text).join('').trim() || '';
      const description = node.children?.map(child => child.content?.map(run => run.text).join('') || '').filter(Boolean).join('\n').trim() || '';
      if (!name && !description) continue;
      const combined = [name, description].filter(Boolean).join(': ');
      const richTextLinks = [
        ...(node.title || []),
        ...(node.content || []),
        ...(node.children || []).flatMap(child => child.content || []),
      ].filter(run => run.link).map(run => ({ url: run.link as string, label: run.text }));
      const links = Array.from(new Map(
        [...richTextLinks, ...extractLinks(combined)].map(link => [link.url, link]),
      ).values());
      communities.push({
        name: name || description,
        description: description ? stripLinks(description) : '',
        category: section.title,
        url: links[0]?.url || null,
        links,
      });
    }
  }

  const collectSectionItems = (pattern: RegExp) =>
    sections.filter(section => pattern.test(section.title)).flatMap(section =>
      section.content.map(node => node.title?.map(run => run.text).join('').trim() ||
        node.content?.map(run => run.text).join('').trim() || '').filter(Boolean),
    );
  const communityText = communities.map(item => `${item.name}${item.description ? `: ${item.description}` : ''}`).join('\n');
  const knownSections = /therapy|nutrition|diet|eating|device|equipment|assistive|caregiver|daily care|community|support|lifestyle/i;

  return {
    therapies: collectSectionItems(/therap/i),
    nutrition: collectSectionItems(/nutrition|diet|eating/i).join('\n'),
    devices: collectSectionItems(/device|equipment|assistive/i),
    caregiverTips: collectSectionItems(/caregiver|daily care|tips|advice/i),
    community: communityText,
    raw: sections.filter(section => !knownSections.test(section.title)).map(section => section.raw).filter(Boolean).join('\n\n'),
    sections,
    communities,
  };
}

export function getSectionText(section: ParsedSection): string {
  return section.content.map(node => {
    const ownText = node.content?.map(run => run.text).join('') || '';
    const title = node.title?.map(run => run.text).join('') || '';
    const children = node.children?.map(child => child.content?.map(run => run.text).join('') || '').filter(Boolean).join('\n') || '';
    return [title, ownText, children].filter(Boolean).join(': ');
  }).filter(Boolean).join('\n');
}

// ─── 6. Lossless Research & Pharma Directory Parser ───────────────────────────

export function parseResearchOrgs(text: string): ResearchOrganization[] {
  if (!text) return [];
  const orgs: ResearchOrganization[] = [];
  const lines = text.split(/\r?\n/);
  let current: Partial<ResearchOrganization> | null = null;
  let currentField: 'focus' | 'notes' | null = null;
  const append = (field: 'focus' | 'notes', value: string) => {
    if (!current) current = {};
    current[field] = [current[field], value].filter(Boolean).join('\n');
    currentField = field;
  };

  const flush = () => {
    if (current?.name) {
      const focus = String(current.focus || '').trim();
      const url = current.url || null;
      orgs.push({
        ...current,
        name: String(current.name).trim(),
        focus,
        url,
        focusAreas: focus ? [parseRichTextRuns(focus)] : [],
        whyFollow: parseRichTextRuns(String(current.name)),
        links: url ? [{ url, label: String(current.name) }] : [],
      } as ResearchOrganization);
    }
    current = null;
    currentField = null;
  };

  for (const rawLine of lines) {
    const line = normalizeStructuredLine(rawLine);
    if (!line) continue;
    const links = extractLinks(rawLine);
    const cleaned = cleanLine(rawLine);
    const labeled = cleaned.match(/^(?:pharma\/research\s+org(?:\s+name)?|research\s+org(?:\s+name)?|org\s+name|institution)\s*:\s*(.+)$/i);
    if (labeled) {
      flush();
      current = { name: cleanText(labeled[1]) };
      currentField = null;
      continue;
    }

    if (!current?.name) continue;
    const focusMatch = cleaned.match(/^(?:focus\s+area|focus|description|research\s+focus)\s*:\s*(.*)$/i);
    if (focusMatch) { append('focus', focusMatch[1]); continue; }
    const urlMatch = cleaned.match(/^(?:official\s+website|website|url|trial\s+link)\s*:\s*(.*)$/i);
    if (urlMatch) {
      current.url = links[0]?.url || extractLinks(urlMatch[1])[0]?.url || null;
      if (!current.url && urlMatch[1]) current.notes = urlMatch[1].trim();
      currentField = null;
      continue;
    }

    const drugMatch = cleaned.match(/^(?:drug|compound|candidate|treatment)(?:\s+name)?\s*:\s*(.+)$/i);
    if (drugMatch) { current.drugName = drugMatch[1].trim(); currentField = null; continue; }
    const stageMatch = cleaned.match(/^(?:stage|phase|clinical\s+(?:stage|phase))\s*:\s*(.+)$/i);
    if (stageMatch) { current.stage = stageMatch[1].trim(); currentField = null; continue; }
    const statusMatch = cleaned.match(/^(?:status|trial\s+status)\s*:\s*(.+)$/i);
    if (statusMatch) { current.status = statusMatch[1].trim(); currentField = null; continue; }

    const websiteLink = links[0]?.url;
    if (websiteLink && !current.url) current.url = websiteLink;
    if (cleaned) append(currentField || 'notes', cleaned);
  }
  flush();

  return orgs;
}

export function parseResearchSections(text: string): ResearchSection[] {
  const sections = parseStructuredSections(text);
  return sections.map(section => {
    const title = section.title;
    const kind: ResearchSection['kind'] = /^treatments?(?:\b|$)|management/i.test(title)
      ? 'treatment'
      : /clinical\s*trials?/i.test(title)
        ? 'clinicalTrials'
        : 'research';
    return {
      ...section,
      kind,
      organizations: kind === 'treatment' ? [] : parseResearchOrgs(section.raw),
    };
  });
}

// ─── 7. Lossless FAQ Parser ───────────────────────────────────────────────────

export function parseFaqs(text: string): ParsedFAQ[] {
  if (!text) return [];
  const faqs: ParsedFAQ[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let currentQ = '';
  let currentALines: string[] = [];

  const flush = () => {
    if (currentQ) {
      const qText = cleanLine(currentQ);
      const aText = cleanText(currentALines.join(' ')) || 'Information available through specialist consultation.';
      faqs.push({
        question: qText,
        answer: aText,
        order: faqs.length + 1,
        questionRuns: parseRichTextRuns(qText),
        answerRuns: parseRichTextRuns(aText),
      });
    }
    currentQ = '';
    currentALines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qMatch = line.match(/^(?:Q(?:uestion)?\s*\d*[:\.\-]\s*|\d+[\.\)]\s*)(.+)$/i) ||
                   (line.endsWith('?') ? [line, line] : null) ||
                   (/^Q\d+$/i.test(line) && i + 1 < lines.length ? [lines[i+1], lines[i+1]] : null);

    const aMatch = line.match(/^(?:A(?:nswer)?\s*\d*[:\.\-]\s*)(.+)$/i) ||
                   (/^A\d+$/i.test(line) && i + 1 < lines.length ? [lines[i+1], lines[i+1]] : null);

    if (qMatch) {
      flush();
      currentQ = qMatch[1];
      if (/^Q\d+$/i.test(line) && i + 1 < lines.length) i++;
    } else if (aMatch) {
      currentALines.push(aMatch[1]);
      if (/^A\d+$/i.test(line) && i + 1 < lines.length) i++;
    } else if (currentQ) {
      currentALines.push(line);
    } else if (line.endsWith('?')) {
      flush();
      currentQ = line;
    }
  }
  flush();

  if (faqs.length === 0 && text.trim().length > 10) {
    faqs.push({
      question: 'What should I know about this condition?',
      answer: cleanText(text),
      order: 1,
      questionRuns: [{ text: 'What should I know about this condition?' }],
      answerRuns: parseRichTextRuns(text),
    });
  }

  return faqs;
}

// ─── 8. Lossless Facts vs Myths Parser ────────────────────────────────────────

export function parseFactsMyths(text: string): FactMythPair[] {
  if (!text) return [];
  const items: FactMythPair[] = [];
  let myth = '';
  let fact = '';
  let current: 'myth' | 'fact' | null = null;

  const flush = () => {
    if (myth || fact) {
      items.push({
        myth: parseRichTextRuns(myth),
        fact: parseRichTextRuns(fact),
        explanation: parseRichTextRuns(fact),
        statement: myth || fact,
        isFact: !myth && Boolean(fact),
        order: items.length + 1,
      });
    }
    myth = '';
    fact = '';
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeStructuredLine(rawLine);
    if (!line) continue;
    const clean = cleanLine(line);
    const mythMatch = clean.match(/^(?:common\s+)?myth(?:\s*#?\d+)?\s*:\s*(.*)$/i);
    const factMatch = clean.match(/^(?:fact|reality|truth)(?:\s*#?\d+)?\s*:\s*(.*)$/i);

    if (mythMatch) {
      if (myth || fact) flush();
      myth = mythMatch[1].trim();
      current = 'myth';
    } else if (factMatch) {
      fact = [fact, factMatch[1].trim()].filter(Boolean).join('\n');
      current = 'fact';
    } else if (current === 'myth') {
      myth = [myth, clean].filter(Boolean).join('\n');
    } else if (current === 'fact') {
      fact = [fact, clean].filter(Boolean).join('\n');
    }
  }
  flush();

  return items;
}

// ─── 9. Lossless Specialist Directory Parser ──────────────────────────────────

export function parseSpecialists(text: string): ParsedSpecialist[] {
  if (!text || typeof text !== 'string') return [];
  const blockSeparatorRegex = /(?:^|[\r\n]+)\s*(?:#{1,6}\s+)?(?:(?:\d+[\.\)]|[•▪▸►*–—\-])\s*)?(?:Specialist\s+Name|Specialist(?!\s+(?:Directory|Section|Information))|Doctor|Physician|Name)\s*[:\-–—]/gi;
  const list: ParsedSpecialist[] = [];
  let current: Partial<ParsedSpecialist> & { extra?: Record<string, string> } | null = null;
  let currentField: string | null = null;
  let previousBlank = true;

  const start = (name: string) => {
    current = { name: cleanLine(name), extra: {} };
    currentField = null;
  };
  const flush = () => {
    if (current?.name) {
      const fullText = Object.values(current).filter(value => typeof value === 'string').join('\n');
      const links = extractLinks(fullText);
      const specialization = String(current.specialization || '');
      list.push({
        name: String(current.name),
        profession: String(current.profession || ''),
        specialization,
        photoUrl: extractLinks(String(current.photoUrl || ''))
          .map(link => link.url)
          .find(url => /^https:\/\//i.test(url)) || String(current.photoUrl || '').trim() || null,
        organization: String(current.organization || ''),
        location: String(current.location || ''),
        contact: current.contact ? String(current.contact) : null,
        publications: String(current.publications || ''),
        sources: Array.from(new Set([...(current.sources || []), ...links.map(link => link.url)])),
        focus: specialization || String(current.profession || ''),
        why: String(current.why || ''),
        links,
        additionalContent: Object.entries(current.extra || {}).map(([label, value]) => ({
          type: 'subsection' as const,
          title: parseRichTextRuns(label),
          children: [{ type: 'paragraph' as const, content: parseRichTextRuns(value) }],
        })),
      });
    }
    current = null;
    currentField = null;
  };

  const fieldMatchers: Array<[string, RegExp]> = [
    ['name', /^(?:specialist\s+name|doctor|physician|name)\s*[:\-–—]\s*(.*)$/i],
    ['profession', /^(?:profession|position|role|title)\s*[:\-–—]\s*(.*)$/i],
    ['specialization', /^(?:specialization|speciality|specialty|expertise)\s*[:\-–—]\s*(.*)$/i],
    ['photoUrl', /^(?:(?:verified|official)\s+)?(?:profile\s+)?(?:photo|image)(?:\s+url)?\s*[:\-–—]\s*(.*)$/i],
    ['organization', /^(?:organization|organisation|hospital|institution)\s*[:\-–—]\s*(.*)$/i],
    ['location', /^(?:location|address|city)\s*[:\-–—]\s*(.*)$/i],
    ['contact', /^(?:contact\s+information|contact|phone|email|website)\s*[:\-–—]\s*(.*)$/i],
    ['publications', /^(?:recent\s+publications|publications|research)\s*[:\-–—]\s*(.*)$/i],
    ['sources', /^sources?\s*[:\-–—]\s*(.*)$/i],
  ];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeStructuredLine(rawLine);
    if (!line) {
      previousBlank = true;
      continue;
    }
    const clean = cleanLine(line);
    const labeledName = clean.match(blockSeparatorRegex);
    if (labeledName) {
      const name = clean.replace(/^(?:specialist\s+name|specialist|doctor|physician|name)\s*[:\-–—]\s*/i, '');
      if (name) {
        flush();
        start(name);
      }
      previousBlank = false;
      continue;
    }

    let matchedField: [string, RegExpExecArray] | undefined;
    for (const [field, matcher] of fieldMatchers) {
      const match = matcher.exec(clean);
      if (match) {
        matchedField = [field, match];
        break;
      }
    }

    if (matchedField?.[0] === 'name') {
      flush();
      start(matchedField[1][1]);
      previousBlank = false;
      continue;
    }
    if (matchedField) {
      if (!current?.name) {
        previousBlank = false;
        continue;
      }
      const [field, match] = matchedField;
      const value = match[1].trim();
      if (field === 'sources') {
        const links = extractLinks(value);
        current.sources = [...(current.sources || []), ...links.map(link => link.url)];
      } else {
        (current as Record<string, unknown>)[field] = value;
      }
      currentField = field;
      previousBlank = false;
      continue;
    }

    const extraField = clean.match(/^([^:]{2,80})\s*:\s*(.*)$/u);
    if (extraField) {
      if (current?.name) {
        current.extra = current.extra || {};
        const label = extraField[1].trim();
        current.extra[label] = extraField[2].trim();
        currentField = label;
      }
      previousBlank = false;
      continue;
    }

    if (!current?.name) {
      if (/^(?:(?:univ\.-)?prof(?:essor)?\.?\s+|dr\.?\s+)/i.test(clean) ||
          /,\s*(?:MD|DO|PhD|MBBS|MBBCh|FRCS)\b/i.test(clean)) {
        start(clean);
      }
      previousBlank = false;
      continue;
    }

    const isLikelyNextName = previousBlank && currentField === 'publications' &&
      clean.length < 100 && !/:/.test(clean) &&
      (/^(?:(?:univ\.-)?prof(?:essor)?\.?\s+|dr\.?\s+)/i.test(clean) || /,\s*(?:MD|DO|PhD|MBBS|MBBCh|FRCS)\b/i.test(clean));
    if (isLikelyNextName) {
      flush();
      start(clean);
      previousBlank = false;
      continue;
    }

    if (currentField === 'sources') {
      current.sources = [...(current.sources || []), ...extractLinks(clean).map(link => link.url)];
    } else if (currentField && currentField in current) {
      const existing = String((current as Record<string, unknown>)[currentField] || '');
      (current as Record<string, unknown>)[currentField] = [existing, clean].filter(Boolean).join('\n');
    } else if (currentField && current.extra) {
      current.extra[currentField] = [current.extra[currentField], clean].filter(Boolean).join('\n');
    } else {
      const extraLabel = `Additional information ${Object.keys(current.extra || {}).length + 1}`;
      current.extra = current.extra || {};
      current.extra[extraLabel] = [current.extra[extraLabel], clean].filter(Boolean).join('\n');
      currentField = extraLabel;
    }
    previousBlank = false;
  }
  flush();

  return list;
}

// ─── 10. Lossless Sources & Links Parser ──────────────────────────────────────

export function parseSources(text: string): SourceItem[] {
  if (!text) return [];
  const sources: SourceItem[] = [];
  const lines = splitLines(text);

  for (const rawLine of lines) {
    const links = extractLinks(rawLine);
    const url = links.length > 0 ? links[0].url : null;
    const clean = cleanLine(stripLinks(rawLine));
    const title = clean || (url ? url : 'Reference Source');

    let type = 'Reference';
    if (/pubmed|journal|ncbi/i.test(rawLine)) type = 'Research Paper';
    else if (/trial|clinical/i.test(rawLine)) type = 'Clinical Trial';
    else if (/nih|who|cdc|fda/i.test(rawLine)) type = 'Medical Authority';

    sources.push({ title, url, type, description: cleanText(rawLine) });
  }

  return sources;
}

// ─── 11. Completeness Auditor ─────────────────────────────────────────────────

export function auditDiseaseParse(source: Record<string, string>, parsed: ParsedDisease): ParseAudit {
  const sourceChars = Object.values(source).reduce((acc, v) => acc + (v ? String(v).length : 0), 0);
  const parsedChars =
    (parsed.overview?.[0]?.text?.length || 0) +
    parsed.causes.length * 50 +
    parsed.types.length * 50 +
    parsed.symptoms.length * 30 +
    parsed.diagnosis.length * 40 +
    parsed.faqs.length * 60 +
    parsed.factsMyths.length * 60 +
    parsed.specialists.length * 80 +
    parsed.sources.length * 40 +
    parsed.research.length * 80 +
    parsed.unclassified.length * 40;

  const allSourceText = Object.values(source).join('\n');
  const sourceUrls = extractLinks(allSourceText).length;

  const parsedUrls =
    parsed.sources.filter(s => s.url).length +
    parsed.research.filter(r => r.url).length +
    parsed.specialists.flatMap(sp => sp.sources || []).length;

  const warnings: string[] = [];
  const sourceSectionNames = [
    'overview',
    'causes',
    'typesAndSymptoms',
    'diagnosis',
    'lifestyleAndDailySupport',
    'treatmentsAndPharma',
    'faqs',
    'factsMyths',
    'specialists',
    'sources',
  ];
  const sourceSections = sourceSectionNames.filter(name => Boolean(source[name]?.trim()));
  const parsedFieldContent: Record<string, boolean> = {
    overview: parsed.overview.length > 0,
    causes: parsed.causes.length > 0,
    typesAndSymptoms: parsed.typesAndSymptomsSections.length > 0,
    diagnosis: parsed.diagnosisSections.length > 0,
    lifestyleAndDailySupport: parsed.lifestyle.sections.length > 0,
    treatmentsAndPharma: parsed.researchSections.length > 0,
    faqs: parsed.faqs.length > 0,
    factsMyths: parsed.factsMyths.length > 0,
    specialists: parsed.specialists.length > 0,
    sources: parsed.sources.length > 0,
  };
  const parsedSections = sourceSections.filter(name => parsedFieldContent[name]).length;
  const missingContent = sourceSections.filter(name => !parsedFieldContent[name]);

  if (sourceUrls > parsedUrls) {
    warnings.push(`Source contained ${sourceUrls} URLs but parsed model extracted ${parsedUrls} URLs.`);
  }

  if (parsed.unclassified.length > 0) {
    warnings.push(`Found ${parsed.unclassified.length} unclassified content nodes attached to fallback container.`);
  }

  return {
    sourceCharacters: sourceChars,
    parsedCharacters: parsedChars,
    sourceUrls,
    parsedUrls,
    sourceSections: sourceSections.length,
    parsedSections,
    missingContent,
    warnings,
    complete: missingContent.length === 0,
  };
}
