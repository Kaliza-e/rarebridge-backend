import { Injectable, NotFoundException } from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { ValidationService } from '../validation/validation.service';

@Injectable()
export class DiseaseService {
  private cachedDiseases: any[] = [];
  private lastFetchTime: number = 0;
  // Cache for 5 minutes
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private googleSheetsService: GoogleSheetsService,
    private validationService: ValidationService
  ) {}

  private async fetchAndCacheDiseases() {
    const now = Date.now();
    if (this.cachedDiseases.length > 0 && (now - this.lastFetchTime) < this.CACHE_TTL_MS) {
      return this.cachedDiseases;
    }

    console.log('Fetching diseases from Google Sheets...');
    const rawData = await this.googleSheetsService.importDiseases();
    console.log(`Raw data fetched from Google Sheets: ${rawData.length} diseases`);
    
    const transformedData = this.validationService.transformGoogleSheetsData(rawData);
    console.log(`Transformed data: ${transformedData.length} diseases`);
    
    const validDiseases = [];
    for (const disease of transformedData) {
      const validation = this.validationService.validateDiseaseData(disease);
      if (validation.valid) {
        const audit = validation.sanitized.parsedDiseaseModel?.audit;
        if (audit?.warnings?.length || audit?.missingContent?.length) {
          console.warn(`Disease source parsing warnings for "${disease.name || 'Unknown'}":`, {
            missingContent: audit.missingContent,
            warnings: audit.warnings,
          });
        }
        validDiseases.push({
          id: validation.sanitized.diseaseNumber, // Use diseaseNumber as ID for backward compatibility
          ...validation.sanitized
        });
      } else {
        console.error('Validation failed for disease:', disease.name || 'Unknown', validation.errors);
      }
    }

    this.cachedDiseases = validDiseases;
    this.lastFetchTime = now;
    console.log(`Successfully cached ${validDiseases.length} diseases.`);
    return this.cachedDiseases;
  }

  async findAll(search?: string, category?: string) {
    let diseases = await this.fetchAndCacheDiseases();

    if (search) {
      const searchLower = search.toLowerCase().trim();
      diseases = diseases.filter(d => {
        const nameStr = typeof d.name === 'string' ? d.name.toLowerCase() : '';
        const catStr = typeof d.category === 'string' ? d.category.toLowerCase() : '';
        const ovStr = typeof d.overview === 'string'
          ? d.overview.toLowerCase()
          : (d.overview?.simple || d.overview?.medical || '').toLowerCase();
        const numStr = typeof d.diseaseNumber === 'string' ? d.diseaseNumber.toLowerCase() : String(d.diseaseNumber || '').toLowerCase();

        return (
          nameStr.includes(searchLower) ||
          catStr.includes(searchLower) ||
          ovStr.includes(searchLower) ||
          numStr.includes(searchLower)
        );
      });
    }

    if (category && category !== 'All' && category !== 'all') {
      const catLower = category.toLowerCase().trim();
      diseases = diseases.filter(d => {
        if (!d.category) return false;
        const cats = String(d.category)
          .split(',')
          .map(c => c.trim().toLowerCase());
        return cats.includes(catLower) || String(d.category).toLowerCase().includes(catLower);
      });
    }

    // Sort by name
    return diseases.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async findOne(id: string) {
    const diseases = await this.fetchAndCacheDiseases();
    const idLower = String(id).trim().toLowerCase();
    const disease = diseases.find(d =>
      String(d.id).toLowerCase() === idLower ||
      String(d.diseaseNumber).toLowerCase() === idLower ||
      String(d.name).toLowerCase() === idLower ||
      String(d.name).toLowerCase().replace(/\s+/g, '-') === idLower
    );
    if (!disease) {
      throw new NotFoundException(`Disease with ID/Number ${id} not found`);
    }
    return disease;
  }

  async findByDiseaseNumber(diseaseNumber: string) {
    const diseases = await this.fetchAndCacheDiseases();
    const numLower = String(diseaseNumber).trim().toLowerCase();
    const disease = diseases.find(d => String(d.diseaseNumber).trim().toLowerCase() === numLower);
    if (!disease) {
      throw new NotFoundException(`Disease with number ${diseaseNumber} not found`);
    }
    return disease;
  }

  async getCategories() {
    return [
      'Neurological',
      'Genetic',
      'Cancer',
      'Vascular',
      'Autoimmune',
      'Metabolic',
      'Endocrine',
      'Multi-System',
      'Pulmonary',
      'Musculoskeletal',
      'Hepatobiliary',
    ];
  }
}
