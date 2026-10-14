import path from 'path';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import { parseGoogleDocJson } from './text-docs-parser.service';
import { serializeRbm } from '../rbm/rbm.serializer';
import { parseRbm } from '../rbm/rbm.parser';
import assert from 'assert';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '../../service-account-key.json'),
  scopes: ['https://www.googleapis.com/auth/documents.readonly'],
});

async function testDoc(docId: string, label: string) {
  const docs = google.docs({ version: 'v1', auth });
  console.log(`\n================ Testing Doc: ${label} (${docId}) ================`);
  const res = await docs.documents.get({ documentId: docId });
  const parsed = parseGoogleDocJson(res.data);

  console.log(`Disease Name: "${parsed.name}"`);
  console.log(`Aliases:`, parsed.aliases);
  console.log(`Categories:`, parsed.categories);
  console.log(`Sections overview:`);
  for (const [secKey, blocks] of Object.entries(parsed.sections)) {
    console.log(`  - ${secKey}: ${blocks.length} blocks`);
  }

  console.log(`Validation Issues (${parsed.validation.length}):`);
  for (const v of parsed.validation) {
    console.log(`  [${v.severity.toUpperCase()}] ${v.section ? '(' + v.section + ') ' : ''}${v.message}`);
  }

  // Round-trip test through RBM for each section
  for (const [secKey, blocks] of Object.entries(parsed.sections)) {
    if (blocks.length > 0) {
      const rbm = serializeRbm(blocks);
      const readBack = parseRbm(rbm);
      assert.deepStrictEqual(
        readBack,
        blocks,
        `Section "${secKey}" in "${label}" must round-trip losslessly through RBM!`
      );
    }
  }
  console.log(`✓ All sections round-tripped losslessly through RBM for ${label}!`);
  return parsed;
}

async function run() {
  const fixtures = [
    { id: '1deXXytv15LTm0CWUmvL52hhN2o4gGwi0amptTfmaqDU', name: 'Adrenocortical Carcinoma' },
    { id: '1LGOEvRhDXXbX3-btoUg3WhSdwm8qvmulvQDStiVqurc', name: 'Adrenoleukodystrophy' },
    { id: '1vYw555MvuwEKZXpwb5Cr7kWJmYV-3-ZQ8Dwj9TxT0Tc', name: 'Alexander Disease' },
    { id: '1naRnHkLZxZvD3DH6A9jsT5flF3ZpX7azU8sNF9oMY4A', name: 'Amyloidosis' },
    { id: '1l1GYvVNlnUBZ8be_ZpfSx_NZmGZP2AT-NaZtNg9RL9Q', name: 'Amyotrophic Lateral Sclerosis' },
    { id: '18pY-0_gtkaGcHx83zz1V7xtsOdL3ZVu-bh00c_KDwwY', name: 'Angiosarcoma' },
    { id: '1D-wVjWkWD190KgtIZC1fqAGEPATkIZFd4yXNsXtBvNQ', name: 'Batten Disease' },
    { id: '1DxV5PQ-JjncidsY-4PGdM-7HbNA8z0zjbMMtXi0AxEI', name: "Behçet's Disease" },
    { id: '1d69lpPTqCGl0yzdB-LPp7xBeWcEO3-Ev0K7vEOrvACM', name: 'Castleman Disease' },
    { id: '1Rf50McTpbHWvQ_GtGLI-BOAoE1hHa02WPa3ncuFHdxA', name: 'Krabbe Disease' },
    { id: '1IPU1mM1H3Jf9CAYJzvkzYtxtZbtenFfUDqkqq9Qobj0', name: 'Pheochromocytoma' },
  ];

  let passed = 0;
  let failed = 0;
  for (const f of fixtures) {
    try {
      await testDoc(f.id, f.name);
      passed++;
    } catch (err: any) {
      console.error(`FAILED: ${f.name}:`, err.message);
      failed++;
    }
  }

  console.log(`\n================ SUMMARY ================`);
  console.log(`Passed: ${passed}/${fixtures.length}`);
  console.log(`Failed: ${failed}/${fixtures.length}`);
}

run();
