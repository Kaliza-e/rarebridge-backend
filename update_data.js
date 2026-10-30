const fs = require('fs');

let content = fs.readFileSync('rarebridge-frontend/src/app/data.ts', 'utf8');

// 1. Add diseaseNumber to each disease in FALLBACK_DISEASES
content = content.replace(
  'id: "amyloidosis",\r\n    name: "Amyloidosis",',
  'id: "amyloidosis",\r\n    diseaseNumber: "1",\r\n    name: "Amyloidosis",'
);

content = content.replace(
  'id: "adrenocortical-carcinoma",\r\n    name: "Adrenocortical Carcinoma",',
  'id: "adrenocortical-carcinoma",\r\n    diseaseNumber: "2",\r\n    name: "Adrenocortical Carcinoma",'
);

content = content.replace(
  'id: "alexander-disease",\r\n    name: "Alexander Disease",',
  'id: "alexander-disease",\r\n    diseaseNumber: "3",\r\n    name: "Alexander Disease",'
);

content = content.replace(
  'id: "batten-disease",\r\n    name: "Batten Disease",',
  'id: "batten-disease",\r\n    diseaseNumber: "5",\r\n    name: "Batten Disease",'
);

content = content.replace(
  'id: "angiosarcoma",\r\n    name: "Angiosarcoma",',
  'id: "angiosarcoma",\r\n    diseaseNumber: "6",\r\n    name: "Angiosarcoma",'
);

content = content.replace(
  'id: "als",\r\n    name: "Amyotrophic Lateral Sclerosis",',
  'id: "als",\r\n    diseaseNumber: "7",\r\n    name: "Amyotrophic Lateral Sclerosis",'
);

content = content.replace(
  'id: "adrenoleukodystrophy",\r\n    name: "Adrenoleukodystrophy",',
  'id: "adrenoleukodystrophy",\r\n    diseaseNumber: "4",\r\n    name: "Adrenoleukodystrophy",'
);

// 2. Move Adrenoleukodystrophy block to position 4 (before Batten Disease)
// Find the start of Batten Disease
const battenIdx = content.indexOf('  {\r\n    id: "batten-disease",');
// Find the start of Adrenoleukodystrophy
const aldStartIdx = content.indexOf('  {\r\n    id: "adrenoleukodystrophy",');
const aldEndIdx = content.indexOf('\r\n];\r\n\r\n// Helper function to extract plain text');

if (battenIdx === -1 || aldStartIdx === -1 || aldEndIdx === -1) {
  console.error('Indices not found:', { battenIdx, aldStartIdx, aldEndIdx });
  process.exit(1);
}

const aldBlock = content.slice(aldStartIdx, aldEndIdx);
// Remove ALD block and preceding comma/newline
let beforeAld = content.slice(0, aldStartIdx);
if (beforeAld.endsWith(',\r\n')) {
  beforeAld = beforeAld.slice(0, -3); // remove ',\r\n'
}
const afterAld = content.slice(aldEndIdx);

let newContent = beforeAld + afterAld;

// Now insert ALD block before Batten Disease
const newBattenIdx = newContent.indexOf('  {\r\n    id: "batten-disease",');
newContent = newContent.slice(0, newBattenIdx) + aldBlock + ',\r\n' + newContent.slice(newBattenIdx);

// 3. Ensure transformed apiDisease uses diseaseNumber || id consistently
newContent = newContent.replace(
  'id: apiDisease.id || apiDisease.diseaseNumber || apiDisease.name.toLowerCase().replace(/\\s+/g, "-"),',
  'id: apiDisease.diseaseNumber || apiDisease.id || apiDisease.name.toLowerCase().replace(/\\s+/g, "-"),'
);

fs.writeFileSync('rarebridge-frontend/src/app/data.ts', newContent, 'utf8');
console.log('Successfully updated rarebridge-frontend/src/app/data.ts');

