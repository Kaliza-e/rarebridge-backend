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

    // Validate core required fields
    for (const field of coreRequiredFields) {
      if (data[field] !== undefined && data[field] !== null && typeof data[field] === 'number') {
        data[field] = String(data[field]);
      }

      if (!data[field]) {
        errors.push(`${field} is required and must be a non-empty string`);
      } else if (typeof data[field] !== 'string') {
        errors.push(`${field} must be a string`);
      } else if (data[field].trim() === '') {
        errors.push(`${field} is required and must be a non-empty string`);
      } else {
        sanitized[field] = cleanText(data[field]);
      }
    }

    // Validate optional plain-text fields with defaults
    for (const field of optionalTextFields) {
      if (data[field] !== undefined && data[field] !== null && typeof data[field] === 'number') {
        data[field] = String(data[field]);
      }
      if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
        sanitized[field] = 'Information not available';
        console.warn(`${field} is missing, using default value for disease:`, data.name);
      } else {
        sanitized[field] = cleanText(data[field]);
      }
    }

    // ── Smart-parsed structured fields ──────────────────────────────────────

    // typesAndSymptoms → string[]
    sanitized.typesAndSymptoms = parseSymptomsList(data.typesAndSymptoms || '');

    // diagnosis → DiagnosticStep[]
    sanitized.diagnosis = parseDiagnosticSteps(data.diagnosis || '');

    // lifestyleAndDailySupport → LifestyleData
    sanitized.lifestyleAndDailySupport = parseLifestyleSection(data.lifestyleAndDailySupport || '');

    // treatmentsAndPharma → ResearchOrg[]
    sanitized.treatmentsAndPharma = parseResearchOrgs(data.treatmentsAndPharma || '');

    // ── Nested data fields ───────────────────────────────────────────────────

    // FAQs — may already be parsed arrays or raw text
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

    // Log validation results
    if (errors.length > 0) {
      console.error('Validation errors for disease:', data.name, errors);
    } else {
      console.log('Validation passed for disease:', data.name);
    }

    return {
      valid: errors.length === 0,
      errors,
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
    console.log('Transforming raw data, first row:', rawData[0]);
    return rawData
      .filter(row => {
        // Filter out rows missing core required fields
        const hasCoreFields = row.name && row.diseaseNumber && row.category && row.overview;
        if (!hasCoreFields) {
          console.warn('Filtering out row missing core fields:', row);
        }
        return hasCoreFields;
      })
      .map(row => {
        const transformed: any = { ...row };

        // Google Sheets may return diseaseNumber as a number
        if (transformed.diseaseNumber !== undefined && transformed.diseaseNumber !== null) {
          transformed.diseaseNumber = String(transformed.diseaseNumber).trim();
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
