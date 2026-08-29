import { type JSX, type Component, For } from 'solid-js';
import { Copy, ThumbsUp, ThumbsDown, RefreshCw, Pencil, Volume2, ChevronUp, ChevronDown } from 'lucide-solid';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import type { ChatMessageAction } from '../elements/chat-types';

/**
 * The role-scoped, ordered message-action picker — extracted from
 * `builder-in-app-assistant.stories.tsx` (Round A3) into this standalone
 * module during the T-1 build-out so the Assistant and Research templates
 * (both asked for a "message actions, role-scoped picker, reuse" section)
 * share one definition instead of forking it. `builder-in-app-assistant.
 * stories.tsx` was retrofitted to import from here in the same round; its
 * rendered output and behavior are unchanged — this is a pure extraction.
 *
 * Model: `ChatMessage.actions` (`elements/chat-types.ts`) is `(ChatMessage
 * Action | CustomAction)[]` — an ORDERED array, not a set — and role-scoped
 * only by caller curation (checked against `message.tsx`/`chat-thread.tsx`:
 * neither hard-couples any built-in id to a role). This picker enforces
 * role-appropriateness via two independent catalogs, one per role, each
 * independently ordered and toggled.
 *
 * `'speak'` (read-aloud) is a real `ChatMessageAction` (elements/
 * chat-actions.ts) backed by the kit's own SpeechSynthesis mechanics
 * (primitives/speech.ts, shared with `kai-voice-output`) via the shared
 * action-bar click router (primitives/message-feedback.ts).
 */
export type UserActionId = Extract<ChatMessageAction, 'edit' | 'copy'>;
export type AssistantActionId = ChatMessageAction;

export interface ActionRowDef<TId extends string> {
  id: TId;
  label: string;
  /** A curated icon — same components `ui/action-icons.ts`'s registry maps
   *  each built-in id to, so the picker's icons match what the real action
   *  bar renders. */
  icon: Component<{ class?: string }>;
}

export interface ActionRowState<TId extends string> {
  id: TId;
  enabled: boolean;
}

export const USER_ACTION_CATALOG: readonly ActionRowDef<UserActionId>[] = [
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'copy', label: 'Copy', icon: Copy },
];

export const ASSISTANT_ACTION_CATALOG: readonly ActionRowDef<AssistantActionId>[] = [
  { id: 'copy', label: 'Copy', icon: Copy },
  { id: 'like', label: 'Like', icon: ThumbsUp },
  { id: 'dislike', label: 'Dislike', icon: ThumbsDown },
  { id: 'regenerate', label: 'Regenerate', icon: RefreshCw },
  { id: 'speak', label: 'Read aloud', icon: Volume2 },
];

/** Owner defaults (Round A3): "Your messages" starts with only Edit on;
 *  "Assistant messages" starts with Copy/Like/Dislike on, Regenerate and
 *  Speak off. Row ORDER here is also the default enabled-action order. */
export const DEFAULT_USER_ACTION_ROWS: ActionRowState<UserActionId>[] = [
  { id: 'edit', enabled: true },
  { id: 'copy', enabled: false },
];

export const DEFAULT_ASSISTANT_ACTION_ROWS: ActionRowState<AssistantActionId>[] = [
  { id: 'copy', enabled: true },
  { id: 'like', enabled: true },
  { id: 'dislike', enabled: true },
  { id: 'regenerate', enabled: false },
  { id: 'speak', enabled: false },
];

/**
 * One role's ordered, toggleable action list — a vertical list of rows
 * (icon + label + up/down reorder buttons + an enable switch). Row ORDER
 * is the array order, and doubles
 * as the enabled-action order once filtered — no separate "priority"
 * field, because the component tier has no separate concept either.
 *
 * Up/down buttons over drag-and-drop: keyboard- and screen-reader-operable
 * for free, which a bare drag handle is not, without extra work a design
 * round doesn't need to do to prove the model (T-6).
 */
export function ActionRowPicker<TId extends string>(props: {
  legend: string;
  catalog: readonly ActionRowDef<TId>[];
  rows: ActionRowState<TId>[];
  onChange: (next: ActionRowState<TId>[]) => void;
}): JSX.Element {
  const defOf = (id: TId): ActionRowDef<TId> | undefined => props.catalog.find((c) => c.id === id);
  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= props.rows.length) return;
    const next = props.rows.slice();
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(next);
  };
  const setEnabled = (index: number, enabled: boolean): void => {
    const next = props.rows.slice();
    next[index] = { ...next[index], enabled };
    props.onChange(next);
  };
  return (
    <div class="flex flex-col gap-1" role="group" aria-label={props.legend}>
      <For each={props.rows}>
        {(row, i) => {
          const definition = defOf(row.id);
          const Icon = definition?.icon;
          const label = definition?.label ?? row.id;
          return (
            <div class="flex items-center gap-2 rounded-md border border-border/70 bg-surface px-2 py-1.5">
              {Icon ? <Icon class="size-3.5 shrink-0 text-muted-foreground" /> : null}
              <span class="flex-1 truncate text-xs font-medium text-foreground">{label}</span>
              <div class="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${label} up`}
                  disabled={i() === 0}
                  onClick={() => move(i(), -1)}
                >
                  <ChevronUp size={12} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${label} down`}
                  disabled={i() === props.rows.length - 1}
                  onClick={() => move(i(), 1)}
                >
                  <ChevronDown size={12} aria-hidden="true" />
                </Button>
              </div>
              <Switch checked={row.enabled} label={`Enable ${label}`} onChange={(v) => setEnabled(i(), v)} />
            </div>
          );
        }}
      </For>
    </div>
  );
}
