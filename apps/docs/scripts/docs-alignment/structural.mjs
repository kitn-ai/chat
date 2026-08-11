// The `kai-*` contract, checked structurally against element-meta.json.
//
// WHY NOT tsc
// -----------
// The kit's shipped React JSX augmentation types every element as
// `{ [attr: string]: unknown }`, so tsc cannot reject a misspelled attribute on
// a <kai-chat>, and 132 of the docs' code blocks are plain `html` that tsc never
// sees at all. Element names, prop names, event names, slot names, part names
// and the scalar/non-scalar split all live in element-meta.json, which is
// generated from the source at build time. Checking markup against it directly
// is both stronger and uniform across html, JSX, Vue, Svelte and Angular.
//
// The rule from CLAUDE.md this exists to enforce:
//   Array/object props are set as JS PROPERTIES, never HTML attributes; only
//   scalars work as attributes. Events are non-bubbling `kai-*` CustomEvents.
import { camelToKebab, kebabToCamel } from './surface.mjs';

/** Attributes valid on any element, so never checked against element-meta. */
const GLOBAL_ATTRS = new Set([
  'id', 'class', 'classname', 'style', 'slot', 'part', 'exportparts', 'hidden', 'title', 'role',
  'dir', 'lang', 'tabindex', 'is', 'ref', 'key', 'draggable', 'contenteditable', 'spellcheck',
  'autofocus', 'inert', 'popover', 'itemprop', 'itemscope', 'itemtype', 'children',
]);

const isGlobal = (n) => {
  const l = n.toLowerCase();
  return (
    GLOBAL_ATTRS.has(l) ||
    l.startsWith('data-') ||
    l.startsWith('aria-') ||
    l.startsWith('client:') || // Astro directives
    l.startsWith('on') // inline DOM handlers / framework onFoo
  );
};

/**
 * Split a framework-flavoured attribute into { base, kind }.
 *   kind: 'attr'     — stringified HTML attribute (scalars only)
 *         'property' — real DOM property assignment (anything)
 *         'event'    — event listener binding
 *         'skip'     — a directive that names no element prop
 */
function classifyAttr(raw) {
  // Framework directives that name no element prop: Astro hydration, Solid
  // `use:` actions, Svelte transitions, Angular structural directives.
  if (/^(client|use|transition|in|out|animate|let|slot|is|ngIf|ngFor|\*ng)[:.]/.test(raw)) return { kind: 'skip' };
  if (/^\*/.test(raw)) return { kind: 'skip' };

  // Vue modifiers (`:messages.prop`, `@submit.stop`, `:title.attr`). `.prop`
  // forces a real DOM property assignment and is the CORRECT way to pass an
  // array in a Vue template — reading it as part of the name reported
  // `<kai-chat> has no prop 'messages.prop'` on code that is exactly right.
  const withModifiers = (s, kind) => {
    const [base, ...mods] = s.split('.');
    if (mods.includes('prop') || mods.includes('camel')) return { base, kind: 'property' };
    return { base, kind };
  };

  if (raw.startsWith('prop:')) return { base: raw.slice(5), kind: 'property' }; // Solid
  if (raw.startsWith('attr:')) return { base: raw.slice(5), kind: 'attr' }; // Solid
  if (raw.startsWith('on:')) return { base: raw.slice(3), kind: 'event' }; // Solid / Svelte
  if (raw.startsWith('bind:')) return { base: raw.slice(5), kind: 'property' }; // Svelte
  if (raw.startsWith('v-on:')) return withModifiers(raw.slice(5), 'event'); // Vue
  if (raw.startsWith('v-bind:')) return withModifiers(raw.slice(7), 'attr'); // Vue
  if (raw.startsWith('.')) return { base: raw.slice(1), kind: 'property' }; // Vue .prop / lit
  if (raw.startsWith('@')) return withModifiers(raw.slice(1), 'event'); // Vue shorthand
  if (raw.startsWith(':')) return withModifiers(raw.slice(1), 'attr'); // Vue shorthand bind
  if (/^\[.+\]$/.test(raw)) return { base: raw.slice(1, -1), kind: 'property' }; // Angular
  if (/^\(.+\)$/.test(raw)) return { base: raw.slice(1, -1), kind: 'event' }; // Angular
  if (/^v-/.test(raw)) return { kind: 'skip' };
  // A dotted name that reached here is a property path picked up out of an
  // expression, not an attribute (`{...chat.bind}`).
  if (raw.includes('.')) return { kind: 'skip' };
  return { base: raw, kind: 'attr' };
}

/** Opening tags of kai-* elements, with their raw attribute text. */
function* kaiTags(code) {
  const re = /<(kai-[a-z0-9-]+)((?:"[^"]*"|'[^']*'|\{[^{}]*\}|[^>"'{])*)\/?>/g;
  let m;
  while ((m = re.exec(code))) {
    yield { tag: m[1], attrText: m[2] ?? '', index: m.index };
  }
}

function parseAttrs(attrText) {
  const out = [];
  // Spreads name no attribute: `{...chat.bind}` was being read as an attribute
  // called `chat.bind`.
  // Spreads and Svelte's `{messages}` shorthand name no ATTRIBUTE. The
  // shorthand is a property binding — reading it as a bare attribute reported
  // `<kai-chat messages="…">` as a contract violation on code that is correct.
  const cleaned = attrText.replace(/\{\s*\.\.\.[^}]*\}/g, ' ').replace(/\{\s*[A-Za-z_$][\w$]*\s*\}/g, ' ');
  const re = /([@:.\[\(]?[A-Za-z_][\w:.\-]*[\]\)]?)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[\s\S]*?\})))?/g;
  let m;
  while ((m = re.exec(cleaned))) {
    if (!m[1]) continue;
    out.push({
      raw: m[1],
      value: m[2] ?? m[3] ?? m[4] ?? null,
      // A `{…}` value is an expression: in JSX/Vue/Angular it is a real binding,
      // not a stringified attribute.
      expression: m[4] !== undefined,
    });
  }
  return out;
}

const lineOf = (code, index, startLine) => startLine + code.slice(0, index).split('\n').length - 1;

/**
 * Docs teach by counter-example, and a counter-example is SUPPOSED to be wrong.
 * `guides/for-ai-agents.mdx` writes:
 *
 *     <!-- Fails — an array can't be an HTML attribute -->
 *     <kai-chat messages="[...]"></kai-chat>
 *
 * Flagging that is flagging the docs for being right. So a marker comment exempts
 * itself and the counter-example that follows it. This reads the docs' existing
 * wording rather than requiring new directives, so nothing has to be annotated
 * for the harness's benefit.
 *
 * Both halves of that are narrower than they look, and both were widened by an
 * adversarial pass that made the harness go quiet on real defects:
 *
 *   · The marker must LEAD the comment body. A counter-example marker is a
 *     LABEL — `Fails — …`, `Wrong: …`, `✗ …` — and matching the words anywhere
 *     in the comment turns every ordinary prose caution into a mute button.
 *     guides/recipes/streaming.mdx really writes "Point at your own backend in
 *     production. Never expose an API key in the browser", and on the old rule
 *     that "Never" exempted the four lines under it, `fetch(...)` included.
 *   · The window stops at a BLANK LINE. A counter-example is a contiguous block;
 *     a fixed three-line reach reads past the end of one into whatever follows.
 *     Measured: `<kai-chat sugestions="…">` one blank line below an unrelated
 *     counter-example was silently dropped.
 */
const NEGATIVE_MARKER =
  /^["'`(\[*\-–—>\s]*(fails?|failing|won'?t work|anti-pattern|instead of|not this|incorrect|wrong|broken|don'?t|do not|never|avoid|bad|✗|❌)(?!\w)/i;

/** The comment body on a line, or null when the line opens no comment. */
function commentBody(line) {
  const m = /(?:^|\s)(?:\/\/+|\/\*+|<!--|#)[ \t]*(.*)$/.exec(line);
  return m ? m[1] : null;
}

export function counterExampleLines(code) {
  const lines = code.split('\n');
  const marked = new Set();
  lines.forEach((line, i) => {
    const body = commentBody(line);
    if (body === null || !NEGATIVE_MARKER.test(body)) return;
    marked.add(i + 1); // 1-based: the marker itself
    // …then the contiguous block it labels, up to three lines, ending at the
    // first blank line. Beyond that is a different example.
    for (let d = 1; d <= 3; d++) {
      const next = lines[i + d];
      if (next === undefined || !next.trim()) break;
      marked.add(i + 1 + d);
    }
  });
  return marked;
}

/**
 * Blank out comments, preserving line count so reported lines stay correct.
 * Prose inside a comment is not code: `/* stream your reply into chat.messages
 * (see Drop-in chat) *\/` was being read as a call to a method `messages`.
 */
function stripComments(code) {
  const blank = (m) => '\n'.repeat((m.match(/\n/g) ?? []).length);
  return code
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    // Line comments, but never the `//` in a URL.
    .replace(/(^|[^:"'`\w])\/\/[^\n]*/g, (_, p) => p);
}

/**
 * @returns findings[] — { kind, tag, detail, line, severity }
 */
export function checkMarkup({ code: rawCode, startLine, surface, lang }) {
  const code = stripComments(rawCode);
  const negative = counterExampleLines(rawCode);
  const findings = [];
  const seenTags = [];
  const push = (f) => {
    if (negative.has(f.line - startLine + 1)) return;
    findings.push(f);
  };

  for (const { tag, attrText, index } of kaiTags(code)) {
    const line = lineOf(code, index, startLine);
    const el = surface.byTag.get(tag);
    if (!el) {
      push(
        surface.knownTokens.has(tag)
          ? {
              kind: 'undeclared-in-element-meta',
              tag,
              detail: `<${tag}> is used by the kit (a declarative light-DOM child) but is not a registered element, so element-meta.json, the generated types and the MCP catalog all omit it`,
              line,
              severity: 'advisory',
            }
          : { kind: 'unknown-element', tag, detail: `<${tag}> is not a registered element and the kit's source never mentions it`, line, severity: 'high' },
      );
      continue;
    }
    seenTags.push(el);

    for (const attr of parseAttrs(attrText)) {
      const { base, kind } = classifyAttr(attr.raw);
      if (kind === 'skip' || !base) continue;
      if (isGlobal(base) && kind !== 'event') continue;

      if (kind === 'event') {
        const name = base.startsWith('kai-') ? base : `kai-${camelToKebab(base)}`;
        if (!el.eventNames.has(name) && !el.eventNames.has(base) && !el.handlerNames.has(base)) {
          push({
            kind: 'unknown-event',
            tag,
            detail: `<${tag}> has no event '${base}' (declares: ${[...el.eventNames].join(', ') || 'none'})`,
            line,
            severity: 'high',
          });
        }
        continue;
      }

      const prop = el.propIndex.get(base) ?? el.propIndex.get(kebabToCamel(base)) ?? el.propIndex.get(camelToKebab(base));
      if (!prop) {
        push({
          kind: 'unknown-prop',
          tag,
          detail: `<${tag}> has no prop '${base}'`,
          line,
          severity: 'high',
        });
        continue;
      }
      // The contract: only scalars survive being written as an HTML attribute.
      // A `{…}` value in JSX/Vue/Angular is a real binding, so it is exempt; a
      // quoted value in plain html is not.
      // `attr.value === null` is a valueless (boolean) attribute, which cannot
      // be stringifying an array.
      if (kind === 'attr' && prop.scalar === false && !attr.expression && attr.value !== null && lang === 'html') {
        push({
          kind: 'nonscalar-as-attribute',
          tag,
          detail: `<${tag} ${attr.raw}="…"> — '${prop.name}' is ${prop.displayType ?? 'a non-scalar'}; set it as a JS property, an attribute stringifies it`,
          line,
          severity: 'high',
        });
      }
    }
  }

  // ── element variables -> tag, so `.prop =` and method calls are checkable ──
  const varTag = new Map();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\(\s*['"](kai-[a-z0-9-]+)['"]/g))
    varTag.set(m[1], m[2]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.querySelector\w*\(\s*['"](kai-[a-z0-9-]+)['"]/g))
    varTag.set(m[1], m[2]);
  // `document.getElementById('chat')` -> the tag that carries id="chat".
  const idTag = new Map();
  for (const m of code.matchAll(/<(kai-[a-z0-9-]+)[^>]*\bid=["']([^"']+)["']/g)) idTag.set(m[2], m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.getElementById\(\s*['"]([^'"]+)['"]/g)) {
    const t = idTag.get(m[2]);
    if (t) varTag.set(m[1], t);
  }

  for (const [name, tag] of varTag) {
    const el = surface.byTag.get(tag);
    if (!el) continue;
    const assign = new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g');
    for (const m of code.matchAll(assign)) {
      const p = m[1];
      if (isGlobal(p) || ['innerHTML', 'textContent', 'value', 'onclick'].includes(p)) continue;
      if (!el.propIndex.has(p) && !el.propIndex.has(camelToKebab(p))) {
        push({
          kind: 'unknown-prop',
          tag,
          detail: `${name}.${p} = … — <${tag}> has no prop '${p}'`,
          line: lineOf(code, m.index, startLine),
          severity: 'high',
        });
      }
    }
    const call = new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g');
    for (const m of code.matchAll(call)) {
      const meth = m[1];
      if (['addEventListener', 'removeEventListener', 'setAttribute', 'getAttribute', 'append', 'appendChild', 'remove', 'replaceChildren', 'focus', 'blur', 'querySelector', 'closest', 'dispatchEvent', 'scrollIntoView', 'toggleAttribute', 'hasAttribute', 'removeAttribute', 'insertAdjacentHTML'].includes(meth)) continue;
      if (el.methodNames.size && !el.methodNames.has(meth)) {
        push({
          kind: 'unknown-method',
          tag,
          detail: `${name}.${meth}() — <${tag}> declares methods: ${[...el.methodNames].join(', ') || 'none'}`,
          line: lineOf(code, m.index, startLine),
          severity: 'medium',
        });
      }
    }
  }

  // ── addEventListener('kai-…') — the event must exist somewhere in the kit ──
  for (const m of code.matchAll(/addEventListener\(\s*['"](kai-[a-z0-9-]+)['"]/g)) {
    const name = m[1];
    if (surface.eventNames.has(name)) continue;
    const line = lineOf(code, m.index, startLine);
    push(
      surface.knownTokens.has(name)
        ? {
            kind: 'undeclared-in-element-meta',
            tag: null,
            detail: `addEventListener('${name}') — the kit dispatches this event, but no element DECLARES it, so it is missing from element-meta.json and the generated event types`,
            line,
            severity: 'advisory',
          }
        : {
            kind: 'unknown-event',
            tag: null,
            detail: `addEventListener('${name}') — no kai-* element declares that event and the kit's source never mentions it`,
            line,
            severity: 'high',
          },
    );
  }

  // ── slot="…" must be a slot of one of the kai elements in the block ───────
  // Only when EVERY element in the block actually has slot data. element-meta
  // records no slots at all for many elements that clearly declare
  // `<slot name="media">` in source (kai-empty is one), so an element with an
  // empty slot list means "unknown", not "has none" — treating it as the latter
  // flagged correct documentation.
  if (seenTags.length && seenTags.every((e) => e.slotNames.size > 0)) {
    const slots = new Set(seenTags.flatMap((e) => [...e.slotNames]));
    for (const m of code.matchAll(/\bslot=["']([^"']+)["']/g)) {
      if (slots.has(m[1])) continue;
      push({
        kind: 'unknown-slot',
        tag: seenTags.map((e) => e.tag).join('/'),
        detail: `slot="${m[1]}" — not a slot of ${seenTags.map((e) => e.tag).join(' / ')} (available: ${[...slots].join(', ') || 'none'})`,
        line: lineOf(code, m.index, startLine),
        severity: 'medium',
      });
    }
  }

  return findings;
}

/** `kai-foo::part(bar)` in CSS — the part must exist on that element. */
export function checkCss({ code, startLine, surface }) {
  const findings = [];
  // The tag must start a selector, not sit inside a longer token: without the
  // lookbehind, `var(--kai-color-primary-foreground)` on a line that also has
  // `::part(content)` matched as the element `kai-color-primary-foreground`.
  // Nothing between the tag and `::part(` may cross a paren either.
  for (const m of code.matchAll(/(?<![\w-])(kai-[a-z0-9-]+)([^{;()]*?)::part\(\s*([A-Za-z0-9_-]+)\s*\)/g)) {
    const [, tag, , part] = m;
    const el = surface.byTag.get(tag);
    const line = lineOf(code, m.index, startLine);
    if (!el) {
      findings.push({ kind: 'unknown-element', tag, detail: `${tag}::part(${part}) — <${tag}> is not a registered element`, line, severity: 'high' });
      continue;
    }
    if (!el.partNames.has(part)) {
      findings.push({
        kind: 'unknown-part',
        tag,
        detail: `${tag}::part(${part}) — not an exposed part (available: ${[...el.partNames].join(', ') || 'none'})`,
        line,
        severity: 'high',
      });
    }
  }
  return findings;
}

/** <Example tag="kai-x" config={{ … }} /> and friends: the tag and every config
 *  key are hand-written in MDX but resolved against element-meta at render time,
 *  so a stale one renders nothing and fails silently in the browser. */
export function checkMdxComponents(doc, surface) {
  const findings = [];
  for (const c of doc.mdxComponents) {
    const tagAttr = c.attrs.tag;
    if (!tagAttr || tagAttr.kind !== 'string') continue;
    const tag = tagAttr.value;
    const el = surface.byTag.get(tag);
    if (!el) {
      findings.push({
        kind: 'unknown-element',
        tag,
        detail: `<${c.name} tag="${tag}" …/> — no such element; this component renders "Unknown element" in the browser`,
        line: c.line,
        severity: 'high',
      });
      continue;
    }
    const cfg = c.attrs.config;
    if (cfg && cfg.kind === 'expr') {
      // Keys only — anchored to `{` or `,`. An unanchored match read the
      // `https:` out of a URL value and reported it as a prop.
      for (const m of cfg.value.matchAll(/[{,]\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/g)) {
        const key = m[1] ?? m[2] ?? m[3];
        if (!el.propIndex.has(key) && !el.propIndex.has(camelToKebab(key))) {
          findings.push({
            kind: 'unknown-prop',
            tag,
            detail: `<${c.name} tag="${tag}" config={{ ${key}: … }} /> — <${tag}> has no prop '${key}'`,
            line: c.line,
            severity: 'high',
          });
        }
      }
    }
  }
  return findings;
}
