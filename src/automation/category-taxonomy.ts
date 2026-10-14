export interface CategoryChip {
  name: string;
  key: string;
  description: string;
}

export const CANONICAL_CATEGORY_CHIPS: CategoryChip[] = [
  { name: 'Neurological', key: 'neurological', description: 'Neurodegenerative, leukodystrophy, motor neuron, and prion disorders' },
  { name: 'Genetic', key: 'genetic', description: 'Single-gene, hereditary, and chromosomal disorders' },
  { name: 'Cancer', key: 'cancer', description: 'Malignant neoplasms, sarcomas, carcinomas, and rare tumors' },
  { name: 'Vascular', key: 'vascular', description: 'Blood vessel diseases, vasculitis, stroke, and vascular malformations' },
  { name: 'Autoimmune', key: 'autoimmune', description: 'Autoimmune, autoinflammatory, and fibro-inflammatory conditions' },
  { name: 'Metabolic', key: 'metabolic', description: 'Inborn errors of metabolism, storage disorders, and enzyme deficiencies' },
  { name: 'Endocrine', key: 'endocrine', description: 'Hormonal, adrenal, pituitary, and endocrine gland disorders' },
  { name: 'Multi-System', key: 'multi-system', description: 'Systemic diseases involving 3 or more organ systems' },
  { name: 'Pulmonary', key: 'pulmonary', description: 'Lung, respiratory, and pleural disorders' },
  { name: 'Musculoskeletal', key: 'musculoskeletal', description: 'Connective tissue, bone, joint, and muscle disorders' },
  { name: 'Hepatobiliary', key: 'hepatobiliary', description: 'Liver, gallbladder, and bile duct disorders' },
];

export const CHIP_NAME_BY_KEY: Record<string, string> = Object.fromEntries(
  CANONICAL_CATEGORY_CHIPS.map(c => [c.key, c.name])
);

export const CHIP_KEY_BY_NAME: Record<string, string> = Object.fromEntries(
  CANONICAL_CATEGORY_CHIPS.map(c => [c.name.toLowerCase(), c.key])
);

/**
 * Seeded mapping of normalized disease name to canonical category keys.
 * Derived from Disease.docx and approved taxonomy.
 */
export const DISEASE_TAXONOMY_MAP: Record<string, string[]> = {
  amyloidosis: ['multi-system', 'metabolic', 'genetic'],
  'adrenocortical carcinoma': ['cancer', 'endocrine'],
  'alexander disease': ['neurological', 'genetic'],
  adrenoleukodystrophy: ['neurological', 'endocrine', 'genetic'],
  'batten disease': ['neurological', 'genetic'],
  angiosarcoma: ['cancer', 'vascular'],
  'amyotrophic lateral sclerosis': ['neurological'],
  als: ['neurological'],
  cholangiocarcinoma: ['cancer', 'hepatobiliary'],
  chordoma: ['cancer', 'musculoskeletal', 'neurological'],
  'castleman disease': ['autoimmune', 'multi-system'],
  cadasil: ['neurological', 'vascular', 'genetic'],
  'glioblastoma multiforme': ['cancer', 'neurological'],
  glioblastoma: ['cancer', 'neurological'],
  'guillain barre syndrome': ['autoimmune', 'neurological'],
  'guillain-barre syndrome': ['autoimmune', 'neurological'],
  'huntingtons disease': ['neurological', 'genetic'],
  'huntington disease': ['neurological', 'genetic'],
  'creutzfeldt jakob disease': ['neurological'],
  'creutzfeldt-jakob disease': ['neurological'],
  'cystic fibrosis': ['pulmonary', 'genetic'],
  'behcets disease': ['autoimmune', 'vascular'],
  'behcet disease': ['autoimmune', 'vascular'],
  'erdheim chester disease': ['cancer', 'multi-system'],
  'erdheim-chester disease': ['cancer', 'multi-system'],
  'ehlers danlos syndrome': ['musculoskeletal', 'genetic', 'vascular'],
  'ehlers-danlos syndrome': ['musculoskeletal', 'genetic', 'vascular'],
  'gaucher disease': ['metabolic', 'genetic'],
  'kawasaki disease': ['autoimmune', 'vascular'],
  'kaposi sarcoma': ['cancer', 'vascular'],
  'igg4 related disease': ['autoimmune', 'multi-system'],
  'igg4-related disease': ['autoimmune', 'multi-system'],
  'merkel cell carcinoma': ['cancer'],
  mesothelioma: ['cancer', 'pulmonary'],
  'moyamoya disease': ['neurological', 'vascular'],
  'krabbe disease': ['neurological', 'metabolic', 'genetic'],
  krabbe: ['neurological', 'metabolic', 'genetic'],
  'neurofibromatosis type 2': ['neurological', 'genetic', 'cancer'],
  'neurofibromatosis type 2 nf2-related schwannomatosis': ['neurological', 'genetic', 'cancer'],
  'niemann pick disease': ['metabolic', 'genetic', 'neurological'],
  'niemann-pick disease': ['metabolic', 'genetic', 'neurological'],
  pheochromocytoma: ['endocrine', 'cancer'],
};

/**
 * Normalizes disease name for taxonomy lookup.
 */
export function normalizeForTaxonomy(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFC')
    .replace(/^[\s\d.#\-+]+/, '')
    .replace(/['"’`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves canonical categories for a disease.
 * Uses the taxonomy map first, and falls back to parsing raw doc category string.
 */
export function resolveCategories(
  diseaseName: string,
  rawDocCategory?: string
): { categories: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const normalizedName = normalizeForTaxonomy(diseaseName);

  if (DISEASE_TAXONOMY_MAP[normalizedName]) {
    const keys = DISEASE_TAXONOMY_MAP[normalizedName];
    const categoryNames = keys.map(k => CHIP_NAME_BY_KEY[k] || k);
    return { categories: categoryNames, warnings };
  }

  // Fallback: parse raw category string from Doc
  if (!rawDocCategory) {
    warnings.push(`No category specified for disease "${diseaseName}". Defaulted to Multi-System.`);
    return { categories: ['Multi-System'], warnings };
  }

  // Clean raw string: split on comma, slash, hyphen, semicolon, plus, 'and'
  const tokens = rawDocCategory
    .split(/[,;\/\+\-]|(?:\band\b)/i)
    .map(t => t.trim().toLowerCase())
    .filter(t => Boolean(t) && t.length > 1);

  const matchedKeys = new Set<string>();

  for (const token of tokens) {
    // Check direct match
    if (CHIP_KEY_BY_NAME[token]) {
      matchedKeys.add(CHIP_KEY_BY_NAME[token]);
      continue;
    }

    // Heuristic mapping for dialect terms
    if (token.includes('neuro') || token.includes('brain') || token.includes('nerve') || token.includes('prion')) {
      matchedKeys.add('neurological');
    } else if (token.includes('gene') || token.includes('heredit') || token.includes('leukodystrophy')) {
      matchedKeys.add('genetic');
    } else if (token.includes('cancer') || token.includes('sarcoma') || token.includes('carcinoma') || token.includes('tumor')) {
      matchedKeys.add('cancer');
    } else if (token.includes('vascular') || token.includes('vessel') || token.includes('arter') || token.includes('stroke')) {
      matchedKeys.add('vascular');
    } else if (token.includes('autoimmun') || token.includes('autoinflamm') || token.includes('immune') || token.includes('lymph')) {
      matchedKeys.add('autoimmune');
    } else if (token.includes('metabol') || token.includes('storage') || token.includes('enzyme')) {
      matchedKeys.add('metabolic');
    } else if (token.includes('endocrin') || token.includes('adrenal') || token.includes('hormon')) {
      matchedKeys.add('endocrine');
    } else if (token.includes('lung') || token.includes('pulmon') || token.includes('respir')) {
      matchedKeys.add('pulmonary');
    } else if (token.includes('bone') || token.includes('connective') || token.includes('muscle')) {
      matchedKeys.add('musculoskeletal');
    } else if (token.includes('liver') || token.includes('hepat') || token.includes('bile')) {
      matchedKeys.add('hepatobiliary');
    } else {
      warnings.push(`Unrecognized category term "${token}" in raw category "${rawDocCategory}".`);
    }
  }

  if (matchedKeys.size === 0) {
    warnings.push(`Could not map category "${rawDocCategory}" to taxonomy. Defaulted to Multi-System.`);
    return { categories: ['Multi-System'], warnings };
  }

  const result = Array.from(matchedKeys).map(k => CHIP_NAME_BY_KEY[k] || k);
  return { categories: result, warnings };
}
