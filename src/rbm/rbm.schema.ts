import { z } from 'zod';

export const SpanSchema = z.object({
  t: z.string(),
  b: z.boolean().optional(),
  i: z.boolean().optional(),
  u: z.boolean().optional(),
  href: z.string().optional(),
});

export type Span = z.infer<typeof SpanSchema>;

export const ListItemSchema = z.object({
  spans: z.array(SpanSchema),
  level: z.number().int().min(0).default(0),
});

export type ListItem = z.infer<typeof ListItemSchema>;

export const LabeledFieldSchema = z.object({
  label: z.string(),
  body: z.array(SpanSchema),
});

export type LabeledField = z.infer<typeof LabeledFieldSchema>;

export type ParagraphBlock = {
  type: 'paragraph';
  spans: Span[];
};

export type LabeledBlock = {
  type: 'labeled';
  label: string;
  body: Span[];
};

export type ListBlock = {
  type: 'list';
  label?: string;
  items: ListItem[];
};

export type RecordBlock = {
  type: 'record';
  kind: 'specialist' | 'org';
  fields: LabeledField[];
};

export type GroupBlock = {
  type: 'group';
  title: string;
  blocks: Block[];
};

export type Block =
  | ParagraphBlock
  | LabeledBlock
  | ListBlock
  | RecordBlock
  | GroupBlock;

export const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('paragraph'),
      spans: z.array(SpanSchema),
    }),
    z.object({
      type: z.literal('labeled'),
      label: z.string(),
      body: z.array(SpanSchema),
    }),
    z.object({
      type: z.literal('list'),
      label: z.string().optional(),
      items: z.array(ListItemSchema),
    }),
    z.object({
      type: z.literal('record'),
      kind: z.enum(['specialist', 'org']),
      fields: z.array(LabeledFieldSchema),
    }),
    z.object({
      type: z.literal('group'),
      title: z.string(),
      blocks: z.array(BlockSchema),
    }),
  ])
);

export const IssueSeveritySchema = z.enum(['error', 'warn', 'info']);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const IssueSchema = z.object({
  diseaseId: z.string().optional(),
  section: z.string().optional(),
  severity: IssueSeveritySchema,
  message: z.string(),
});

export type Issue = z.infer<typeof IssueSchema>;

export const DiseaseSectionsSchema = z.object({
  overview: z.array(BlockSchema).default([]),
  causes: z.array(BlockSchema).default([]),
  typesSymptoms: z.array(BlockSchema).default([]),
  diagnosis: z.array(BlockSchema).default([]),
  lifestyle: z.array(BlockSchema).default([]),
  research: z.array(BlockSchema).default([]),
  faqs: z.array(BlockSchema).default([]),
  myths: z.array(BlockSchema).default([]),
  specialists: z.array(BlockSchema).default([]),
  sources: z.array(BlockSchema).default([]),
});

export type DiseaseSections = z.infer<typeof DiseaseSectionsSchema>;

export const DiseaseSchema = z.object({
  diseaseNumber: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  sections: DiseaseSectionsSchema,
  validation: z.array(IssueSchema).default([]),
});

export type Disease = z.infer<typeof DiseaseSchema>;
