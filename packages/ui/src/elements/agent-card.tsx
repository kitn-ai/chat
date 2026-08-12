import { defineWebComponent } from './define';
import { AgentCard, type AgentStatus } from '../ui/agent-card';

interface Props extends Record<string, unknown> {
  /** The agent's name, the primary label. Attribute: `name`. */
  name?: string;
  /** Selected / focused state: highlighted border + surface. Attribute: `active`. */
  active?: boolean;
  /** Raise a prominent "Needs you" pill plus a glowing amber edge. This
   *  is the attention-routing signal that pulls focus to this agent.
   *  Attribute: `needs-attention`. */
  needsAttention?: boolean;
  /** Run status. A JS PROPERTY (object), not an attribute. Shape: `{ tone,
   *  label?, pulse? }`, where `tone` is one of `working` | `idle` | `done` |
   *  `error` | `blocked` (maps to the kit's tool hues), `label` is an optional
   *  short string beside the dot, and `pulse` animates the dot. Set it with
   *  `el.status = { tone: 'working', label: 'Working', pulse: true }`. */
  status?: AgentStatus;
}

/** Events fired by `<kai-agent-card>`. */
interface Events {
  /** The card was activated by a click, or by Enter / Space while focused.
   *  Promote this agent back to focus. */
  'kai-activate': void;
  /** The trailing "..." kebab was clicked. The consumer opens its own menu; the
   *  card only surfaces the affordance (the click does not also activate the card). */
  'kai-menu': void;
}

/**
 * `<kai-agent-card>` — the compact glanceable card for one agent in a multi-agent
 * workspace. The agent name with a leading tone-colored status dot, an optional
 * "Needs you" attention treatment, an `active` (selected) state, and a trailing
 * "..." overflow button.
 *
 * Set `status` as a JS property (it's an object); `name` is a string attribute and
 * `active` / `needs-attention` are boolean attributes. Listen for `kai-activate`
 * (promote to focus) and `kai-menu` (open your own per-agent menu).
 *
 * ```html
 * <kai-agent-card name="Refactor bot" active></kai-agent-card>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const card = document.querySelector('kai-agent-card');
 *   card.status = { tone: 'working', label: 'Working', pulse: true };
 *   card.addEventListener('kai-activate', () => focusAgent());
 *   card.addEventListener('kai-menu', () => openMenu());
 * </script>
 * ```
 * Recolor the status dot via `::part(status)` and the kebab via `::part(menu)`.
 */
defineWebComponent<Props, Events>('kai-agent-card', {
  name: undefined,
  active: undefined,
  needsAttention: undefined,
  status: undefined,
}, (props, { dispatch, flag }) => (
  <AgentCard
    name={(props.name as string) ?? ''}
    active={flag('active')}
    needsAttention={flag('needsAttention')}
    status={(props.status as AgentStatus) ?? { tone: 'idle' }}
    onActivate={() => dispatch('kai-activate')}
    onMenu={() => dispatch('kai-menu')}
  />
));
