import meta from '../../elements/element-meta.json';

type Prop = { name: string; type: string; default?: string; scalar: boolean };
type ElementMeta = { tag: string; props: Prop[] };
const all = meta as unknown as ElementMeta[];

/**
 * Build a Storybook `docs.description` from an element's intro paragraphs.
 * (`tag` is kept in the signature so callers don't churn.) The full per-element
 * API for the web components lives on the consumer docs at ui.kitn.ai.
 */
export function specDescription(_tag: string, paragraphs: string[]): { component: string } {
  return { component: paragraphs.join('\n\n') };
}

/** Build a Storybook `docs.description` for a SolidJS/UI component story. */
export function componentDescription(paragraphs: string[]): { component: string } {
  return { component: paragraphs.join('\n\n') };
}

/**
 * Parse a type string from element-meta.json into meaningful parts.
 *
 * The meta generator writes types like:
 *   - `"undefined | false | true"` for booleans (NOT "boolean")
 *   - `"undefined | \"preview\" | \"code\""` for enums (double-quoted, with leading undefined)
 *
 * We normalise by splitting on `|`, trimming, and dropping `undefined` / `null`.
 */
const normaliseParts = (type: string): string[] =>
  type
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== 'undefined' && s !== 'null');

const enumValues = (parts: string[]): string[] | null => {
  // Accept both single-quoted ('foo') and double-quoted ("foo") string literals.
  if (parts.length > 0 && parts.every((p) => /^(['"])[^'"]*\1$/.test(p)))
    return parts.map((p) => p.slice(1, -1));
  return null;
};

const isBooleanParts = (parts: string[], rawType: string): boolean => {
  // Explicit boolean keyword (future-proof)
  if (/\bboolean\b/.test(rawType)) return true;
  // element-meta encodes booleans as "undefined | false | true"
  const sorted = [...parts].sort().join(',');
  return sorted === 'false,true';
};

/**
 * Storybook argTypes for an element's props (theme select, booleans, text,
 * number, object/JSON for complex types, and no control for functions).
 *
 * Classification order:
 *  1. enum  → select
 *  2. boolean → boolean
 *  3. number  → number
 *  4. contains `=>` (function / function-bearing object) → control: false
 *  5. not all-string after normalisation (arrays, records, generics…) → object
 *  6. all-string → text
 */
export function argTypesFor(tag: string): Record<string, unknown> {
  const el = all.find((e) => e.tag === tag);
  if (!el) return {};
  const out: Record<string, unknown> = {};
  for (const p of el.props) {
    const parts = normaliseParts(p.type);

    // 1–3: scalar classifications (enums, booleans, numbers only appear in scalar props)
    if (p.scalar) {
      const values = enumValues(parts);
      if (values) {
        out[p.name] = { control: { type: 'select' }, options: values };
        continue;
      }
      if (isBooleanParts(parts, p.type)) {
        out[p.name] = { control: 'boolean' };
        continue;
      }
      if (/\bnumber\b/.test(p.type)) {
        out[p.name] = { control: 'number' };
        continue;
      }
    }

    // 4. Function / function-bearing object: contains `=>` in raw type string.
    // A function-typed prop on a kai-* element is always an event handler
    // (`onSubmit`, `onMessageAction`, ...), so it belongs in the Events group
    // in the Controls/Docs panel rather than sorted alongside plain props.
    // See lint-story-conventions.mjs, which enforces the same
    // `table.category: 'Events'` shape on hand-authored argTypes.
    if (p.type.includes('=>')) {
      out[p.name] = { control: false, table: { category: 'Events' } };
      continue;
    }

    // 5. Complex/object: parts are not all exactly the string "string"
    if (!parts.every((part) => part === 'string')) {
      out[p.name] = { control: 'object' };
      continue;
    }

    // 6. Pure string
    out[p.name] = { control: 'text' };
  }
  return out;
}
