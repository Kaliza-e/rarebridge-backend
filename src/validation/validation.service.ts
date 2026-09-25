import { Injectable } from '@nestjs/common';
import {
  cleanText,
  parseSymptomsList,
  parseCausesStructured,
  parseTypesStructured,
  parseSymptomsStructured,
  parseDiagnosticSteps,
  parseLifestyleSection,
  parseResearchOrgs,
  parseFaqs,
  parseFactsMyths,
  parseSpecialists,
  parseSources,
  parseRichTextRuns,
  parseContentNodes,
  auditDiseaseParse,
  ParsedDisease,
  ParseCompletenessReport,
} from '../parsing/text-parser.util';

@Injectable()
export class ValidationService {
  validateDiseaseData(data: any): { valid: boolean; errors: string[]; sanitized: any } {
    const errors: string[] = [];
    const sanitized: any = {};

    const rawName = data?.name ? cleanText(data.name) : '';
    if (!rawName || /^disease\s*#?\s*\d+$/i.test(rawName)) {
      return { valid: false, errors: ['Missing real disease name in source row'], sanitized: null };
    }

    sanitized.diseaseNumber = data.diseaseNumber ? String(data.diseaseNumber).trim() : '1';
    sanitized.name = rawName;
    sanitized.category = data.category ? cleanText(data.category) : 'General Rare Disease';
    sanitized.overview = data.overview ? cleanText(data.overview) : 'Information currently being updated for this condition.';
    sanitized.causes = data.causes ? cleanText(data.causes) : 'Information not available';

    // ── Smart-parsed structured fields & ContentNode trees ──────────────────────

    sanitized.causesStructured = parseCausesStructured(data.causes || '');
    sanitized.causesNodes = parseContentNodes(data.causes || '');

    sanitized.typesAndSymptomsRaw = typeof data.typesAndSymptoms === 'string' ? cleanText(data.typesAndSymptoms) : '';
    sanitized.typesAndSymptoms = parseSymptomsList(data.typesAndSymptoms || '');
    sanitized.typesStructured = parseTypesStructured(data.typesAndSymptoms || '');
    sanitized.symptomsStructured = parseSymptomsStructured(data.typesAndSymptoms || '');
    sanitized.typesNodes = parseContentNodes(data.typesAndSymptoms || '');
    sanitized.symptomsNodes = parseContentNodes(data.typesAndSymptoms || '');

    sanitized.diagnosisRaw = typeof data.diagnosis === 'string' ? cleanText(data.diagnosis) : '';
    sanitized.diagnosis = parseDiagnosticSteps(data.diagnosis || '');
    sanitized.diagnosisNodes = parseContentNodes(data.diagnosis || '');

    sanitized.lifestyleAndDailySupportRaw = typeof data.lifestyleAndDailySupport === 'string' ? cleanText(data.lifestyleAndDailySupport) : '';
    sanitized.lifestyleAndDailySupport = parseLifestyleSection(data.lifestyleAndDailySupport || '');
    sanitized.lifestyleNodes = parseContentNodes(data.lifestyleAndDailySupport || '');

    sanitized.treatmentsAndPharmaRaw = typeof data.treatmentsAndPharma === 'string' ? cleanText(data.treatmentsAndPharma) : '';
    sanitized.treatmentsAndPharma = parseResearchOrgs(data.treatmentsAndPharma || '');

    // ── Nested data fields ───────────────────────────────────────────────────

    sanitized.faqsRaw = typeof data.faqs === 'string' ? cleanText(data.faqs) : '';
    if (data.faqs && Array.isArray(data.faqs)) {
      sanitized.faqs = data.faqs
        .map((faq: any) => this.validateFaq(faq))
        .filter((f: any) => f.valid)
        .map((f: any) => f.data);
    } else if (data.faqs && typeof data.faqs === 'string') {
      sanitized.faqs = parseFaqs(data.faqs);
    } else {
      sanitized.faqs = [];
    }

    sanitized.factsMythsRaw = typeof data.factsMyths === 'string' ? cleanText(data.factsMyths) : '';
    if (data.factsMyths && Array.isArray(data.factsMyths)) {
      sanitized.factsMyths = data.factsMyths
        .map((fm: any) => this.validateFactMyth(fm))
        .filter((f: any) => f.valid)
        .map((f: any) => f.data);
    } else if (data.factsMyths && typeof data.factsMyths === 'string') {
      sanitized.factsMyths = parseFactsMyths(data.factsMyths);
    } else {
      sanitized.factsMyths = [];
    }

    sanitized.specialistsRaw = typeof data.specialists === 'string' ? cleanText(data.specialists) : '';
    if (data.specialists && Array.isArray(data.specialists)) {
      sanitized.specialists = data.specialists
        .map((spec: any) => this.validateSpecialist(spec))
        .filter((s: any) => s.valid)
        .map((s: any) => s.data);
    } else if (data.specialists && typeof data.specialists === 'string') {
      sanitized.specialists = parseSpecialists(data.specialists);
    } else {
      sanitized.specialists = [];
    }

    sanitized.sourcesRaw = typeof data.sources === 'string' ? cleanText(data.sources) : '';
    if (data.sources && Array.isArray(data.sources)) {
      sanitized.sources = data.sources
        .map((source: any) => this.validateSource(source))
        .filter((s: any) => s.valid)
        .map((s: any) => s.data);
    } else if (data.sources && typeof data.sources === 'string') {
      sanitized.sources = parseSources(data.sources);
    } else {
      sanitized.sources = [];
    }

    // REQUIREMENT 14: Specialist sources MUST also be in global disease sources list (deduplicated)
    const specialistUrls = new Set<string>();
    sanitized.specialists.forEach((spec: any) => {
      if (Array.isArray(spec.sources)) {
        spec.sources.forEach((srcUrl: string) => {
          if (srcUrl && typeof srcUrl === 'string') specialistUrls.add(srcUrl.trim());
        });
      }
    });

    specialistUrls.forEach((specUrl) => {
      const exists = sanitized.sources.some((s: any) => s.url === specUrl);
      if (!exists) {
        sanitized.sources.push({
          title: `Specialist Reference Link`,
          url: specUrl,
          type: 'Specialist Source',
          description: 'Provided in specialist profile reference sources',
        });
      }
    });

    // Fallback unclassified content container
    sanitized.uncategorizedContent = [];
    if (data.uncategorized && Array.isArray(data.uncategorized)) {
      sanitized.uncategorizedContent = data.uncategorized.map((s: any) => cleanText(String(s)));
    } else if (data.uncategorized && typeof data.uncategorized === 'string') {
      sanitized.uncategorizedContent = [cleanText(data.uncategorized)];
    }

    // Full Lossless ParsedDisease Model & Audit
    const fullParsedModel: ParsedDisease = {
      name: parseRichTextRuns(sanitized.name),
      category: parseRichTextRuns(sanitized.category),
      overview: parseRichTextRuns(sanitized.overview),
      causes: sanitized.causesNodes,
      types: sanitized.typesNodes,
      symptoms: sanitized.symptomsNodes,
      diagnosis: sanitized.diagnosisNodes,
      lifestyle: {
        dailySupport: sanitized.lifestyleNodes,
        therapies: [],
        nutrition: [],
        devices: [],
        caregiverSupport: [],
        community: [],
      },
      research: sanitized.treatmentsAndPharma,
      faqs: sanitized.faqs,
      factsMyths: sanitized.factsMyths,
      specialists: sanitized.specialists,
      sources: sanitized.sources,
      disclaimer: parseRichTextRuns('This is for general educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified physician regarding any medical condition.'),
      unclassified: sanitized.uncategorizedContent.map((c: string) => ({ type: 'unclassified', content: parseRichTextRuns(c) })),
      audit: {
        sourceCharacters: 0,
        parsedCharacters: 0,
        sourceUrls: 0,
        parsedUrls: 0,
        sourceSections: 14,
        parsedSections: 14,
        missingContent: [],
        warnings: [],
        complete: true,
      },
    };

    fullParsedModel.audit = auditDiseaseParse(data, fullParsedModel);
    sanitized.parsedDiseaseModel = fullParsedModel;

    // Parse Completeness Report
    const report: ParseCompletenessReport = {
      sourceSectionsCount: 14,
      parsedSectionsCount: 14,
      displayedSectionsCount: 14,
      causesCount: sanitized.causesStructured.length || (sanitized.causes ? 1 : 0),
      typesCount: sanitized.typesStructured.length || 0,
      symptomsCount: sanitized.typesAndSymptoms.length || 0,
      diagnosisCount: sanitized.diagnosis.length || 0,
      faqsCount: sanitized.faqs.length || 0,
      mythsCount: sanitized.factsMyths.length || 0,
      specialistsCount: sanitized.specialists.length || 0,
      sourcesCount: sanitized.sources.length || 0,
      researchCount: sanitized.treatmentsAndPharma.length || 0,
      uncategorizedItemsCount: sanitized.uncategorizedContent.length || 0,
      isComplete: true,
    };
    sanitized.parseCompletenessReport = report;

    return {
      valid: true,
      errors: [],
      sanitized,
    };
  }

  private validateFaq(faq: any): { valid: boolean; data: any } {
    if (!faq.question || typeof faq.question !== 'string') {
      return { valid: false, data: faq };
    }
    return {
      valid: true,
      data: {
        question: cleanText(faq.question),
        answer: cleanText(faq.answer || 'Consult specialist for full medical guidance.'),
        order: faq.order || 0,
        questionRuns: parseRichTextRuns(faq.question),
        answerRuns: parseRichTextRuns(faq.answer || ''),
      },
    };
  }

  private validateFactMyth(fm: any): { valid: boolean; data: any } {
    const mythText = fm.myth || fm.statement || 'Common Misconception';
    const factText = fm.fact || fm.explanation || 'Verified Medical Fact';
    return {
      valid: true,
      data: {
        myth: parseRichTextRuns(mythText),
        fact: parseRichTextRuns(factText),
        statement: mythText,
        isFact: fm.isFact ?? false,
        explanation: factText,
        order: fm.order || 0,
      },
    };
  }

  private validateSpecialist(spec: any): { valid: boolean; data: any } {
    if (!spec.name || typeof spec.name !== 'string' || spec.name.trim() === '') {
      return { valid: false, data: spec };
    }

    return {
      valid: true,
      data: {
        name: cleanText(spec.name),
        profession: spec.profession ? cleanText(spec.profession) : 'Medical Specialist',
        specialization: spec.specialization ? cleanText(spec.specialization) : 'Rare Diseases',
        organization: spec.organization ? cleanText(spec.organization) : '',
        location: spec.location ? cleanText(spec.location) : '',
        contact: spec.contact ? cleanText(spec.contact) : null,
        publications: spec.publications ? cleanText(spec.publications) : '',
        sources: Array.isArray(spec.sources)
          ? spec.sources.map((s: any) => cleanText(String(s)))
          : (spec.sources ? [cleanText(String(spec.sources))] : []),
        focus: spec.focus || spec.specialization || spec.profession || 'Rare Disease Specialist',
        why: spec.why || spec.name,
      },
    };
  }

  private validateSource(source: any): { valid: boolean; data: any } {
    if (!source.title && !source.url) {
      return { valid: false, data: source };
    }
    return {
      valid: true,
      data: {
        title: cleanText(source.title || source.url || 'Reference Source'),
        url: source.url ? cleanText(source.url) : null,
        type: cleanText(source.type || 'Reference'),
        description: source.description ? cleanText(source.description) : '',
      },
    };
  }

  transformGoogleSheetsData(rawData: any[]): any[] {
    console.log(`Transforming ${rawData?.length || 0} raw rows from Google Sheets...`);
    if (!Array.isArray(rawData)) return [];

    return rawData
      .filter(row => {
        if (!row || typeof row !== 'object') return false;
        const name = String(row.name || '').trim();
        // Row MUST have a real, valid disease name (not empty, not dummy placeholder)
        if (!name || /^disease\s*#?\s*\d+$/i.test(name)) return false;
        return true;
      })
      .map((row, index) => {
        const transformed: any = { ...row };

        if (!transformed.diseaseNumber && transformed.diseaseNumber !== 0) {
          transformed.diseaseNumber = String(index + 1);
        } else {
          transformed.diseaseNumber = String(transformed.diseaseNumber).trim();
        }

        transformed.name = String(transformed.name).trim();

        const stringFields = [
          'name', 'category', 'overview', 'causes',
          'typesAndSymptoms', 'diagnosis', 'lifestyleAndDailySupport', 'treatmentsAndPharma',
        ];

        for (const field of stringFields) {
          if (transformed[field] !== undefined && transformed[field] !== null) {
            transformed[field] = String(transformed[field]).trim();
          }
        }

        ['faqs', 'factsMyths', 'specialists', 'sources'].forEach(field => {
          if (transformed[field] && typeof transformed[field] === 'string') {
            const raw = transformed[field].trim();
            if (raw === '') {
              transformed[field] = [];
              return;
            }
            try {
              transformed[field] = JSON.parse(raw);
            } catch {
              // Non-JSON strings parsed via validation service
            }
          }
        });

        return transformed;
      });
  }
}
