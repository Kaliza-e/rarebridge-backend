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
  'lifestyle and daily support and community': 'lifestyleAndDailySupport',
  'lifestyle and daily support': 'lifestyleAndDailySupport',
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
  'myth': 'factsMyths',
  'fact': 'factsMyths',
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

function normalizeHeading(value: string): string {
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

export function extractGoogleDocText(document: any): string {
  const extractElements = (elements: any[]): string => elements.map((element: any) => {
    if (element?.paragraph?.elements) {
      return element.paragraph.elements
        .map((child: any) => child.textRun?.content || '')
        .join('');
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

  Object.keys(result).forEach(key => { result[key] = cleanText(result[key]); });
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
