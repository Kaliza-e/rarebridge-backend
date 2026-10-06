import { Injectable } from '@nestjs/common';
import {
  cleanText,
  parseCausesStructured,
  parseDiagnosticSteps,
  parseLifestyleSection,
  parseResearchSections,
  parseFaqs,
  parseFactsMyths,
  parseSpecialists,
  parseSources,
  parseRichTextRuns,
  parseContentNodes,
  parseStructuredSections,
  getSectionText,
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

    const typesAndSymptomsRaw = typeof data.typesAndSymptoms === 'string' ? data.typesAndSymptoms.trim() : '';
    sanitized.typesAndSymptomsRaw = typesAndSymptomsRaw;
    sanitized.typesAndSymptomsSections = parseStructuredSections(typesAndSymptomsRaw);
    const typeSections = sanitized.typesAndSymptomsSections.filter((section: any) =>
      /types?|subtypes?|forms?|variants?|classes/i.test(section.title),
    );
    const symptomSections = sanitized.typesAndSymptomsSections.filter((section: any) =>
      /symptom/i.test(section.title),
    );
    sanitized.typesAndSymptoms = symptomSections.flatMap((section: any) =>
      section.content
        .filter((node: any) => node.type === 'bullet' || node.type === 'numbered' || node.type === 'subsection')
        .map((node: any) => node.title?.map((run: any) => run.text).join('') || node.content?.map((run: any) => run.text).join('') || '')
        .filter(Boolean),
    );
    sanitized.typesStructured = typeSections.map((section: any) => ({
      title: section.title,
      description: '',
      characteristics: section.content.map((node: any) => getSectionText({ title: '', raw: '', content: [node] })).filter(Boolean),
    }));
    sanitized.symptomsStructured = symptomSections.flatMap((section: any) =>
      section.content.map((node: any) => {
        if (!['bullet', 'numbered', 'subsection'].includes(node.type)) return null;
        const name = node.title?.map((run: any) => run.text).join('').trim() ||
          node.content?.map((run: any) => run.text).join('').trim() || '';
        const description = node.children?.map((child: any) => child.content?.map((run: any) => run.text).join('') || '').filter(Boolean).join('\n') || '';
        return name ? { name, description } : null;
      }).filter(Boolean),
    );
    sanitized.typesNodes = sanitized.typesAndSymptomsSections.map((section: any) => ({
      type: 'section',
      title: parseRichTextRuns(section.title),
      children: section.content,
    }));
    sanitized.symptomsNodes = symptomSections.map((section: any) => ({
      type: 'section',
      title: parseRichTextRuns(section.title),
      children: section.content,
    }));

    sanitized.diagnosisRaw = typeof data.diagnosis === 'string' ? data.diagnosis.trim() : '';
    sanitized.diagnosis = parseDiagnosticSteps(data.diagnosis || '');
    sanitized.diagnosisSections = parseStructuredSections(sanitized.diagnosisRaw);
    sanitized.diagnosisNodes = sanitized.diagnosisSections.map((section: any) => ({
      type: 'section',
      title: parseRichTextRuns(section.title),
      children: section.content,
    }));

    sanitized.lifestyleAndDailySupportRaw = typeof data.lifestyleAndDailySupport === 'string' ? data.lifestyleAndDailySupport.trim() : '';
    sanitized.lifestyleAndDailySupport = parseLifestyleSection(data.lifestyleAndDailySupport || '');
    sanitized.lifestyleNodes = sanitized.lifestyleAndDailySupport.sections.map((section: any) => ({
      type: 'section',
      title: parseRichTextRuns(section.title),
      children: section.content,
    }));

    sanitized.treatmentsAndPharmaRaw = typeof data.treatmentsAndPharma === 'string' ? data.treatmentsAndPharma.trim() : '';
    sanitized.researchSections = parseResearchSections(sanitized.treatmentsAndPharmaRaw);
    sanitized.treatmentSections = sanitized.researchSections.filter((section: any) => section.kind === 'treatment');
    sanitized.clinicalTrials = sanitized.researchSections
      .filter((section: any) => section.kind === 'clinicalTrials')
      .flatMap((section: any) => section.organizations);
    sanitized.researchOrganizations = sanitized.researchSections
      .filter((section: any) => section.kind === 'research')
      .flatMap((section: any) => section.organizations);
    sanitized.treatmentsAndPharma = [
      ...sanitized.clinicalTrials,
      ...sanitized.researchOrganizations,
    ];

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

    sanitized.factsMythsRaw = typeof data.factsMyths === 'string' ? data.factsMyths.trim() : '';
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

    sanitized.specialistsRaw = typeof data.specialists === 'string' ? data.specialists.trim() : '';
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
      metadata: {
        diseaseNumber: sanitized.diseaseNumber,
        name: sanitized.name,
        category: sanitized.category,
      },
      name: parseRichTextRuns(sanitized.name),
      category: parseRichTextRuns(sanitized.category),
      overview: parseRichTextRuns(sanitized.overview),
      causes: sanitized.causesNodes,
      types: sanitized.typesNodes,
      symptoms: sanitized.symptomsNodes,
      typesAndSymptomsSections: sanitized.typesAndSymptomsSections,
      diagnosis: sanitized.diagnosisNodes,
      diagnosisSections: sanitized.diagnosisSections,
      lifestyle: {
        dailySupport: sanitized.lifestyleNodes,
        therapies: sanitized.lifestyleAndDailySupport.sections
          .filter((section: any) => /therap/i.test(section.title))
          .flatMap((section: any) => section.content),
        nutrition: sanitized.lifestyleAndDailySupport.sections
          .filter((section: any) => /nutrition|diet|eating/i.test(section.title))
          .flatMap((section: any) => section.content),
        devices: sanitized.lifestyleAndDailySupport.sections
          .filter((section: any) => /device|equipment|assistive/i.test(section.title))
          .flatMap((section: any) => section.content),
        caregiverSupport: sanitized.lifestyleAndDailySupport.sections
          .filter((section: any) => /caregiver|daily care|tips|advice/i.test(section.title))
          .flatMap((section: any) => section.content),
        community: sanitized.lifestyleAndDailySupport.sections
          .filter((section: any) => /community|support (?:groups?|networks?|resources?)|regional.*groups?/i.test(section.title))
          .flatMap((section: any) => section.content),
        sections: sanitized.lifestyleAndDailySupport.sections,
        communities: sanitized.lifestyleAndDailySupport.communities,
      },
      research: sanitized.treatmentsAndPharma,
      researchSections: sanitized.researchSections,
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
      sourceSectionsCount: fullParsedModel.audit.sourceSections,
      parsedSectionsCount: fullParsedModel.audit.parsedSections,
      displayedSectionsCount: fullParsedModel.audit.parsedSections,
      causesCount: sanitized.causesStructured.length || (sanitized.causes ? 1 : 0),
      typesCount: typeSections.length,
      symptomsCount: symptomSections.length,
      diagnosisCount: sanitized.diagnosisSections.length,
      faqsCount: sanitized.faqs.length || 0,
      mythsCount: sanitized.factsMyths.length || 0,
      specialistsCount: sanitized.specialists.length || 0,
      sourcesCount: sanitized.sources.length || 0,
      researchCount: sanitized.treatmentsAndPharma.length || 0,
      uncategorizedItemsCount: sanitized.uncategorizedContent.length || 0,
      isComplete: fullParsedModel.audit.complete,
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
        profession: spec.profession ? cleanText(spec.profession) : '',
        specialization: spec.specialization ? cleanText(spec.specialization) : '',
        organization: spec.organization ? cleanText(spec.organization) : '',
        location: spec.location ? cleanText(spec.location) : '',
        contact: spec.contact ? cleanText(spec.contact) : null,
        publications: spec.publications ? cleanText(spec.publications) : '',
        sources: Array.isArray(spec.sources)
          ? spec.sources.map((s: any) => cleanText(String(s)))
          : (spec.sources ? [cleanText(String(spec.sources))] : []),
        links: Array.isArray(spec.links) ? spec.links : [],
        additionalContent: Array.isArray(spec.additionalContent) ? spec.additionalContent : [],
        focus: spec.focus || spec.specialization || spec.profession || '',
        why: spec.why || '',
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
