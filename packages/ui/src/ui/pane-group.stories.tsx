import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show, type JSX } from 'solid-js';
import { PaneGroup, type PaneTab } from './pane-group';
import { componentDescription } from '../stories/docs/element-controls';

// --- Story helpers -------------------------------------------------------

/** Three agents in varied states — a pulsing worker, a finished one, and one that
 *  needs you (amber ring + always-on status word). */
const TABS: PaneTab[] = [
  { id: 'atlas', name: 'Atlas', status: { tone: 'working', label: 'Running', pulse: true } },
  { id: 'ivy', name: 'Ivy', status: { tone: 'done', label: 'Green' } },
  { id: 'cleo', name: 'Cleo', status: { tone: 'blocked', label: 'Needs input' }, needsAttention: true },
];

/** A terminal-ish pane body, one per agent — what the consumer swaps on selection. */
const BODIES: Record<string, JSX.Element> = {
  atlas: (
    <div class="space-y-2 p-3 text-sm text-muted-foreground">
      <p class="text-foreground">Fanning the checkout refactor out to the fleet.</p>
      <pre class="overflow-x-auto rounded-md bg-surface-sunken p-2 text-xs text-foreground">{`$ atlas dispatch --plan checkout\n→ otto · ivy · cleo\n3 agents running`}</pre>
    </div>
  ),
  ivy: (
    <div class="space-y-2 p-3 text-sm text-muted-foreground">
      <p class="text-foreground">Suite is green after the change.</p>
      <pre class="overflow-x-auto rounded-md bg-surface-sunken p-2 text-xs text-foreground">{`$ vitest run\n✓ 142 passed (2.1s)`}</pre>
    </div>
  ),
  cleo: (
    <div class="space-y-2 p-3 text-sm text-muted-foreground">
      <p class="text-foreground">The checkout guide needs a provider example.</p>
      <blockquote class="border-l-2 border-tool-amber pl-3 text-foreground">
        Which provider should the auth section target — Stripe or the in-house gateway?
      </blockquote>
      <p>Waiting on your call.</p>
    </div>
  ),
};

const meta = {
  title: 'Components/Elements/Pane Group',
  component: PaneGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['children', 'tabs', 'onTabChange', 'onTabClose', 'onTabMenu'] },
      description: componentDescription([
        'An editor group: a tab strip (numbered-status-badge tabs) over a single content area showing the active tab\'s pane body. The reusable "one column = a group of agents shown as tabs" primitive from the Multi-Agent Workspace, extracted from the hand-rolled group in the Split Workspace demo.',
        'Each tab leads with a tone-colored numbered badge — the color encodes status (`working` blue, `idle` muted, `done` green, `error` red, `blocked` amber), the digit is the keyboard ⌥-jump number. The status word shows on the active tab, on hover, and always for a needs-attention / error tab; a needs-attention tab carries an amber ring even when inactive. Each tab has a close "×" and an optional "…" overflow.',
        'Composition: the group owns the tab UX, the consumer owns the pane content — it renders `children` as the active body and you swap it on `onTabChange`. Selection-only; it never routes content itself. Give the group a bounded height for the body scroll.',
      ]),
    },
  },
  argTypes: {
    tabs: { control: false, description: 'The tabs (array of { id, name, status?, needsAttention?, number? }).' },
    active: { control: 'text', description: 'The active tab id. Defaults to the first tab.' },
    focused: { control: 'boolean', description: 'Ring the frame as the active group in a multi-group layout.' },
    onTabChange: { control: false, description: 'A tab was selected. (id) => void.' },
    onTabClose: { control: false, description: 'A tab\'s × was clicked. (id) => void.' },
    onTabMenu: { control: false, description: 'A tab\'s "…" was clicked. (id) => void. Omit to hide the button.' },
    children: { control: false, description: 'The active pane body (you swap it on onTabChange).' },
    class: { control: 'text', description: 'Extra classes for the outer frame.' },
  },
} satisfies Meta<typeof PaneGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { PaneGroup, type PaneTab } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** A group with three tabs in varied states. Click a tab (or arrow-key across the
 *  strip) to swap the body; the "…" / "×" fire their callbacks. */
export const Default: Story = {
  render: () => {
    const [active, setActive] = createSignal('atlas');
    const [closed, setClosed] = createSignal<Set<string>>(new Set());
    const live = () => TABS.filter((t) => !closed().has(t.id));
    return (
      <div class="h-80 max-w-lg">
        <Show
          when={live().length}
          fallback={<div class="flex h-full items-center justify-center rounded-xl border border-border text-sm text-muted-foreground">All tabs closed.</div>}
        >
          <PaneGroup
            tabs={live()}
            active={active()}
            onTabChange={setActive}
            onTabClose={(id) => {
              setClosed((s) => new Set(s).add(id));
              if (active() === id) setActive(live().find((t) => t.id !== id)?.id ?? '');
            }}
            onTabMenu={(id) => console.log('menu', id)}
          >
            {BODIES[active()]}
          </PaneGroup>
        </Show>
      </div>
    );
  },
  ...src(`const [active, setActive] = createSignal('atlas');

const tabs: PaneTab[] = [
  { id: 'atlas', name: 'Atlas', status: { tone: 'working', label: 'Running', pulse: true } },
  { id: 'ivy',   name: 'Ivy',   status: { tone: 'done',    label: 'Green' } },
  { id: 'cleo',  name: 'Cleo',  status: { tone: 'blocked', label: 'Needs input' }, needsAttention: true },
];

// The group owns the tab UX; you own the pane content + swap it on change.
<PaneGroup
  tabs={tabs}
  active={active()}
  onTabChange={setActive}
  onTabClose={(id) => closeTab(id)}
  onTabMenu={(id) => openMenu(id)}
>
  {bodies[active()]}
</PaneGroup>`),
};

/** `focused` rings the frame to mark this as the active group in a multi-group
 *  layout (e.g. a row of columns, each a group). */
export const Focused: Story = {
  render: () => {
    const [active, setActive] = createSignal('ivy');
    return (
      <div class="h-80 max-w-lg">
        <PaneGroup tabs={TABS} active={active()} focused onTabChange={setActive} onTabClose={() => {}} onTabMenu={() => {}}>
          {BODIES[active()]}
        </PaneGroup>
      </div>
    );
  },
  ...src(`<PaneGroup
  tabs={tabs}
  active={active()}
  focused                       // rings the active group
  onTabChange={setActive}
  onTabClose={(id) => closeTab(id)}
  onTabMenu={(id) => openMenu(id)}
>
  {bodies[active()]}
</PaneGroup>`),
};

/** Every status tone in the badge, so the hue mapping reads at a glance: `working`
 *  blue (pulsing), `idle` muted, `done` green, `error` red, `blocked` amber. The
 *  badge digit is the keyboard ⌥-jump number. */
export const Tones: Story = {
  render: () => {
    const tabs: PaneTab[] = [
      { id: 'a', name: 'Atlas', status: { tone: 'working', label: 'Working', pulse: true } },
      { id: 'b', name: 'Dara', status: { tone: 'idle', label: 'Idle' } },
      { id: 'c', name: 'Ivy', status: { tone: 'done', label: 'Done' } },
      { id: 'd', name: 'Rex', status: { tone: 'error', label: '2 findings' } },
      { id: 'e', name: 'Nova', status: { tone: 'blocked', label: 'Awaiting approval' }, needsAttention: true },
    ];
    const [active, setActive] = createSignal('a');
    return (
      <div class="h-80 max-w-2xl">
        <PaneGroup tabs={tabs} active={active()} onTabChange={setActive} onTabClose={() => {}} onTabMenu={() => {}}>
          <div class="p-3 text-sm text-muted-foreground">
            Active: <span class="text-foreground">{tabs.find((t) => t.id === active())?.name}</span>
          </div>
        </PaneGroup>
      </div>
    );
  },
  ...src(`// tone → numbered-badge color (light + dark from tokens):
//   working → blue · idle → muted · done → green · error → red · blocked → amber
const tabs: PaneTab[] = [
  { id: 'a', name: 'Atlas', status: { tone: 'working', label: 'Working', pulse: true } },
  { id: 'b', name: 'Dara', status: { tone: 'idle',    label: 'Idle' } },
  { id: 'c', name: 'Ivy',  status: { tone: 'done',    label: 'Done' } },
  { id: 'd', name: 'Rex',  status: { tone: 'error',   label: '2 findings' } },
  { id: 'e', name: 'Nova', status: { tone: 'blocked', label: 'Awaiting approval' }, needsAttention: true },
];

<PaneGroup tabs={tabs} active={active()} onTabChange={setActive} … />`),
};
