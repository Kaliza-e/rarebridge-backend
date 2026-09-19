import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { formatSheetValue } from './sheet-format.util';

@Injectable()
export class GoogleSheetsService {
  private sheets: any;
  private drive: any;
  private docs: any;

  constructor() {
    // Prefer inline JSON (production/Render) over key file path (local dev)
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
    const authConfig: any = {
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    };
    if (keyJson) {
      authConfig.credentials = JSON.parse(keyJson);
    } else {
      authConfig.keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    }
    const auth = new google.auth.GoogleAuth(authConfig);
    this.sheets = google.sheets({ version: 'v4', auth });
    this.drive = google.drive({ version: 'v3', auth });
    this.docs = google.docs({ version: 'v1', auth });
  }

  async listGoogleDocs(folderId: string, modifiedAfter?: string) {
    const clauses = [
      `'${folderId}' in parents`,
      "mimeType = 'application/vnd.google-apps.document'",
      'trashed = false',
    ];
    if (modifiedAfter) clauses.push(`modifiedTime > '${modifiedAfter}'`);

    const files: any[] = [];
    let pageToken: string | undefined;
    do {
      const response = await this.drive.files.list({
        q: clauses.join(' and '),
        fields: 'nextPageToken,files(id,name,modifiedTime,webViewLink,md5Checksum)',
        orderBy: 'modifiedTime asc',
        pageSize: 1000,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      files.push(...(response.data.files || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return files;
  }

  async getGoogleDoc(documentId: string) {
    return this.docs.documents.get({ documentId });
  }

  async upsertDiseaseRows(
    rows: Record<string, any>[],
    spreadsheetId = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '',
    range = process.env.SPREADSHEET_RANGE || process.env.GOOGLE_SPREADSHEET_RANGE || 'Disease Information!A:Z',
  ) {
    if (!spreadsheetId) throw new Error('Google Spreadsheet ID is not configured.');
    if (!rows.length) return { inserted: 0, updated: 0 };

    const headerResponse = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = headerResponse.data.values || [];
    if (!values.length) throw new Error(`Sheet range ${range} must contain a header row.`);

    const headers = values[0].map((header: string) => this.mapHeaderToField(header));
    const keyColumn = headers.indexOf('diseaseNumber');
    if (keyColumn < 0) throw new Error('Sheet must contain a Disease Number column.');
    const sheetName = range.split('!')[0].replace(/^'|'$/g, '');
    const existing = new Map<string, number>();
    values.slice(1).forEach((row: any[], index: number) => {
      const key = String(row[keyColumn] || '').trim();
      if (key) existing.set(key, index + 2);
    });

    const updates: any[] = [];
    const inserts: any[][] = [];
    let updated = 0;
    for (const row of rows) {
      const serialized = headers.map((header: string) => this.serializeSheetValue(row[header], header));
      const existingRow = existing.get(String(row.diseaseNumber).trim());
      if (existingRow) {
        updates.push({ range: `'${sheetName}'!A${existingRow}:${this.columnName(headers.length)}${existingRow}`, values: [serialized] });
        updated++;
      } else {
        inserts.push(serialized);
      }
    }

    if (updates.length) {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'RAW', data: updates },
      });
    }
    if (inserts.length) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:${this.columnName(headers.length)}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: inserts },
      });
    }
    return { inserted: inserts.length, updated };
  }

  private serializeSheetValue(value: any, field: string): string {
    return formatSheetValue(value, field);
  }

  private columnName(columnNumber: number): string {
    let result = '';
    let n = columnNumber;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }


  async importDiseases(
    spreadsheetId: string = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '', 
    range: string = process.env.SPREADSHEET_RANGE || process.env.GOOGLE_SPREADSHEET_RANGE || 'Disease Information!A:Z'
  ) {
    if (!spreadsheetId) {
      throw new Error('Google Spreadsheet ID is not configured.');
    }
    try {
      // First try fetching full grid data to capture hyperlinks, rich text, and formulas
      try {
        const gridResponse = await this.sheets.spreadsheets.get({
          spreadsheetId,
          ranges: [range],
          fields: 'sheets(data(rowData(values(formattedValue,hyperlink,textFormatRuns,userEnteredValue))))',
        });

        const sheet = gridResponse.data?.sheets?.[0];
        const rowData = sheet?.data?.[0]?.rowData;

        if (rowData && rowData.length > 0) {
          const headerRow = rowData[0]?.values || [];
          const headers = headerRow.map((c: any) => (c?.formattedValue || '').trim());
          console.log('Google Sheets headers (from grid):', headers);

          const dataRows = rowData.slice(1);
          const diseases = dataRows.map((row: any) => {
            const disease: any = {};
            const cells = row?.values || [];
            headers.forEach((header: string, index: number) => {
              if (!header) return;
              const key = this.mapHeaderToField(header);
              const cell = cells[index];
              disease[key] = this.extractCellValueWithHyperlinks(cell);
            });
            return disease;
          });

          return diseases;
        }
      } catch (gridError: any) {
        console.warn('Could not fetch rich grid data from Google Sheets, falling back to values.get:', gridError?.message);
      }

      // Fallback: standard values.get
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        throw new Error('No data found in spreadsheet');
      }

      const headers = rows[0];
      console.log('Google Sheets headers (from values.get):', headers);
      const dataRows = rows.slice(1);

      const diseases = dataRows.map((row: any[]) => {
        const disease: any = {};
        headers.forEach((header: string, index: number) => {
          const key = this.mapHeaderToField(header);
          disease[key] = row[index] || '';
        });
        return disease;
      });

      return diseases;
    } catch (error) {
      console.error('Error importing from Google Sheets:', error);
      throw error;
    }
  }

  /**
   * Extract cell value preserving any embedded hyperlinks, formula hyperlinks, or rich text links.
   */
  private extractCellValueWithHyperlinks(cell: any): string {
    if (!cell) return '';

    // 1. Check if user entered a =HYPERLINK("url", "label") formula
    const formula = cell.userEnteredValue?.formulaValue;
    if (formula && typeof formula === 'string') {
      const hyperlinkMatch = formula.match(/=HYPERLINK\(\s*["']([^"']+)["'](?:\s*,\s*["']([^"']*)["'])?\s*\)/i);
      if (hyperlinkMatch) {
        const url = hyperlinkMatch[1];
        const label = hyperlinkMatch[2] || cell.formattedValue || url;
        return `[${label}](${url})`;
      }
    }

    const formattedValue = cell.formattedValue !== undefined && cell.formattedValue !== null
      ? String(cell.formattedValue)
      : (cell.userEnteredValue?.stringValue || '');

    // 2. Check if whole cell has a direct hyperlink
    if (cell.hyperlink && typeof cell.hyperlink === 'string') {
      const link = cell.hyperlink.trim();
      if (link) {
        if (!formattedValue || formattedValue.trim() === link) {
          return link;
        }
        return `[${formattedValue}](${link})`;
      }
    }

    // 3. Check if cell has rich text format runs with embedded links
    if (Array.isArray(cell.textFormatRuns) && cell.textFormatRuns.length > 0 && formattedValue) {
      const runs = cell.textFormatRuns;
      let result = '';
      for (let i = 0; i < runs.length; i++) {
        const startIndex = runs[i].startIndex || 0;
        const endIndex = i + 1 < runs.length ? (runs[i + 1].startIndex || formattedValue.length) : formattedValue.length;
        const textSegment = formattedValue.slice(startIndex, endIndex);
        const linkUri = runs[i].format?.link?.uri;
        if (linkUri && textSegment.trim()) {
          result += `[${textSegment}](${linkUri})`;
        } else {
          result += textSegment;
        }
      }
      if (result) return result;
    }

    return formattedValue;
  }

  private mapHeaderToField(header: string): string {
    if (!header || typeof header !== 'string') return '';

    const cleaned = header
      .replace(/^\s*#+\s*/, '')
      .replace(/^\s*\d+[.)]?\s*/, '')
      .replace(/^[•·▪▸►→\-–—*]\s*/, '')
      .replace(/\s*:.*$/, '')
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\+/g, ' and ')
      .replace(/[\/]/g, ' ')
      .replace(/[.,()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const headerMap: { [key: string]: string } = {
      // Disease No.
      'disease no': 'diseaseNumber',
      'disease number': 'diseaseNumber',
      'disease': 'diseaseNumber',
      'no': 'diseaseNumber',

      // Disease name
      'disease name': 'name',
      'name': 'name',

      // Category
      'category': 'category',
      'categories': 'category',

      // Overview
      'overview': 'overview',
      'description': 'overview',
      'summary': 'overview',
      'simple explanation': 'overview',
      'medical description': 'overview',

      // Causes
      'causes': 'causes',
      'cause': 'causes',
      'genetic causes': 'causes',
      'environmental factors': 'causes',
      'unknown causes': 'causes',

      // Types and symptoms
      'types and symptoms': 'typesAndSymptoms',
      'causes types and symptoms': 'typesAndSymptoms',
      'symptoms': 'typesAndSymptoms',
      'types': 'typesAndSymptoms',
      'common symptoms': 'typesAndSymptoms',

      // Diagnosis
      'diagnosis': 'diagnosis',
      'diagnostic': 'diagnosis',
      'diagnostics': 'diagnosis',
      'diagnostic methods': 'diagnosis',

      // Lifestyle and daily support + community
      'lifestyle and daily support and community': 'lifestyleAndDailySupport',
      'lifestyle and daily support community': 'lifestyleAndDailySupport',
      'lifestyle and daily support': 'lifestyleAndDailySupport',
      'lifestyle and support': 'lifestyleAndDailySupport',
      'lifestyle': 'lifestyleAndDailySupport',

      // Research and pharma directory / Treatments & Research Directory
      'treatments and research directory': 'treatmentsAndPharma',
      'treatments and research': 'treatmentsAndPharma',
      'treatments and pharma directory': 'treatmentsAndPharma',
      'treatments and pharma': 'treatmentsAndPharma',
      'research and pharma directory': 'treatmentsAndPharma',
      'research and pharma': 'treatmentsAndPharma',
      'research directory': 'treatmentsAndPharma',
      'research': 'treatmentsAndPharma',
      'pharma directory': 'treatmentsAndPharma',
      'treatments': 'treatmentsAndPharma',

      // FAQs
      'faqs': 'faqs',
      'faq': 'faqs',
      'faqs for a disease': 'faqs',
      'faq for a disease': 'faqs',
      'frequently asked questions': 'faqs',
      'frequently asked questions faqs': 'faqs',

      // Facts vs. Myths
      'facts vs myths': 'factsMyths',
      'fact vs myth': 'factsMyths',
      'facts and myths': 'factsMyths',
      'myths and facts': 'factsMyths',
      'facts': 'factsMyths',
      'myths': 'factsMyths',

      // Specialist directory
      'specialist directory': 'specialists',
      'specialists directory': 'specialists',
      'specialist': 'specialists',
      'specialists': 'specialists',
      'specialist directory and contacts': 'specialists',
      'specialist directory contacts': 'specialists',
      'specialist information': 'specialists',
      'specialists information': 'specialists',
      'speacislist directory': 'specialists', // typo fallback
      'doctors': 'specialists',
      'physicians': 'specialists',

      // Sources
      'sources': 'sources',
      'source': 'sources',
      'source directory': 'sources',
      'references': 'sources',
      'reference': 'sources',
    };

    if (headerMap[cleaned]) return headerMap[cleaned];

    // Fallback keyword matching
    if (cleaned.includes('specialist') || cleaned.includes('doctor') || cleaned.includes('physician')) return 'specialists';
    if (cleaned.includes('treatment') || cleaned.includes('pharma') || cleaned.includes('research org')) return 'treatmentsAndPharma';
    if (cleaned.includes('myth') || cleaned.includes('fact')) return 'factsMyths';
    if (cleaned.includes('faq') || cleaned.includes('frequently asked')) return 'faqs';
    if (cleaned.includes('source') || cleaned.includes('reference')) return 'sources';
    if (cleaned.includes('lifestyle') || cleaned.includes('daily support')) return 'lifestyleAndDailySupport';
    if (cleaned.includes('diagnos')) return 'diagnosis';
    if (cleaned.includes('symptom')) return 'typesAndSymptoms';
    if (cleaned.includes('cause')) return 'causes';
    if (cleaned.includes('overview') || cleaned.includes('summary')) return 'overview';
    if (cleaned.includes('name')) return 'name';
    if (cleaned.includes('category')) return 'category';

    const normalizedHeader = header.toLowerCase().replace(/\s+/g, ' ').trim();
    return headerMap[normalizedHeader] || normalizedHeader;
  }

  async parseNestedData(data: string, type: 'faq' | 'factMyth' | 'specialist' | 'source'): Promise<any[]> {
    if (!data || typeof data !== 'string') return [];

    // This is a placeholder - you'll need to adjust the parsing logic
    // based on how your data is structured in the Google Sheets
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // If not JSON, parse based on your sheet format
      return [];
    }
  }
}
