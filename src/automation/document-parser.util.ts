import { cleanText } from '../parsing/text-parser.util';

const FIELD_ALIASES: Record<string, string> = {
  'disease number': 'diseaseNumber',
  'disease no': 'diseaseNumber',
  'disease name': 'name',
  name: 'name',
  category: 'category',
  overview: 'overview',
  causes: 'causes',
  symptoms: 'typesAndSymptoms',
  'types and symptoms': 'typesAndSymptoms',
  diagnosis: 'diagnosis',
  'lifestyle and daily support': 'lifestyleAndDailySupport',
  lifestyle: 'lifestyleAndDailySupport',
  'treatments and pharma': 'treatmentsAndPharma',
  'research and pharma directory': 'treatmentsAndPharma',
  faqs: 'faqs',
  'facts vs myths': 'factsMyths',
  'facts vs. myths': 'factsMyths',
  specialists: 'specialists',
  'specialist directory': 'specialists',
  sources: 'sources',
};

export function extractGoogleDocText(document: any): string {
  return (document?.body?.content || [])
    .map((element: any) => element.paragraph?.elements || [])
    .flat()
    .map((element: any) => element.textRun?.content || '')
    .join('')
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
    const match = line.match(/^\s*(?:\d+[.)]\s*)?([^:]{2,60}):\s*(.*)$/);
    const heading = match ? match[1].trim().toLowerCase().replace(/[.#]/g, '') : line.toLowerCase();
    const normalized = FIELD_ALIASES[heading];
    if (normalized) {
      currentField = normalized;
      const value = match?.[2]?.trim() || '';
      if (value) result[currentField] = value;
      else if (!result[currentField]) result[currentField] = '';
      continue;
    }
    if (currentField) result[currentField] = `${result[currentField] || ''}${result[currentField] ? '\n' : ''}${line}`;
  }

  Object.keys(result).forEach(key => { result[key] = cleanText(result[key]); });
  return result;
}
