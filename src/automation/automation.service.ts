import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { ValidationService } from '../validation/validation.service';
import { createStableDiseaseNumber } from './document-parser.util';
import { parseGoogleDocJson, parseDocxFile } from './text-docs-parser.service';
import { serializeRbm } from '../rbm/rbm.serializer';

export interface ImportReport {
  startedAt: string;
  completedAt: string;
  mode: 'manual' | 'scheduled';
  targetRange: string;
  processed: number;
  successful: number;
  warnings: number;
  failed: number;
  inserted: number;
  updated: number;
  unchanged: number;
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

// Known folders containing approved research documents
const DEFAULT_DOCS_FOLDERS = [
  '1A2W3VigsIeBY0LYwAX-EdvrgQ7_DxFTB', // Primary folder (8 docs)
  '1gHK3U4kEE9mgUr7Z76OrPSlimqPUG8Pq', // Secondary folder (9 docs)
  '16eveeWqY0hnfwH6aiSH1op90Tu0st8iv', // Genetic disorders folder (subfolders: Cancer, Single-gene)
];

// Archived doc IDs that should be skipped during active ingestion
const ARCHIVED_DOC_IDS = new Set([
  '17dg1xzrKfeD7j2hO6nFm9w3gJ4L',
  '17dg1xzrKfeDXRK7_5uWgZTZ1VwP6-fFJiq_L4lvWUOY', // Secondary Krabbe draft (archived in Legacy Review)
]);

const NON_DISEASE_NAME_REGEX = /^(template|rarebridge project plan.*|disease)$/i;

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

  async run(
    mode: 'manual' | 'scheduled' = 'manual',
    targetRange?: string,
  ): Promise<ImportReport> {
    if (this.running) {
      this.writeLog('warn', 'run', 'Import skipped because another import is already running.', { mode });
      throw new Error('An import is already running.');
    }

    const configuredFolder = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.DRIVE_FOLDER_ID;
    const foldersToScan = configuredFolder
      ? Array.from(new Set([...configuredFolder.split(',').map(s => s.trim()), ...DEFAULT_DOCS_FOLDERS]))
      : DEFAULT_DOCS_FOLDERS;

    const effectiveTargetRange =
      targetRange ||
      process.env.AUTOMATION_TARGET_RANGE ||
      process.env.GOOGLE_SPREADSHEET_RANGE ||
      'Disease Information Staging!A:Z';

    this.running = true;
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    const report: ImportReport = {
      startedAt,
      completedAt: '',
      mode,
      targetRange: effectiveTargetRange,
      processed: 0,
      successful: 0,
      warnings: 0,
      failed: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      failures: [],
    };

    this.writeLog('log', 'run:start', 'Starting document import.', {
      mode,
      targetRange: effectiveTargetRange,
      folders: foldersToScan.length,
      incremental: Boolean(this.lastSyncAt),
    });

    const validationLogEntries: any[][] = [];

    try {
      const files = await this.googleSheets.listGoogleDocs(foldersToScan, this.lastSyncAt || undefined);
      this.writeLog('log', 'drive:list', 'Google Docs & docx files discovered.', {
        count: files.length,
        incrementalAfter: this.lastSyncAt || null,
      });

      // Deduplicate files by ID
      const uniqueFiles = Array.from(new Map(files.map((f: any) => [f.id, f])).values());
      const rows: Record<string, any>[] = [];

      for (const file of uniqueFiles as any[]) {
        if (ARCHIVED_DOC_IDS.has(file.id)) {
          this.writeLog('log', 'document:skip', 'Skipping archived doc.', {
            documentId: file.id,
            documentName: file.name,
            reason: 'Marked as ARCHIVED in Legacy Review',
          });
          continue;
        }

        if (NON_DISEASE_NAME_REGEX.test(file.name?.trim() || '')) {
          this.writeLog('log', 'document:skip', 'Skipping non-disease document.', {
            documentId: file.id,
            documentName: file.name,
            reason: 'Matches non-disease template or project plan',
          });
          continue;
        }

        report.processed++;
        this.writeLog('log', 'document:start', 'Processing document.', {
          documentId: file.id,
          documentName: file.name,
          modifiedTime: file.modifiedTime,
          mimeType: file.mimeType,
        });

        try {
          let parsedResult: any;

          const isDocx =
            file.mimeType?.includes('openxmlformats') ||
            file.name?.toLowerCase().endsWith('.docx');

          if (isDocx) {
            // Check for local file or download from Drive
            const localDocxPath = path.join(process.cwd(), file.name || 'cholangiocarcinoma.docx');
            if (fs.existsSync(localDocxPath)) {
              this.writeLog('debug', 'document:docx', 'Reading docx from local filesystem cache.', { path: localDocxPath });
              parsedResult = await parseDocxFile(localDocxPath, file.name.replace(/\.docx$/i, ''));
            } else {
              this.writeLog('debug', 'document:docx', 'Downloading docx from Drive as binary buffer.', { fileId: file.id });
              const buffer = await this.googleSheets.getDriveFileBuffer(file.id);
              parsedResult = await parseDocxFile(buffer, file.name.replace(/\.docx$/i, ''));
            }
          } else {
            const document = await this.googleSheets.getGoogleDoc(file.id);
            parsedResult = parseGoogleDocJson(document.data);
          }

          if (!parsedResult.name && file.name) {
            parsedResult.name = file.name.replace(/\.docx$/i, '').trim();
          }

          // Serialize all 10 sections into RBM v1 format
          const rbmOverview = serializeRbm(parsedResult.sections.overview);
          const rbmCauses = serializeRbm(parsedResult.sections.causes);
          const rbmTypesSymptoms = serializeRbm(parsedResult.sections.typesSymptoms);
          const rbmDiagnosis = serializeRbm(parsedResult.sections.diagnosis);
          const rbmLifestyle = serializeRbm(parsedResult.sections.lifestyle);
          const rbmResearch = serializeRbm(parsedResult.sections.research);
          const rbmFaqs = serializeRbm(parsedResult.sections.faqs);
          const rbmMyths = serializeRbm(parsedResult.sections.myths);
          const rbmSpecialists = serializeRbm(parsedResult.sections.specialists);
          const rbmSources = serializeRbm(parsedResult.sections.sources);

          const fullSourceContent = [
            rbmOverview,
            rbmCauses,
            rbmTypesSymptoms,
            rbmDiagnosis,
            rbmLifestyle,
            rbmResearch,
            rbmFaqs,
            rbmMyths,
            rbmSpecialists,
            rbmSources,
          ].join('');

          const sourceHash = createHash('sha256').update(fullSourceContent).digest('hex').slice(0, 16);

          const rawRecord: Record<string, any> = {
            name: parsedResult.name,
            category: parsedResult.categories.join(', '),
            overview: rbmOverview,
            causes: rbmCauses,
            typesAndSymptoms: rbmTypesSymptoms,
            diagnosis: rbmDiagnosis,
            lifestyleAndDailySupport: rbmLifestyle,
            treatmentsAndPharma: rbmResearch,
            faqs: rbmFaqs,
            factsMyths: rbmMyths,
            specialists: rbmSpecialists,
            sources: rbmSources,
            docUrl: file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
            docId: file.id,
            lastSynced: new Date().toISOString(),
            formatVersion: 'rbm:1',
            validationStatus: parsedResult.validation.some((v: any) => v.severity === 'error') ? 'INVALID' : 'VALID',
            sourceHash,
            approved: true,
          };

          const validation = this.validation.validateDiseaseData(rawRecord);

          // Record validation log
          validationLogEntries.push([
            new Date().toISOString(),
            parsedResult.name,
            file.id,
            validation.valid ? 'VALID' : 'INVALID',
            validation.errors.join('; ') || 'None',
            parsedResult.validation.filter((v: any) => v.severity === 'warning').map((v: any) => v.message).join('; ') || 'None',
            parsedResult.coverage ? `${(parsedResult.coverage.ratio * 100).toFixed(1)}%` : '100%',
          ]);

          if (!validation.valid) {
            report.failed++;
            report.failures.push({ documentId: file.id, documentName: file.name, errors: validation.errors });
            this.writeLog('warn', 'document:validation', 'Document failed validation.', {
              documentId: file.id,
              documentName: file.name,
              errors: validation.errors,
            });
            continue;
          }

          if (!validation.sanitized.diseaseNumber) {
            validation.sanitized.diseaseNumber = createStableDiseaseNumber(file.id);
          }
          const sheetRecord = {
            ...rawRecord,
            diseaseNumber: validation.sanitized.diseaseNumber,
          };
          rows.push(sheetRecord);
          report.successful++;
          this.writeLog('log', 'document:success', 'Document validated and queued for Sheets.', {
            documentId: file.id,
            documentName: file.name,
            diseaseName: validation.sanitized.name,
            category: validation.sanitized.category,
          });
        } catch (error: any) {
          const message = this.errorMessage(error);
          report.failed++;
          report.failures.push({ documentId: file.id, documentName: file.name, errors: [message] });
          this.writeLog('error', 'document:error', 'Document processing failed.', {
            documentId: file.id,
            documentName: file.name,
            error: message,
          });
        }
      }

      if (rows.length) {
        this.writeLog('log', 'sheets:write', `Writing validated rows to Google Sheets (${effectiveTargetRange}).`, {
          rows: rows.length,
          targetRange: effectiveTargetRange,
        });

        const spreadsheetId = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '';
        const writeResult = await this.googleSheets.upsertDiseaseRows(rows, spreadsheetId, effectiveTargetRange);
        report.inserted = writeResult.inserted;
        report.updated = writeResult.updated;
        report.unchanged = writeResult.unchanged || 0;
        this.writeLog('log', 'sheets:write', 'Google Sheets write completed.', writeResult);
      } else {
        this.writeLog('warn', 'sheets:write', 'No valid rows were available for Google Sheets.', {
          processed: report.processed,
          failed: report.failed,
        });
      }

      // Append audit logs to Google Sheets
      if (validationLogEntries.length > 0) {
        await this.googleSheets.appendValidationLogs(validationLogEntries);
        this.writeLog('log', 'sheets:audit', 'Appended entries to Validation Log tab.', {
          count: validationLogEntries.length,
        });
      }

      const syncLogEntry = [
        new Date().toISOString(),
        mode,
        report.processed,
        report.successful,
        report.failed,
        report.inserted,
        report.updated,
        report.unchanged,
      ];
      await this.googleSheets.appendSyncLog(syncLogEntry);

      report.warnings = report.processed - report.successful - report.failed;
      report.completedAt = new Date().toISOString();

      if (report.failed === 0) {
        this.lastSyncAt = report.completedAt;
      }
      this.latestReport = report;
      this.writeLog('log', 'run:complete', 'Document import completed.', {
        ...this.summary(report),
        durationMs: Date.now() - startedAtMs,
      });

      return report;
    } catch (error: any) {
      const message = this.errorMessage(error);
      report.error = message;
      report.failed = Math.max(report.failed, 1);
      report.completedAt = new Date().toISOString();
      report.failures.push({ documentId: 'pipeline', documentName: 'Automation pipeline', errors: [message] });
      this.latestReport = report;
      this.writeLog('error', 'run:error', 'Automation pipeline failed.', {
        error: message,
        durationMs: Date.now() - startedAtMs,
      });
      throw error;
    } finally {
      this.running = false;
      this.writeLog('debug', 'run:finally', 'Import lock released.');
    }
  }

  getStatus() {
    return {
      running: this.running,
      lastSyncAt: this.lastSyncAt || null,
      latestReport: this.latestReport,
      recentLogs: this.logs,
    };
  }

  getLogs(limit = 100) {
    const safeLimit = Math.max(1, Math.min(limit, this.maxLogs));
    return this.logs.slice(-safeLimit);
  }

  private summary(report: ImportReport) {
    return {
      targetRange: report.targetRange,
      processed: report.processed,
      successful: report.successful,
      failed: report.failed,
      inserted: report.inserted,
      updated: report.updated,
      unchanged: report.unchanged,
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
