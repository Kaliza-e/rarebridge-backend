function text(value: any): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function lines(items: any[]): string {
  return items
    .map(item => text(item))
    .filter(Boolean)
    .map(item => `• ${item}`)
    .join('\n');
}

function section(label: string, value: any): string {
  const content = Array.isArray(value) ? lines(value) : text(value);
  return content ? `${label}:\n${content}` : '';
}

function formatDiagnosis(value: any): string {
  if (!Array.isArray(value)) return text(value);
  return value.map((step: any, index: number) => {
    const name = text(step?.name) || `Diagnostic Method ${index + 1}`;
    return [
      `${index + 1}. ${name}`,
      `What it is: ${text(step?.what)}`,
      `How it works: ${text(step?.how)}`,
      `The result: ${text(step?.result)}`,
    ].join('\n');
  }).join('\n\n');
}

function formatLifestyle(value: any): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return text(value);
  return [
    section('Therapies', value.therapies),
    section('Diets/Nutrition', value.nutrition),
    section('Assistive Devices', value.devices),
    section('Daily Care Tips', value.caregiverTips),
    section('Community Links', value.community),
  ].filter(Boolean).join('\n\n');
}

function formatResearch(value: any): string {
  if (!Array.isArray(value)) return text(value);
  return value.map((org: any) => [
    `Pharma/Research Org Name: ${text(org?.name) || 'Research Organization'}`,
    `Focus Area: ${text(org?.focus)}`,
    `Official Website: ${text(org?.url) || 'Not provided'}`,
  ].join('\n')).join('\n\n');
}

function formatFaqs(value: any): string {
  if (!Array.isArray(value)) return text(value);
  return value.map((faq: any) => [
    `Question: ${text(faq?.question)}`,
    `Answer: ${text(faq?.answer)}`,
  ].join('\n')).join('\n\n');
}

function formatFactsMyths(value: any): string {
  if (!Array.isArray(value)) return text(value);
  return value.map((item: any) => [
    `${item?.isFact ? 'Fact' : 'Myth'}: ${text(item?.statement)}`,
    `Explanation: ${text(item?.explanation)}`,
  ].join('\n')).join('\n\n');
}

function formatSpecialists(value: any): string {
  if (!Array.isArray(value)) return text(value);
  return value.map((specialist: any) => [
    `Specialist Name: ${text(specialist?.name)}`,
    `Profession: ${text(specialist?.profession)}`,
    `Specialization: ${text(specialist?.specialization)}`,
    `Organization: ${text(specialist?.organization)}`,
    `Location: ${text(specialist?.location)}`,
    `Contact Information: ${text(specialist?.contact) || 'Not publicly available'}`,
    `Recent Publications: ${text(specialist?.publications) || 'Not provided'}`,
  ].join('\n')).join('\n\n');
}

function formatSources(value: any): string {
  if (!Array.isArray(value)) return text(value);
  return value.map((source: any, index: number) => [
    `${index + 1}. ${text(source?.title) || 'Reference'}`,
    `Type: ${text(source?.type)}`,
    `URL: ${text(source?.url) || 'Not provided'}`,
    `Description: ${text(source?.description)}`,
  ].join('\n')).join('\n\n');
}

export function formatSheetValue(value: any, field: string): string {
  if (value === undefined || value === null) return '';
  if (field === 'typesAndSymptoms') return Array.isArray(value) ? lines(value) : text(value);
  if (field === 'diagnosis') return formatDiagnosis(value);
  if (field === 'lifestyleAndDailySupport') return formatLifestyle(value);
  if (field === 'treatmentsAndPharma') return formatResearch(value);
  if (field === 'faqs') return formatFaqs(value);
  if (field === 'factsMyths') return formatFactsMyths(value);
  if (field === 'specialists') return formatSpecialists(value);
  if (field === 'sources') return formatSources(value);
  if (Array.isArray(value)) return lines(value);
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${text(item)}`)
      .join('\n');
  }
  return text(value);
}
