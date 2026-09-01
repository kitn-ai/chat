import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const kebab = (n) => n.replace(/([A-Z])/g, '-$1').toLowerCase();

// ---------------------------------------------------------------------------
// Type-shortening map — DISPLAY ONLY (markdown). These are the fully-expanded
// inline object types emitted by the TypeScript compiler, mapped back to their
// readable named aliases. Do NOT use these aliases anywhere else (element-types
// .d.ts must keep the full expansions so consumers get complete type info).
//
// To update: run `node -e "const m=require('./src/elements/element-meta.json');
// console.log(m.find(e=>e.tag==='kai-chat').props.find(p=>p.name==='messages').type)"`
// and add the resulting string → alias pair.
// ---------------------------------------------------------------------------
const ALIAS = new Map([
  // Prop types
  [
    '{ id: string; role: "user" | "assistant"; content: string; reasoning?: undefined | { text: string; label?: undefined | string }; tools?: undefined | { type: string; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string }[]; attachments?: undefined | { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[]; actions?: undefined | ("copy" | "like" | "dislike" | "regenerate" | "edit")[] }[]',
    'ChatMessage[]',
  ],
  [
    'undefined | { id: string; role: "user" | "assistant"; content: string; reasoning?: undefined | { text: string; label?: undefined | string }; tools?: undefined | { type: string; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string }[]; attachments?: undefined | { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[]; actions?: undefined | ("copy" | "like" | "dislike" | "regenerate" | "edit")[] }',
    'ChatMessage | undefined',
  ],
  [
    '{ id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[]',
    'AttachmentData[]',
  ],
  [
    'undefined | { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[]',
    'AttachmentData[] | undefined',
  ],
  [
    'undefined | { id: string; name: string; provider?: undefined | string }[]',
    'ModelOption[] | undefined',
  ],
  [
    '{ id: string; title: string; groupId?: undefined | string; scope: { type: "document" | "collection"; documentId?: undefined | string; filters?: undefined | { tags?: undefined | string[]; authors?: undefined | string[]; contentType?: undefined | "transcript" | "markdown"; dateRange?: undefined | { from: string; to: string } } }; messageCount: number; lastMessageAt: string; updatedAt: string }[]',
    'ConversationSummary[]',
  ],
  [
    '{ id: string; userId?: undefined | string; teamId?: undefined | string; name: string; sortOrder: number; createdAt: string }[]',
    'ConversationGroup[]',
  ],
  [
    'undefined | { usedTokens: number; maxTokens: number; inputTokens?: undefined | number; outputTokens?: undefined | number; reasoningTokens?: undefined | number; cacheTokens?: undefined | number; estimatedCost?: undefined | number }',
    'ContextData | undefined',
  ],
  [
    'undefined | { usedTokens: number; maxTokens: number; inputTokens?: undefined | number; outputTokens?: undefined | number; estimatedCost?: undefined | number }',
    'ContextData | undefined',
  ],
  [
    'undefined | { type: string; state: "input-streaming" | "input-available" | "output-available" | "output-error"; input?: undefined | Record<string, unknown>; output?: undefined | Record<string, unknown>; toolCallId?: undefined | string; errorText?: undefined | string }',
    'ToolPart | undefined',
  ],
  [
    '{ href: string; title?: undefined | string; description?: undefined | string; label?: undefined | string; showFavicon?: undefined | false | true }[]',
    'SourceItem[]',
  ],
  // Event detail types
  [
    '{ value: string; attachments: { id: string; type: "file" | "source-document"; filename?: undefined | string; mediaType?: undefined | string; url?: undefined | string; title?: undefined | string }[] }',
    '{ value: string; attachments: AttachmentData[] }',
  ],
  [
    '{ messageId: string; action: "copy" | "like" | "dislike" | "regenerate" | "edit" }',
    '{ messageId: string; action: ChatMessageAction }',
  ],
  [
    '{ filters: undefined | { tags?: undefined | string[]; authors?: undefined | string[]; contentType?: undefined | "transcript" | "markdown"; dateRange?: undefined | { from: string; to: string } } }',
    '{ filters: SearchFilters | undefined }',
  ],
  // Loader variant — collapses the long union to a short alias
  [
    'undefined | "circular" | "classic" | "pulse" | "pulse-dot" | "dots" | "typing" | "wave" | "bars" | "terminal" | "text-blink" | "text-shimmer" | "loading-dots"',
    'LoaderVariant | undefined',
  ],
]);

/** Shorten a fully-expanded type string to a readable alias for display. */
export function shorten(type) {
  return ALIAS.get(type) ?? type;
}

// ---------------------------------------------------------------------------
// Icon roster (P-8, blocks-and-parts spec 2026-08-31; spike finding F-7): the
// curated icon names were enumerated NOWHERE a doc reader or agent could see,
// so unknown names were guessed and painted as literal text. The roster here
// is DERIVED from the `NAMED_ICONS` map in src/ui/icon.tsx — the same map
// `ICON_NAMES` (the runtime export) derives from — never a hand list. The
// extraction is textual because this script runs on the unbuilt tree and the
// map lives in a Solid .tsx module a Node script cannot import; a zero-match
// extraction is a HARD FAILURE (checks-that-prove-nothing), so a refactor of
// the map's shape breaks the build loudly instead of shipping an empty roster.
// ---------------------------------------------------------------------------
export function iconNames(root) {
  const src = readFileSync(resolve(root, 'src/ui/icon.tsx'), 'utf8');
  const block = src.match(/const NAMED_ICONS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    throw new Error(
      'gen-web-components-md: could not find the NAMED_ICONS map in src/ui/icon.tsx. ' +
        'The icon roster is derived from that map; update iconNames() to match its new shape.',
    );
  }
  const names = [...block[1].matchAll(/^\s*(?:'([^'\n]+)'|([A-Za-z_$][\w$]*))\s*:/gm)]
    .map((m) => m[1] ?? m[2]);
  if (names.length === 0) {
    throw new Error(
      'gen-web-components-md: extracted ZERO icon names from NAMED_ICONS in src/ui/icon.tsx. ' +
        'An empty roster would regenerate the docs section into nothing silently; failing instead.',
    );
  }
  return [...new Set(names)].sort();
}

function iconRosterBlock(root) {
  const names = iconNames(root);
  return (
    `\nEvery name \`kai-icon\` (and every \`icon\` prop/attribute across the elements) resolves — ` +
    `${names.length} names, derived from the \`NAMED_ICONS\` map in \`src/ui/icon.tsx\` ` +
    `(also exported at runtime as \`ICON_NAMES\`). An icon-shaped name outside this roster ` +
    `renders a fallback glyph and logs a console error, in dev and prod alike; ` +
    `URLs render an \`<img>\`, and emoji/arbitrary text passes through as text.\n\n` +
    `${names.map((n) => `\`${n}\``).join(' · ')}\n`
  );
}

// ---------------------------------------------------------------------------
// The Overview block.
//
// Everything OUTSIDE a `<!-- spec:… -->` marker in docs/web-components.md is
// hand-written prose that this generator preserves byte-for-byte. That is
// exactly why the element count rotted: it was typed by hand as "27" while the
// kit had grown to 80, and `verify:generated` could not see it — regeneration
// reproduced the stale sentence byte-identically, so the drift check passed.
// Re-typing "80" here would rot the same way on the next element.
//
// So the count is DERIVED from the same in-memory model that writes every table
// below. It now moves with the roster on its own, and because it lives inside a
// marked region the drift guard covers it like any other generated block.
// ---------------------------------------------------------------------------

/**
 * Editorial: the three headline elements. The purposes are authored prose (the
 * model's own descriptions are written for a props table, not a lede); the tags
 * are checked against the model so this block can never advertise an element
 * the kit stopped shipping.
 */
const FEATURED = [
  ['kai-chat', 'Full chat UI — message list plus prompt input'],
  ['kai-conversations', 'Sidebar conversation browser with group support'],
  ['kai-prompt-input', 'Standalone text-input area with send button'],
];

function overviewBlock(elements) {
  const tags = new Set(elements.map((e) => e.tag));
  const missing = FEATURED.map(([t]) => t).filter((t) => !tags.has(t));
  if (missing.length) {
    throw new Error(
      `gen-web-components-md: the Overview block features ${missing.join(', ')}, ` +
        'which the element model no longer contains. Update FEATURED in ' +
        'scripts/gen-web-components-md.mjs rather than shipping a roster that ' +
        'points at an element the kit does not have.',
    );
  }
  const rows = FEATURED.map(([tag, purpose]) => `| \`<${tag}>\` | ${purpose} |`).join('\n');
  const rest = elements.length - FEATURED.length;
  return (
    `\n\`@kitn.ai/ui\` ships ${elements.length} framework-agnostic custom elements built on the SolidJS kit.\n\n` +
    `| Tag | Purpose |\n|-----|---------|\n${rows}\n` +
    `| + ${rest} composable primitives | See the full roster below |\n`
  );
}

function tablesFor(el) {
  const propRows = el.props
    .map((p) => {
      const attr = p.scalar ? `\`${kebab(p.name)}\`` : '—';
      const type = shorten(p.type);
      const def = p.default ? `\`${p.default}\`` : '—';
      const desc = p.description || '';
      return `| \`${p.name}\` | ${attr} | \`${type}\` | ${def} | ${desc} |`;
    })
    .join('\n');

  let out = `\n#### Properties\n\n| Property | Attribute | Type | Default | Notes |\n|----------|-----------|------|---------|-------|\n${propRows}\n`;

  if (el.events.length) {
    const evRows = el.events
      .map((e) => {
        // Payloadless events (no detail, or an empty `Record<string, never>`) render as a dash.
        const detail = e.detail && e.detail !== 'Record<string, never>' ? `\`${shorten(e.detail)}\`` : '—';
        const desc = e.description || '';
        return `| \`${e.name}\` | ${detail} | ${desc} |`;
      })
      .join('\n');
    out += `\n#### Events\n\n| Event | \`detail\` | Description |\n|-------|-----------|-------------|\n${evRows}\n`;
  }

  // The imperative half of the interaction API. `params`/`returns` are the
  // AUTHORED text, not the self-contained expansion the .d.ts carries (see
  // `withDts` in gen-element-api.mjs): this table is read by a human, the .d.ts
  // by a compiler.
  //
  // A `|` inside a signature (`HTMLElement | null`) splits the markdown row even
  // inside backticks, so it is escaped. Only these cells are escaped, and only
  // because they are new — the prop/event tables above have shipped raw pipes for
  // union types since this generator was written, and fixing that rewrites most
  // of the file for one reviewable change at a time.
  if (el.methods?.length) {
    const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const rows = el.methods
      .map((m) => `| \`${m.name}\` | \`${cell(`(${m.params}): ${m.returns}`)}\` | ${cell(m.description)} |`)
      .join('\n');
    const [first] = el.methods;
    const call = `document.querySelector('${el.tag}').${first.name}(${first.params ? '…' : ''})`;
    out += `\n#### Methods\n\nCall these on the element instance: \`${call}\`.\n\n| Method | Signature | Description |\n|--------|-----------|-------------|\n${rows}\n`;
  }

  if (el.slots?.length) {
    const rows = el.slots
      .map((s) => `| ${s.name ? `\`${s.name}\`` : '_(default)_'} | ${s.mode} | ${s.doc ?? ''} |`)
      .join('\n');
    out += `\n#### Slots\n\nProject your own markup with \`slot="name"\` on a light-DOM child.\n\n| Slot | Mode | Description |\n|------|------|-------------|\n${rows}\n`;
  }

  if (el.declarativeChildren?.length) {
    const rows = el.declarativeChildren
      .map((c) => {
        const attrs = c.attributes.length ? c.attributes.map((a) => `\`${a}\``).join(', ') : '—';
        return `| \`<${c.tag}>\` | ${attrs} | ${c.text ? 'yes' : '—'} | ${(c.description ?? '').replace(/\n/g, ' ')} |`;
      })
      .join('\n');
    out += `\n#### Declarative children\n\nCompose these in light DOM instead of setting the JS property — the no-JS route.\n\n| Child element | Attributes | Text content | Notes |\n|---------------|------------|--------------|-------|\n${rows}\n`;
  }

  if (el.parts?.length) {
    const rows = el.parts
      .map((p) => {
        const recipe = p.recipe ? ` <br>\`${p.recipe}\`` : '';
        return `| \`::part(${p.name})\` | ${p.doc ?? ''}${recipe} |`;
      })
      .join('\n');
    out += `\n#### Styleable parts\n\nRestyle from outside the Shadow DOM via \`${el.tag}::part(name)\`.\n\n| Part | Description |\n|------|-------------|\n${rows}\n`;
  }

  if (el.composedFrom.length) {
    const items = el.composedFrom.map((c) => `\`${c.group}/${c.name}\``).join(', ');
    out += `\n#### Composed from\n\n${items}\n`;
  }

  const tokenLine = el.tokens.length
    ? ` Element-specific tokens: ${el.tokens.map((t) => `\`${t}\``).join(', ')}.`
    : '';
  out += `\n#### Theming\n\nThemed by the global design tokens (override any \`--color-*\`).${tokenLine}\n`;

  return out;
}

export function writeWebComponentsMd(root, elements) {
  const path = resolve(root, '..', '..', 'docs/web-components.md');
  let md = readFileSync(path, 'utf8');

  // Derived element counts — see overviewBlock. Unlike the per-element blocks
  // below there is no "insert it on first run" fallback: this region wraps
  // hand-written prose, so guessing where to put it would be worse than saying
  // it is gone. A missing marker is the stale-count bug coming back, so fail.
  {
    const start = '<!-- spec:overview -->';
    const end = '<!-- /spec:overview -->';
    const re = new RegExp(`${start}[\\s\\S]*?${end}`);
    if (!re.test(md)) {
      throw new Error(
        `gen-web-components-md: docs/web-components.md has no ${start} … ${end} region. ` +
          'It carries the DERIVED element count; without it the count is hand-typed ' +
          'prose again and goes stale silently (regeneration reproduces it exactly, ' +
          'so verify:generated cannot see it). Restore the markers.',
      );
    }
    md = md.replace(re, `${start}${overviewBlock(elements)}${end}`);
  }

  for (const el of elements) {
    const block = tablesFor(el);
    const start = `<!-- spec:${el.tag} -->`;
    const end = `<!-- /spec:${el.tag} -->`;
    // Escape hyphens for use inside a RegExp character class or literal (none here).
    const re = new RegExp(`${start}[\\s\\S]*?${end}`);
    const replacement = `${start}${block}${end}`;

    if (re.test(md)) {
      // Subsequent runs: rewrite the block in place.
      md = md.replace(re, replacement);
    } else {
      // First run: insert markers right after the element's heading line.
      // Headings look like:  ### `<kai-chat>` / `KaiChat`
      // The / KitnClass suffix is optional (some elements may not have it).
      const headingRe = new RegExp(
        `(### \`<${el.tag}>\`[^\\n]*\\n)`,
      );
      if (headingRe.test(md)) {
        md = md.replace(headingRe, `$1\n${start}${block}${end}\n`);
      }
    }
  }

  // Icon roster region (P-8) — replace in place, or append the whole section
  // (heading + markers) on first run: unlike the overview this wraps no
  // hand-written prose, so a deterministic append is safe and needs no manual
  // marker placement before the first regeneration.
  {
    const start = '<!-- spec:icon-roster -->';
    const end = '<!-- /spec:icon-roster -->';
    const block = `${start}${iconRosterBlock(root)}${end}`;
    const re = new RegExp(`${start}[\\s\\S]*?${end}`);
    if (re.test(md)) md = md.replace(re, block);
    else md = `${md.trimEnd()}\n\n## Icon roster\n\n${block}\n`;
  }

  writeFileSync(path, md);
  console.log('✓ docs/web-components.md tables regenerated');
}
