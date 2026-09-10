import { Injectable, OnModuleInit } from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { ValidationService } from '../validation/validation.service';
import { extractGoogleDocText, parseDiseaseDocument } from './document-parser.util';

export interface ImportReport {
  startedAt: string;
  completedAt: string;
  mode: 'manual' | 'scheduled';
  processed: number;
  successful: number;
  warnings: number;
  failed: number;
  inserted: number;
  updated: number;
  failures: { documentId: string; documentName: string; errors: string[] }[];
}

@Injectable()
export class AutomationService implements OnModuleInit {
  private lastSyncAt = '';
  private running = false;
  private latestReport: ImportReport | null = null;

  constructor(
    private readonly googleSheets: GoogleSheetsService,
    private readonly validation: ValidationService,
  ) {}

  onModuleInit() {
    const interval = Number(process.env.AUTOMATION_INTERVAL_MS || 0);
    if (interval > 0) {
      const timer = setInterval(() => this.run('scheduled').catch(error => console.error('Scheduled import failed:', error)), interval);
      timer.unref();
    }
  }

  async run(mode: 'manual' | 'scheduled' = 'manual'): Promise<ImportReport> {
    if (this.running) throw new Error('An import is already running.');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.DRIVE_FOLDER_ID;
    if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured.');

    this.running = true;
    const startedAt = new Date().toISOString();
    const report: ImportReport = { startedAt, completedAt: '', mode, processed: 0, successful: 0, warnings: 0, failed: 0, inserted: 0, updated: 0, failures: [] };
    try {
      const files = await this.googleSheets.listGoogleDocs(folderId, this.lastSyncAt || undefined);
      const rows: Record<string, any>[] = [];
      for (const file of files) {
        report.processed++;
        try {
          const document = await this.googleSheets.getGoogleDoc(file.id);
          const raw = parseDiseaseDocument(extractGoogleDocText(document.data));
          const validation = this.validation.validateDiseaseData(raw);
          if (!validation.valid) {
            report.failed++;
            report.failures.push({ documentId: file.id, documentName: file.name, errors: validation.errors });
            continue;
          }
          rows.push(validation.sanitized);
          report.successful++;
        } catch (error: any) {
          report.failed++;
          report.failures.push({ documentId: file.id, documentName: file.name, errors: [error?.message || 'Unknown import error'] });
        }
      }

      if (rows.length) {
        const writeResult = await this.googleSheets.upsertDiseaseRows(rows);
        report.inserted = writeResult.inserted;
        report.updated = writeResult.updated;
      }
      report.warnings = report.processed - report.successful - report.failed;
      report.completedAt = new Date().toISOString();
      // Keep the cursor when a document failed so the next incremental run retries it.
      if (report.failed === 0) this.lastSyncAt = report.completedAt;
      this.latestReport = report;
      return report;
    } finally {
      this.running = false;
    }
  }

  getStatus() {
    return { running: this.running, lastSyncAt: this.lastSyncAt || null, latestReport: this.latestReport };
  }
}
