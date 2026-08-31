/**
 * DerivedBuilderPanel (B-19/B-25) — the REAL builder inspector: controls
 * DERIVE from ConstructSchema.shape (construct-form-paths' walk), the
 * template registry's `controls` manifest selects and orders the sections,
 * a path-keyed FIELD_OVERRIDES map supplies bespoke editors, and the
 * RULE_VISIBILITY registry (keyed by CROSS_FIELD_RULES ids) drives
 * hide/disable/show-requires. Typed over the REAL Construct — the legacy
 * BuilderPanel (stub BuilderConstruct, four design-round stories) stays
 * as-is; this module reuses its Section/Field/Row rhythm and editors, which
 * is what "keeps the merged section/row rhythm" means once the type
 * changes. Migrating the four template stories onto this panel is recorded
 * follow-up, not this task.
 */
import { type JSX, Show, For, createUniqueId } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { X } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { ColorField } from '../ui/color-field';
import { BUTTON_VARIANT_NAMES } from '../ui/button-variant-names';
import { Section, Field, Row, TagEditor, AcceptTypeEditor, LinksEditor } from './builder-panel';
import { ActionRowPicker, USER_ACTION_CATALOG, ASSISTANT_ACTION_CATALOG } from './builder-message-actions';
import type { BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct, ConstructProblem } from '../agent-tooling/construct/schema';
import {
  getAtPath, setAtPath, deleteAtPath,
  readPresenceBoolean, writePresenceBoolean, PRESENCE_BOOLEAN_PATHS,
  readAnchoredBoolean, writeAnchoredBoolean, ANCHORED_BOOLEAN_DEFAULTS,
  schemaNodeAt, controlKindFor, RULE_VISIBILITY,
} from './construct-form-paths';

export interface DerivedBuilderPanelProps {
  value: Construct; // controlled; the panel holds no copy
  onChange: (next: Construct) => void; // fires a whole next Construct per edit
  template: BuildableTemplate; // registry entry — controls manifest + starter (section seeds)
  problems?: readonly ConstructProblem[]; // server-side rejections, rendered per path
  class?: string;
}

export interface FieldEditorProps {
  path: string;
  value: Construct;
  write: (next: Construct) => void;
}

/** Human labels for schema path leaves the walk cannot name well. Fallback:
 *  the last path segment, capitalized. */
const FIELD_LABELS: Record<string, string> = {
  'name': 'Name',
  'aside.width': 'Width',
  'aside.position': 'Position',
  'header.title': 'Header title',
  'header.themeToggle': 'Theme toggle',
  'theme.mode': 'Mode',
  'theme.accent': 'Accent',
  'theme.unreadColor': 'Unread color',
  'capabilities.starters': 'Starters',
  'capabilities.reasoning': 'Reasoning',
  'capabilities.reasoningOpen': 'Reasoning open',
  'capabilities.conversations': 'Conversations',
  'capabilities.sources.strip': 'Sources strip',
  'shell.commandPalette': 'Command palette',
  'widget.position': 'Position',
  'widget.launcherIcon': 'Launcher icon',
  'widget.defaultOpen': 'Open by default',
  'home.recentConversation': 'Recent conversation',
  // The design story's own labels (builder-workspace.stories.tsx's
  // WorkSurfaceSection) — the panel names these controls the way the approved
  // design names them, never a fresh auto-generated wording.
  'workSurface.kind': 'Pane kind',
  'workSurface.url': 'Preview URL',
  'workSurface.codeUrl': 'Code URL',
  'workSurface.chrome.deviceToggle': 'Device toggle',
  'workSurface.chrome.urlBar': 'URL bar',
  'workSurface.chrome.openInNewTab': 'Open in new tab',
  'workSurface.chrome.expand': 'Expand',
  'workSurface.chrome.codeView': 'Code view',
};
export function labelFor(path: string): string {
  const named = FIELD_LABELS[path];
  if (named) return named;
  const leaf = path.split('.').at(-1)!;
  return leaf.charAt(0).toUpperCase() + leaf.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase();
}

// ── Bespoke editors, path-keyed in FIELD_OVERRIDES below ────────────────────

function AccentEditor(props: FieldEditorProps): JSX.Element {
  return (
    <ColorField
      label={labelFor(props.path)}
      value={getAtPath(props.value, props.path) as string | undefined}
      onChange={(v) => props.write(setAtPath(props.value, props.path, v || undefined))}
    />
  );
}

function UnreadColorEditor(props: FieldEditorProps): JSX.Element {
  return (
    <ColorField
      label={labelFor(props.path)}
      value={getAtPath(props.value, props.path) as string | undefined}
      onChange={(v) => props.write(setAtPath(props.value, props.path, v || undefined))}
    />
  );
}

const DEFAULT_ACCEPT: string[] = ['image/*', 'application/pdf'];

function AttachmentsEditor(props: FieldEditorProps): JSX.Element {
  const current = () => getAtPath(props.value, props.path) as { accept?: string[] } | undefined;
  const setEnabled = (on: boolean): void => {
    props.write(
      on ? setAtPath(props.value, props.path, current() ?? { accept: DEFAULT_ACCEPT.slice() }) : deleteAtPath(props.value, props.path),
    );
  };
  return (
    <>
      <Row label="Attachments">
        <Switch checked={current() !== undefined} label="Attachments" onChange={setEnabled} />
      </Row>
      <Show when={current()}>
        {(att) => (
          <Field label="Accepted types">
            <AcceptTypeEditor
              accept={att().accept ?? []}
              onChange={(next) => props.write(setAtPath(props.value, props.path, { accept: next }))}
            />
          </Field>
        )}
      </Show>
    </>
  );
}

const HISTORY_PERSISTENCE_OPTIONS = [
  { value: 'none', label: 'None — nothing saved' },
  { value: 'local', label: 'Local — this browser' },
  { value: 'endpoint', label: 'Endpoint — your backend' },
];

function HistoryEditor(props: FieldEditorProps): JSX.Element {
  const current = () => getAtPath(props.value, props.path) as { persistence?: string; url?: string } | undefined;
  const persistence = () => current()?.persistence ?? 'none';
  const persistenceId = createUniqueId();
  const urlId = createUniqueId();
  return (
    <>
      <div class="flex flex-col gap-1.5">
        <label for={persistenceId} class="text-xs font-medium text-foreground">History</label>
        <Select
          id={persistenceId}
          options={HISTORY_PERSISTENCE_OPTIONS}
          value={persistence()}
          onChange={(e) =>
            props.write(setAtPath(props.value, props.path, { persistence: e.currentTarget.value }))
          }
        />
      </div>
      <Show when={persistence() === 'endpoint'}>
        <div class="flex flex-col gap-1.5">
          <label for={urlId} class="text-xs font-medium text-foreground">Endpoint URL</label>
          <Input
            id={urlId}
            size="sm"
            required
            value={current()?.url ?? ''}
            placeholder="/api/history"
            onValueInput={(v) =>
              props.write(setAtPath(props.value, props.path, { ...current(), url: v || undefined }))
            }
          />
        </div>
      </Show>
    </>
  );
}

/**
 * Cards — READ-ONLY (mirrors the legacy stub panel's own Cards section in
 * builder-panel.tsx, wired here for the derived panel as part of the
 * 2026-08-29 design-parity fix wave). A card is declared with a full JSON
 * Schema + `x-kai-*` widget/format/mask hints that this panel has no editor
 * for and isn't building one this round — showing nothing here would
 * silently drop a real part of the construct from view, which is worse
 * than an honest "not yet editable" (CLAUDE.md: decide loudly). Each row
 * shows the schema's own `title` when present, falling back to the
 * tool-facing `name`.
 */
function CardsEditor(props: FieldEditorProps): JSX.Element {
  const cards = () => (getAtPath(props.value, props.path) as Construct['cards']) ?? [];
  return (
    <Show
      when={cards().length > 0}
      fallback={<p class="text-xs text-muted-foreground">No cards declared.</p>}
    >
      <div class="flex flex-col gap-1.5" data-builder-cards-list>
        <For each={cards()}>
          {(card) => (
            <div class="rounded-lg border border-border/70 bg-surface px-2.5 py-1.5 text-xs text-foreground">
              {typeof card.schema?.title === 'string' ? (card.schema.title as string) : card.name}
            </div>
          )}
        </For>
      </div>
      <p class="mt-1.5 text-xs text-muted-foreground">Read-only for now — card editing is a later round.</p>
    </Show>
  );
}

function messageActionsEditor(role: 'user' | 'assistant'): (props: FieldEditorProps) => JSX.Element {
  const catalog = role === 'user' ? USER_ACTION_CATALOG : ASSISTANT_ACTION_CATALOG;
  const legend = role === 'user' ? 'Your messages' : 'Assistant messages';
  return function MessageActionsEditor(props: FieldEditorProps): JSX.Element {
    const enabledIds = () => (getAtPath(props.value, props.path) as string[] | undefined) ?? [];
    const rows = () => {
      const enabled = enabledIds();
      const enabledRows = enabled
        .map((id) => catalog.find((c) => c.id === id))
        .filter((c): c is (typeof catalog)[number] => c !== undefined)
        .map((c) => ({ id: c.id, enabled: true }));
      const restRows = catalog.filter((c) => !enabled.includes(c.id)).map((c) => ({ id: c.id, enabled: false }));
      return [...enabledRows, ...restRows];
    };
    return (
      // The role-group heading (design parity fix): `ActionRowPicker`'s own
      // `legend` prop is an `aria-label` only — no visible text — so a
      // panel with BOTH roles' pickers back-to-back (Research, Assistant,
      // Workspace all wire both) rendered as one flat unlabeled list with
      // two "Copy" rows and nothing distinguishing them. The design story
      // (builder-assistant.stories.tsx) never relied on the component to
      // show this on its own — it wraps each picker in its own visible
      // `<span>` label. Matching that exact wrapper here, once, fixes every
      // template that reuses this editor.
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-foreground">{legend}</span>
        <ActionRowPicker
          legend={legend}
          catalog={catalog}
          rows={rows()}
          onChange={(next) => {
            const ids = next.filter((r) => r.enabled).map((r) => r.id);
            props.write(setAtPath(props.value, props.path, ids));
          }}
        />
      </div>
    );
  };
}
const UserMessageActionsEditor = messageActionsEditor('user');
const AssistantMessageActionsEditor = messageActionsEditor('assistant');

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

interface TriggerEntry {
  id: string;
  label: string;
  description?: string;
}

function triggerEntriesEditor(kind: 'slash' | 'mention'): (props: FieldEditorProps) => JSX.Element {
  return function TriggerEntriesEditor(props: FieldEditorProps): JSX.Element {
    const rows = () => (getAtPath(props.value, props.path) as TriggerEntry[] | undefined) ?? [];
    const setRow = (i: number, patch: Partial<TriggerEntry>): void => {
      const next = rows().slice();
      const row = { ...next[i], ...patch };
      row.id = row.id || slugify(row.label ?? '');
      next[i] = row;
      props.write(setAtPath(props.value, props.path, next));
    };
    const addRow = (): void =>
      props.write(setAtPath(props.value, props.path, [...rows(), { id: 'new', label: 'New' }]));
    const removeRow = (i: number): void =>
      props.write(setAtPath(props.value, props.path, rows().filter((_, idx) => idx !== i)));
    const noun = kind === 'slash' ? 'slash command' : 'mention';
    return (
      <div class="flex flex-col gap-2" data-trigger-entries={kind}>
        <For each={rows()}>
          {(row, i) => (
            <div class="flex flex-col gap-2 rounded-lg border border-border/70 bg-surface p-2.5">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-medium text-muted-foreground">
                  {noun} {i() + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${noun} ${i() + 1}`}
                  onClick={() => removeRow(i())}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </div>
              <Input
                size="sm"
                value={row.label}
                placeholder="Label"
                aria-label={`${noun} ${i() + 1} label`}
                onValueInput={(v) => setRow(i(), { label: v, id: slugify(v) })}
              />
              <Input
                size="sm"
                value={row.id}
                placeholder="id"
                aria-label={`${noun} ${i() + 1} id`}
                onValueInput={(v) => setRow(i(), { id: v })}
              />
              <Input
                size="sm"
                value={row.description ?? ''}
                placeholder="Description"
                aria-label={`${noun} ${i() + 1} description`}
                onValueInput={(v) => setRow(i(), { description: v || undefined })}
              />
            </div>
          )}
        </For>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          Add {noun}
        </Button>
      </div>
    );
  };
}
const SlashTriggersEditor = triggerEntriesEditor('slash');
const MentionTriggersEditor = triggerEntriesEditor('mention');

interface HeaderAction {
  label: string;
  variant?: string;
}

function HeaderActionsEditor(props: FieldEditorProps): JSX.Element {
  const rows = () => (getAtPath(props.value, props.path) as HeaderAction[] | undefined) ?? [];
  const setRow = (i: number, patch: Partial<HeaderAction>): void => {
    const next = rows().slice();
    next[i] = { ...next[i], ...patch };
    props.write(setAtPath(props.value, props.path, next));
  };
  const addRow = (): void => props.write(setAtPath(props.value, props.path, [...rows(), { label: 'New' }]));
  const removeRow = (i: number): void =>
    props.write(setAtPath(props.value, props.path, rows().filter((_, idx) => idx !== i)));
  return (
    <div class="flex flex-col gap-2" data-header-actions>
      <For each={rows()}>
        {(row, i) => (
          <div class="flex flex-col gap-2 rounded-lg border border-border/70 bg-surface p-2.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-medium text-muted-foreground">Action {i() + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove action ${i() + 1}`}
                onClick={() => removeRow(i())}
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
            <Input
              size="sm"
              value={row.label}
              placeholder="Label"
              aria-label={`Action ${i() + 1} label`}
              onValueInput={(v) => setRow(i(), { label: v })}
            />
            <Select
              options={[
                { value: '', label: 'Default' },
                ...BUTTON_VARIANT_NAMES.map((v) => ({ value: v, label: v })),
              ]}
              value={row.variant ?? ''}
              aria-label={`Action ${i() + 1} variant`}
              onChange={(e) => setRow(i(), { variant: e.currentTarget.value || undefined })}
            />
          </div>
        )}
      </For>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        Add action
      </Button>
    </div>
  );
}

interface UserMenu {
  name: string;
  plan?: string;
}

function UserMenuEditor(props: FieldEditorProps): JSX.Element {
  const current = () => getAtPath(props.value, props.path) as UserMenu | undefined;
  const setEnabled = (on: boolean): void => {
    props.write(on ? setAtPath(props.value, props.path, current() ?? { name: '' }) : deleteAtPath(props.value, props.path));
  };
  const nameId = createUniqueId();
  const planId = createUniqueId();
  return (
    <>
      <Row label="User menu">
        <Switch checked={current() !== undefined} label="User menu" onChange={setEnabled} />
      </Row>
      <Show when={current()}>
        {(um) => (
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label for={nameId} class="text-xs font-medium text-foreground">Name</label>
              <Input
                id={nameId}
                size="sm"
                required
                value={um().name}
                onValueInput={(v) => props.write(setAtPath(props.value, props.path, { ...um(), name: v }))}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for={planId} class="text-xs font-medium text-foreground">Plan</label>
              <Input
                id={planId}
                size="sm"
                value={um().plan ?? ''}
                onValueInput={(v) => props.write(setAtPath(props.value, props.path, { ...um(), plan: v || undefined }))}
              />
            </div>
          </div>
        )}
      </Show>
    </>
  );
}

interface HomeShape {
  greeting?: { title?: string; subtitle?: string };
  recentConversation?: boolean;
  links?: { label: string; href?: string; description?: string; icon?: string }[];
}

function HomeEditor(props: FieldEditorProps): JSX.Element {
  const current = () => getAtPath(props.value, props.path) as HomeShape | undefined;
  const setEnabled = (on: boolean): void => {
    props.write(on ? setAtPath(props.value, props.path, current() ?? {}) : deleteAtPath(props.value, props.path));
  };
  const titleId = createUniqueId();
  const subtitleId = createUniqueId();
  return (
    <>
      <Row label="Home tab">
        <Switch checked={current() !== undefined} label="Home tab" onChange={setEnabled} />
      </Row>
      <Show when={current()}>
        {(home) => (
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label for={titleId} class="text-xs font-medium text-foreground">Greeting title</label>
              <Input
                id={titleId}
                size="sm"
                value={home().greeting?.title ?? ''}
                onValueInput={(v) =>
                  props.write(
                    setAtPath(props.value, `${props.path}.greeting`, { ...home().greeting, title: v || undefined }),
                  )
                }
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for={subtitleId} class="text-xs font-medium text-foreground">Greeting subtitle</label>
              <Input
                id={subtitleId}
                size="sm"
                value={home().greeting?.subtitle ?? ''}
                onValueInput={(v) =>
                  props.write(
                    setAtPath(props.value, `${props.path}.greeting`, { ...home().greeting, subtitle: v || undefined }),
                  )
                }
              />
            </div>
            <Row label="Recent conversation">
              <Switch
                checked={readPresenceBoolean(props.value, `${props.path}.recentConversation`)}
                label="Recent conversation"
                onChange={(on) => props.write(writePresenceBoolean(props.value, `${props.path}.recentConversation`, on))}
              />
            </Row>
            <Field label="Links">
              <LinksEditor
                links={home().links ?? []}
                onChange={(next) => props.write(setAtPath(props.value, `${props.path}.links`, next))}
              />
            </Field>
          </div>
        )}
      </Show>
    </>
  );
}

const PROVIDER_MODE_OPTIONS = [
  { value: 'mock', label: 'Mock — canned replies, no network calls' },
  { value: 'endpoint', label: 'Endpoint — your own chat route' },
];

const PROVIDER_WIRE_OPTIONS = [
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'anthropic', label: 'Anthropic' },
];

interface ProviderShape {
  mode: 'mock' | 'endpoint';
  url?: string;
  wire?: 'openai' | 'anthropic';
}

function ProviderEditor(props: FieldEditorProps): JSX.Element {
  const current = () => getAtPath(props.value, props.path) as ProviderShape;
  const modeId = createUniqueId();
  const urlId = createUniqueId();
  const wireId = createUniqueId();
  return (
    <>
      <div class="flex flex-col gap-1.5">
        <label for={modeId} class="text-xs font-medium text-foreground">Mode</label>
        <Select
          id={modeId}
          options={PROVIDER_MODE_OPTIONS}
          value={current()?.mode ?? 'mock'}
          onChange={(e) => {
            const mode = e.currentTarget.value;
            props.write(
              setAtPath(props.value, props.path, mode === 'mock' ? { mode: 'mock' } : { mode: 'endpoint', url: '', wire: 'openai' }),
            );
          }}
        />
      </div>
      <Show when={current()?.mode === 'endpoint'}>
        <div class="flex flex-col gap-1.5">
          <label for={urlId} class="text-xs font-medium text-foreground">Endpoint URL</label>
          <Input
            id={urlId}
            size="sm"
            value={current()?.url ?? ''}
            placeholder="/api/chat"
            onValueInput={(v) => props.write(setAtPath(props.value, props.path, { ...current(), url: v }))}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for={wireId} class="text-xs font-medium text-foreground">Wire format</label>
          <Select
            id={wireId}
            options={PROVIDER_WIRE_OPTIONS}
            value={current()?.wire ?? 'openai'}
            onChange={(e) => props.write(setAtPath(props.value, props.path, { ...current(), wire: e.currentTarget.value }))}
          />
        </div>
      </Show>
    </>
  );
}

export const FIELD_OVERRIDES: Record<string, (props: FieldEditorProps) => JSX.Element> = {
  'theme.accent': AccentEditor,
  'theme.unreadColor': UnreadColorEditor,
  'capabilities.attachments': AttachmentsEditor,
  'capabilities.history': HistoryEditor,
  'capabilities.messageActions.user': UserMessageActionsEditor,
  'capabilities.messageActions.assistant': AssistantMessageActionsEditor,
  'composer.triggers.slash': SlashTriggersEditor,
  'composer.triggers.mention': MentionTriggersEditor,
  'header.actions': HeaderActionsEditor,
  'shell.userMenu': UserMenuEditor,
  'home': HomeEditor,
  'provider': ProviderEditor,
  'cards': CardsEditor,
};

// The generic derived field (B-25 a11y baked in — real label/for, generated
// ids, aria-describedby wiring).
function DerivedField(props: FieldEditorProps & { disabledReason?: string }): JSX.Element {
  const node = () => schemaNodeAt(props.path);
  const kind = () => (node() ? controlKindFor(node()!) : ({ kind: 'complex' } as const));
  const id = createUniqueId();
  const reasonId = `${id}-reason`;
  const label = labelFor(props.path);
  const current = () => getAtPath(props.value, props.path);
  const write = (v: unknown) => props.write(setAtPath(props.value, props.path, v));
  const anchored = () => props.path in ANCHORED_BOOLEAN_DEFAULTS;
  const presence = () => (PRESENCE_BOOLEAN_PATHS as readonly string[]).includes(props.path);
  return (
    <>
      <Show when={kind().kind === 'enum'}>
        <div class="flex flex-col gap-1.5">
          <label for={id} class="text-xs font-medium text-foreground">{label}</label>
          <Select
            id={id}
            options={(kind() as { options: readonly string[] }).options.map((value) => ({ value, label: value }))}
            value={(current() as string | undefined) ?? ''}
            onChange={(e) => write(e.currentTarget.value || undefined)}
          />
        </div>
      </Show>
      <Show when={kind().kind === 'boolean' || presence() || anchored()}>
        <Row label={label} muted={Boolean(props.disabledReason)}>
          <Switch
            checked={
              anchored() ? readAnchoredBoolean(props.value, props.path)
              : presence() ? readPresenceBoolean(props.value, props.path)
              : current() === true
            }
            disabled={Boolean(props.disabledReason)}
            label={label}
            aria-describedby={props.disabledReason ? reasonId : undefined}
            onChange={(on) =>
              props.write(
                anchored() ? writeAnchoredBoolean(props.value, props.path, on)
                : presence() ? writePresenceBoolean(props.value, props.path, on)
                : on ? setAtPath(props.value, props.path, true) : deleteAtPath(props.value, props.path),
              )
            }
          />
        </Row>
        <Show when={props.disabledReason}>
          <p id={reasonId} class="text-xs text-muted-foreground">{props.disabledReason}</p>
        </Show>
      </Show>
      <Show when={kind().kind === 'string'}>
        <div class="flex flex-col gap-1.5">
          <label for={id} class="text-xs font-medium text-foreground">{label}</label>
          <Input id={id} size="sm" value={(current() as string | undefined) ?? ''} onValueInput={(v) => write(v || undefined)} />
        </div>
      </Show>
      <Show when={kind().kind === 'string-list'}>
        <Field label={label}>
          <TagEditor
            tags={(current() as string[] | undefined) ?? []}
            onChange={(next) => write(next)}
            ariaLabel={label}
          />
        </Field>
      </Show>
    </>
  );
}

export function DerivedBuilderPanel(props: DerivedBuilderPanelProps): JSX.Element {
  const hiddenSections = (): Set<string> => {
    const hidden = new Set<string>();
    for (const [, vis] of Object.entries(RULE_VISIBILITY)) {
      if (vis.treatment !== 'hide-section') continue;
      // The rule's precondition: the section's key is layout-scoped; hide
      // unless the construct's layout matches the scope the rule STATES.
      // Never `vis.section` — that only ever worked because `widget` and
      // `aside` are named after their layouts, and `workSurface`/`split` is
      // not (2026-08-30).
      if (props.value.layout !== vis.layout) hidden.add(vis.section);
    }
    return hidden;
  };
  const disabledReasonFor = (path: string): string | undefined => {
    for (const vis of Object.values(RULE_VISIBILITY)) {
      if (vis.treatment !== 'disable-with-reason' || vis.path !== path) continue;
      if (path === 'capabilities.conversations') {
        const p = props.value.capabilities?.history?.persistence;
        if (!p || p === 'none') return vis.reason;
      }
      if (path === 'capabilities.reasoningOpen') {
        const r = props.value.capabilities?.reasoning;
        if (r === 'compact' || r === 'off') return vis.reason;
      }
    }
    return undefined;
  };
  const problemsFor = (section: { paths: readonly string[] }): ConstructProblem[] =>
    (props.problems ?? []).filter((p) => section.paths.some((sp) => p.path === sp || p.path.startsWith(`${sp}.`)));

  return (
    <div class={cn('flex flex-col divide-y divide-border text-sm text-foreground', props.class)} data-derived-panel>
      <For each={props.template.controls.filter((s) => !hiddenSections().has(s.id))}>
        {(section) => (
          <section class="flex flex-col gap-3 border-b border-border p-4 last:border-b-0" data-derived-section={section.id}>
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sectionTitle(section.id)}</h3>
            <For each={section.paths}>
              {(path) => {
                const Override = FIELD_OVERRIDES[path];
                const hint = section.hints?.[path];
                return (
                  <>
                    {Override ? (
                      <Dynamic component={Override} path={path} value={props.value} write={props.onChange} />
                    ) : (
                      <DerivedField path={path} value={props.value} write={props.onChange} disabledReason={disabledReasonFor(path)} />
                    )}
                    <Show when={hint}>
                      {/* One site, not five: DerivedField's enum/string/boolean
                          branches each render their own label+control inline, so
                          threading a hint through `Field` would mean five render
                          sites for one line of text. Same class Field's own hint
                          uses (builder-panel.tsx's Field), so it looks identical. */}
                      <p class="text-xs text-muted-foreground" data-derived-hint={path}>{hint}</p>
                    </Show>
                  </>
                );
              }}
            </For>
            <For each={problemsFor(section)}>
              {(p) => <p class="text-xs text-destructive" role="alert">{p.path}: {p.message}</p>}
            </For>
          </section>
        )}
      </For>
    </div>
  );
}

const SECTION_TITLES: Record<string, string> = {
  identity: 'Identity', theme: 'Theme', header: 'Header', empty: 'Empty state',
  home: 'Home', capabilities: 'Capabilities', messageActions: 'Message actions',
  sources: 'Sources', widget: 'Widget', aside: 'Aside', composerTriggers: 'Composer triggers',
  shell: 'Shell', provider: 'Provider', cards: 'Cards', workSurface: 'Work surface',
};
function sectionTitle(id: string): string { return SECTION_TITLES[id] ?? id; }
