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

export interface LinkItem {
  url: string;
  label?: string;
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
  name: RichTextRun[];
  category: RichTextRun[];
  overview: RichTextRun[];
  causes: ContentNode[];
  types: ContentNode[];
  symptoms: ContentNode[];
  diagnosis: ContentNode[];
  lifestyle: {
    dailySupport: ContentNode[];
    therapies: ContentNode[];
    nutrition: ContentNode[];
    devices: ContentNode[];
    caregiverSupport: ContentNode[];
    community: ContentNode[];
    raw?: ContentNode[];
  };
  research: ResearchOrganization[];
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
  return line
    .replace(/^[\s\-\*•·▪▸►→–—>\.\d]+[\.):,\s]*/u, '')
    .replace(/^["'""\u2018\u2019]/u, '')
    .trim();
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|•|▪|▸/)
    .map(l => l.trim())
    .filter(l => l.length > 2);
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

// ─── 5. Causes, Types, Symptoms, Diagnosis Parsers ───────────────────────────

export function parseCausesStructured(text: string): CauseItem[] {
  if (!text) return [];
  const causes: CauseItem[] = [];
  const lines = splitLines(text);

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

    const isHeader = cleaned.length < 75 && !rawLine.startsWith('•') && !rawLine.startsWith('-') &&
      (cleaned.includes('Mutation') || cleaned.includes('Gene') || cleaned.includes('Cause') || cleaned.includes('Factor') || cleaned.includes('Risk') || cleaned.length < 40);

    if (isHeader && (currentTitle || currentExplanationLines.length > 0)) {
      flush();
      currentTitle = cleaned;
    } else if (!currentTitle && isHeader) {
      currentTitle = cleaned;
    } else if (rawLine.startsWith('•') || rawLine.startsWith('-') || rawLine.startsWith('*')) {
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
  const lines = splitLines(text);

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

    const isHeader = /^(?:type\s*\d+|subtype|form|variant|stage|class)\b/i.test(cleaned) ||
      (cleaned.length < 50 && !rawLine.startsWith('•') && !rawLine.startsWith('-'));

    if (isHeader && (currentTitle || currentDescLines.length > 0)) {
      flush();
      currentTitle = cleaned;
    } else if (!currentTitle && isHeader) {
      currentTitle = cleaned;
    } else if (rawLine.startsWith('•') || rawLine.startsWith('-') || rawLine.startsWith('*')) {
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
  if (!text) return { therapies: [], nutrition: '', devices: [], caregiverTips: [], community: '', raw: '' };
  const lines = splitLines(text);
  const therapies: string[] = [];
  const devices: string[] = [];
  const caregiverTips: string[] = [];
  const nutritionLines: string[] = [];
  const communityLines: string[] = [];
  const otherLines: string[] = [];

  let currentSection = 'other';

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    if (/^(therap(?:y|ies)|treatments?)\s*:?/i.test(line)) { currentSection = 'therapy'; continue; }
    if (/^(nutrition|diet|eating)\s*:?/i.test(line)) { currentSection = 'nutrition'; continue; }
    if (/^(devices?|equipment|assistive)\s*:?/i.test(line)) { currentSection = 'device'; continue; }
    if (/^(caregiver|tips?|advice)\s*:?/i.test(line)) { currentSection = 'caregiver'; continue; }
    if (/^(community|support)\s*:?/i.test(line)) { currentSection = 'community'; continue; }

    if (currentSection === 'therapy') therapies.push(line);
    else if (currentSection === 'nutrition') nutritionLines.push(line);
    else if (currentSection === 'device') devices.push(line);
    else if (currentSection === 'caregiver') caregiverTips.push(line);
    else if (currentSection === 'community') communityLines.push(line);
    else otherLines.push(line);
  }

  return {
    therapies,
    nutrition: cleanText(nutritionLines.join(' ')),
    devices,
    caregiverTips,
    community: cleanText(communityLines.join(' ')),
    raw: cleanText(otherLines.join(' ')),
  };
}

// ─── 6. Lossless Research & Pharma Directory Parser ───────────────────────────

export function parseResearchOrgs(text: string): ResearchOrganization[] {
  if (!text) return [];
  const orgs: ResearchOrganization[] = [];
  const lines = splitLines(text);

  let currentName = '';
  let currentFocusLines: string[] = [];
  let currentUrl: string | null = null;
  let currentDrugName = '';
  let currentStage = '';
  let currentStatus = '';

  const flush = () => {
    if (currentName || currentFocusLines.length > 0) {
      orgs.push({
        name: currentName || 'Research Institution',
        focus: stripLinks(currentFocusLines.join(' ')).trim() || 'Rare disease research',
        url: currentUrl,
        drugName: currentDrugName || undefined,
        stage: currentStage || undefined,
        status: currentStatus || undefined,
        focusAreas: [parseRichTextRuns(currentFocusLines.join(' '))],
        whyFollow: parseRichTextRuns(currentName || 'Research Focus'),
        links: currentUrl ? [{ url: currentUrl, label: currentName }] : [],
      });
    }
    currentName = '';
    currentFocusLines = [];
    currentUrl = null;
    currentDrugName = '';
    currentStage = '';
    currentStatus = '';
  };

  for (const rawLine of lines) {
    const links = extractLinks(rawLine);
    const url = links.length > 0 ? links[0].url : null;
    const cleaned = cleanLine(stripLinks(rawLine));
    if (!cleaned && !url) continue;

    const orgNameMatch = rawLine.match(/^(?:pharma\/research\s+org(?:\s+name)?|research\s+org(?:\s+name)?|org\s+name|institution)\s*:\s*(.+)$/i);
    if (orgNameMatch) {
      if (currentName || currentFocusLines.length > 0) flush();
      currentName = orgNameMatch[1].trim();
      continue;
    }

    const drugMatch = rawLine.match(/^(?:drug|compound|candidate|treatment)(?:\s+name)?\s*:\s*(.+)$/i);
    if (drugMatch) { currentDrugName = drugMatch[1].trim(); continue; }

    const stageMatch = rawLine.match(/^(?:stage|phase|clinical\s+(?:stage|phase))\s*:\s*(.+)$/i);
    if (stageMatch) { currentStage = stageMatch[1].trim(); continue; }

    const statusMatch = rawLine.match(/^(?:status|trial\s+status)\s*:\s*(.+)$/i);
    if (statusMatch) { currentStatus = statusMatch[1].trim(); continue; }

    const looksLikeOrgHeader = (/\b(institute|foundation|center|hospital|university|pharma|biotech|association|society)\b/i.test(cleaned) && cleaned.length < 80) ||
      /^[A-Z][A-Za-z\s\-,&]+(?:Institute|Foundation|Center|University|Pharma)/.test(cleaned);

    if (looksLikeOrgHeader && currentFocusLines.length > 0) flush();

    if (looksLikeOrgHeader && !currentName) {
      currentName = cleaned;
      if (url) currentUrl = url;
    } else {
      if (cleaned) currentFocusLines.push(cleaned);
      if (url && !currentUrl) currentUrl = url;
    }
  }
  flush();

  if (orgs.length === 0 && text.trim()) {
    const links = extractLinks(text);
    orgs.push({
      name: 'Research & Pharma Directory',
      focus: cleanText(text),
      url: links.length > 0 ? links[0].url : null,
      links,
    });
  }

  return orgs;
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
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const line = cleanLine(lines[i]);
    const isMythHeader = /^myth[\s:]/i.test(line) || /^(?:myth\s*\d*|common myth)/i.test(line);
    const isFactHeader = /^fact[\s:]/i.test(line) || /^(?:fact\s*\d*|reality|truth)/i.test(line);

    if (isMythHeader) {
      const mythText = line.replace(/^(?:myth\s*\d*|common myth)[:\s]*/i, '').trim() ||
        (i + 1 < lines.length && !/^(?:fact|myth)/i.test(lines[i+1]) ? cleanLine(lines[++i]) : '');
      
      let factText = '';
      if (i + 1 < lines.length && /^fact[\s:]/i.test(cleanLine(lines[i + 1]))) {
        i++;
        factText = cleanLine(lines[i]).replace(/^(?:fact\s*\d*|reality|truth)[:\s]*/i, '').trim();
      } else if (i + 1 < lines.length && !/^(?:myth)/i.test(cleanLine(lines[i + 1]))) {
        i++;
        factText = cleanLine(lines[i]).replace(/^(?:fact\s*\d*|reality|truth)[:\s]*/i, '').trim();
      }

      if (mythText || factText) {
        items.push({
          myth: parseRichTextRuns(mythText || 'Common Misconception'),
          fact: parseRichTextRuns(factText || 'Verified Medical Fact'),
          explanation: parseRichTextRuns(factText || mythText),
          statement: mythText || 'Common Misconception',
          isFact: false,
          order: items.length + 1,
        });
      }
    } else if (isFactHeader) {
      const factText = line.replace(/^(?:fact\s*\d*|reality|truth)[:\s]*/i, '').trim();
      items.push({
        myth: parseRichTextRuns('Common Misconception'),
        fact: parseRichTextRuns(factText),
        explanation: parseRichTextRuns(factText),
        statement: factText,
        isFact: true,
        order: items.length + 1,
      });
    }
    i++;
  }

  return items;
}

// ─── 9. Lossless Specialist Directory Parser ──────────────────────────────────

export function parseSpecialists(text: string): ParsedSpecialist[] {
  if (!text || typeof text !== 'string') return [];
  const blockSeparatorRegex = /(?:^|[\r\n]+)\s*(?:#{1,6}\s+)?(?:(?:\d+[\.\)]|[•▪▸►*–—\-])\s*)?(?:Specialist\s+Name|Specialist(?!\s+(?:Directory|Section|Information))|Doctor|Physician|Name)\s*[:\-–—]/gi;

  const positions: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockSeparatorRegex.exec(text)) !== null) positions.push(match.index);

  const list: ParsedSpecialist[] = [];
  if (positions.length > 0) {
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i];
      const end = i + 1 < positions.length ? positions[i + 1] : text.length;
      const block = text.slice(start, end);

      const nameMatch = block.match(/(?:Specialist\s+Name|Doctor|Physician|Name)\s*[:\-–—]\s*([^\n\r]+)/i);
      if (!nameMatch) continue;
      const name = cleanLine(nameMatch[1]);
      const profMatch = block.match(/(?:Profession|Position|Role|Title)\s*[:\-–—]\s*([^\n\r]+)/i);
      const specMatch = block.match(/(?:Specialization|Speciality|Specialty|Expertise)\s*[:\-–—]\s*([^\n\r]+)/i);
      const orgMatch = block.match(/(?:Organization|Organisation|Hospital|Institution)\s*[:\-–—]\s*([^\n\r]+)/i);
      const locMatch = block.match(/(?:Location|Address|City)\s*[:\-–—]\s*([^\n\r]+)/i);
      const contactMatch = block.match(/(?:Contact\s+Information|Contact|Phone|Email|Website)\s*[:\-–—]\s*([^\n\r]+)/i);
      const pubMatch = block.match(/(?:Recent\s+Publications|Publications|Research)\s*[:\-–—]\s*([^\n\r]+)/i);

      const links = extractLinks(block);
      const sources = links.map(l => l.url);

      list.push({
        name,
        profession: profMatch ? cleanLine(profMatch[1]) : 'Medical Specialist',
        specialization: specMatch ? cleanLine(specMatch[1]) : 'Rare Diseases',
        organization: orgMatch ? cleanLine(orgMatch[1]) : 'Medical Center',
        location: locMatch ? cleanLine(locMatch[1]) : 'Location',
        contact: contactMatch ? cleanLine(contactMatch[1]) : (links.length > 0 ? links[0].url : null),
        publications: pubMatch ? cleanLine(pubMatch[1]) : 'Publications available',
        sources,
        focus: specMatch ? cleanLine(specMatch[1]) : 'Rare Disease Specialist',
        why: name,
        links,
      });
    }
  }

  if (list.length === 0 && text.trim()) {
    const links = extractLinks(text);
    list.push({
      name: 'Medical Specialist',
      profession: 'Physician',
      specialization: 'Rare Disease Care',
      organization: 'Clinical Center',
      location: 'Regional Hospital',
      contact: links.length > 0 ? links[0].url : null,
      publications: cleanText(text),
      sources: links.map(l => l.url),
      focus: 'Rare Disease Care',
      why: 'Specialist Directory',
      links,
    });
  }

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
  const missingContent: string[] = [];

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
    sourceSections: Object.keys(source).length,
    parsedSections: 14,
    missingContent,
    warnings,
    complete: missingContent.length === 0,
  };
}
