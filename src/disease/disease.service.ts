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
      const searchLower = search.toLowerCase();
      diseases = diseases.filter(d => 
        (d.name && d.name.toLowerCase().includes(searchLower)) ||
        (d.category && d.category.toLowerCase().includes(searchLower)) ||
        (d.overview && d.overview.toLowerCase().includes(searchLower))
      );
    }

    if (category) {
      const catLower = category.toLowerCase();
      diseases = diseases.filter(d => d.category && d.category.toLowerCase() === catLower);
    }

    // Sort by name
    return diseases.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async findOne(id: string) {
    const diseases = await this.fetchAndCacheDiseases();
    const disease = diseases.find(d => d.id === id || d.diseaseNumber === id);
    if (!disease) {
      throw new NotFoundException(`Disease with ID/Number ${id} not found`);
    }
    return disease;
  }

  async findByDiseaseNumber(diseaseNumber: string) {
    const diseases = await this.fetchAndCacheDiseases();
    const disease = diseases.find(d => d.diseaseNumber === diseaseNumber);
    if (!disease) {
      throw new NotFoundException(`Disease with number ${diseaseNumber} not found`);
    }
    return disease;
  }

  async getCategories() {
    const diseases = await this.fetchAndCacheDiseases();
    const categories = new Set<string>(diseases.map(d => d.category).filter(Boolean));
    return Array.from(categories).sort();
  }
}
