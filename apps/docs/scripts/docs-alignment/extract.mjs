// MDX -> the three things this harness can check: fenced code blocks, the
// data-driven <Example …/> style MDX components, and prose.
//
// The scanner is line-based rather than one big regex. Fences nest inside
// <TabItem>, code blocks contain strings that themselves contain ``` runs, and a
// regex that gets either wrong silently drops or merges blocks — which would
// show up as "the docs are clean" rather than as a harness bug.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** MDX components whose props name a real element/prop and so are checkable. */
export const TAGGED_MDX_COMPONENTS = new Set([
  'Playground',
  'Example',
  'PropTable',
  'EventTable',
  'SlotTable',
  'PartTable',
  'MethodTable',
  'ComposedFrom',
  'TokenTable',
]);

export function listDocs(docsRoot) {
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.mdx?$/.test(e.name)) out.push(p);
    }
  })(docsRoot);
  return out.sort();
}

/** Section a page belongs to, used to rank findings by consumer impact. */
export function sectionOf(relPath) {
  const parts = relPath.split('/');
  if (parts.length === 1) return '(root)';
  if (parts[0] === 'guides' && parts[1] === 'frameworks') return 'guides/frameworks';
  if (parts[0] === 'guides' && parts[1] === 'recipes') return 'guides/recipes';
  return parts[0];
}

export function parseDoc(absPath, docsRoot) {
  const rel = relative(docsRoot, absPath);
  const src = readFileSync(absPath, 'utf8');
  const lines = src.split('\n');

  const blocks = [];
  const proseLines = [];
  let inFrontmatter = false;
  let fence = null; // { marker, indent, lang, meta, startLine, body: [] }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (i === 0 && line.trim() === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === '---') inFrontmatter = false;
      continue;
    }

    if (fence) {
      // A closing fence is the same marker char, at least as long, same indent,
      // and nothing but the marker on the line.
      const close = new RegExp(`^${escapeRe(fence.indent)}(${fence.marker[0]}{${fence.marker.length},})\\s*$`);
      if (close.test(line)) {
        blocks.push({
          lang: fence.lang,
          meta: fence.meta,
          // Dedent by the fence's own indent so JSX-nested blocks compile.
          code: fence.body.map((l) => (l.startsWith(fence.indent) ? l.slice(fence.indent.length) : l)).join('\n'),
          startLine: fence.startLine + 1, // first line of code
          fenceLine: fence.startLine,
          endLine: lineNo,
        });
        fence = null;
      } else {
        fence.body.push(line);
      }
      continue;
    }

    const open = /^([ \t]*)(`{3,}|~{3,})[ \t]*([A-Za-z0-9+#.-]*)[ \t]*(.*)$/.exec(line);
    if (open) {
      fence = {
        indent: open[1],
        marker: open[2],
        lang: (open[3] || '').toLowerCase(),
        meta: open[4] || '',
        startLine: lineNo,
        body: [],
      };
      continue;
    }

    proseLines.push({ line: lineNo, text: line });
  }

  const proseText = proseLines.map((p) => p.text).join('\n');

  // ── MDX components with checkable props ──────────────────────────────────
  const mdxComponents = [];
  const compRe = /<([A-Z][A-Za-z0-9]*)\b([^>]*?)\/?>/g;
  let m;
  while ((m = compRe.exec(src))) {
    const name = m[1];
    if (!TAGGED_MDX_COMPONENTS.has(name)) continue;
    mdxComponents.push({
      name,
      raw: m[0],
      attrs: parseJsxAttrs(m[2]),
      line: src.slice(0, m.index).split('\n').length,
    });
  }

  // ── Markdown tables (header + first column), for the prose cross-reference ─
  const tables = [];
  for (let i = 0; i < proseLines.length; i++) {
    const t = proseLines[i].text;
    if (!/^\s*\|/.test(t)) continue;
    const next = proseLines[i + 1]?.text ?? '';
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(next)) continue;
    const header = splitRow(t);
    const rows = [];
    let j = i + 2;
    while (j < proseLines.length && /^\s*\|/.test(proseLines[j].text)) {
      rows.push({ cells: splitRow(proseLines[j].text), line: proseLines[j].line });
      j++;
    }
    tables.push({ header, rows, line: proseLines[i].line });
    i = j - 1;
  }

  // ── Inline `code` spans in prose, with their line ─────────────────────────
  const inlineCode = [];
  for (const { line, text } of proseLines) {
    const re = /`([^`\n]+)`/g;
    let c;
    while ((c = re.exec(text))) inlineCode.push({ token: c[1], line, context: text.trim() });
  }

  return { absPath, rel, section: sectionOf(rel), src, lines, blocks, proseLines, proseText, mdxComponents, tables, inlineCode };
}

const splitRow = (t) =>
  t
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Good enough for the attribute shapes Starlight docs actually use:
 *  name="str", name={{ a: 1 }}, name={expr}, bare boolean. */
function parseJsxAttrs(s) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})|([A-Za-z_:][\w:.-]*)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[5] !== undefined && m[1] === undefined) {
      attrs[m[5]] = { kind: 'boolean', value: true };
      continue;
    }
    const name = m[1];
    if (m[2] !== undefined) attrs[name] = { kind: 'string', value: m[2] };
    else if (m[3] !== undefined) attrs[name] = { kind: 'string', value: m[3] };
    else if (m[4] !== undefined) attrs[name] = { kind: 'expr', value: m[4].trim() };
  }
  return attrs;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
