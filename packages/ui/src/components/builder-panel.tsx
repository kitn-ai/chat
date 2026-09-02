import { type JSX, Show, For, createSignal, createEffect, on } from 'solid-js';
import { cn } from '../utils/cn';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { RadioGroup, type RadioOption } from '../ui/radio';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import { ColorField } from '../ui/color-field';
import { ToggleChip } from '../ui/toggle-chip';
import { X } from 'lucide-solid';

// ─────────────────────────────────────────────────────────────────────────────
// Types — a design-round stub of the real construct.v1 schema
// (mcp/construct/schema.ts), narrowed to the fields this panel
// edits. NOT the source of truth: a real build derives its FormDefinition
// from ConstructSchema (per RECOMMENDATION.md, that derivation is the hard
// part and is out of scope here). Presence, not a boolean, is what turns
// `home` and `capabilities.attachments` on — matching the real schema's own
// "presence enables the feature" contract, so this stub's shape stays honest
// about the translation the real panel will also need (strain #2).
// ─────────────────────────────────────────────────────────────────────────────

export type BuilderLayoutKind = 'widget' | 'fullscreen' | 'aside' | 'split' | 'custom';
export type BuilderThemeMode = 'light' | 'dark' | 'system';
export type BuilderHistoryPersistence = 'none' | 'local' | 'endpoint';

export interface BuilderHomeLink {
  label: string;
  href?: string;
  description?: string;
  icon?: string;
}

export interface BuilderHome {
  greeting?: { title?: string; subtitle?: string };
  links?: BuilderHomeLink[];
}

export interface BuilderCapabilities {
  starters?: string[];
  attachments?: { accept?: string[] };
  history?: { persistence: BuilderHistoryPersistence };
  conversations?: boolean;
}

export type BuilderWidgetPosition = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start';

/** `layout: 'widget'`-scoped FAB chrome — mirrors `construct.v1`'s own
 *  `widget` block. Meaningless on any other layout, which is exactly why
 *  the panel section it drives is HIDDEN, not just disabled, on any other
 *  layout (see the Layout section's own doc comment for that distinction). */
export interface BuilderWidget {
  position?: BuilderWidgetPosition;
  launcherIcon?: string;
  defaultOpen?: boolean;
}

export type BuilderProviderMode = 'mock' | 'endpoint';
export type BuilderProviderWire = 'openai' | 'anthropic';

/** Mirrors `construct.v1`'s own `provider` discriminated union
 *  (`mcp/construct/schema.ts`'s `ProviderSchema`) — `mock` needs
 *  nothing else; `endpoint` needs the consumer's own chat route + wire
 *  format. A DISPLAY/edit stub, not a real one: no dev-server exists for
 *  this design round to actually call, so there's nothing to validate the
 *  URL against — the field exists so a template's panel shows the whole
 *  construct shape, not because this round wires it to anything. */
export interface BuilderProvider {
  mode: BuilderProviderMode;
  url?: string;
  wire?: BuilderProviderWire;
}

/** Mirrors `construct.v1`'s own `cards` entry shape (`schema.ts`'s
 *  `cards` array): a tool-facing `name` plus the kit's card-schema JSON.
 *  `schema` is `Record<string, unknown>` here too — deep card validation
 *  (incl. `x-kai-format` mask hints) is the kit's own card contract at
 *  render time, not this stub panel's job; this stub only ever READS
 *  `schema.title` for a display label (Round A's read-only Cards section —
 *  see `BuilderPanelSections.cards`). */
export interface BuilderCard {
  name: string;
  schema?: Record<string, unknown>;
}

export interface BuilderConstruct {
  name: string;
  layout: BuilderLayoutKind;
  provider?: BuilderProvider;
  header?: { title?: string };
  theme?: { accent?: string; unreadColor?: string; mode?: BuilderThemeMode };
  home?: BuilderHome;
  capabilities?: BuilderCapabilities;
  widget?: BuilderWidget;
  cards?: BuilderCard[];
}

/**
 * A template-scoped section configuration (Round W, T-2/T-6): a template
 * FIXES its layout internally (no layout radio) and owns which of the
 * layout-scoped sections apply — a widget template shows Widget chrome
 * unconditionally (it IS the widget template, not merely "currently set to
 * widget"), where the old layout-driven panel showed it only when the
 * layout radio happened to be on "Widget". Omit this prop entirely to get
 * the original, generic, layout-driven panel (every existing test above
 * exercises that default) — a template panel opts INTO the narrower set
 * rather than the generic panel opting out.
 */
export interface BuilderPanelSections {
  /** Show the Layout radio section. Default `true` (the generic panel).
   *  A template panel sets this `false` — T-2: the template fixes the
   *  layout, so there is nothing left to choose here. */
  layout?: boolean;
  /** The Widget-chrome section's visibility. `'auto'` (default) follows
   *  `value.layout === 'widget'`, the original cross-field-visibility
   *  behavior. `'always'` shows it unconditionally — what a Support widget
   *  template panel wants, since for THAT template the section is never
   *  conditional, it's simply always this template's own controls.
   *  `'never'` hides it — what every non-widget template wants once each
   *  gets its own `Labs/Builder/<Template>` story. */
  widget?: 'auto' | 'always' | 'never';
  /** Show the Provider section (mode + endpoint URL/wire when applicable).
   *  Default `false` — the generic panel predates `provider` existing on
   *  `BuilderConstruct` at all; a template panel opts in. */
  provider?: boolean;
  /** Show the Home section (greeting/links tab). Default `true` (the
   *  generic panel). A template with no Home concept at all — In-app
   *  assistant (Round A): widget-only chrome, no Home/Messages tab bar in
   *  its own construct basis (`fixtures/ops-console.construct.json` has no
   *  `home` key) — sets this `false` to remove the section outright,
   *  rather than leaving a switch that would only ever read "off". */
  home?: boolean;
  /** Show a READ-ONLY Cards section: the construct's declared card names
   *  (Round A's `cards` addition to `BuilderConstruct`), with a muted note
   *  that editing them is a later round. Default `false`. Deliberately not
   *  an editor — a template whose construct basis carries `cards` (like
   *  `ops-console.construct.json`'s `deployment_parameters` form) still
   *  needs the panel to acknowledge them exist rather than silently
   *  dropping them from view, without this design round faking a card-
   *  schema editor it doesn't have (decide loudly, per CLAUDE.md). */
  cards?: boolean;
}

export interface BuilderPanelProps {
  /** The construct being edited. Controlled — the panel never holds its own copy. */
  value: BuilderConstruct;
  /** Fires with the next construct on every edit. */
  onChange: (next: BuilderConstruct) => void;
  /** Which sections render — see `BuilderPanelSections`. Omit for the
   *  original generic, layout-driven panel. */
  sections?: BuilderPanelSections;
  class?: string;
}

/** One "common case" chip for `capabilities.attachments.accept`: a human label
 *  over one or more raw MIME patterns. Owner feedback (design round 2):
 *  raw MIME types are hostile to the audience this panel is for, so the
 *  common cases get a toggle chip and the raw list is a secondary, visible
 *  ("Advanced") affordance rather than the primary input. */
export interface AcceptChip {
  id: string;
  label: string;
  patterns: readonly string[];
}

/**
 * The chip → MIME-pattern map for the attachments accept editor below.
 *
 * Exported (not module-local) because it's exactly the vocabulary a future
 * schema-driven wizard or capability menu (RECOMMENDATION.md's "real build")
 * will also want — one place to widen the common-case list rather than a
 * second one growing beside it.
 */
export const ACCEPT_CHIPS: readonly AcceptChip[] = [
  { id: 'images', label: 'Images', patterns: ['image/*'] },
  { id: 'pdfs', label: 'PDFs', patterns: ['application/pdf'] },
  {
    id: 'documents',
    label: 'Documents',
    patterns: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ],
  },
  {
    id: 'spreadsheets',
    label: 'Spreadsheets',
    patterns: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
  },
  { id: 'audio', label: 'Audio', patterns: ['audio/*'] },
  { id: 'video', label: 'Video', patterns: ['video/*'] },
];

/** The wizard's stated default (also the kit's own example everywhere else —
 *  scaffold.ts, the construct fixtures): Images + PDFs on. Derived from
 *  `ACCEPT_CHIPS` rather than hand-typed again, so widening either chip's
 *  pattern list keeps this in sync automatically. */
const DEFAULT_ACCEPT: string[] = [
  ...(ACCEPT_CHIPS.find((c) => c.id === 'images')?.patterns ?? []),
  ...(ACCEPT_CHIPS.find((c) => c.id === 'pdfs')?.patterns ?? []),
];

// ─────────────────────────────────────────────────────────────────────────────
// Local layout helpers — a section header + a consistent field row, so the
// rhythm (label size, spacing, hint color) is set once, not per field.
// ─────────────────────────────────────────────────────────────────────────────

export function Section(props: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4 last:border-b-0" data-builder-section={props.title}>
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{props.title}</h3>
      {props.children}
    </section>
  );
}

export function Field(props: { label: string; hint?: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-foreground">{props.label}</label>
      {props.children}
      <Show when={props.hint}>
        <p class="text-xs text-muted-foreground">{props.hint}</p>
      </Show>
    </div>
  );
}

export function Row(props: { label: string; children: JSX.Element; muted?: boolean }): JSX.Element {
  return (
    <div class="flex items-center justify-between gap-3">
      <span class={cn('text-xs font-medium', props.muted ? 'text-muted-foreground' : 'text-foreground')}>
        {props.label}
      </span>
      {props.children}
    </div>
  );
}

/** A minimal, reusable string-tag editor — the taglist pattern the spike
 *  proved out (`starters`). `capabilities.attachments.accept` moved to
 *  `AcceptTypeEditor` below (owner feedback, design round 2): raw MIME
 *  strings are a bad first surface for this audience. */
export function TagEditor(props: {
  tags: string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
}): JSX.Element {
  const [draft, setDraft] = createSignal('');
  const add = (): void => {
    const v = draft().trim();
    if (!v) return;
    props.onChange([...props.tags, v]);
    setDraft('');
  };
  const remove = (i: number): void => props.onChange(props.tags.filter((_, idx) => idx !== i));
  return (
    <div class="flex flex-col gap-2" role="group" aria-label={props.ariaLabel}>
      <Show when={props.tags.length > 0}>
        <div class="flex flex-wrap gap-1.5">
          <For each={props.tags}>
            {(tag, i) => (
              <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="size-4 rounded-full p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  aria-label={`Remove ${tag}`}
                  onClick={() => remove(i())}
                >
                  <X size={12} aria-hidden="true" />
                </Button>
              </span>
            )}
          </For>
        </div>
      </Show>
      <div class="flex items-center gap-2">
        <Input
          data-control
          size="sm"
          type="text"
          value={draft()}
          placeholder={props.placeholder ?? 'Add…'}
          aria-label={props.ariaLabel}
          onValueInput={setDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * `capabilities.attachments.accept` — chips for the common cases
 * (`ACCEPT_CHIPS`) over a collapsed "Advanced" raw MIME-list editor.
 *
 * A chip lights up (`aria-pressed`) exactly when EVERY one of its patterns is
 * present in `accept` — toggling it adds/removes that whole pattern group.
 *
 * Owner feedback (design round 5): the raw pattern list is no longer shown
 * under the chips at all — it lives ONLY inside the "Advanced" disclosure,
 * as an autosizing textarea (one MIME type/glob per line, not a comma
 * string: each edit adds or removes a LINE rather than reflowing a long
 * wrapped string, and a list copied from a spec or another tool's `accept`
 * field is naturally one-per-line already; a pasted comma list still parses
 * fine, `commitDraft` splits on either). A hand-added entry lives only
 * there; no chip claims it.
 */
export function AcceptTypeEditor(props: { accept: string[]; onChange: (next: string[]) => void }): JSX.Element {
  const isActive = (chip: AcceptChip): boolean => chip.patterns.every((p) => props.accept.includes(p));
  const toggleChip = (chip: AcceptChip): void => {
    if (isActive(chip)) {
      props.onChange(props.accept.filter((p) => !chip.patterns.includes(p)));
      return;
    }
    const next = props.accept.slice();
    for (const p of chip.patterns) if (!next.includes(p)) next.push(p);
    props.onChange(next);
  };

  // The advanced field's own draft text — kept in sync with `accept` (chip
  // toggles included) via the effect below, but otherwise free to hold
  // whatever the person is mid-typing without a keystroke-by-keystroke
  // re-parse fighting them.
  const [draft, setDraft] = createSignal(props.accept.join('\n'));
  createEffect(on(() => props.accept, (accept) => setDraft(accept.join('\n')), { defer: true }));
  const commitDraft = (text: string): void => {
    props.onChange(
      text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  };

  return (
    <div class="flex flex-col gap-2" data-builder-accept-editor>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Common file types">
        <For each={ACCEPT_CHIPS}>
          {(chip) => (
            <ToggleChip pressed={isActive(chip)} onChange={() => toggleChip(chip)}>
              {chip.label}
            </ToggleChip>
          )}
        </For>
      </div>
      <details class="group">
        <summary class="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Advanced: exact MIME types
        </summary>
        <div class="mt-2 flex flex-col gap-1.5">
          {/* `Textarea` is already an autosizing box (`ui/textarea.tsx` ->
              `useAutoResize`) — the same primitive `kai-form`'s
              `TextareaWidget` and the feedback bar's comment box already
              grow on, reused here rather than duplicated. `maxHeight` caps
              it so a long hand-typed list scrolls instead of pushing the
              rest of the panel down; `minHeight` floors it at roughly two
              lines at this text size (16px line-height × 2 + 12px vertical
              padding + 2px border) even while empty or freshly revealed —
              this box starts life inside a collapsed <details>, exactly the
              case `useAutoResize`'s ResizeObserver fix (design round 7)
              exists for. */}
          <Textarea
            data-builder-accept-raw
            class="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
            maxHeight={160}
            minHeight={46}
            value={draft()}
            placeholder={'image/*\napplication/pdf'}
            aria-label="Exact MIME types, one per line"
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={(e) => commitDraft(e.currentTarget.value)}
          />
          <p class="text-xs text-muted-foreground">
            One media type or glob per line — a chip above stays lit only while all of its patterns are here.
          </p>
        </div>
      </details>
    </div>
  );
}

/** `home.links` — the array-of-objects hard case (RECOMMENDATION.md), as a
 *  small labeled-row repeater. Each row explicitly numbered ("Link N") so a
 *  scanning eye always knows which entry it's looking at. */
export function LinksEditor(props: { links: BuilderHomeLink[]; onChange: (next: BuilderHomeLink[]) => void }): JSX.Element {
  const setRow = (i: number, patch: Partial<BuilderHomeLink>): void => {
    const next = props.links.slice();
    next[i] = { ...next[i], ...patch };
    props.onChange(next);
  };
  const addRow = (): void => props.onChange([...props.links, { label: 'New link' }]);
  const removeRow = (i: number): void => props.onChange(props.links.filter((_, idx) => idx !== i));
  return (
    <div class="flex flex-col gap-2" data-builder-links>
      <For each={props.links}>
        {(link, i) => (
          <div class="flex flex-col gap-2 rounded-lg border border-border/70 bg-surface p-2.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-medium text-muted-foreground">Link {i() + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove link ${i() + 1}`}
                onClick={() => removeRow(i())}
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
            <Input
              size="sm"
              value={link.label}
              placeholder="Label"
              aria-label={`Link ${i() + 1} label`}
              onValueInput={(v) => setRow(i(), { label: v })}
            />
            <Input
              size="sm"
              value={link.href ?? ''}
              placeholder="https://…"
              aria-label={`Link ${i() + 1} href`}
              onValueInput={(v) => setRow(i(), { href: v || undefined })}
            />
            <Input
              size="sm"
              value={link.description ?? ''}
              placeholder="Description"
              aria-label={`Link ${i() + 1} description`}
              onValueInput={(v) => setRow(i(), { description: v || undefined })}
            />
          </div>
        )}
      </For>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        Add link
      </Button>
    </div>
  );
}

// `custom` is deliberately NOT offered (owner ruling, design round 8): it's
// the bring-your-own-composition tier (named slots, no capabilities wired by
// codegen), not a fifth peer of these four. The builder's own escape hatch
// for it is "eject and compose by hand" — see the hint text under the radio
// group below — not a fifth radio option that would silently produce a
// construct codegen can't actually finish wiring.
const LAYOUT_OPTIONS: readonly RadioOption<BuilderLayoutKind>[] = [
  { value: 'widget', label: 'Widget', description: 'Floating launcher + panel' },
  { value: 'fullscreen', label: 'Fullscreen', description: 'The whole viewport' },
  { value: 'aside', label: 'Aside', description: 'Docked beside your content' },
  { value: 'split', label: 'Split', description: 'Chat beside a reserved pane' },
];

const WIDGET_POSITION_OPTIONS = [
  { value: 'bottom-end' as const, label: 'Bottom end' },
  { value: 'bottom-start' as const, label: 'Bottom start' },
  { value: 'top-end' as const, label: 'Top end' },
  { value: 'top-start' as const, label: 'Top start' },
];

const MODE_OPTIONS = [
  { value: 'system' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

const HISTORY_OPTIONS = [
  { value: 'none' as const, label: 'None — nothing saved' },
  { value: 'local' as const, label: 'Local — this browser' },
  { value: 'endpoint' as const, label: 'Endpoint — your backend' },
];

const PROVIDER_MODE_OPTIONS = [
  { value: 'mock' as const, label: 'Mock — canned replies, no network calls' },
  { value: 'endpoint' as const, label: 'Endpoint — your own chat route' },
];

const PROVIDER_WIRE_OPTIONS = [
  { value: 'openai' as const, label: 'OpenAI-compatible' },
  { value: 'anthropic' as const, label: 'Anthropic' },
];

const DEFAULT_PANEL_SECTIONS: Required<BuilderPanelSections> = {
  layout: true,
  widget: 'auto',
  provider: false,
  home: true,
  cards: false,
};

/**
 * `BuilderPanel` — the visual construct builder's inspector: identity, layout,
 * theme, an optional Home tab, and capabilities. Pure props/callbacks, stub-
 * friendly (no dev-server seam, no schema derivation) — a STORY-FIRST design
 * surface for the panel's look, per RECOMMENDATION.md. Composed entirely from
 * the kit's own controls (`Input`/`Textarea`/`Switch`/`RadioGroup`/`Select`/
 * `Button`/`ColorField`/`ToggleChip`); no `part=` attributes — this component is not
 * yet wired to a `kai-*` facade.
 *
 * Round W (T-2/T-6) added `sections` (`BuilderPanelSections`): omit it for
 * the original generic, layout-driven panel this doc comment otherwise
 * describes unchanged; pass it to scope the panel to ONE template's control
 * set — no Layout radio, Widget chrome shown unconditionally rather than
 * `layout`-conditionally, a Provider section — the shape `Labs/Builder/
 * Support widget` (`src/elements/builder.stories.tsx`) actually uses.
 *
 * Three patterns from the spike (plus the owner's own round-8 ruling) get
 * real design treatment here rather than being hand-waved:
 *  - **presence-as-boolean**: `home` and `capabilities.attachments` are each
 *    driven by ONE switch that adds/removes the whole sub-object, with its
 *    revealed fields directly below (no second "enabled" flag living beside
 *    the object it toggles).
 *  - **cross-field visibility, field-level**: `capabilities.conversations`
 *    requires `capabilities.history.persistence` to be `local`/`endpoint`
 *    (the schema's own `superRefine` rule) — shown as a disabled switch with
 *    the reason spelled out in muted text right below it, not a validation
 *    error surfaced after the fact.
 *  - **cross-field visibility, section-level**: the whole "Widget" section
 *    (position/launcher icon/open-by-default) is meaningless outside
 *    `layout: 'widget'`, and unlike the single Conversations toggle above, a
 *    disabled-and-explained SECTION would just be three greyed-out rows for
 *    one sentence's worth of reason — so it's hidden entirely, not disabled,
 *    whenever `layout` isn't `'widget'` (owner ruling, design round 8; see
 *    that section's own comment for the full distinction).
 */
export function BuilderPanel(props: BuilderPanelProps): JSX.Element {
  const v = () => props.value;
  const sections = (): Required<BuilderPanelSections> => ({ ...DEFAULT_PANEL_SECTIONS, ...props.sections });
  const widgetSectionVisible = (): boolean => {
    const mode = sections().widget;
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    return v().layout === 'widget';
  };
  const update = (patch: Partial<BuilderConstruct>): void => props.onChange({ ...v(), ...patch });
  const updateHeader = (patch: Partial<NonNullable<BuilderConstruct['header']>>): void =>
    update({ header: { ...v().header, ...patch } });
  const updateTheme = (patch: Partial<NonNullable<BuilderConstruct['theme']>>): void =>
    update({ theme: { ...v().theme, ...patch } });
  const updateHome = (patch: Partial<BuilderHome>): void => update({ home: { ...v().home, ...patch } });
  const updateCaps = (patch: Partial<BuilderCapabilities>): void =>
    update({ capabilities: { ...v().capabilities, ...patch } });
  const updateWidget = (patch: Partial<BuilderWidget>): void => update({ widget: { ...v().widget, ...patch } });
  const updateProvider = (patch: Partial<BuilderProvider>): void =>
    update({ provider: { mode: v().provider?.mode ?? 'mock', ...v().provider, ...patch } });

  const setHomeEnabled = (on: boolean): void => {
    if (on) {
      update({ home: v().home ?? {} });
      return;
    }
    const { home: _home, ...rest } = v();
    props.onChange(rest);
  };

  const setAttachmentsEnabled = (enabled: boolean): void => {
    if (enabled) {
      updateCaps({ attachments: v().capabilities?.attachments ?? { accept: DEFAULT_ACCEPT.slice() } });
      return;
    }
    const { attachments: _attachments, ...restCaps } = v().capabilities ?? {};
    update({ capabilities: restCaps });
  };

  const historyPersistence = (): BuilderHistoryPersistence => v().capabilities?.history?.persistence ?? 'none';
  const conversationsDisabled = (): boolean => historyPersistence() === 'none';

  return (
    <div class={cn('flex flex-col divide-y divide-border text-sm text-foreground', props.class)} data-builder-panel>
      <Section title="Identity">
        <Field label="Name" hint="The emitted custom-element tag, e.g. acme-support.">
          <Input size="sm" value={v().name} placeholder="acme-support" onValueInput={(val) => update({ name: val })} />
        </Field>
        <Field label="Header title" hint="Shown in the chat header bar.">
          <Input
            size="sm"
            value={v().header?.title ?? ''}
            placeholder="Acme Support"
            onValueInput={(val) => updateHeader({ title: val || undefined })}
          />
        </Field>
      </Section>

      {/* Provider — DISPLAY/edit of `construct.v1`'s own `provider` union
          (`mode: 'mock'` needs nothing else; `mode: 'endpoint'` needs the
          consumer's own chat route + wire format), opt-in via
          `sections().provider` (default off — the generic panel predates
          `provider` existing on the stub `BuilderConstruct` at all). No
          dev-server exists for this design round to actually call, so
          there's nothing here to validate a URL against; the section
          exists so a template's panel shows the WHOLE construct shape a
          real build would emit, not because this round wires it to
          anything (mirrors the Home/Widget stub-typed-only convention
          already established above). */}
      <Show when={sections().provider}>
        <Section title="Provider">
          <Field label="Mode">
            <Select
              aria-label="Provider mode"
              options={PROVIDER_MODE_OPTIONS}
              value={v().provider?.mode ?? 'mock'}
              onChange={(e) => updateProvider({ mode: e.currentTarget.value as BuilderProviderMode })}
            />
          </Field>
          <Show when={v().provider?.mode === 'endpoint'}>
            <Field label="Endpoint URL" hint="Your own chat route. The kit parses the stream; you fetch it.">
              <Input
                size="sm"
                value={v().provider?.url ?? ''}
                placeholder="/api/chat"
                onValueInput={(val) => updateProvider({ url: val || undefined })}
              />
            </Field>
            <Field label="Wire format">
              <Select
                aria-label="Wire format"
                options={PROVIDER_WIRE_OPTIONS}
                value={v().provider?.wire ?? 'openai'}
                onChange={(e) => updateProvider({ wire: e.currentTarget.value as BuilderProviderWire })}
              />
            </Field>
          </Show>
        </Section>
      </Show>

      <Show when={sections().layout}>
        <Section title="Layout">
          <RadioGroup<BuilderLayoutKind>
            options={LAYOUT_OPTIONS}
            value={v().layout}
            label="Layout"
            onChange={(val) => update({ layout: val })}
          />
          <p class="text-xs text-muted-foreground">
            Need a custom composition? Eject and compose by hand.
          </p>
        </Section>
      </Show>

      {/*
        Layout-scoped section — the cross-field-visibility pattern's OTHER
        shape (owner ruling, design round 8), deliberately different from
        Capabilities' Conversations row below: Conversations stays VISIBLE
        but disabled-with-a-reason, because it's one dependent TOGGLE next to
        the field it depends on and the disabled state IS the explanation.
        A whole SECTION of fields that are meaningless for the current
        layout is a different case — "Position" / "Launcher icon" / "Open by
        default" disabled-and-explained would just be noise on every
        non-widget layout, three greyed-out rows for one sentence's worth of
        reason. So this section is HIDDEN ENTIRELY (unmounted, not just
        disabled) whenever layout isn't "widget", and reappears the instant
        it is — same as Home's presence-as-boolean reveal, but keyed off a
        SIBLING field's value instead of this section's own toggle.

        Round W (T-2/T-6) generalized the KEY this is scoped to, not the
        pattern itself: `sections().widget` defaults to `'auto'`, which is
        exactly the `layout === 'widget'` check above, so the generic panel
        (every test in builder-panel.test.tsx) is unaffected byte-for-byte.
        A TEMPLATE panel passes `'always'` (Support widget — this section
        is never conditional for that template, it just IS the template's
        controls, T-2: no layout radio means nothing to condition on) or
        `'never'` (every other template, once each lands its own story).
      */}
      <Show when={widgetSectionVisible()}>
        <Section title="Widget">
          <Field label="Position">
            <Select
              aria-label="Widget position"
              options={WIDGET_POSITION_OPTIONS}
              value={v().widget?.position ?? 'bottom-end'}
              onChange={(e) => updateWidget({ position: e.currentTarget.value as BuilderWidgetPosition })}
            />
          </Field>
          <Field label="Launcher icon" hint="Image URL replacing the default chat-bubble glyph.">
            <Input
              size="sm"
              value={v().widget?.launcherIcon ?? ''}
              placeholder="https://…/icon.svg"
              onValueInput={(val) => updateWidget({ launcherIcon: val || undefined })}
            />
          </Field>
          <Row label="Open by default">
            <Switch
              checked={v().widget?.defaultOpen === true}
              label="Open by default"
              onChange={(defaultOpen) => updateWidget({ defaultOpen: defaultOpen || undefined })}
            />
          </Row>
        </Section>
      </Show>

      <Section title="Theme">
        <Field label="Accent">
          <ColorField
            label="Accent color"
            value={v().theme?.accent}
            placeholder="#e91e63"
            onChange={(val) => updateTheme({ accent: val || undefined })}
          />
        </Field>
        <Field label="Unread color">
          <ColorField
            label="Unread indicator color"
            value={v().theme?.unreadColor}
            placeholder="#38bdf8"
            onChange={(val) => updateTheme({ unreadColor: val || undefined })}
          />
        </Field>
        <Field label="Mode">
          <Select
            aria-label="Theme mode"
            options={MODE_OPTIONS}
            value={v().theme?.mode ?? 'system'}
            onChange={(e) => updateTheme({ mode: e.currentTarget.value as BuilderThemeMode })}
          />
        </Field>
      </Section>

      <Show when={sections().home}>
        <Section title="Home">
          <Row label="Home tab">
            <Switch checked={v().home !== undefined} label="Home tab" onChange={setHomeEnabled} />
          </Row>
          <Show
            when={v().home}
            fallback={
              <p class="text-xs text-muted-foreground">
                Off — the widget opens straight into chat, no Home/Messages tab bar.
              </p>
            }
          >
            {(home) => (
              <div class="flex flex-col gap-3">
                <Field label="Greeting title">
                  <Input
                    size="sm"
                    value={home().greeting?.title ?? ''}
                    placeholder="Hi there 👋"
                    onValueInput={(val) => updateHome({ greeting: { ...home().greeting, title: val || undefined } })}
                  />
                </Field>
                <Field label="Greeting subtitle">
                  <Input
                    size="sm"
                    value={home().greeting?.subtitle ?? ''}
                    placeholder="How can we help?"
                    onValueInput={(val) => updateHome({ greeting: { ...home().greeting, subtitle: val || undefined } })}
                  />
                </Field>
                <Field label="Links">
                  <LinksEditor links={home().links ?? []} onChange={(next) => updateHome({ links: next })} />
                </Field>
              </div>
            )}
          </Show>
        </Section>
      </Show>

      <Section title="Capabilities">
        <Field label="Starters" hint="Prompts shown on the empty thread.">
          <TagEditor
            tags={v().capabilities?.starters ?? []}
            onChange={(next) => updateCaps({ starters: next })}
            ariaLabel="Starters"
            placeholder="Add a starter…"
          />
        </Field>

        <Row label="Attachments">
          <Switch checked={v().capabilities?.attachments !== undefined} label="Attachments" onChange={setAttachmentsEnabled} />
        </Row>
        <Show when={v().capabilities?.attachments}>
          {(att) => (
            <Field label="Accepted types">
              <AcceptTypeEditor
                accept={att().accept ?? []}
                onChange={(next) => updateCaps({ attachments: { accept: next } })}
              />
            </Field>
          )}
        </Show>

        <Field label="History">
          <Select
            aria-label="History persistence"
            options={HISTORY_OPTIONS}
            value={historyPersistence()}
            onChange={(e) => updateCaps({ history: { persistence: e.currentTarget.value as BuilderHistoryPersistence } })}
          />
        </Field>

        <Row label="Conversations" muted={conversationsDisabled()}>
          <Switch
            checked={v().capabilities?.conversations === true}
            disabled={conversationsDisabled()}
            label="Conversations"
            onChange={(on) => updateCaps({ conversations: on || undefined })}
          />
        </Row>
        <Show when={conversationsDisabled()}>
          <p class="text-xs text-muted-foreground">
            Needs History set to Local or Endpoint — a conversation list needs somewhere to persist conversations.
          </p>
        </Show>
      </Section>

      {/* Cards — READ-ONLY (Round A). A card is declared with a full JSON
          Schema + `x-kai-*` widget/format/mask hints (see `BuilderCard`'s
          own doc comment) that this stub panel has no editor for and isn't
          building one this round — showing nothing here would silently
          drop a real part of the construct from view, which is worse than
          an honest "not yet editable" (CLAUDE.md: decide loudly). Each row
          shows the schema's own `title` when present (falling back to the
          tool-facing `name`), never invents a friendlier label. */}
      <Show when={sections().cards}>
        <Section title="Cards">
          <Show
            when={(v().cards ?? []).length > 0}
            fallback={<p class="text-xs text-muted-foreground">No cards declared.</p>}
          >
            <div class="flex flex-col gap-1.5" data-builder-cards-list>
              <For each={v().cards}>
                {(card) => (
                  <div class="rounded-lg border border-border/70 bg-surface px-2.5 py-1.5 text-xs text-foreground">
                    {typeof card.schema?.title === 'string' ? card.schema.title : card.name}
                  </div>
                )}
              </For>
            </div>
            <p class="text-xs text-muted-foreground">Read-only for now — card editing is a later round.</p>
          </Show>
        </Section>
      </Show>

      <Section title="Raw JSON">
        <details class="group">
          <summary class="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            View raw construct JSON
          </summary>
          <pre class="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-foreground">
            {JSON.stringify(v(), null, 2)}
          </pre>
        </details>
      </Section>
    </div>
  );
}
