import { Block, Span, GroupBlock, RecordBlock, ListBlock, LabeledBlock, ParagraphBlock, ListItem, LabeledField } from './rbm.schema';
import { RBM_HEADER, spansToPlainText, blocksToPlainText } from './rbm.serializer';

export function isRbmCell(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return text.trimStart().startsWith('<!--rbm:');
}

/**
 * Parses inline formatting: [text](href), <u>text</u>, **bold**, *italic*.
 */
export function parseSpans(input: string): Span[] {
  if (!input) return [];

  const spans: Span[] = [];
  let index = 0;
  const len = input.length;

  function addSpan(t: string, b?: boolean, i?: boolean, u?: boolean, href?: string) {
    if (!t) return;
    const cleanT = t.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    const last = spans[spans.length - 1];
    if (
      last &&
      Boolean(last.b) === Boolean(b) &&
      Boolean(last.i) === Boolean(i) &&
      Boolean(last.u) === Boolean(u) &&
      last.href === href
    ) {
      last.t += cleanT;
    } else {
      const s: Span = { t: cleanT };
      if (b) s.b = true;
      if (i) s.i = true;
      if (u) s.u = true;
      if (href) s.href = href;
      spans.push(s);
    }
  }

  // Regex token pattern for inline markdown: links (with balanced parens in URL), underline, bold-italic, bold, italic
  const tokenRegex = /(\[([\s\S]*?)\]\(((?:https?:\/\/|\/)[^\s\)]*(?:\([^\s\)]*\)[^\s\)]*)*|[^\s\)]+)\))|(<u>([\s\S]*?)<\/u>)|(\*\*\*([\s\S]*?)\*\*\*)|(\*\*([\s\S]*?)\*\*)|(\*([\s\S]*?)\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(input)) !== null) {
    const matchStart = match.index;
    if (matchStart > lastIndex) {
      addSpan(input.substring(lastIndex, matchStart));
    }

    if (match[1]) {
      // Link: [inner](url)
      const linkText = match[2];
      const linkHref = match[3];
      // Recursively parse inside link text
      const innerSpans = parseSpans(linkText);
      for (const sp of innerSpans) {
        addSpan(sp.t, sp.b, sp.i, sp.u, linkHref);
      }
    } else if (match[4]) {
      // Underline: <u>inner</u>
      const innerText = match[5];
      const innerSpans = parseSpans(innerText);
      for (const sp of innerSpans) {
        addSpan(sp.t, sp.b, sp.i, true, sp.href);
      }
    } else if (match[6]) {
      // Bold + Italic: ***inner***
      const innerText = match[7];
      const innerSpans = parseSpans(innerText);
      for (const sp of innerSpans) {
        addSpan(sp.t, true, true, sp.u, sp.href);
      }
    } else if (match[8]) {
      // Bold: **inner**
      const innerText = match[9];
      const innerSpans = parseSpans(innerText);
      for (const sp of innerSpans) {
        addSpan(sp.t, true, sp.i, sp.u, sp.href);
      }
    } else if (match[10]) {
      // Italic: *inner*
      const innerText = match[11];
      const innerSpans = parseSpans(innerText);
      for (const sp of innerSpans) {
        addSpan(sp.t, sp.b, true, sp.u, sp.href);
      }
    }

    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < len) {
    addSpan(input.substring(lastIndex));
  }

  return spans;
}

function unescapeLine(line: string): string {
  if (line.startsWith('\\')) {
    const after = line.substring(1);
    if (/^(\#{1,6}\s|\-\s|@@|\*\*|\\[#\-@*])/.test(after)) {
      return after;
    }
  }
  return line;
}

export function parseRbm(content: string): Block[] {
  if (!content || typeof content !== 'string') return [];

  let text = content.trim();
  // Strip header <!--rbm:1--> or <!--rbm:cont n/N-->
  if (text.startsWith('<!--rbm:')) {
    text = text.replace(/^<!--rbm:[^>]+-->\r?\n?/, '').trim();
  }

  if (!text) return [];

  const rawLines = text.split(/\r?\n/);
  const blocks: Block[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Group: ## Title
    const groupMatch = trimmed.match(/^##\s+(.*)$/);
    if (groupMatch) {
      const title = groupMatch[1].trim();
      i++;
      // Collect all lines until the next group ##
      const groupLines: string[] = [];
      while (i < rawLines.length && !rawLines[i].trim().match(/^##\s+/)) {
        groupLines.push(rawLines[i]);
        i++;
      }
      const innerBlocks = parseRbm(groupLines.join('\n'));
      blocks.push({
        type: 'group',
        title,
        blocks: innerBlocks,
      });
      continue;
    }

    // 2. Record: @@specialist or @@org ... @@end
    const recordMatch = trimmed.match(/^@@(specialist|org)$/);
    if (recordMatch) {
      const kind = recordMatch[1] as 'specialist' | 'org';
      i++;
      const fields: LabeledField[] = [];
      while (i < rawLines.length && rawLines[i].trim() !== '@@end') {
        const fLine = rawLines[i].trim();
        if (fLine) {
          const fieldMatch = fLine.match(/^\*\*([^:]+):\*\*\s*(.*)$/);
          if (fieldMatch) {
            fields.push({
              label: fieldMatch[1].trim(),
              body: parseSpans(fieldMatch[2].trim()),
            });
          }
        }
        i++;
      }
      if (i < rawLines.length && rawLines[i].trim() === '@@end') {
        i++; // skip @@end
      }
      blocks.push({
        type: 'record',
        kind,
        fields,
      });
      continue;
    }

    // 3. Labeled item OR Labeled item followed by bullets
    const labeledMatch = line.match(/^\*\*([^:]+):\*\*(.*)$/);
    if (labeledMatch) {
      const label = labeledMatch[1].trim();
      const bodyRest = labeledMatch[2].trim();

      // Look ahead: is the next non-empty line a bullet line?
      let nextLineIndex = i + 1;
      while (nextLineIndex < rawLines.length && !rawLines[nextLineIndex].trim()) {
        nextLineIndex++;
      }

      const nextIsBullet =
        nextLineIndex < rawLines.length &&
        /^\s*-\s+/.test(rawLines[nextLineIndex]);

      if (nextIsBullet && !bodyRest) {
        // This is a List with a label
        i = nextLineIndex;
        const items: ListItem[] = [];
        while (i < rawLines.length) {
          const bLine = rawLines[i];
          const bMatch = bLine.match(/^(\s*)-\s+(.*)$/);
          if (bMatch) {
            const indentSpaces = bMatch[1].length;
            const level = Math.floor(indentSpaces / 2);
            items.push({
              spans: parseSpans(bMatch[2].trim()),
              level,
            });
            i++;
          } else {
            break;
          }
        }
        blocks.push({
          type: 'list',
          label,
          items,
        });
        continue;
      } else {
        // Standard labeled block
        blocks.push({
          type: 'labeled',
          label,
          body: parseSpans(bodyRest),
        });
        i++;
        continue;
      }
    }

    // 4. Standalone bullet list
    const bulletMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (bulletMatch) {
      const items: ListItem[] = [];
      while (i < rawLines.length) {
        const bLine = rawLines[i];
        const bMatch = bLine.match(/^(\s*)-\s+(.*)$/);
        if (bMatch) {
          const indentSpaces = bMatch[1].length;
          const level = Math.floor(indentSpaces / 2);
          items.push({
            spans: parseSpans(bMatch[2].trim()),
            level,
          });
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: 'list',
        items,
      });
      continue;
    }

    // 5. Paragraph
    const paraLines: string[] = [];
    while (i < rawLines.length) {
      const curLine = rawLines[i];
      const curTrimmed = curLine.trim();
      if (!curTrimmed) break;
      // Stop if next line is a special construct start
      if (
        curTrimmed.startsWith('## ') ||
        curTrimmed.startsWith('@@') ||
        /^\*\*([^:]+):\*\*/.test(curTrimmed) ||
        /^\s*-\s+/.test(curLine)
      ) {
        break;
      }
      paraLines.push(unescapeLine(curLine));
      i++;
    }

    if (paraLines.length > 0) {
      const fullPara = paraLines.join('\n');
      blocks.push({
        type: 'paragraph',
        spans: parseSpans(fullPara),
      });
    }
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPED BACKWARD-COMPATIBILITY EXTRACTORS
// ─────────────────────────────────────────────────────────────────────────────

export function extractSpansLinks(spans: Span[]): Array<{ url: string; label?: string }> {
  const links: Array<{ url: string; label?: string }> = [];
  if (!spans || !Array.isArray(spans)) return links;
  for (const s of spans) {
    if (s.href) {
      links.push({ url: s.href, label: s.t });
    }
  }
  return links;
}

export function extractSpecialistsFromBlocks(blocks: Block[]): any[] {
  const specialists: any[] = [];
  const allBlocks: Block[] = [];
  function collect(bl: Block[]) {
    for (const b of bl) {
      if (b.type === 'group') collect(b.blocks);
      else allBlocks.push(b);
    }
  }
  collect(blocks);

  for (const b of allBlocks) {
    if (b.type === 'record') {
      const getField = (pattern: RegExp) => {
        const found = b.fields.find(f => pattern.test(f.label));
        return found ? spansToPlainText(found.body).trim() : '';
      };

      const name = getField(/name|doctor|physician/i);
      if (!name) continue;

      const profession = getField(/profession/i);
      const specialization = getField(/specializ/i);
      const organization = getField(/organiza/i);
      const location = getField(/location/i);
      const contact = getField(/contact/i);
      const publications = getField(/publication/i);

      // Collect links from all fields
      const links: Array<{ url: string; label?: string }> = [];
      const sources: string[] = [];
      for (const f of b.fields) {
        const fieldLinks = extractSpansLinks(f.body);
        for (const l of fieldLinks) {
          links.push(l);
          sources.push(l.url);
        }
      }

      specialists.push({
        name,
        profession,
        specialization,
        organization,
        location,
        contact: contact || null,
        publications,
        sources: Array.from(new Set(sources)),
        links,
        focus: specialization || profession || '',
        why: '',
      });
    }
  }
  return specialists;
}

export function extractFaqsFromBlocks(blocks: Block[]): any[] {
  const faqs: any[] = [];
  let order = 0;
  for (const b of blocks) {
    if (b.type === 'labeled') {
      faqs.push({
        question: b.label,
        answer: spansToPlainText(b.body).trim(),
        order: order++,
      });
    } else if (b.type === 'record') {
      const qField = b.fields.find(f => /question/i.test(f.label));
      const aField = b.fields.find(f => /answer/i.test(f.label));
      if (qField) {
        faqs.push({
          question: spansToPlainText(qField.body).trim(),
          answer: aField ? spansToPlainText(aField.body).trim() : '',
          order: order++,
        });
      }
    }
  }
  return faqs;
}

export function extractFactsMythsFromBlocks(blocks: Block[]): any[] {
  const list: any[] = [];
  let order = 0;
  for (const b of blocks) {
    if (b.type === 'group' && /^Myth:\s*/i.test(b.title)) {
      const myth = b.title.replace(/^Myth:\s*/i, '').trim();
      const factBlock = b.blocks.find(inner => inner.type === 'labeled' && /fact/i.test(inner.label)) as LabeledBlock | undefined;
      const fact = factBlock ? spansToPlainText(factBlock.body).trim() : '';
      list.push({
        myth,
        fact,
        statement: myth,
        explanation: fact,
        isFact: false,
        order: order++,
      });
    } else if (b.type === 'record') {
      const mField = b.fields.find(f => /myth/i.test(f.label));
      const fField = b.fields.find(f => /fact/i.test(f.label));
      if (mField) {
        const myth = spansToPlainText(mField.body).trim();
        const fact = fField ? spansToPlainText(fField.body).trim() : '';
        list.push({
          myth,
          fact,
          statement: myth,
          explanation: fact,
          isFact: false,
          order: order++,
        });
      }
    }
  }
  return list;
}

export function extractSourcesFromBlocks(blocks: Block[]): any[] {
  const sources: any[] = [];
  for (const b of blocks) {
    if (b.type === 'record') {
      const title = b.fields.find(f => /title|name/i.test(f.label));
      const url = b.fields.find(f => /url|link/i.test(f.label));
      const desc = b.fields.find(f => /desc/i.test(f.label));
      const typ = b.fields.find(f => /type/i.test(f.label));
      sources.push({
        title: title ? spansToPlainText(title.body).trim() : 'Reference',
        url: url ? spansToPlainText(url.body).trim() : null,
        description: desc ? spansToPlainText(desc.body).trim() : '',
        type: typ ? spansToPlainText(typ.body).trim() : 'Reference',
      });
    } else if (b.type === 'labeled') {
      const links = extractSpansLinks(b.body);
      sources.push({
        title: b.label,
        url: links[0]?.url || null,
        description: spansToPlainText(b.body).trim(),
        type: 'Reference',
      });
    } else if (b.type === 'paragraph') {
      const links = extractSpansLinks(b.spans);
      for (const l of links) {
        sources.push({
          title: l.label || l.url,
          url: l.url,
          description: spansToPlainText(b.spans).trim(),
          type: 'Reference',
        });
      }
    }
  }
  return sources;
}

export function extractResearchFromBlocks(blocks: Block[]): {
  treatmentSections: any[];
  clinicalTrials: any[];
  researchOrganizations: any[];
} {
  const treatmentSections: any[] = [];
  const clinicalTrials: any[] = [];
  const researchOrganizations: any[] = [];

  for (const b of blocks) {
    if (b.type === 'group') {
      const isTrialGroup = /clinical\s*trials?/i.test(b.title);
      const isTreatGroup = /treatments?/i.test(b.title);

      const orgs: any[] = [];
      for (const child of b.blocks) {
        if (child.type === 'record') {
          const nameField = child.fields.find(f => /name|org/i.test(f.label));
          const focusField = child.fields.find(f => /focus/i.test(f.label));
          const siteField = child.fields.find(f => /website|url/i.test(f.label));
          const siteLinks = siteField ? extractSpansLinks(siteField.body) : [];
          const name = nameField ? spansToPlainText(nameField.body).trim() : 'Organization';
          const focus = focusField ? spansToPlainText(focusField.body).trim() : '';
          const url = siteLinks[0]?.url || (siteField ? spansToPlainText(siteField.body).trim() : null);

          orgs.push({ name, focus, url, links: siteLinks });
        }
      }

      if (isTrialGroup) {
        clinicalTrials.push(...orgs);
      } else if (isTreatGroup) {
        treatmentSections.push({ title: b.title, kind: 'treatment', organizations: orgs });
      } else {
        researchOrganizations.push(...orgs);
      }
    } else if (b.type === 'record') {
      const nameField = b.fields.find(f => /name|org/i.test(f.label));
      const focusField = b.fields.find(f => /focus/i.test(f.label));
      const siteField = b.fields.find(f => /website|url/i.test(f.label));
      const siteLinks = siteField ? extractSpansLinks(siteField.body) : [];
      const name = nameField ? spansToPlainText(nameField.body).trim() : 'Organization';
      const focus = focusField ? spansToPlainText(focusField.body).trim() : '';
      const url = siteLinks[0]?.url || (siteField ? spansToPlainText(siteField.body).trim() : null);

      researchOrganizations.push({ name, focus, url, links: siteLinks });
    }
  }

  return { treatmentSections, clinicalTrials, researchOrganizations };
}

