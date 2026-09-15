import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { ValidationService } from '../validation/validation.service';
import { createStableDiseaseNumber, extractGoogleDocText, parseDiseaseDocument } from './document-parser.util';

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
  error?: string;
  failures: { documentId: string; documentName: string; errors: string[] }[];
}

export interface AutomationLogEvent {
  at: string;
  level: 'log' | 'warn' | 'error' | 'debug';
  stage: string;
  message: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class AutomationService implements OnModuleInit {
  private readonly logger = new Logger(AutomationService.name);
  private lastSyncAt = '';
  private running = false;
  private latestReport: ImportReport | null = null;
  private readonly logs: AutomationLogEvent[] = [];
  private readonly maxLogs = 200;

  constructor(
    private readonly googleSheets: GoogleSheetsService,
    private readonly validation: ValidationService,
  ) {}

  onModuleInit() {
    // Keep automation enabled by default. Set AUTOMATION_INTERVAL_MS=0 to disable it.
    const interval = Number(process.env.AUTOMATION_INTERVAL_MS || 900000);
    if (interval > 0) {
      this.writeLog('log', 'scheduler', 'Automation scheduler enabled.', { intervalMs: interval, initialRunInMs: 1000 });
      setTimeout(() => this.run('scheduled').catch(() => undefined), 1000);
      const timer = setInterval(() => this.run('scheduled').catch(() => undefined), interval);
      timer.unref();
    } else {
      this.writeLog('warn', 'scheduler', 'Automation scheduler disabled because AUTOMATION_INTERVAL_MS is 0.');
    }
  }

  async run(mode: 'manual' | 'scheduled' = 'manual'): Promise<ImportReport> {
    if (this.running) {
      this.writeLog('warn', 'run', 'Import skipped because another import is already running.', { mode });
      throw new Error('An import is already running.');
    }
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.DRIVE_FOLDER_ID;
    if (!folderId) {
      this.writeLog('error', 'configuration', 'GOOGLE_DRIVE_FOLDER_ID is not configured.');
      throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured.');
    }

    this.running = true;
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    const report: ImportReport = { startedAt, completedAt: '', mode, processed: 0, successful: 0, warnings: 0, failed: 0, inserted: 0, updated: 0, failures: [] };
    this.writeLog('log', 'run:start', 'Starting document import.', { mode, incremental: Boolean(this.lastSyncAt) });
    try {
      const files = await this.googleSheets.listGoogleDocs(folderId, this.lastSyncAt || undefined);
      this.writeLog('log', 'drive:list', 'Google Docs discovered.', { count: files.length, incrementalAfter: this.lastSyncAt || null });
      const rows: Record<string, any>[] = [];
      for (const file of files) {
        report.processed++;
        this.writeLog('log', 'document:start', 'Processing document.', { documentId: file.id, documentName: file.name, modifiedTime: file.modifiedTime });
        try {
          const document = await this.googleSheets.getGoogleDoc(file.id);
          const text = extractGoogleDocText(document.data);
          const raw = parseDiseaseDocument(text);
          if (!raw.name && file.name) raw.name = file.name;
          if (!raw.diseaseNumber) raw.diseaseNumber = createStableDiseaseNumber(file.id);
          this.writeLog('debug', 'document:parse', 'Document text parsed.', { documentId: file.id, documentName: file.name, characters: text.length, fields: Object.keys(raw) });
          const validation = this.validation.validateDiseaseData(raw);
          if (!validation.valid) {
            report.failed++;
            report.failures.push({ documentId: file.id, documentName: file.name, errors: validation.errors });
            this.writeLog('warn', 'document:validation', 'Document failed validation.', { documentId: file.id, documentName: file.name, errors: validation.errors });
            continue;
          }
          rows.push(validation.sanitized);
          report.successful++;
          this.writeLog('log', 'document:success', 'Document validated and queued for Sheets.', { documentId: file.id, documentName: file.name, diseaseNumber: validation.sanitized.diseaseNumber });
        } catch (error: any) {
          const message = this.errorMessage(error);
          report.failed++;
          report.failures.push({ documentId: file.id, documentName: file.name, errors: [message] });
          this.writeLog('error', 'document:error', 'Document processing failed.', { documentId: file.id, documentName: file.name, error: message });
        }
      }

      if (rows.length) {
        this.writeLog('log', 'sheets:write', 'Writing validated rows to Google Sheets.', { rows: rows.length });
        const writeResult = await this.googleSheets.upsertDiseaseRows(rows);
        report.inserted = writeResult.inserted;
        report.updated = writeResult.updated;
        this.writeLog('log', 'sheets:write', 'Google Sheets write completed.', writeResult);
      } else {
        this.writeLog('warn', 'sheets:write', 'No valid rows were available for Google Sheets.', { processed: report.processed, failed: report.failed });
      }
      report.warnings = report.processed - report.successful - report.failed;
      report.completedAt = new Date().toISOString();
      // Keep the cursor when a document failed so the next incremental run retries it.
      if (report.failed === 0) this.lastSyncAt = report.completedAt;
      this.latestReport = report;
      this.writeLog('log', 'run:complete', 'Document import completed.', { ...this.summary(report), durationMs: Date.now() - startedAtMs });
      return report;
    } catch (error: any) {
      const message = this.errorMessage(error);
      report.error = message;
      report.failed = Math.max(report.failed, 1);
      report.completedAt = new Date().toISOString();
      report.failures.push({ documentId: 'pipeline', documentName: 'Automation pipeline', errors: [message] });
      this.latestReport = report;
      this.writeLog('error', 'run:error', 'Automation pipeline failed.', { error: message, durationMs: Date.now() - startedAtMs });
      throw error;
    } finally {
      this.running = false;
      this.writeLog('debug', 'run:finally', 'Import lock released.');
    }
  }

  getStatus() {
    return { running: this.running, lastSyncAt: this.lastSyncAt || null, latestReport: this.latestReport, recentLogs: this.logs };
  }

  getLogs(limit = 100) {
    const safeLimit = Math.max(1, Math.min(limit, this.maxLogs));
    return this.logs.slice(-safeLimit);
  }

  private summary(report: ImportReport) {
    return {
      processed: report.processed,
      successful: report.successful,
      failed: report.failed,
      inserted: report.inserted,
      updated: report.updated,
    };
  }

  private errorMessage(error: any): string {
    return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Unknown import error';
  }

  private writeLog(level: AutomationLogEvent['level'], stage: string, message: string, context?: Record<string, unknown>) {
    const event: AutomationLogEvent = { at: new Date().toISOString(), level, stage, message, context };
    this.logs.push(event);
    if (this.logs.length > this.maxLogs) this.logs.shift();

    const suffix = context ? ` ${JSON.stringify(context)}` : '';
    if (level === 'error') this.logger.error(`[${stage}] ${message}${suffix}`);
    else if (level === 'warn') this.logger.warn(`[${stage}] ${message}${suffix}`);
    else if (level === 'debug') this.logger.debug(`[${stage}] ${message}${suffix}`);
    else this.logger.log(`[${stage}] ${message}${suffix}`);
  }
}
