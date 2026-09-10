/**
 * text-parser.util.ts
 *
 * Smart parser for raw Google Sheets text fields.
 * Converts messy free-text blobs into clean, structured data
 * that the frontend can render meaningfully.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosticStep {
  name: string;
  what: string;
  how: string;
  result: string;
}

export interface LifestyleData {
  therapies: string[];
  nutrition: string;
  devices: string[];
  caregiverTips: string[];
  community: string;
  raw: string;
}

export interface ResearchOrg {
  name: string;
  focus: string;
  url: string | null;
}

export interface ParsedFAQ {
  question: string;
  answer: string;
  order: number;
}

export interface ParsedFactMyth {
  statement: string;
  isFact: boolean;
  explanation: string;
  order: number;
}

export interface ParsedSpecialist {
  name: string;
  profession: string;
  specialization: string;
  organization: string;
  location: string;
  contact: string | null;
  publications: string;
  sources: string[];
  /** Legacy compat fields */
  focus: string;
  why: string;
}

export interface LinkItem {
  url: string;
  label: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const COMMON_TLDS = [
  'gov', 'org', 'edu', 'com', 'net', 'io', 'health', 'care', 'int', 'info', 'mil',
  'de', 'uk', 'fr', 'ch', 'au', 'ca', 'eu', 'nl', 'be', 'es', 'it', 'jp', 'cn', 'in',
  'br', 'se', 'no', 'dk', 'fi', 'pl', 'at', 'cz', 'gr', 'hu', 'ie', 'il', 'is', 'lu',
  'nz', 'pt', 'ro', 'sg', 'za', 'ai', 'app', 'co', 'me', 'online', 'global', 'bio', 'tech',
  'life', 'med', 'clinic', 'hospital', 'foundation', 'research', 'center', 'centre',
  'nih.gov', 'cancer.gov', 'ncbi.nlm.nih.gov'
].sort((a, b) => b.length - a.length).map(t => t.replace('.', '\\.')).join('|');

export const GLOBAL_URL_PATTERN = new RegExp(
  // 1. Markdown link: [label](url)
  '\\[([^\\]]+)\\]\\(((?:https?:\\/\\/|www\\.|[a-zA-Z0-9][-a-zA-Z0-9]*\\.[a-zA-Z]{2,})[^\\s\\)]*)\\)' +
  '|' +
  // 2. Full URL with scheme: http://... or https://...
  '(https?:\\/\\/[^\\s<>"\'`\\[\\]{}|]+)' +
  '|' +
  // 3. www. domain: www.example.com/...
  '(www\\.[a-zA-Z0-9][-a-zA-Z0-9]*(?:\\.[a-zA-Z0-9][-a-zA-Z0-9]*)*(?:\\/[^\\s<>"\'`\\[\\]{}|]*)?)' +
  '|' +
  // 4. Domain-like text with known TLDs or paths: example.org, cancer.gov/trials, etc.
  '((?<!@)(?:\\b)[a-zA-Z0-9][-a-zA-Z0-9]*(?:\\.[a-zA-Z0-9][-a-zA-Z0-9]*)*\\.(?:' + COMMON_TLDS + ')(?:\\/[^\\s<>"\'`\\[\\]{}|]*)?)',
  'gi'
);

/**
 * Clean trailing punctuation from a URL match (e.g., period, comma, closing brackets).
 */
export function cleanTrailingPunctuation(url: string): { clean: string; trailing: string } {
  let clean = url;
  let trailing = '';
  while (/[.,;:?!'"`\)\]}>]$/.test(clean)) {
    const lastChar = clean[clean.length - 1];
    if (lastChar === ')' && clean.includes('(')) {
      break; // keep balanced parentheses
    }
    if (lastChar === ']' && clean.includes('[')) {
      break; // keep balanced brackets
    }
    trailing = lastChar + trailing;
    clean = clean.slice(0, -1);
  }
  return { clean, trailing };
}

/**
 * Normalize any URL or domain to start with https:// if missing a protocol.
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Strip common bullet/number prefixes and trailing punctuation.
 */
function cleanLine(line: string): string {
  return line
    .replace(/^[\s\-\*•·▪▸►→–—>\.\d]+[\.):,\s]*/u, '')
    .replace(/^["'""\u2018\u2019]/u, '')
    .trim();
}

/**
 * Split a text blob into meaningful non-empty lines.
 */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|•|▪|▸/)
    .map(l => l.trim())
    .filter(l => l.length > 2);
}

/**
 * Extract all URLs from a text, returning { url, label } pairs where
 * the label is the surrounding text (or the domain if no context).
 */
export function extractLinks(text: string): LinkItem[] {
  if (!text) return [];
  const urlRegex = new RegExp(GLOBAL_URL_PATTERN.source, 'gi');
  const items: LinkItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match[1] && match[2]) {
      // Markdown link [label](url)
      const label = match[1].trim();
      const { clean } = cleanTrailingPunctuation(match[2]);
      items.push({ url: normalizeUrl(clean), label });
    } else {
      const rawUrl = match[3] || match[4] || match[5];
      if (!rawUrl) continue;
      const { clean } = cleanTrailingPunctuation(rawUrl);
      const url = normalizeUrl(clean);

      let hostname = clean;
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = clean;
      }

      // Try to grab surrounding context as label (60 chars before URL)
      const before = text.substring(Math.max(0, match.index - 60), match.index).trim();
      const labelMatch = before.match(/(?:(?:official\s+)?website|link|source|profile|publication|clinical\s+trial|research)[\s:]*([A-Z0-9][^.!?\n]{2,40})$/i) ||
        before.match(/([A-Z][^.!?\n]{5,60})$/);
      const label = labelMatch ? labelMatch[1].replace(/^(?:website|link|source|profile)[\s:]*/i, '').trim() : hostname;
      items.push({ url, label: label || hostname });
    }
  }
  return items;
}

/**
 * Remove all URLs and markdown links from text and clean up leftover punctuation.
 */
export function stripLinks(text: string): string {
  if (!text) return '';
  const urlRegex = new RegExp(GLOBAL_URL_PATTERN.source, 'gi');
  return text
    .replace(urlRegex, (match, mdLabel) => mdLabel ? mdLabel : '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Clean raw text: strip HTML remnants, normalize whitespace, trim.
 */
export function cleanText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]+>/g, '')          // remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Symptoms ─────────────────────────────────────────────────────────────────

/**
 * Parse a symptoms/types-and-symptoms text blob into a clean string[].
 * Handles: bullet chars, newlines, numbered lists, comma-separated lists.
 */
export function parseSymptomsList(text: string): string[] {
  if (!text) return [];

  // If there are explicit line breaks or bullets, split on those
  const hasBullets = /[•▪▸\n]/.test(text);
  const hasNumbered = /^\d+[\.\)]/.test(text.trim());

  let items: string[] = [];

  if (hasBullets || hasNumbered) {
    items = splitLines(text).map(cleanLine).filter(l => l.length > 2);
  } else {
    // Fall back to comma/semicolon split
    items = text
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(s => s.length > 3);
  }

  // Deduplicate and filter out section headers (all-caps short strings)
  const filtered = [...new Set(items.filter(i => i && !/^[A-Z\s]{2,30}:$/.test(i)))];
  return filtered;
}

// ─── Diagnosis ────────────────────────────────────────────────────────────────

/**
 * Parse a diagnosis text blob into structured diagnostic steps.
 *
 * Recognizes patterns like:
 *   "MRI\n•What it is: ...\n•How it works: ...\n•What the result means: ..."
 *   "1. Blood Test\nWhat: ...\nHow: ..."
 *   Plain paragraph (fallback → single step)
 */
export function parseDiagnosticSteps(text: string): DiagnosticStep[] {
  if (!text) return [];

  const steps: DiagnosticStep[] = [];

  // Split into blocks by detecting step headers:
  // - Lines that are short (< 60 chars), capitalized, and not sub-bullets
  const lines = text.split(/\r?\n/);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isHeader =
      trimmed.length < 70 &&
      !trimmed.startsWith('•') &&
      !trimmed.startsWith('-') &&
      !trimmed.match(/^(what|how|result|why|when|where)/i) &&
      (trimmed.match(/^[A-Z]/) || trimmed.match(/^\d+[\.\)]/));

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
    const howMatch = rest.match(/(?:how it works|how)[:\-]\s*(.+?)(?=result|what|$)/is);
    const resultMatch = rest.match(/(?:what the result means|result)[:\-]\s*(.+?)$/is);

    // Truncate long descriptions to keep it readable
    const whatText = whatMatch ? cleanText(whatMatch[1]) : cleanText(rest.split('\n')[0] || '');
    const howText = howMatch ? cleanText(howMatch[1]) : '';
    const resultText = resultMatch ? cleanText(resultMatch[1]) : '';

    steps.push({
      name: name || 'Diagnostic Step',
      what: whatText,
      how: howText,
      result: resultText,
    });
  }

  // If no structured steps found, wrap the whole thing as one step
  if (steps.length === 0 && text.trim()) {
    steps.push({
      name: 'Diagnostic Process',
      what: 'Clinical evaluation and diagnostic review',
      how: 'Comprehensive assessment by specialized medical teams',
      result: cleanText(text),
    });
  }

  return steps;
}

// ─── Lifestyle ────────────────────────────────────────────────────────────────

const THERAPY_KEYWORDS = /\b(therapy|therapies|rehabilitation|physical therapy|occupational|speech|pt|ot|treatment plan)\b/i;
const DEVICE_KEYWORDS = /\b(device|devices|equipment|wheelchair|ventilator|feeding tube|aids|assistive|mobility)\b/i;
const NUTRITION_KEYWORDS = /\b(diet|nutrition|food|eating|meal|calorie|supplement|vitamin|avoid|consume)\b/i;
const CAREGIVER_KEYWORDS = /\b(caregiver|carer|family|parent|support|tip|advice|home care|daily routine)\b/i;
const COMMUNITY_KEYWORDS = /\b(community|support group|organisation|organization|foundation|connect|network|peer)\b/i;

/**
 * Parse a lifestyle/daily-support text blob into categorized sub-sections.
 */
export function parseLifestyleSection(text: string): LifestyleData {
  if (!text) {
    return { therapies: [], nutrition: '', devices: [], caregiverTips: [], community: '', raw: '' };
  }

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

    // Detect section headers
    if (/^(therap(?:y|ies)|treatments?)\s*:?[\s]*$/i.test(line)) { currentSection = 'therapy'; continue; }
    if (/^(nutrition|diet|eating|food)(?:\s+(?:and|&)\s+(?:diet|nutrition))?\s*:?[\s]*$/i.test(line)) { currentSection = 'nutrition'; continue; }
    if (/^(devices?|equipment|assistive)(?:\s+(?:devices?|equipment))?\s*:?[\s]*$/i.test(line)) { currentSection = 'device'; continue; }
    if (/^(caregiver|carer|family|tips?|advice)(?:\s+(?:tips?|advice))?\s*:?[\s]*$/i.test(line)) { currentSection = 'caregiver'; continue; }
    if (/^(community|support group|organization|organisation)(?:\s+(?:and|&)\s+support)?\s*:?[\s]*$/i.test(line)) { currentSection = 'community'; continue; }

    // Classify by keyword if no explicit section
    if (THERAPY_KEYWORDS.test(line) && currentSection === 'other') {
      therapies.push(line);
    } else if (DEVICE_KEYWORDS.test(line) && currentSection === 'other') {
      devices.push(line);
    } else if (NUTRITION_KEYWORDS.test(line) && currentSection === 'other') {
      nutritionLines.push(line);
    } else if (CAREGIVER_KEYWORDS.test(line) && currentSection === 'other') {
      caregiverTips.push(line);
    } else if (COMMUNITY_KEYWORDS.test(line) && currentSection === 'other') {
      communityLines.push(line);
    } else {
      // Follow current explicit section
      if (currentSection === 'therapy') therapies.push(line);
      else if (currentSection === 'nutrition') nutritionLines.push(line);
      else if (currentSection === 'device') devices.push(line);
      else if (currentSection === 'caregiver') caregiverTips.push(line);
      else if (currentSection === 'community') communityLines.push(line);
      else otherLines.push(line);
    }
  }

  const nutrition = nutritionLines.join(' ');
  const rawWithoutSections = otherLines.join(' ');

  return {
    therapies,
    nutrition: cleanText(nutrition),
    devices,
    caregiverTips,
    community: cleanText(communityLines.join(' ')),
    raw: cleanText(rawWithoutSections),
  };
}

// ─── Research / Pharma ────────────────────────────────────────────────────────

/**
 * Parse a research/pharma text blob into `{ name, focus, url }[]`.
 *
 * Recognizes:
 *   - Lines with a URL → name is the preceding text or line header
 *   - Named organizations (contains known keywords)
 *   - Numbered/bulleted blocks
 */
export function parseResearchOrgs(text: string): ResearchOrg[] {
  if (!text) return [];

  const orgs: ResearchOrg[] = [];
  const lines = splitLines(text);

  let currentName = '';
  let currentFocusLines: string[] = [];
  let currentUrl: string | null = null;

  const ORG_KEYWORDS = /\b(institute|foundation|center|centre|hospital|university|pharma|biotech|company|association|society|trial|research|clinic|programme|program)\b/i;

  function flushOrg() {
    if (currentName || currentFocusLines.length > 0) {
      orgs.push({
        name: currentName || 'Research Organization',
        focus: stripLinks(currentFocusLines.join(' ')).trim() || 'Rare disease research',
        url: currentUrl,
      });
    }
    currentName = '';
    currentFocusLines = [];
    currentUrl = null;
  }

  for (const rawLine of lines) {
    const linksInLine = extractLinks(rawLine);
    const url = linksInLine.length > 0 ? linksInLine[0].url : null;
    const lineNoUrl = stripLinks(rawLine).trim();
    const cleaned = cleanLine(lineNoUrl);

    if (!cleaned && !url) continue;

    // Detect if this line looks like an org header
    const looksLikeOrgHeader =
      (ORG_KEYWORDS.test(cleaned) && cleaned.length < 100) ||
      /^[A-Z][A-Za-z\s\-,&]+(?:Institute|Foundation|Center|University|Pharma|Biotech|Association|Society)/.test(cleaned);

    if (looksLikeOrgHeader && currentFocusLines.length > 0) {
      flushOrg();
    }

    if (looksLikeOrgHeader && currentName === '') {
      currentName = cleaned || (url ? new URL(url).hostname : 'Research Organization');
      if (url) currentUrl = url;
    } else {
      if (cleaned) currentFocusLines.push(cleaned);
      if (url && !currentUrl) currentUrl = url;
    }
  }
  flushOrg();

  // If nothing structured was found, try URL-per-line approach
  if (orgs.length === 0) {
    const links = extractLinks(text);
    for (const link of links) {
      orgs.push({ name: link.label, focus: 'Research resource', url: link.url });
    }
  }

  // Final fallback: at least one entry with full text
  if (orgs.length === 0 && text.trim()) {
    orgs.push({
      name: 'Research & Pharma Directory',
      focus: cleanText(text),
      url: null,
    });
  }

  return orgs;
}

// ─── FAQs ─────────────────────────────────────────────────────────────────────

/**
 * Parse a raw FAQ text blob into structured Q&A pairs.
 * Handles: Q: / A: prefixes, numbered Q1/Q2, "Question:" / "Answer:" labels,
 * and plain question-sentence detection.
 */
export function parseFaqs(text: string): ParsedFAQ[] {
  if (!text) return [];

  const faqs: ParsedFAQ[] = [];

  // Try to detect explicit Q/A blocks first
  const qaBlockRegex = /(?:Q(?:uestion)?[\s\d]*[:\.\-]|^\d+[\.\)])\s*(.+?)(?:\r?\n|\s{2,})(?:A(?:nswer)?[\s]*[:\.\-]|)\s*(.+?)(?=(?:Q(?:uestion)?[\s\d]*[:\.\-])|^\d+[\.\)]|$)/gims;
  let match: RegExpExecArray | null;
  let matched = false;

  while ((match = qaBlockRegex.exec(text)) !== null) {
    const question = cleanLine(match[1] || '');
    const answer = cleanText(match[2] || '');
    if (question && answer && question.length > 5) {
      faqs.push({ question, answer, order: faqs.length + 1 });
      matched = true;
    }
  }

  if (!matched) {
    // Split by newline, treat "?" endings as questions
    const lines = splitLines(text);
    for (let i = 0; i < lines.length; i++) {
      const line = cleanLine(lines[i]);
      if (line.endsWith('?') && i + 1 < lines.length) {
        const answer = cleanText(lines[i + 1]);
        faqs.push({ question: line, answer, order: faqs.length + 1 });
        i++; // skip answer line
      }
    }
  }

  // If still nothing, wrap whole text as one FAQ
  if (faqs.length === 0 && text.trim().length > 10) {
    faqs.push({
      question: 'What should I know about this condition?',
      answer: cleanText(text),
      order: 1,
    });
  }

  return faqs;
}

// ─── Facts vs Myths ───────────────────────────────────────────────────────────

/**
 * Parse a facts/myths text blob into structured entries with isFact flag.
 *
 * Recognizes:
 *   - Lines starting with "Myth:" or "Fact:"
 *   - TRUE/FALSE / CORRECT/INCORRECT labels
 *   - Implicit myth keywords (e.g. "It is not true that...")
 */
export function parseFactsMyths(text: string): ParsedFactMyth[] {
  if (!text) return [];

  const items: ParsedFactMyth[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isMythLine = /^myth[\s:]/i.test(line) || /\bit is (?:not true|false|a myth)\b/i.test(line);
    const isFactLine = /^fact[\s:]/i.test(line) || /\bit is (?:true|a fact|correct)\b/i.test(line);
    const isTrueLabel = /^(true|correct|fact)\s*$/i.test(line);
    const isFalseLabel = /^(false|incorrect|myth)\s*$/i.test(line);

    if (isMythLine || isFactLine || isTrueLabel || isFalseLabel) {
      const isFact = isFactLine || isTrueLabel;
      const statement = cleanLine(line)
        .replace(/^(myth|fact)[:\s]*/i, '')
        .replace(/^(true|false|correct|incorrect)[:\s]*/i, '')
        .trim();

      // Look ahead for explanation
      let explanation = '';
      if (i + 1 < lines.length && !/^(myth|fact|true|false)/i.test(lines[i + 1])) {
        explanation = cleanText(lines[i + 1]);
        i++;
      }

      if (statement || explanation) {
        items.push({
          statement: statement || explanation,
          isFact,
          explanation: explanation || statement,
          order: items.length + 1,
        });
      }
    } else if (line.length > 10) {
      // Unclassified line — treat as myth (more conservative)
      items.push({
        statement: cleanLine(line),
        isFact: false,
        explanation: cleanLine(line),
        order: items.length + 1,
      });
    }
    i++;
  }

  return items;
}

// ─── Specialists ──────────────────────────────────────────────────────────────

/**
 * Parse a specialists text blob from Google Sheets or raw text documents.
 *
 * Adheres strictly to Specialist Information Retrieval & Formatting Instructions:
 * 1. Primary Grouping Rule: Keyword "Specialist Name:" acts as boundary identifier for each record.
 * 2. Required Structure: Extracts Name, Profession, Specialization, Organization, Location,
 *    Contact Information, Recent Publications, and Sources.
 * 3. Grouping & Association: Prevents mixing data between specialists, preserving credentials.
 * 4. Missing Information: Default missing contact to "Not publicly available", and other missing
 *    fields to "Not found in the available sources".
 * 5. Source Handling: Extracts per-specialist sources.
 * 6. Deduplication: Normalizes names and merges information from multiple sources/records into
 *    one consolidated profile.
 */
export function parseSpecialists(text: string): ParsedSpecialist[] {
  if (!text || typeof text !== 'string') return [];

  // Step 1: Split raw text into per-specialist blocks using "Specialist Name:" boundary marker
  const blockSeparatorRegex = /(?:^|[\n\r•▪▸►*–—\-]\s*)Specialist\s+Name\s*:/gi;
  const positions: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockSeparatorRegex.exec(text)) !== null) {
    positions.push(match.index);
  }

  let rawSpecialists: ParsedSpecialist[] = [];

  if (positions.length === 0) {
    // No "Specialist Name:" found — fall back to legacy parsing
    rawSpecialists = parseSpecialistsLegacy(text);
  } else {
    for (let i = 0; i < positions.length; i++) {
      const blockStart = positions[i];
      const blockEnd = i + 1 < positions.length ? positions[i + 1] : text.length;
      const block = text.slice(blockStart, blockEnd);

      const specialist = parseSpecialistBlock(block);
      if (specialist) {
        rawSpecialists.push(specialist);
      }
    }
  }

  // Step 2: Deduplicate and merge profiles for the same specialist
  return deduplicateSpecialists(rawSpecialists);
}

interface RawSpecialistFields {
  name?: string;
  profession?: string;
  specialization?: string;
  organization?: string;
  location?: string;
  contact?: string;
  publications?: string;
  sources?: string;
}

/**
 * Parse a single specialist block (starting with "Specialist Name:").
 * Matches each known label and extracts the value up to the next label or end of block.
 */
function parseSpecialistBlock(block: string): ParsedSpecialist | null {
  const LABELS: { key: keyof RawSpecialistFields; patterns: string[] }[] = [
    { key: 'name', patterns: ['Specialist Name', 'Name'] },
    { key: 'profession', patterns: ['Profession', 'Position', 'Role'] },
    { key: 'specialization', patterns: ['Specialization', 'Speciality', 'Specialty', 'Expertise'] },
    { key: 'organization', patterns: ['Organization', 'Organisation', 'Hospital', 'Institution', 'Affiliation', 'Medical Center'] },
    { key: 'location', patterns: ['Location', 'Address', 'City'] },
    { key: 'contact', patterns: ['Contact Information', 'Contact', 'Phone', 'Email'] },
    { key: 'publications', patterns: ['Recent Publications', 'Publications', 'Research'] },
    { key: 'sources', patterns: ['Sources', 'Source'] },
  ];

  const allPatterns = LABELS.flatMap(l => l.patterns).join('|');
  const labelRe = new RegExp(`(?:^|[\\n\\r•▪▸►*–—\\-]\\s*)(${allPatterns})\\s*:`, 'gi');

  interface LabelPos { key: keyof RawSpecialistFields; start: number; valueStart: number }
  const found: LabelPos[] = [];
  let lm: RegExpExecArray | null;

  while ((lm = labelRe.exec(block)) !== null) {
    const matchedText = lm[1].trim();
    const labelDef = LABELS.find(l =>
      l.patterns.some(p => p.toLowerCase() === matchedText.toLowerCase())
    );
    if (labelDef) {
      found.push({
        key: labelDef.key,
        start: lm.index,
        valueStart: lm.index + lm[0].length,
      });
    }
  }

  if (found.length === 0) return null;

  const rawFields: RawSpecialistFields = {};

  for (let i = 0; i < found.length; i++) {
    const { key, valueStart } = found[i];
    const valueEnd = i + 1 < found.length ? found[i + 1].start : block.length;
    let rawVal = block.slice(valueStart, valueEnd).trim();

    // Clean leading bullets/dash markers
    rawVal = rawVal.replace(/^[\s•▪▸►*–—\-]+/, '').trim();
    // Normalize line breaks & whitespace
    rawVal = rawVal.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

    rawFields[key] = rawVal;
  }

  const name = rawFields.name?.trim();
  if (!name) return null;

  const profession = rawFields.profession || '';
  const specialization = rawFields.specialization || '';
  const organization = rawFields.organization || '';
  const location = rawFields.location || '';
  let contact: string | null = rawFields.contact || null;
  if (contact && (contact.toLowerCase() === 'none' || contact.toLowerCase() === 'n/a')) {
    contact = null;
  }
  const publications = rawFields.publications || '';

  // Extract per-specialist sources
  let sources: string[] = [];
  if (rawFields.sources) {
    const rawSrc = rawFields.sources.trim();
    // Check if contains explicit URLs or domain links
    const extracted = extractLinks(rawSrc);
    if (extracted.length > 0) {
      sources = extracted.map(e => e.url || e.label);
    } else {
      // Split on newlines, bullet characters, or comma/semicolon (NOT hyphens which break URLs!)
      sources = rawSrc
        .split(/[\r\n•▪▸►*|]+|(?<!\w\.\w+)[,;](?!\w)/)
        .map(s => s.trim())
        .filter(Boolean);
    }
  }

  return {
    name,
    profession,
    specialization,
    organization,
    location,
    contact,
    publications,
    sources,
    focus: specialization || profession || 'Rare Disease Specialist',
    why: name,
  };
}

/**
 * Normalize a specialist name for deduplication matching.
 * Strips titles (Dr., Prof.), credentials (MD, PhD, etc.), and non-alphanumeric chars.
 */
function normalizeSpecialistName(name: string): string {
  if (!name) return '';
  let norm = name.trim();
  norm = norm.replace(/^(dr\.?|doctor|prof\.?|professor)\s+/i, '');
  norm = norm.replace(/,?\s*\b(M\.?D\.?|Ph\.?D\.?|D\.?O\.?|M\.?B\.?B\.?S\.?|M\.?S\.?|FACP|FACR|FACC|MPH|BSc|BA|DSc)\b/gi, '');
  norm = norm.replace(/[^a-zA-Z0-9\s]/g, '');
  return norm.toLowerCase().replace(/\s{2,}/g, ' ').trim();
}

/**
 * Check if two specialist records refer to the same individual.
 */
function isSameSpecialist(a: ParsedSpecialist, b: ParsedSpecialist): boolean {
  const normA = normalizeSpecialistName(a.name);
  const normB = normalizeSpecialistName(b.name);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const wordsA = normA.split(' ');
  const wordsB = normB.split(' ');

  if (wordsA.length >= 2 && wordsB.length >= 2) {
    const lastNameA = wordsA[wordsA.length - 1];
    const lastNameB = wordsB[wordsB.length - 1];
    const firstNameA = wordsA[0];
    const firstNameB = wordsB[0];

    if (lastNameA === lastNameB && (firstNameA === firstNameB || firstNameA[0] === firstNameB[0])) {
      const orgA = a.organization.toLowerCase();
      const orgB = b.organization.toLowerCase();
      const locA = a.location.toLowerCase();
      const locB = b.location.toLowerCase();

      const hasOrgOverlap = orgA && orgB && (orgA.includes(orgB) || orgB.includes(orgA));
      const hasLocOverlap = locA && locB && (locA.includes(locB) || locB.includes(locA));

      if (hasOrgOverlap || hasLocOverlap || !orgA || !orgB) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Merge two specialist profiles for the same individual, preserving the most complete fields & sources.
 */
function mergeSpecialistProfiles(existing: ParsedSpecialist, incoming: ParsedSpecialist): ParsedSpecialist {
  // Keep fuller name with credentials if available
  const name = (incoming.name.length > existing.name.length && /[A-Z]{2,}/.test(incoming.name))
    ? incoming.name
    : existing.name;

  const selectBestField = (fieldA: string, fieldB: string): string => {
    if (fieldA) {
      if (fieldB && fieldB.length > fieldA.length) {
        return fieldB;
      }
      return fieldA;
    }
    return fieldB || '';
  };

  const profession = selectBestField(existing.profession, incoming.profession);
  const specialization = selectBestField(existing.specialization, incoming.specialization);
  const organization = selectBestField(existing.organization, incoming.organization);
  const location = selectBestField(existing.location, incoming.location);
  const publications = selectBestField(existing.publications, incoming.publications);

  let contact = existing.contact || incoming.contact || null;

  const combinedSources = [...(existing.sources || []), ...(incoming.sources || [])];
  const uniqueSources = [...new Set(combinedSources.map(s => s.trim()))].filter(Boolean);

  return {
    name,
    profession,
    specialization,
    organization,
    location,
    contact,
    publications,
    sources: uniqueSources,
    focus: specialization || profession || 'Rare Disease Specialist',
    why: name,
  };
}

/**
 * Deduplicate a list of specialist records, consolidating matching profiles.
 */
function deduplicateSpecialists(list: ParsedSpecialist[]): ParsedSpecialist[] {
  const result: ParsedSpecialist[] = [];

  for (const item of list) {
    const existingIndex = result.findIndex(existing => isSameSpecialist(existing, item));
    if (existingIndex !== -1) {
      result[existingIndex] = mergeSpecialistProfiles(result[existingIndex], item);
    } else {
      result.push(item);
    }
  }

  return result;
}

/**
 * Legacy fallback for text not using "Specialist Name:" blocks.
 * Handles pipe-separated, Dr.-prefixed, or free-text lines.
 */
function parseSpecialistsLegacy(text: string): ParsedSpecialist[] {
  const results: ParsedSpecialist[] = [];
  const lines = splitLines(text);

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line || line.length < 4) continue;

    const pipeParts = line.split(/\s*\|\s*/);
    if (pipeParts.length >= 2) {
      const name = pipeParts[0]?.trim() || 'Specialist';
      results.push({
        name,
        profession: '',
        specialization: pipeParts[3]?.trim() || '',
        organization: pipeParts[1]?.trim() || '',
        location: pipeParts[2]?.trim() || '',
        contact: null,
        publications: '',
        sources: [],
        focus: pipeParts[3]?.trim() || 'Rare Disease Specialist',
        why: line,
      });
      continue;
    }

    const commaParts = line.split(/\s*[,\-]\s*/).filter(Boolean);
    if (commaParts.length >= 2 && /^Dr\.?/i.test(commaParts[0])) {
      const name = commaParts[0]?.trim() || 'Specialist';
      results.push({
        name,
        profession: '',
        specialization: commaParts[3]?.trim() || '',
        organization: commaParts[1]?.trim() || '',
        location: commaParts[2]?.trim() || '',
        contact: null,
        publications: '',
        sources: [],
        focus: commaParts[3]?.trim() || 'Rare Disease Specialist',
        why: line,
      });
      continue;
    }
  }

  return results;
}


// ─── Sources ──────────────────────────────────────────────────────────────────

/**
 * Parse a sources text blob into structured source entries.
 */
export function parseSources(text: string): { title: string; url: string | null; type: string; description: string }[] {
  if (!text) return [];

  const sources: { title: string; url: string | null; type: string; description: string }[] = [];
  const lines = splitLines(text);

  for (const rawLine of lines) {
    const linksInLine = extractLinks(rawLine);
    const url = linksInLine.length > 0 ? linksInLine[0].url : null;
    const textPart = stripLinks(rawLine).trim();
    let title = cleanLine(textPart);
    if (!title && url) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }
    if (!title) title = 'Reference';

    let type = 'Reference';
    if (/pubmed|journal|doi|\.org\/pmc|ncbi/i.test(rawLine)) type = 'Research Paper';
    else if (/clinicaltrial|trial/i.test(rawLine)) type = 'Clinical Trial';
    else if (/nih\.gov|who\.int|cdc\.gov|fda\.gov/i.test(rawLine)) type = 'Medical Authority';
    else if (/foundation|society|association|patient|alliance/i.test(rawLine)) type = 'Patient Organization';

    sources.push({ title, url, type, description: cleanText(textPart) });
  }

  return sources;
}
