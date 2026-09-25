import {
  parseCausesStructured,
  parseTypesStructured,
  parseSymptomsStructured,
  parseDiagnosticSteps,
  parseFaqs,
  parseFactsMyths,
  parseSpecialists,
  parseResearchOrgs,
  extractLinks,
  parseRichTextRuns,
  parseContentNodes,
  auditDiseaseParse,
  ParsedDisease,
} from './text-parser.util';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ TEST FAILED: ${message}`);
  }
}

console.log('🧪 Running Lossless Disease Parser & Pipeline Test Suite (13/13 Tests)...\n');

// Test 1 — Causes
const rawCauses = `Genetic Causes
CF is caused by mutations in the CFTR gene on chromosome 7.

Environmental Factors
Air pollutants and respiratory infections can exacerbate symptoms.`;
const causes = parseCausesStructured(rawCauses);
assert(causes.length === 2, 'Test 1: Causes count should be 2');
assert(causes[0].title.includes('Genetic Causes'), 'Test 1: Causes title 1 matched');
assert(causes[1].title.includes('Environmental Factors'), 'Test 1: Causes title 2 matched');
console.log('✓ Test 1 — Causes: PASSED');

// Test 2 — Types
const rawTypes = `Type 1
Severe form characterized by complete absence of functional protein.

Type 2
Milder residual function form leading to later onset.`;
const types = parseTypesStructured(rawTypes);
assert(types.length === 2, 'Test 2: Types count should be 2');
assert(types[0].title === 'Type 1', 'Test 2: Type 1 title matched');
assert(types[0].description.includes('complete absence'), 'Test 2: Type 1 description matched');
console.log('✓ Test 2 — Types: PASSED');

// Test 3 — Symptoms
const rawSymptoms = `Chronic cough: Persistent coughing with thick mucus.
Frequent lung infections: Recurring pneumonia and bronchitis.
Salty-tasting skin: Excess salt content in sweat output.`;
const symptoms = parseSymptomsStructured(rawSymptoms);
assert(symptoms.length === 3, 'Test 3: Symptoms count should be 3');
assert(symptoms[0].name === 'Chronic cough', 'Test 3: Symptom 1 name matched');
assert(symptoms[0].description === 'Persistent coughing with thick mucus.', 'Test 3: Symptom 1 description matched');
console.log('✓ Test 3 — Symptoms: PASSED');

// Test 4 — Diagnosis
const rawDiag = `Sweat Chloride Test
What it is: Measures salt concentration in sweat.
How it works: Pilocarpine is applied to skin to stimulate sweat collection.
Result: Values above 60 mmol/L indicate CF.`;
const diag = parseDiagnosticSteps(rawDiag);
assert(diag.length === 1, 'Test 4: Diagnosis count should be 1');
assert(diag[0].name === 'Sweat Chloride Test', 'Test 4: Diagnosis step name matched');
assert(diag[0].what.includes('salt concentration'), 'Test 4: Diagnosis what matched');
assert(diag[0].how.includes('Pilocarpine is applied'), 'Test 4: Diagnosis how matched');
assert(diag[0].result.includes('above 60 mmol/L'), 'Test 4: Diagnosis result matched');
console.log('✓ Test 4 — Diagnosis: PASSED');

// Test 5 — FAQ (Q1/A1)
const rawFaq1 = `Q1. What is Cystic Fibrosis?
A. CF is an inherited disorder affecting mucus glands.

Q2. How is it treated?
A. Treatments include airway clearance and gene modulators.`;
const faqs1 = parseFaqs(rawFaq1);
assert(faqs1.length === 2, 'Test 5: FAQ count should be 2');
assert(faqs1[0].question.includes('What is Cystic Fibrosis?'), 'Test 5: FAQ 1 Q matched');
assert(faqs1[0].answer.includes('inherited disorder'), 'Test 5: FAQ 1 A matched');
console.log('✓ Test 5 — FAQ (Q1/A1): PASSED');

// Test 6 — FAQ without A
const rawFaq2 = `What causes CF?
Mutations in the CFTR gene cause protein malfunction.
This leads to thick sticky mucus in lungs and organs.

Can CF be cured?
Currently there is no cure, but therapies manage symptoms effectively.`;
const faqs2 = parseFaqs(rawFaq2);
assert(faqs2.length === 2, 'Test 6: Implied FAQ count should be 2');
assert(faqs2[0].question === 'What causes CF?', 'Test 6: Implied FAQ 1 Q matched');
assert(faqs2[0].answer.includes('Mutations in the CFTR gene'), 'Test 6: Implied FAQ 1 A matched');
console.log('✓ Test 6 — FAQ (implied answer): PASSED');

// Test 7 — Facts vs Myths
const rawMyths = `Myth: Cystic fibrosis is contagious.
Fact: CF is a genetic condition and cannot be caught from someone else.

Myth: People with CF cannot exercise.
Fact: Regular physical activity is highly encouraged to clear mucus.`;
const myths = parseFactsMyths(rawMyths);
assert(myths.length === 2, 'Test 7: Myth/Fact pairs count should be 2');
const myth1Text = String(myths[0].statement || myths[0].myth?.[0]?.text || '');
assert(myth1Text.includes('contagious'), 'Test 7: Myth 1 statement matched');
console.log('✓ Test 7 — Facts vs Myths: PASSED');

// Test 8 — Specialists
const rawSpec = `Specialist Name: Dr. Jane Doe
Profession: Pulmonologist
Specialization: Pediatric CF
Organization: Children Hospital
Location: Boston, MA
Contact: jane.doe@hospital.org

Specialist Name: Dr. John Smith
Profession: Geneticist
Specialization: Gene Therapy
Organization: Mayo Clinic
Location: Rochester, MN`;
const specialists = parseSpecialists(rawSpec);
assert(specialists.length === 2, 'Test 8: Specialists count should be 2');
assert(specialists[0].name === 'Dr. Jane Doe', 'Test 8: Specialist 1 name matched');
assert(specialists[0].profession === 'Pulmonologist', 'Test 8: Specialist 1 profession matched');
assert(specialists[1].organization === 'Mayo Clinic', 'Test 8: Specialist 2 organization matched');
console.log('✓ Test 8 — Specialists: PASSED');

// Test 9 — Specialist Sources
const rawSpecSrc = `Specialist Name: Dr. Alice Green
Organization: Global Health
Sources: https://clinicaltrials.gov/ct2/show/NCT01234567`;
const specWithSrc = parseSpecialists(rawSpecSrc);
assert(specWithSrc[0].sources.includes('https://clinicaltrials.gov/ct2/show/NCT01234567'), 'Test 9: Specialist source URL extracted');
console.log('✓ Test 9 — Specialist Sources: PASSED');

// Test 10 — Research Organizations
const rawResearch = `Research Org Name: Vertex Pharmaceuticals
Drug Name: Trikafta
Clinical Stage: Phase 3
Status: Approved
Official Website: https://www.vrtx.com`;
const research = parseResearchOrgs(rawResearch);
assert(research.length === 1, 'Test 10: Research org count should be 1');
assert(research[0].name === 'Vertex Pharmaceuticals', 'Test 10: Research name matched');
assert(research[0].drugName === 'Trikafta', 'Test 10: Research drug matched');
assert(research[0].stage === 'Phase 3', 'Test 10: Research stage matched');
assert(research[0].url === 'https://www.vrtx.com', 'Test 10: Research URL matched');
console.log('✓ Test 10 — Research Organizations: PASSED');

// Test 11 — URLs
const textWithUrls = 'Visit https://cff.org or [NIH Portal](https://nih.gov) or www.example.org';
const links = extractLinks(textWithUrls);
assert(links.length === 3, 'Test 11: Links count should be 3');
assert(links[0].url === 'https://cff.org', 'Test 11: Link 1 url matched');
assert(links[1].label === 'NIH Portal', 'Test 11: Link 2 label matched');
assert(links[1].url === 'https://nih.gov', 'Test 11: Link 2 url matched');
console.log('✓ Test 11 — URLs: PASSED');

// Test 12 — Formatting
const textFormat = 'This is **bold** and *italic* and [link](https://example.com)';
const runs = parseRichTextRuns(textFormat);
assert(runs.some(r => r.bold && r.text === 'bold'), 'Test 12: Bold run matched');
assert(runs.some(r => r.italic && r.text === 'italic'), 'Test 12: Italic run matched');
assert(runs.some(r => r.link === 'https://example.com' && r.text === 'link'), 'Test 12: Link run matched');
console.log('✓ Test 12 — Formatting: PASSED');

// Test 13 — Unknown content to unclassified
const rawUnk = 'Unrecognized random line of clinical observation text.';
const nodes = parseContentNodes(rawUnk);
assert(nodes.length === 1, 'Test 13: ContentNode count should be 1');
assert(nodes[0].content?.[0].text.includes('Unrecognized random line') === true, 'Test 13: Content text preserved');

const dummyParsed: ParsedDisease = {
  name: [{ text: 'CF' }],
  category: [{ text: 'Genetic' }],
  overview: [{ text: 'Overview' }],
  causes: [],
  types: [],
  symptoms: [],
  diagnosis: [],
  lifestyle: { dailySupport: [], therapies: [], nutrition: [], devices: [], caregiverSupport: [], community: [] },
  research: [],
  faqs: [],
  factsMyths: [],
  specialists: [],
  sources: [],
  disclaimer: [],
  unclassified: nodes,
  audit: { sourceCharacters: 100, parsedCharacters: 100, sourceUrls: 0, parsedUrls: 0, sourceSections: 1, parsedSections: 14, missingContent: [], warnings: [], complete: true },
};

const audit = auditDiseaseParse({ test: rawUnk }, dummyParsed);
assert(audit.warnings.length > 0, 'Test 13: Audit warning generated for unclassified content');
assert(audit.complete === true, 'Test 13: Audit completed without loss');
console.log('✓ Test 13 — Unknown Content & Audit: PASSED');

console.log('\n🎉 ALL 13/13 LOSSLESS PARSER TESTS PASSED SUCCESSFULLY!');
