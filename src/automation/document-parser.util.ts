import { cleanText } from '../parsing/text-parser.util';

const FIELD_ALIASES: Record<string, string> = {
  'disease number': 'diseaseNumber',
  'disease no': 'diseaseNumber',
  'disease name': 'name',
  name: 'name',
  category: 'category',
  overview: 'overview',
  'simple explanation': 'overview',
  'medical description': 'overview',
  causes: 'causes',
  'genetic causes': 'causes',
  'environmental factors': 'causes',
  'unknown causes': 'causes',
  symptoms: 'typesAndSymptoms',
  'types and symptoms': 'typesAndSymptoms',
  'infantile form': 'typesAndSymptoms',
  'late onset form': 'typesAndSymptoms',
  'common symptoms': 'typesAndSymptoms',
  severity: 'typesAndSymptoms',
  'age of appearance': 'typesAndSymptoms',
  diagnosis: 'diagnosis',
  'specialists involved': 'diagnosis',
  'lifestyle and daily support community': 'lifestyleAndDailySupport',
  'lifestyle and daily supoort community': 'lifestyleAndDailySupport',
  'lifestyle and daily support and community': 'lifestyleAndDailySupport',
  'lifestyle and daily supoort and community': 'lifestyleAndDailySupport',
  'lifestyle and daily support': 'lifestyleAndDailySupport',
  'lifestyle and daily supoort': 'lifestyleAndDailySupport',
  lifestyle: 'lifestyleAndDailySupport',
  therapies: 'lifestyleAndDailySupport',
  'diets nutrition': 'lifestyleAndDailySupport',
  'assistive devices': 'lifestyleAndDailySupport',
  'daily care tips': 'lifestyleAndDailySupport',
  'community links': 'lifestyleAndDailySupport',
  'treatments and pharma': 'treatmentsAndPharma',
  'research and pharma directory': 'treatmentsAndPharma',
  'pharma research org name': 'treatmentsAndPharma',
  'focus area': 'treatmentsAndPharma',
  'official website': 'treatmentsAndPharma',
  'why follow them': 'treatmentsAndPharma',
  faqs: 'faqs',
  'frequently asked questions faqs': 'faqs',
  'facts vs myths': 'factsMyths',
  myth: 'factsMyths',
  fact: 'factsMyths',
  specialists: 'specialists',
  'specialist directory': 'specialists',
  'specialists directory': 'specialists',
  'specialist name': 'specialists',
  profession: 'specialists',
  specialization: 'specialists',
  organization: 'specialists',
  location: 'specialists',
  'contact information': 'specialists',
  'recent publications': 'specialists',
  sources: 'sources',
};

export function normalizeHeading(value: string): string {
  return value
    .replace(/^\s*#+\s*/, '')
    .replace(/^\s*\d+[.)]?\s*/, '')
    .replace(/^[•·▪▸►→\-–—*]\s*/, '')
    .replace(/\s*:.*$/, '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/[\/]/g, ' ')
    .replace(/[.,()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes disease name for robust duplicate detection & comparison.
 * Trims spaces, converts to lowercase, normalizes Unicode, strips punctuation.
 */
export function normalizeDiseaseName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFC')
    .replace(/^[\s\d.#\-+]+/, '') // strip leading bullet/number prefixes
    .replace(/['"’`]/g, '') // strip quotes/apostrophes
    .replace(/[^a-z0-9\s]/g, ' ') // convert remaining punctuation to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a stable canonical slug for a disease name (e.g., "gaucher-disease").
 */
export function createCanonicalDiseaseSlug(name: string): string {
  const normalized = normalizeDiseaseName(name);
  return normalized.replace(/\s+/g, '-');
}

/**
 * Extracts Google Doc text while preserving formatting (Hyperlinks, Red Text, Bold, Italic, Lists).
 */
export function extractGoogleDocText(document: any): string {
  const extractTextRun = (textRun: any): string => {
    let content = textRun?.content || '';
    if (!content) return '';

    const textStyle = textRun?.textStyle || {};
    const linkUrl = textStyle.link?.url;
    const fgColor = textStyle.foregroundColor?.color?.rgbColor;

    // Is text red? (red >= 0.6 and green < 0.4 and blue < 0.4)
    const isRed = fgColor && fgColor.red !== undefined && (fgColor.red > 0.6) && (fgColor.green === undefined || fgColor.green < 0.4) && (fgColor.blue === undefined || fgColor.blue < 0.4);

    const isBold = Boolean(textStyle.bold);
    const isItalic = Boolean(textStyle.italic);
    const isUnderline = Boolean(textStyle.underline);

    let trimmed = content;
    const hasTrailingNewline = trimmed.endsWith('\n');
    if (hasTrailingNewline) trimmed = trimmed.slice(0, -1);

    if (trimmed.trim()) {
      if (linkUrl) {
        trimmed = `[${trimmed.trim()}](${linkUrl.trim()})`;
      }
      if (isRed) {
        trimmed = `<span style="color:#d4183d">${trimmed}</span>`;
      }
      if (isBold && !trimmed.startsWith('**')) {
        trimmed = `**${trimmed}**`;
      }
      if (isItalic && !trimmed.startsWith('*')) {
        trimmed = `*${trimmed}*`;
      }
      if (isUnderline && !trimmed.startsWith('<u>')) {
        trimmed = `<u>${trimmed}</u>`;
      }
    }

    return trimmed + (hasTrailingNewline ? '\n' : '');
  };

  const extractElements = (elements: any[]): string => elements.map((element: any) => {
    if (element?.paragraph?.elements) {
      const paragraphText = element.paragraph.elements
        .map((child: any) => extractTextRun(child.textRun))
        .join('');
      
      const bullet = element.paragraph.bullet;
      if (bullet && paragraphText.trim()) {
        return `- ${paragraphText}`;
      }
      return paragraphText;
    }
    if (element?.table?.tableRows) {
      return element.table.tableRows.map((row: any) =>
        (row.tableCells || []).map((cell: any) => extractElements(cell.content || [])).join('\n')
      ).join('\n');
    }
    if (element?.tableOfContents?.content) {
      return extractElements(element.tableOfContents.content);
    }
    return '';
  }).join('');

  return extractElements(document?.body?.content || [])
    .replace(/\u000b/g, '\n')
    .trim();
}

/** Parses `Field: value` documents and heading-based templates. */
export function parseDiseaseDocument(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentField = '';

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^\s*(?:#+\s*)?(?:\d+[.)]\s*)?([^:]{2,80}):\s*(.*)$/);
    const heading = normalizeHeading(match ? match[1] : line);
    const normalized = FIELD_ALIASES[heading] || FIELD_ALIASES[normalizeHeading(line)];
    if (normalized) {
      currentField = normalized;
      const value = match?.[2]?.trim() || '';
      if (value) {
        const label = match?.[1]?.trim();
        const preserveLabel = normalized !== 'name' && normalized !== 'category' && normalized !== 'diseaseNumber';
        appendValue(result, currentField, preserveLabel && label ? `${label}: ${value}` : value);
      }
      else if (!result[currentField]) result[currentField] = '';
      continue;
    }
    if (currentField) result[currentField] = `${result[currentField] || ''}${result[currentField] ? '\n' : ''}${line}`;
  }

  Object.keys(result).forEach(key => { 
    if (key !== 'overview' && key !== 'causes' && key !== 'typesAndSymptoms' && key !== 'diagnosis' && key !== 'lifestyleAndDailySupport' && key !== 'treatmentsAndPharma' && key !== 'faqs' && key !== 'factsMyths' && key !== 'specialists' && key !== 'sources') {
      result[key] = cleanText(result[key]);
    } else {
      result[key] = result[key].trim();
    }
  });

  return result;
}

function appendValue(result: Record<string, string>, field: string, value: string) {
  result[field] = result[field] ? `${result[field]}\n${value}` : value;
}

/** Stable fallback for templates that intentionally omit a disease number. */
export function createStableDiseaseNumber(documentId: string): string {
  let hash = 2166136261;
  for (const character of documentId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `RB${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
