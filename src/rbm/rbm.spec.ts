import assert from 'assert';
import { Block, Span } from './rbm.schema';
import { serializeRbm, serializeSpans } from './rbm.serializer';
import { parseRbm, parseSpans, isRbmCell } from './rbm.parser';

function runTests() {
  console.log('--- Testing RBM v1 Package ---');

  // Test 1: Span serialization and parsing
  const testSpans: Span[] = [
    { t: 'Hello ' },
    { t: 'world', b: true },
    { t: ' and ' },
    { t: 'italic text', i: true },
    { t: ' plus ' },
    { t: 'underlined', u: true },
    { t: ' and a ' },
    { t: 'link here', href: 'https://example.org' },
    { t: '.' },
  ];

  const serializedSpans = serializeSpans(testSpans);
  console.log('Serialized spans:', serializedSpans);
  assert.strictEqual(
    serializedSpans,
    'Hello **world** and *italic text* plus <u>underlined</u> and a [link here](https://example.org).'
  );

  const parsedSpans = parseSpans(serializedSpans);
  assert.strictEqual(parsedSpans.length, testSpans.length);
  for (let i = 0; i < testSpans.length; i++) {
    assert.strictEqual(parsedSpans[i].t, testSpans[i].t, `Span ${i} text matches`);
    assert.strictEqual(Boolean(parsedSpans[i].b), Boolean(testSpans[i].b), `Span ${i} bold matches`);
    assert.strictEqual(Boolean(parsedSpans[i].i), Boolean(testSpans[i].i), `Span ${i} italic matches`);
    assert.strictEqual(Boolean(parsedSpans[i].u), Boolean(testSpans[i].u), `Span ${i} underline matches`);
    assert.strictEqual(parsedSpans[i].href, testSpans[i].href, `Span ${i} href matches`);
  }
  console.log('✓ Test 1: Spans round-trip PASSED');

  // Test 2: Paragraph block round-trip
  const blocks1: Block[] = [
    {
      type: 'paragraph',
      spans: [{ t: 'This is the first paragraph with ' }, { t: 'bold text', b: true }, { t: '.' }],
    },
    {
      type: 'paragraph',
      spans: [{ t: 'Second paragraph with a ' }, { t: 'link', href: 'https://rarebridge.org' }, { t: '.' }],
    },
  ];

  const rbm1 = serializeRbm(blocks1);
  assert(isRbmCell(rbm1), 'Must start with RBM header');
  const parsed1 = parseRbm(rbm1);
  assert.deepStrictEqual(parsed1, blocks1, 'Paragraphs must round-trip losslessly');
  console.log('✓ Test 2: Paragraph blocks round-trip PASSED');

  // Test 3: Labeled items round-trip
  const blocks2: Block[] = [
    {
      type: 'labeled',
      label: 'Simple Explanation',
      body: [{ t: 'A rare condition affecting the adrenal glands.' }],
    },
    {
      type: 'labeled',
      label: 'Genetic Causes',
      body: [{ t: 'Mutations in the ' }, { t: 'TP53', b: true }, { t: ' gene.' }],
    },
  ];

  const rbm2 = serializeRbm(blocks2);
  const parsed2 = parseRbm(rbm2);
  assert.deepStrictEqual(parsed2, blocks2, 'Labeled blocks must round-trip losslessly');
  console.log('✓ Test 3: Labeled blocks round-trip PASSED');

  // Test 4: List blocks with indentation and labels
  const blocks3: Block[] = [
    {
      type: 'list',
      label: 'Common Symptoms',
      items: [
        { spans: [{ t: 'Fatigue and muscle weakness' }], level: 0 },
        { spans: [{ t: 'Weight gain around abdomen' }], level: 0 },
        { spans: [{ t: 'Hypertension and rapid heart rate' }], level: 1 },
      ],
    },
    {
      type: 'list',
      items: [
        { spans: [{ t: 'Standalone bullet one' }], level: 0 },
        { spans: [{ t: 'Nested child bullet' }], level: 1 },
      ],
    },
  ];

  const rbm3 = serializeRbm(blocks3);
  const parsed3 = parseRbm(rbm3);
  assert.deepStrictEqual(parsed3, blocks3, 'List blocks must round-trip losslessly');
  console.log('✓ Test 4: List blocks round-trip PASSED');

  // Test 5: Records (Specialists and Orgs)
  const blocks4: Block[] = [
    {
      type: 'record',
      kind: 'specialist',
      fields: [
        { label: 'Specialist Name', body: [{ t: 'Dr. Jane Doe, MD' }] },
        { label: 'Profession', body: [{ t: 'Pediatric Neurologist' }] },
        { label: 'Organization', body: [{ t: 'Mayo Clinic' }] },
        { label: 'Location', body: [{ t: 'Rochester, MN, USA' }] },
        { label: 'Contact Information', body: [{ t: 'contact@mayo.edu' }] },
      ],
    },
    {
      type: 'record',
      kind: 'org',
      fields: [
        { label: 'Pharma/Research Org Name', body: [{ t: 'Castleman Disease Collaborative Network' }] },
        { label: 'Focus Area', body: [{ t: 'Translational research for Castleman disease.' }] },
        { label: 'Official Website', body: [{ t: 'Official Website', href: 'https://cdcn.org' }] },
      ],
    },
  ];

  const rbm4 = serializeRbm(blocks4);
  const parsed4 = parseRbm(rbm4);
  assert.deepStrictEqual(parsed4, blocks4, 'Record blocks must round-trip losslessly');
  console.log('✓ Test 5: Record blocks round-trip PASSED');

  // Test 6: Groups with nested blocks
  const blocks5: Block[] = [
    {
      type: 'group',
      title: 'Current Treatment Approaches',
      blocks: [
        {
          type: 'labeled',
          label: 'Surgical Resection',
          body: [{ t: 'Complete surgical removal of the tumor remains primary therapy.' }],
        },
        {
          type: 'labeled',
          label: 'Mitotane Therapy',
          body: [{ t: 'Adrenolytic medication used as adjuvant treatment.' }],
        },
      ],
    },
    {
      type: 'group',
      title: 'Clinical Trials & Organizations',
      blocks: [
        {
          type: 'record',
          kind: 'org',
          fields: [
            { label: 'Pharma/Research Org Name', body: [{ t: 'ACC Research Alliance' }] },
            { label: 'Official Website', body: [{ t: 'Website', href: 'https://acc-alliance.org' }] },
          ],
        },
      ],
    },
  ];

  const rbm5 = serializeRbm(blocks5);
  const parsed5 = parseRbm(rbm5);
  assert.deepStrictEqual(parsed5, blocks5, 'Group blocks must round-trip losslessly');
  console.log('✓ Test 6: Group blocks round-trip PASSED');

  console.log('\nAll RBM v1 tests passed successfully! 🎉');
}

runTests();
