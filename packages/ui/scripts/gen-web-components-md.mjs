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

  writeFileSync(path, md);
  console.log('✓ docs/web-components.md tables regenerated');
}
