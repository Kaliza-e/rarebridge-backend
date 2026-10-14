import path from 'path';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import { extractDocLines, matchSectionHeader, extractLabeled, parseDiagnosisSection } from './text-docs-parser.service';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '../../service-account-key.json'),
  scopes: ['https://www.googleapis.com/auth/documents.readonly'],
});

async function main() {
  const docs = google.docs({ version: 'v1', auth });

  console.log('--- Debugging Batten Doc ---');
  const battenRes = await docs.documents.get({ documentId: '1D-wVjWkWD190KgtIZC1fqAGEPATkIZFd4yXNsXtBvNQ' });
  const battenLines = extractDocLines(battenRes.data, []);
  console.log(`Extracted ${battenLines.length} lines from Batten.`);
  let currentSec = null;
  for (const l of battenLines) {
    const m = matchSectionHeader(l.text);
    if (m) {
      console.log(`Matched header [${m}] on line: "${l.text}"`);
      currentSec = m;
    } else if (currentSec === 'overview') {
      console.log(`Line in overview: "${l.text}"`);
    }
  }

  console.log('\n--- Debugging Castleman Diagnosis ---');
  const castlemanRes = await docs.documents.get({ documentId: '1d69lpPTqCGl0yzdB-LPp7xBeWcEO3-Ev0K7vEOrvACM' });
  const castlemanLines = extractDocLines(castlemanRes.data, []);
  const diagLines = [];
  let inDiag = false;
  for (const l of castlemanLines) {
    const m = matchSectionHeader(l.text);
    if (m === 'diagnosis') {
      inDiag = true;
    } else if (m && inDiag) {
      inDiag = false;
    } else if (inDiag) {
      diagLines.push(l);
    }
  }
  console.log(`Castleman has ${diagLines.length} lines in diagnosis.`);
  for (let i = 0; i < Math.min(15, diagLines.length); i++) {
    console.log(`Diag line ${i + 1} (isBold=${diagLines[i].isBold}, isHeading=${diagLines[i].isHeading}): "${diagLines[i].text}"`);
  }
}

main().catch(console.error);
