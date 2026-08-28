import { type JSX, For, createSignal } from 'solid-js';
import { ChevronUp, ChevronDown, X } from 'lucide-solid';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { renderIcon } from '../ui/icon';
import type { TriggerDef, TriggerItem } from './composer';

/**
 * The composer TRIGGERS control group — `/` (commands/skills) and `@`
 * (agents/mentions) — extracted as a standalone module (T-1 build-out,
 * owner addendum) so every template's composer control group can reuse the
 * SAME editor and the SAME real-`TriggerDef` builder, rather than each
 * template inventing its own.
 *
 * THIS WIRES THE KIT'S REAL MECHANISM, NOT A STUB: `components/composer.tsx`
 * (read before building this) ships `ComposerProps.triggers?: TriggerDef[]`
 * — a real, shipped, atomic-pill trigger system (`TriggerDef = { char, kind,
 * items?: TriggerItem[] }`) that `ChatThread` already forwards straight
 * through to `DefaultPromptInput`/`Composer` via its own `triggers` prop
 * (confirmed in `chat-thread.tsx` before use). Typing the configured
 * character in a real, mounted `ChatThread` composer opens the REAL trigger
 * menu and inserts a REAL atomic pill on selection — there is no "honest
 * stub" fallback needed here, unlike some other preview-only controls in
 * this template family, because the composer this story mounts IS the real
 * component. (`slashCommands`-as-flat-config was deliberately removed from
 * the kit in favor of this trigger system — this control group represents
 * that real shape, not the retired one.)
 *
 * `buildTriggerDefs` converts this panel's editable rows into the real
 * `TriggerDef[]` shape — the one and only translation point, so a story
 * wiring this into its `ChatThread` call never hand-assembles `TriggerDef`
 * itself.
 */
export interface TriggerEntryRow {
  id: string;
  label: string;
  description?: string;
  /** A curated `renderIcon` name, free text per the same convention the
   *  Workspace composer-menu editor uses. */
  icon?: string;
}

export interface TriggerGroupState {
  enabled: boolean;
  entries: TriggerEntryRow[];
}

let nextTriggerRowId = 1;
export function newTriggerRowId(prefix: string): string {
  return `${prefix}-${nextTriggerRowId++}`;
}

export const DEFAULT_SLASH_ENTRIES: TriggerEntryRow[] = [
  { id: newTriggerRowId('slash'), label: 'summarize', description: 'Summarize the thread so far', icon: 'sparkles' },
  { id: newTriggerRowId('slash'), label: 'translate', description: 'Translate the last message', icon: 'globe' },
];

export const DEFAULT_MENTION_ENTRIES: TriggerEntryRow[] = [
  { id: newTriggerRowId('mention'), label: 'researcher', description: 'Hands off to the research agent', icon: 'search' },
  { id: newTriggerRowId('mention'), label: 'coder', description: 'Hands off to the coding agent', icon: 'code' },
];

/** The one translation point from this panel's editable rows to the real
 *  `TriggerDef[]` a `ChatThread`/`Composer` `triggers` prop takes. `/` maps
 *  to `kind: 'command'`, `@` to `kind: 'agent'` — the two kinds
 *  `composer-highlight.ts`'s built-in glyphs already cover (checked before
 *  choosing them, see that file's `kindGlyph`). */
export function buildTriggerDefs(slash: TriggerGroupState, mention: TriggerGroupState): TriggerDef[] {
  const defs: TriggerDef[] = [];
  if (slash.enabled) {
    defs.push({
      char: '/',
      kind: 'command',
      items: slash.entries.map((e): TriggerItem => ({ id: e.id, label: e.label, description: e.description, icon: e.icon })),
    });
  }
  if (mention.enabled) {
    defs.push({
      char: '@',
      kind: 'agent',
      items: mention.entries.map((e): TriggerItem => ({ id: e.id, label: e.label, description: e.description, icon: e.icon })),
    });
  }
  return defs;
}

function TriggerEntryEditor(props: {
  legend: string;
  entries: TriggerEntryRow[];
  onChange: (v: TriggerEntryRow[]) => void;
  rowPrefix: string;
}): JSX.Element {
  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= props.entries.length) return;
    const next = props.entries.slice();
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(next);
  };
  const remove = (id: string): void => props.onChange(props.entries.filter((e) => e.id !== id));

  return (
    <div class="flex flex-col gap-1.5" role="group" aria-label={props.legend}>
      <For each={props.entries}>
        {(entry, i) => (
          <div class="flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1.5">
            {renderIcon(entry.icon, { class: 'size-3.5 shrink-0 text-muted-foreground' })}
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-xs font-medium text-foreground">{entry.label}</span>
              {entry.description && <span class="truncate text-[11px] text-muted-foreground">{entry.description}</span>}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${entry.label} up`} disabled={i() === 0} onClick={() => move(i(), -1)}>
              <ChevronUp size={12} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${entry.label} down`} disabled={i() === props.entries.length - 1} onClick={() => move(i(), 1)}>
              <ChevronDown size={12} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${entry.label}`} onClick={() => remove(entry.id)}>
              <X size={12} aria-hidden="true" />
            </Button>
          </div>
        )}
      </For>
    </div>
  );
}

function AddTriggerEntryForm(props: { onAdd: (row: TriggerEntryRow) => void; rowPrefix: string; placeholder: string }): JSX.Element {
  const [label, setLabel] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [icon, setIcon] = createSignal('');
  const add = (): void => {
    if (!label().trim()) return;
    props.onAdd({ id: newTriggerRowId(props.rowPrefix), label: label().trim(), description: description().trim() || undefined, icon: icon().trim() || undefined });
    setLabel('');
    setDescription('');
    setIcon('');
  };
  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-1.5">
        <Input value={label()} onValueInput={setLabel} placeholder={props.placeholder} class="flex-1 text-xs" />
        <Input value={icon()} onValueInput={setIcon} placeholder="icon name" class="w-24 shrink-0 text-xs" />
      </div>
      <div class="flex items-center gap-1.5">
        <Input value={description()} onValueInput={setDescription} placeholder="Description" class="flex-1 text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
    </div>
  );
}

/**
 * The full "Triggers" subsection: an on/off switch per trigger character,
 * each revealing its own entry editor when on. Meant to sit inside a
 * template's existing "Composer" panel section (a subsection, not a whole
 * new top-level section), matching the rhythm every other composer control
 * already uses.
 */
export function ComposerTriggersSection(props: {
  slash: TriggerGroupState;
  onSlashChange: (v: TriggerGroupState) => void;
  mention: TriggerGroupState;
  onMentionChange: (v: TriggerGroupState) => void;
}): JSX.Element {
  return (
    <div class="flex flex-col gap-3 pt-1" data-builder-composer-triggers>
      <span class="text-xs font-medium text-foreground">Triggers</span>

      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">/ commands</span>
        <Switch checked={props.slash.enabled} label="Slash commands" onChange={(v) => props.onSlashChange({ ...props.slash, enabled: v })} />
      </div>
      {props.slash.enabled && (
        <>
          <TriggerEntryEditor
            legend="Slash command entries"
            entries={props.slash.entries}
            onChange={(entries) => props.onSlashChange({ ...props.slash, entries })}
            rowPrefix="slash"
          />
          <AddTriggerEntryForm
            rowPrefix="slash"
            placeholder="/command"
            onAdd={(row) => props.onSlashChange({ ...props.slash, entries: [...props.slash.entries, row] })}
          />
        </>
      )}

      <div class="flex items-center justify-between gap-3 pt-1">
        <span class="text-xs text-muted-foreground">@ mentions</span>
        <Switch checked={props.mention.enabled} label="@ mentions" onChange={(v) => props.onMentionChange({ ...props.mention, enabled: v })} />
      </div>
      {props.mention.enabled && (
        <>
          <TriggerEntryEditor
            legend="Mention entries"
            entries={props.mention.entries}
            onChange={(entries) => props.onMentionChange({ ...props.mention, entries })}
            rowPrefix="mention"
          />
          <AddTriggerEntryForm
            rowPrefix="mention"
            placeholder="@agent"
            onAdd={(row) => props.onMentionChange({ ...props.mention, entries: [...props.mention.entries, row] })}
          />
        </>
      )}
      <p class="text-xs text-muted-foreground">
        Real triggers — wired to ChatThread's own `triggers` prop (components/composer.tsx). Typing the character opens the real menu
        and inserts a real pill.
      </p>
    </div>
  );
}
