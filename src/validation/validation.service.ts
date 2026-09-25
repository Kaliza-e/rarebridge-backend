import { Injectable } from '@nestjs/common';
import {
  cleanText,
  parseSymptomsList,
  parseDiagnosticSteps,
  parseLifestyleSection,
  parseResearchOrgs,
  parseFaqs,
  parseFactsMyths,
  parseSpecialists,
  parseSources,
} from '../parsing/text-parser.util';

@Injectable()
export class ValidationService {
  validateDiseaseData(data: any): { valid: boolean; errors: string[]; sanitized: any } {
    const errors: string[] = [];
    const sanitized: any = {};

    // Core required fields (must have these)
    const coreRequiredFields = [
      'diseaseNumber',
      'name',
      'category',
      'overview'
    ];

    // Optional fields with defaults (can be missing but better if present)
    const optionalTextFields = [
      'causes',
    ];

    // Ensure core fields have fallbacks so NO row is rejected
    sanitized.diseaseNumber = data.diseaseNumber ? String(data.diseaseNumber).trim() : '1';
    sanitized.name = data.name ? cleanText(data.name) : `Disease #${sanitized.diseaseNumber}`;
    sanitized.category = data.category ? cleanText(data.category) : 'General Rare Disease';
    sanitized.overview = data.overview ? cleanText(data.overview) : 'Information currently being updated for this condition.';
    sanitized.causes = data.causes ? cleanText(data.causes) : 'Information not available';

    // ── Smart-parsed structured fields + raw fallbacks ──────────────────────

    // typesAndSymptoms → string[] + raw
    sanitized.typesAndSymptomsRaw = typeof data.typesAndSymptoms === 'string' ? cleanText(data.typesAndSymptoms) : '';
    sanitized.typesAndSymptoms = parseSymptomsList(data.typesAndSymptoms || '');

    // diagnosis → DiagnosticStep[] + raw
    sanitized.diagnosisRaw = typeof data.diagnosis === 'string' ? cleanText(data.diagnosis) : '';
    sanitized.diagnosis = parseDiagnosticSteps(data.diagnosis || '');

    // lifestyleAndDailySupport → LifestyleData + raw
    sanitized.lifestyleAndDailySupportRaw = typeof data.lifestyleAndDailySupport === 'string' ? cleanText(data.lifestyleAndDailySupport) : '';
    sanitized.lifestyleAndDailySupport = parseLifestyleSection(data.lifestyleAndDailySupport || '');

    // treatmentsAndPharma → ResearchOrg[] + raw
    sanitized.treatmentsAndPharmaRaw = typeof data.treatmentsAndPharma === 'string' ? cleanText(data.treatmentsAndPharma) : '';
    sanitized.treatmentsAndPharma = parseResearchOrgs(data.treatmentsAndPharma || '');

    // ── Nested data fields ───────────────────────────────────────────────────

    // FAQs — may already be parsed arrays or raw text
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

    // factsMyths
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

    // specialists
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

    // sources
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

    return {
      valid: true,
      errors: [],
      sanitized
    };
  }

  private validateFaq(faq: any): { valid: boolean; data: any } {
    if (!faq.question || !faq.answer || typeof faq.question !== 'string' || typeof faq.answer !== 'string') {
      return { valid: false, data: faq };
    }
    return {
      valid: true,
      data: {
        question: cleanText(faq.question),
        answer: cleanText(faq.answer),
        order: faq.order || 0
      }
    };
  }

  private validateFactMyth(fm: any): { valid: boolean; data: any } {
    if (!fm.statement || !fm.explanation || typeof fm.statement !== 'string' || typeof fm.explanation !== 'string') {
      return { valid: false, data: fm };
    }
    if (typeof fm.isFact !== 'boolean') {
      return { valid: false, data: fm };
    }
    return {
      valid: true,
      data: {
        statement: cleanText(fm.statement),
        isFact: fm.isFact,
        explanation: cleanText(fm.explanation),
        order: fm.order || 0
      }
    };
  }

  private validateSpecialist(spec: any): { valid: boolean; data: any } {
    // Only name is strictly required — all other fields are optional
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
        // Legacy compat
        focus: spec.focus || spec.specialization || spec.profession || 'Rare Disease Specialist',
        why: spec.why || spec.name,
      }
    };
  }

  private validateSource(source: any): { valid: boolean; data: any } {
    if (!source.title || !source.type || typeof source.title !== 'string' || typeof source.type !== 'string') {
      return { valid: false, data: source };
    }
    return {
      valid: true,
      data: {
        title: cleanText(source.title),
        url: source.url ? cleanText(source.url) : null,
        type: cleanText(source.type),
        description: source.description ? cleanText(source.description) : null
      }
    };
  }

  transformGoogleSheetsData(rawData: any[]): any[] {
    console.log(`Transforming ${rawData?.length || 0} raw rows from Google Sheets...`);
    if (!Array.isArray(rawData)) return [];

    return rawData
      .filter(row => {
        if (!row || typeof row !== 'object') return false;
        // Keep row if it has name, diseaseNumber, or ANY non-empty key value
        const hasContent = Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== '');
        return hasContent;
      })
      .map((row, index) => {
        const transformed: any = { ...row };

        // Ensure diseaseNumber exists
        if (!transformed.diseaseNumber && transformed.diseaseNumber !== 0) {
          transformed.diseaseNumber = String(index + 1);
        } else {
          transformed.diseaseNumber = String(transformed.diseaseNumber).trim();
        }

        // Ensure name exists
        if (!transformed.name || String(transformed.name).trim() === '') {
          transformed.name = `Disease #${transformed.diseaseNumber}`;
        } else {
          transformed.name = String(transformed.name).trim();
        }

        // Normalize all string fields
        const stringFields = [
          'name', 'category', 'overview', 'causes',
          'typesAndSymptoms', 'diagnosis', 'lifestyleAndDailySupport', 'treatmentsAndPharma',
        ];

        for (const field of stringFields) {
          if (transformed[field] !== undefined && transformed[field] !== null) {
            transformed[field] = String(transformed[field]).trim();
          }
        }

        // Parse nested JSON data if present in string form
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
              // Leave as string — validation service will parse it with smart parsers
            }
          }
        });

        return transformed;
      });
  }
}
