// Names in PROSE, checked against the shipped surface.
//
// Snippets are only half the docs. The other half is sentences and tables that
// name an export, an element, a prop or an event — and those drift exactly like
// code does, with nothing compiling them. The "Key exports" table in
// guides/frameworks/solid.mdx is hand-maintained and lists a few dozen of the
// root entry's several hundred names; a table like that is wrong the moment
// anything is renamed.
//
// PRECISION
// ---------
// Two tiers, because the cost of a false positive differs:
//   · TABLE cells whose header says the column holds exports/components/props/
//     events are checked strictly — the table is CLAIMING those are kit names.
//   · Inline `code` in running prose is advisory. Prose legitimately names React
//     hooks, DOM interfaces and the reader's own variables, and no allowlist
//     covers that cleanly. Backticked kai-* tokens are the exception: nothing
//     but this kit owns that prefix, so those are checked strictly wherever they
//     appear.
import { camelToKebab } from './surface.mjs';

/** Names that show up in prose and are demonstrably NOT kit API. Only used to
 *  quieten the advisory tier; nothing here affects the strict checks. */
const KNOWN_EXTERNAL = new Set([
  // JS / DOM
  'Array', 'Boolean', 'CustomEvent', 'Date', 'Element', 'Error', 'Event', 'EventTarget', 'Function',
  'HTMLElement', 'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Proxy', 'ReadableStream',
  'Record', 'RegExp', 'Response', 'Request', 'Set', 'ShadowRoot', 'String', 'Symbol', 'TextDecoder',
  'TextEncoder', 'URL', 'Uint8Array', 'WeakMap', 'Window', 'Worker', 'AbortController', 'FormData',
  'File', 'Blob', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'DOMPurify',
  'Partial', 'Pick', 'Omit', 'Required', 'Readonly', 'ReturnType', 'Parameters', 'Awaited',
  // Frameworks / ecosystem
  'React', 'ReactDOM', 'Component', 'Fragment', 'Suspense', 'Show', 'For', 'Index', 'Switch', 'Match',
  'ErrorBoundary', 'Portal', 'Dynamic', 'Astro', 'Vue', 'Svelte', 'Angular', 'Next', 'NextJS',
  'App', 'Chat', 'Page', 'Layout', 'Root', 'Main', 'Home', 'Props', 'State', 'Ref', 'Signal',
  'NgModule', 'CUSTOM_ELEMENTS_SCHEMA', 'OnInit', 'Injectable', 'Observable', 'Subject',
  'TypeScript', 'JavaScript', 'HTML', 'CSS', 'JSX', 'TSX', 'DOM', 'SSR', 'CDN', 'MCP', 'API', 'UI',
  'OpenAI', 'Anthropic', 'OpenRouter', 'Ollama', 'LangGraph', 'Cloudflare', 'Mastra', 'Pydantic',
  'Workers', 'Hono', 'Express', 'Vite', 'Rollup', 'Webpack', 'ESM', 'CJS', 'NPM',
]);

const looksLikeIdentifier = (t) => /^[A-Za-z_$][\w$]*$/.test(t);
const isPascal = (t) => /^[A-Z][A-Za-z0-9]*$/.test(t);

/** Every name the page's own code blocks declare — those are page-local, not drift. */
function pageLocalNames(doc) {
  const names = new Set();
  for (const b of doc.blocks) {
    for (const m of b.code.matchAll(
      /\b(?:function|class|interface|enum)\s+([A-Za-z_$][\w$]*)|\b(?:const|let|var|type)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      names.add(m[1] ?? m[2]);
    }
    // Imported names are declared for the page's purposes too.
    for (const m of b.code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const n = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (n && looksLikeIdentifier(n)) names.add(n);
      }
    }
    for (const m of b.code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1]);
  }
  return names;
}

// Only headers whose first column claims a TOP-LEVEL name. A "Prop | Type |
// Default" table lists members of one component, and checking those against the
// package's exports reported `disabled`, `speed` and `mode` as missing exports —
// which is true and completely meaningless. Member tables need to know which
// element they describe; that is handled separately below.
const HEADER_CLAIMS_EXPORT = /^\s*(export|component|element|symbol|api|hook|helper|function|utility|utilities)s?\b/i;
const HEADER_CLAIMS_MEMBER = /^\s*(prop|property|attribute|event|slot|part|method)s?\b/i;

/** Which kai-* element a page is ABOUT, if it says so unambiguously. */
function pageElement(doc, surface) {
  const sub = /<p class="kai-tag-sub">\s*(kai-[a-z0-9-]+)\s*<\/p>/.exec(doc.src);
  if (sub && surface.byTag.has(sub[1])) return surface.byTag.get(sub[1]);
  const tags = new Set(
    doc.mdxComponents.map((c) => (c.attrs.tag?.kind === 'string' ? c.attrs.tag.value : null)).filter(Boolean),
  );
  if (tags.size === 1) {
    const only = [...tags][0];
    if (surface.byTag.has(only)) return surface.byTag.get(only);
  }
  return null;
}

export function checkProse(doc, surface) {
  const findings = [];
  const local = pageLocalNames(doc);

  const known = (name) =>
    surface.byName.has(name) ||
    surface.components.has(name) ||
    local.has(name) ||
    KNOWN_EXTERNAL.has(name) ||
    // Everything TypeScript's own libs declare — MediaRecorder, AbortController,
    // SpeechSynthesisVoice. Resolved from the lib files, not from a list.
    surface.globalNames.has(name);

  // ── 1. kai-* tokens anywhere in prose ────────────────────────────────────
  for (const { token, line, context } of doc.inlineCode) {
    const t = token.trim().replace(/^<|>$|\/>$/g, '').replace(/\(\)$/, '');
    if (!/^kai-[a-z0-9-]+$/.test(t)) continue;
    if (surface.tags.has(t) || surface.eventNames.has(t)) continue;
    // Some prose names a part or slot with a kai- prefix, or a CSS class.
    const anyPart = [...surface.byTag.values()].some((e) => e.partNames.has(t) || e.slotNames.has(t));
    if (anyPart) continue;
    findings.push(
      surface.knownTokens.has(t)
        ? {
            kind: 'undeclared-in-element-meta',
            detail: `\`${t}\` exists in the kit (a declarative child element or a dispatched event) but is not a registered element or a declared event, so element-meta.json omits it`,
            line,
            context: context.slice(0, 160),
            severity: 'advisory',
          }
        : {
            kind: 'unknown-kai-token',
            detail: `\`${t}\` is neither a registered element nor a declared event, and the kit's source never mentions it`,
            line,
            context: context.slice(0, 160),
            severity: 'high',
          },
    );
  }

  // ── 2. prop: / on: bindings named in prose ───────────────────────────────
  for (const { token, line, context } of doc.inlineCode) {
    const m = /^(prop|attr):([A-Za-z_$][\w$-]*)$/.exec(token.trim());
    if (m) {
      const name = m[2];
      const hit = [...surface.byTag.values()].some(
        (e) => e.propIndex.has(name) || e.propIndex.has(camelToKebab(name)),
      );
      if (!hit) {
        findings.push({
          kind: 'unknown-prop',
          detail: `\`${token}\` — no kai-* element declares a prop '${name}'`,
          line,
          context: context.slice(0, 160),
          severity: 'high',
        });
      }
    }
    const e = /^on:(kai-[a-z0-9-]+)$/.exec(token.trim());
    if (e && !surface.eventNames.has(e[1])) {
      findings.push({
        kind: 'unknown-event',
        detail: `\`${token}\` — no kai-* element declares that event`,
        line,
        context: context.slice(0, 160),
        severity: 'high',
      });
    }
  }

  // ── 3. tables that CLAIM to list kit API ─────────────────────────────────
  const el = pageElement(doc, surface);
  for (const table of doc.tables) {
    if (!table.header.length) continue;

    // Member tables: only checkable when the page unambiguously describes one
    // element. Those are the hand-written prop/event tables that drift.
    if (HEADER_CLAIMS_MEMBER.test(table.header[0])) {
      if (!el) continue;
      const isEvent = /^\s*events?\b/i.test(table.header[0]);
      const isProp = /^\s*(prop|property|attribute)s?\b/i.test(table.header[0]);
      if (!isEvent && !isProp) continue;
      for (const row of table.rows) {
        const m = /`([^`]+)`/.exec(row.cells[0] ?? '');
        if (!m) continue;
        const tok = m[1].trim();
        if (isEvent ? el.eventNames.has(tok) || el.handlerNames.has(tok) : el.propIndex.has(tok) || el.propIndex.has(camelToKebab(tok))) continue;
        if (!looksLikeIdentifier(tok) && !/^[a-z][\w-]*$/.test(tok)) continue;
        findings.push({
          kind: 'stale-member-table-entry',
          detail: `table "${table.header.join(' | ')}" on the \`${el.tag}\` page lists ${isEvent ? 'event' : 'prop'} \`${tok}\`, which <${el.tag}> does not declare`,
          line: row.line,
          context: row.cells[0],
          severity: 'high',
        });
      }
      continue;
    }

    if (!HEADER_CLAIMS_EXPORT.test(table.header[0])) continue;
    for (const row of table.rows) {
      const cell = row.cells[0] ?? '';
      for (const m of cell.matchAll(/`([^`]+)`/g)) {
        const tok = m[1].trim().replace(/\(\)$/, '').replace(/^<|\/?>$/g, '');
        if (!tok) continue;
        if (/^kai-/.test(tok)) {
          if (surface.tags.has(tok) || surface.eventNames.has(tok)) continue;
          findings.push({
            kind: 'stale-table-entry',
            detail: `table "${table.header.join(' | ')}" lists \`${tok}\`, which is not a registered element or event`,
            line: row.line,
            context: cell,
            severity: 'high',
          });
          continue;
        }
        if (!looksLikeIdentifier(tok)) continue;
        if (surface.byName.has(tok)) continue;
        if (KNOWN_EXTERNAL.has(tok) || local.has(tok) || surface.globalNames.has(tok)) continue;
        findings.push({
          kind: 'stale-table-entry',
          detail: `table "${table.header.join(' | ')}" lists \`${tok}\`, which no @kitn.ai/ui entry point exports`,
          line: row.line,
          context: cell,
          severity: 'high',
        });
      }
    }
  }

  // ── 4. PascalCase names in running prose ─────────────────────────────────
  // Mostly advisory: prose legitimately backticks UI labels ("Share", "Beta")
  // and third-party types, and no rule separates those cleanly.
  //
  // But a name that EXTENDS a real export family almost never is a UI label —
  // `MessageActionBar` when the kit exports `MessageAction`/`MessageActions`,
  // or `ComposerDoc` when it exports `Composer`. Those read as kit API and are
  // not, which is exactly the drift being hunted, so they are promoted. The
  // family prefix must itself be an export and be reasonably long, which keeps
  // "Chats" from matching "Chat".
  const familyPrefix = (tok) => {
    for (const name of surface.byName.keys()) {
      if (name.length >= 5 && tok.length > name.length && tok.startsWith(name)) return name;
    }
    return null;
  };

  const seen = new Set();
  for (const { token, line, context } of doc.inlineCode) {
    const tok = token.trim().replace(/\(\)$/, '');
    if (!isPascal(tok) || known(tok) || seen.has(tok)) continue;
    seen.add(tok);
    const family = familyPrefix(tok);
    findings.push(
      family
        ? {
            kind: 'stale-kit-api-name',
            detail: `\`${tok}\` reads as kit API (the kit exports \`${family}\`) but no entry point exports it — a consumer cannot import this`,
            line,
            context: context.slice(0, 160),
            severity: 'high',
          }
        : {
            kind: 'unresolved-prose-name',
            detail: `\`${tok}\` is not exported by any @kitn.ai/ui entry point and is not defined on this page`,
            line,
            context: context.slice(0, 160),
            severity: 'advisory',
          },
    );
  }

  return findings;
}

// ── Flag-for-human ─────────────────────────────────────────────────────────
// Claims that are executable and factual but that this harness cannot
// adjudicate. It extracts them; it does not guess. The calibration case is
// solid.mdx's "The `@kitn.ai/ui` entry point (`.`) exports raw TSX", which is
// false — `.` resolves to a compiled dist/index.js — but nothing about the shape
// of that sentence says so.
const CLAIM_PATTERNS = [
  { id: 'packaging', re: /\braw (?:TSX|JSX|source)\b|ships? as source|exports? raw|\buncompiled\b|your bundler compiles|no build step|tree[- ]shak|side[- ]effect|peer dependenc|ESM[- ]only|\bCommonJS\b|dual package/i },
  { id: 'runtime', re: /\bSSR\b|server[- ]render|server component|hydrat|client[- ]only|runs on the server|edge runtime|\bworker\b/i },
  { id: 'default', re: /\bby default\b|\bdefaults? to\b|out of the box|automatically\b/i },
  { id: 'version', re: /\bv?\d+\.\d+\.\d+\b|removed in\b|added in\b|\bdeprecat|\bsince\b \d/i },
  { id: 'size-perf', re: /\bkB\b|\bKB\b|bundle size|gzip|lazy[- ]load|on demand|code[- ]split/i },
];

/** Only claims that are ABOUT the kit — otherwise every "by default" in every
 *  sentence lands on the list and nobody reads it. */
const ABOUT_KIT =
  /@kitn\.ai\/ui|\bkai-[a-z]|\bthe kit\b|\bthe package\b|\bentry point\b|\bthe library\b|\bthis package\b|\belements bundle\b|\bthe elements\b/i;

export function flagForHuman(doc) {
  const flags = [];
  // Sentence-ish segmentation over prose lines, keeping the line number.
  for (const { line, text } of doc.proseLines) {
    const t = text.trim();
    if (!t || t.startsWith('import ') || /^<\/?[A-Z]/.test(t)) continue;
    if (!ABOUT_KIT.test(t)) continue;
    for (const p of CLAIM_PATTERNS) {
      if (!p.re.test(t)) continue;
      flags.push({ category: p.id, line, text: t.replace(/\s+/g, ' ').slice(0, 300) });
      break;
    }
  }
  return flags;
}
