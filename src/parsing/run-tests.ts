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
  parseStructuredSections,
  parseLifestyleSection,
  parseResearchSections,
  auditDiseaseParse,
  ParsedDisease,
} from './text-parser.util';
import { ValidationService } from '../validation/validation.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ TEST FAILED: ${message}`);
  }
}

console.log('🧪 Running Lossless Disease Parser & Pipeline Test Suite (19 tests)...\n');

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
Photo URL: https://example.org/photos/jane-doe.jpg
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
assert(specialists[0].photoUrl === 'https://example.org/photos/jane-doe.jpg', 'Test 8: explicit HTTPS source photo is retained');
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
  metadata: { diseaseNumber: '1', name: 'CF', category: 'Genetic' },
  name: [{ text: 'CF' }],
  category: [{ text: 'Genetic' }],
  overview: [{ text: 'Overview' }],
  causes: [],
  types: [],
  symptoms: [],
  typesAndSymptomsSections: [],
  diagnosis: [],
  diagnosisSections: [],
  lifestyle: { dailySupport: [], therapies: [], nutrition: [], devices: [], caregiverSupport: [], community: [], sections: [], communities: [] },
  research: [],
  researchSections: [],
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

// Test 14 — Chordoma section hierarchy is preserved instead of being flattened as symptoms
const chordomaTypesAndSymptoms = `Types of Chordoma (by Location)

● Skull Base (Clival) Chordoma — Forms at the base of the skull, near the brainstem.
● Spinal (Mobile Spine) Chordoma — Forms in the vertebrae of the neck, mid-back, or lower back.

Types of Chordoma (by Tumor Type)

● Conventional Chordoma — The most common type; grows relatively slowly.

Common Symptoms

Symptoms depend on location.

● Persistent back, neck, or tailbone pain
● Headaches (especially with skull base tumors)

Severity

Chordoma can recur even after treatment.

Age of Appearance

Most often diagnosed between 40 and 70 years old.`;
const chordomaSections = parseStructuredSections(chordomaTypesAndSymptoms);
assert(chordomaSections.length === 5, 'Test 14: Chordoma has five preserved source subsections');
assert(chordomaSections[0].title === 'Types of Chordoma (by Location)', 'Test 14: location heading retained');
assert(chordomaSections[1].title === 'Types of Chordoma (by Tumor Type)', 'Test 14: tumor type heading retained');
assert(chordomaSections[2].title === 'Common Symptoms', 'Test 14: symptoms heading retained');
assert(chordomaSections[3].raw.includes('Chordoma can recur'), 'Test 14: severity content retained');
assert(chordomaSections[4].raw.includes('40 and 70'), 'Test 14: age of appearance retained');
console.log('✓ Test 14 — Chordoma subsection hierarchy: PASSED');

// Test 15 — A therapy category remains distinct and is not merged with the community
const chordomaLifestyle = parseLifestyleSection(`Lifestyle & Daily Support

Therapies

● Physical therapy — helps rebuild strength and balance.
● Occupational therapy — supports daily tasks.

Diet/Nutrition

No special diet is recommended.

Community Links

● Chordoma Connections (Global): Join the forum at [Chordoma Connections](https://example.org/forum).
● European Support Network: Localized resources at https://example.org/europe.`);
assert(chordomaLifestyle.sections.map(section => section.title).join('|') === 'Therapies|Diet/Nutrition|Community Links', 'Test 15: lifestyle subsections retained in order');
assert(chordomaLifestyle.therapies.length === 2, 'Test 15: therapy entries remain separate');
assert(chordomaLifestyle.communities.length === 2, 'Test 15: individual community resources remain separate');
assert(chordomaLifestyle.communities[0].url === 'https://example.org/forum', 'Test 15: first community URL is linked to its own entry');
assert(chordomaLifestyle.communities[1].url === 'https://example.org/europe', 'Test 15: second community URL is linked to its own entry');
console.log('✓ Test 15 — Therapy and community grouping: PASSED');

// Test 16 — Treatment and trial source headings remain separate.
const researchSections = parseResearchSections(`Treatments:
Surgery aims to remove the tumor.

Clinical trials:
•Pharma/Research Org Name: Example Research Center
Focus Area: A recruiting study.
Official Website: [Study page](https://example.org/trial)`);
assert(researchSections.length === 2, 'Test 16: treatment and trial headings remain separate');
assert(researchSections[0].kind === 'treatment' && researchSections[0].raw.includes('Surgery'), 'Test 16: treatment stays in treatment section');
assert(researchSections[0].organizations.length === 0, 'Test 16: treatment is not fabricated into research organization');
assert(researchSections[1].kind === 'clinicalTrials' && researchSections[1].organizations.length === 1, 'Test 16: trial organization is parsed separately');
assert(researchSections[1].organizations[0].url === 'https://example.org/trial', 'Test 16: trial external URL is preserved');
console.log('✓ Test 16 — Treatment and clinical trial separation: PASSED');

// Test 17 — Plain, name-first specialist profiles are parsed without fabricated fallback records.
const chordomaSpecialists = parseSpecialists(`Alessandro Gronchi, MD

•Profession: Surgical oncologist; Chair of the Sarcoma Service.

•Specialization: Sarcoma surgery and chordoma.

•Organization: National Cancer Institute.

•Location: Milan, Italy.

•Clinical-Trial Role: Principal Investigator for the SACRO study.

•Contact Information: alessandro@example.org

•Recent Publications: A recent chordoma consensus.

Univ.-Prof. Dr. Piero Fossati

•Profession: Radiation oncologist.

•Specialization: Particle therapy.`);
assert(chordomaSpecialists.length === 2, 'Test 17: name-first specialists are split into two explicit records');
assert(chordomaSpecialists[0].name === 'Alessandro Gronchi, MD', 'Test 17: specialist name and credentials retained');
assert(chordomaSpecialists[0].organization === 'National Cancer Institute.', 'Test 17: explicit specialist organization retained');
assert(chordomaSpecialists[0].additionalContent?.some(section => section.title?.[0]?.text === 'Clinical-Trial Role'), 'Test 17: non-standard specialist fields retained');
assert(chordomaSpecialists[1].name === 'Univ.-Prof. Dr. Piero Fossati', 'Test 17: second source specialist name retained');
console.log('✓ Test 17 — Name-first specialist records: PASSED');

// Test 18 — The validation/API model keeps Chordoma's field boundaries and parsed relationships.
const chordomaPipeline = new ValidationService().validateDiseaseData({
  diseaseNumber: '9',
  name: 'Chordoma',
  category: 'Cancer',
  overview: 'A rare cancer that forms near the skull base or spine.',
  causes: 'Most chordomas are not inherited.',
  typesAndSymptoms: chordomaTypesAndSymptoms,
  diagnosis: 'MRI and CT Scans\nWhat it is: Imaging tests.\nHow it works: They show soft tissue and bone.\nThe result: They reveal tumor location.',
  lifestyleAndDailySupport: `Lifestyle & Daily Support

Therapies

● Physical therapy — supports mobility.

Community Links

● Chordoma Connections: Join the forum at [Chordoma Connections](https://example.org/forum).`,
  treatmentsAndPharma: `Treatments:
Surgery is the main treatment.

Clinical trials:
•Pharma/Research Org Name: Example Research Center
Focus Area: A recruiting study.
Official Website: [Study page](https://example.org/trial)`,
  faqs: '1. What is chordoma?\nChordoma is a rare cancer.',
  factsMyths: 'Myth: Chordoma is a brain cancer.\nFact: It is a bone and soft-tissue cancer.',
  specialists: `Alessandro Gronchi, MD

•Profession: Surgical oncologist.

•Specialization: Chordoma surgery.

•Organization: National Cancer Institute.`,
});
assert(chordomaPipeline.valid, 'Test 18: Chordoma validates as a disease');
assert(chordomaPipeline.sanitized.typesAndSymptomsSections.length === 5, 'Test 18: API model retains Chordoma section hierarchy');
assert(chordomaPipeline.sanitized.typesStructured.length === 2, 'Test 18: only source type subsections are classified as types');
assert(chordomaPipeline.sanitized.symptomsStructured.length === 2, 'Test 18: only common symptom entries are classified as symptoms');
assert(chordomaPipeline.sanitized.treatmentSections[0].raw.includes('Surgery'), 'Test 18: treatment remains a separate source section');
assert(chordomaPipeline.sanitized.clinicalTrials[0].url === 'https://example.org/trial', 'Test 18: clinical-trial URL survives validation');
assert(chordomaPipeline.sanitized.lifestyleAndDailySupport.communities[0].url === 'https://example.org/forum', 'Test 18: disease-associated community URL survives validation');
assert(chordomaPipeline.sanitized.specialists.length === 1 && chordomaPipeline.sanitized.specialists[0].name === 'Alessandro Gronchi, MD', 'Test 18: source specialist remains associated with Chordoma');
assert(chordomaPipeline.sanitized.faqs.length === 1 && chordomaPipeline.sanitized.factsMyths.length === 1, 'Test 18: FAQ and fact/myth pairs stay distinct');
console.log('✓ Test 18 — Chordoma validation/API model: PASSED');

// Test 19 — Numbered Markdown sections pasted into Overview are routed to their matching tabs.
const combinedOverviewPipeline = new ValidationService().validateDiseaseData({
  diseaseNumber: '10',
  name: 'Example Genetic Condition',
  category: 'Genetic',
  overview: 'Genetic **1. Overview** This inherited condition has **important features**. **2. Causes** **Genetic Causes:** Changes in a gene. **3. Types & Symptoms** **Early-onset form:** Symptoms begin early. **Common Symptoms:** Fatigue and weakness. **4. Diagnosis** Blood testing confirms the condition. **5. Treatment & Management** Treatment supports symptoms. **6. Living with the condition** Families may need support.',
});
assert(combinedOverviewPipeline.valid, 'Test 19: combined overview validates as a disease');
assert(combinedOverviewPipeline.sanitized.overview.includes('This inherited condition'), 'Test 19: overview section is isolated');
assert(!combinedOverviewPipeline.sanitized.overview.includes('2. Causes'), 'Test 19: later numbered headings are removed from overview');
assert(combinedOverviewPipeline.sanitized.causesStructured.some((cause: any) => cause.explanation.includes('Changes in a gene')), 'Test 19: causes are extracted to the causes tab');
assert(combinedOverviewPipeline.sanitized.typesAndSymptomsSections.length > 0, `Test 19: types and symptoms are extracted to their tab (${combinedOverviewPipeline.sanitized.typesAndSymptomsRaw})`);
assert(combinedOverviewPipeline.sanitized.diagnosisSections.length > 0, 'Test 19: diagnosis is extracted to its tab');
assert(combinedOverviewPipeline.sanitized.treatmentSections.length > 0, 'Test 19: treatment is extracted to its tab');
assert(combinedOverviewPipeline.sanitized.lifestyleAndDailySupport.sections.length > 0, 'Test 19: lifestyle is extracted to its tab');
console.log('✓ Test 19 — Combined numbered overview routing: PASSED');

console.log('\n🎉 ALL 19/19 LOSSLESS PARSER TESTS PASSED SUCCESSFULLY!');
