import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Download,
  Minus,
  MoreHorizontal,
  SlidersHorizontal,
  Trash2,
  UserPlus,
} from 'lucide-solid';
import './search';

// Declare the custom element tag for SolidJS JSX.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-search': JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        placeholder?: string;
        icon?: string;
        debounce?: number;
        loading?: boolean;
        shortcut?: string;
        theme?: string;
      };
    }
  }
}

// Labs/Proofs: a TOKEN-DRIVEN proof screen. The kit has no data-table / grid
// component, so this is a polished list-management view (a "Members" table) built
// from NOTHING BUT the design tokens + raw markup — no kai-* feature components,
// no third-party UI deps. Glyphs are inline lucide-solid SVGs (NOT kai-icon), to
// keep the surface pure token-driven markup. The point is to prove the token layer
// (bg-background / bg-card / bg-surface[-strong/-sunken], border-border,
// text-muted-foreground, the --color-tool-* hues, the radius + type scale) can
// carry a screen we ship no component for, and that light/dark falls out for free
// (storybook-dark-mode flips `.dark` on <html>; every utility below is token-keyed,
// no hardcoded hex anywhere).

type Status = 'active' | 'invited' | 'suspended';
type Role = 'Owner' | 'Admin' | 'Member' | 'Viewer';
type SortKey = 'name' | 'email' | 'role' | 'lastActive';
type SortDir = 'asc' | 'desc';

interface Member {
  id: string;
  name: string;
  email: string;
  status: Status;
  role: Role;
  lastActiveLabel: string;
  lastActiveMins: number; // for sorting
}

// Status -> a token-tinted pill. Each hue is the kit's --color-tool-* token over a
// translucent fill of the SAME hue (the documented chip recipe in theme.css). Both
// the fill and the text track light/dark because the token does. The class strings
// are full literals so Tailwind's content scanner emits them.
const STATUS: Record<Status, { label: string; pill: string; dot: string }> = {
  active: { label: 'Active', pill: 'bg-tool-green/15 text-tool-green', dot: 'bg-tool-green' },
  invited: { label: 'Invited', pill: 'bg-tool-amber/15 text-tool-amber', dot: 'bg-tool-amber' },
  suspended: { label: 'Suspended', pill: 'bg-tool-red/15 text-tool-red', dot: 'bg-tool-red' },
};

// Avatar-initial tints cycle the tool hues so the column reads as a real roster
// (deterministic by row index). Token-keyed, so they theme automatically.
const AVATAR_TINTS = [
  'bg-tool-blue/15 text-tool-blue',
  'bg-tool-green/15 text-tool-green',
  'bg-tool-amber/15 text-tool-amber',
  'bg-tool-red/15 text-tool-red',
];

const MEMBERS: Member[] = [
  { id: 'm-ava', name: 'Ava Thompson', email: 'ava@acme.io', status: 'active', role: 'Owner', lastActiveLabel: '2m ago', lastActiveMins: 2 },
  { id: 'm-marcus', name: 'Marcus Lee', email: 'marcus@acme.io', status: 'active', role: 'Admin', lastActiveLabel: '5m ago', lastActiveMins: 5 },
  { id: 'm-priya', name: 'Priya Nair', email: 'priya@acme.io', status: 'invited', role: 'Member', lastActiveLabel: '22m ago', lastActiveMins: 22 },
  { id: 'm-diego', name: 'Diego Ramos', email: 'diego@acme.io', status: 'active', role: 'Member', lastActiveLabel: '1h ago', lastActiveMins: 60 },
  { id: 'm-sara', name: 'Sara Muller', email: 'sara@acme.io', status: 'suspended', role: 'Viewer', lastActiveLabel: '3h ago', lastActiveMins: 180 },
  { id: 'm-tom', name: 'Tom Becker', email: 'tom@acme.io', status: 'active', role: 'Admin', lastActiveLabel: '4h ago', lastActiveMins: 240 },
  { id: 'm-lin', name: 'Lin Wei', email: 'lin@acme.io', status: 'invited', role: 'Member', lastActiveLabel: '1d ago', lastActiveMins: 1440 },
  { id: 'm-noah', name: 'Noah Khan', email: 'noah@acme.io', status: 'active', role: 'Member', lastActiveLabel: '2d ago', lastActiveMins: 2880 },
  { id: 'm-emma', name: 'Emma Clark', email: 'emma@acme.io', status: 'suspended', role: 'Viewer', lastActiveLabel: '6d ago', lastActiveMins: 8640 },
  { id: 'm-jonas', name: 'Jonas Frank', email: 'jonas@acme.io', status: 'active', role: 'Member', lastActiveLabel: '2w ago', lastActiveMins: 20160 },
];

const PAGE_SIZE = 6;

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// A token-driven checkbox: 16px box, neutral border at rest, primary fill when
// checked/indeterminate. No kit checkbox exists, so this is hand-rolled.
function CheckBox(props: { checked: boolean; indeterminate?: boolean; onToggle: () => void; label: string }) {
  const on = () => props.checked || props.indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.indeterminate ? 'mixed' : props.checked ? 'true' : 'false'}
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        props.onToggle();
      }}
      class="flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors"
      classList={{
        'border-border bg-background hover:border-muted-foreground/70': !on(),
        'border-primary bg-primary text-primary-foreground': on(),
      }}
    >
      <Show when={props.indeterminate} fallback={<Show when={props.checked}><Check size={11} strokeWidth={3.5} /></Show>}>
        <Minus size={11} strokeWidth={3.5} />
      </Show>
    </button>
  );
}

// A sortable column header: a label + a caret that reflects the current sort. The
// caret is faint + ChevronsUpDown when inactive, a solid up/down when active.
function SortHeader(props: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
  class?: string;
}) {
  const active = () => props.sortKey === props.col;
  return (
    <th scope="col" class={`px-3 py-2.5 text-left font-medium ${props.class ?? ''}`}>
      <button
        type="button"
        onClick={() => props.onSort(props.col)}
        class="-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-strong"
        classList={{ 'text-foreground': active(), 'text-muted-foreground hover:text-foreground': !active() }}
      >
        {props.label}
        <Show
          when={active()}
          fallback={<ChevronsUpDown size={13} class="opacity-40" aria-hidden="true" />}
        >
          <Show when={props.sortDir === 'asc'} fallback={<ChevronDown size={13} aria-hidden="true" />}>
            <ChevronUp size={13} aria-hidden="true" />
          </Show>
        </Show>
      </button>
    </th>
  );
}

const meta = { title: 'Labs/Proofs', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

export const DataTable: Story = {
  name: 'Data Table',
  render: () => {
    const [search, setSearch] = createSignal('');
    const [sortKey, setSortKey] = createSignal<SortKey>('name');
    const [sortDir, setSortDir] = createSignal<SortDir>('asc');
    const [selected, setSelected] = createSignal<Set<string>>(new Set());
    const [page, setPage] = createSignal(1);

    const onSort = (col: SortKey) => {
      if (sortKey() === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(col);
        setSortDir('asc');
      }
      setPage(1);
    };

    // Filter -> sort. Search matches name or email; sort by the active column +
    // direction (lastActive sorts on the numeric minutes-ago, not the label).
    const filtered = createMemo(() => {
      const q = search().trim().toLowerCase();
      const rows = q
        ? MEMBERS.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        : MEMBERS.slice();
      const key = sortKey();
      const dir = sortDir() === 'asc' ? 1 : -1;
      return rows.sort((a, b) => {
        let cmp: number;
        if (key === 'lastActive') cmp = a.lastActiveMins - b.lastActiveMins;
        else cmp = String(a[key]).localeCompare(String(b[key]));
        return cmp * dir;
      });
    });

    const totalPages = createMemo(() => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)));
    const pageRows = createMemo(() => {
      const start = (Math.min(page(), totalPages()) - 1) * PAGE_SIZE;
      return filtered().slice(start, start + PAGE_SIZE);
    });

    const toggleRow = (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });

    const allFilteredSelected = createMemo(
      () => filtered().length > 0 && filtered().every((m) => selected().has(m.id)),
    );
    const someFilteredSelected = createMemo(
      () => filtered().some((m) => selected().has(m.id)) && !allFilteredSelected(),
    );
    const toggleAll = () =>
      setSelected((prev) => {
        if (filtered().every((m) => prev.has(m.id))) {
          const next = new Set(prev);
          filtered().forEach((m) => next.delete(m.id));
          return next;
        }
        const next = new Set(prev);
        filtered().forEach((m) => next.add(m.id));
        return next;
      });

    const selectedCount = () => selected().size;

    return (
      // Page wraps in the recessed surface so the card lifts off it; the card is
      // bg-card with a border (the kit is flat-by-borders). Both are tokens, so the
      // whole screen re-skins on the dark toggle with zero extra rules.
      <div class="min-h-screen bg-surface-sunken px-4 py-8 text-foreground sm:px-8">
        <div class="mx-auto w-full max-w-5xl">
          {/* Screen header */}
          <div class="mb-5 flex items-end justify-between gap-4">
            <div>
              <h1 class="text-title font-semibold tracking-tight">Members</h1>
              <p class="mt-0.5 text-meta text-muted-foreground">
                Manage who has access to the Acme workspace.
              </p>
            </div>
            <span class="hidden text-meta text-muted-foreground tabular-nums sm:block">
              {MEMBERS.length} members
            </span>
          </div>

          <div class="overflow-hidden rounded-xl border border-border bg-card kai-elevation-sm">
            {/* TOOLBAR: search + filter on the left; a contextual bulk-action cluster
                on the right that swaps to a destructive/export set once rows are
                selected (the standard data-table pattern). */}
            <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
              {/* kai-search: the kit's inline filter field. Its leading search
                  icon and clear (×) button are built in, so the hand-rolled
                  icon/input/clear are gone. Its debounced kai-search event drives
                  the same `search` filter signal (controlled via the value prop). */}
              <div class="min-w-0 max-w-xs flex-1">
                <kai-search
                  ref={(el) => {
                    el.addEventListener('kai-search', (e) => {
                      setSearch((e as CustomEvent).detail.value);
                      setPage(1);
                    });
                  }}
                  value={search()}
                  placeholder="Search members..."
                ></kai-search>
              </div>

              <button
                type="button"
                class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-meta font-medium text-foreground transition-colors hover:bg-surface"
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                Filter
              </button>

              <div class="ml-auto flex shrink-0 items-center gap-2">
                <Show
                  when={selectedCount() > 0}
                  fallback={
                    <button
                      type="button"
                      class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-meta font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <UserPlus size={14} aria-hidden="true" />
                      Add member
                    </button>
                  }
                >
                  <span class="text-meta text-muted-foreground tabular-nums">
                    {selectedCount()} selected
                  </span>
                  <button
                    type="button"
                    class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-meta font-medium text-foreground transition-colors hover:bg-surface"
                  >
                    <Download size={14} aria-hidden="true" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    class="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-meta font-medium text-destructive transition-colors hover:bg-destructive/15"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete
                  </button>
                </Show>
              </div>
            </div>

            {/* TABLE: a real <table> for semantics + axe. Header row carries the
                select-all checkbox + sortable column headers; body rows carry a
                leading checkbox, an avatar-initial name cell, email, status pill,
                role chip, last-active, and a trailing row-actions button. */}
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-body">
                <thead>
                  <tr class="border-b border-border text-meta">
                    <th scope="col" class="w-10 px-3 py-2.5 text-left">
                      <CheckBox
                        checked={allFilteredSelected()}
                        indeterminate={someFilteredSelected()}
                        onToggle={toggleAll}
                        label="Select all rows"
                      />
                    </th>
                    <SortHeader label="Name" col="name" sortKey={sortKey()} sortDir={sortDir()} onSort={onSort} />
                    <SortHeader
                      label="Email"
                      col="email"
                      sortKey={sortKey()}
                      sortDir={sortDir()}
                      onSort={onSort}
                      class="hidden md:table-cell"
                    />
                    <th scope="col" class="px-3 py-2.5 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <SortHeader
                      label="Role"
                      col="role"
                      sortKey={sortKey()}
                      sortDir={sortDir()}
                      onSort={onSort}
                      class="hidden sm:table-cell"
                    />
                    <SortHeader
                      label="Last active"
                      col="lastActive"
                      sortKey={sortKey()}
                      sortDir={sortDir()}
                      onSort={onSort}
                      class="hidden lg:table-cell"
                    />
                    <th scope="col" class="w-10 px-3 py-2.5">
                      <span class="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <Show
                    when={pageRows().length > 0}
                    fallback={
                      <tr>
                        <td colspan="7" class="px-3 py-14 text-center text-body text-muted-foreground">
                          No members match "{search()}".
                        </td>
                      </tr>
                    }
                  >
                    <For each={pageRows()}>
                      {(m, i) => {
                        const isSelected = () => selected().has(m.id);
                        return (
                          <tr
                            class="group border-b border-border transition-colors last:border-0"
                            classList={{
                              // No dedicated "row selected" token, so this is a
                              // faint primary wash (works in both modes); hover uses
                              // the surface token.
                              'bg-primary/[0.05]': isSelected(),
                              'hover:bg-surface': !isSelected(),
                            }}
                          >
                            <td class="px-3 py-2.5">
                              <CheckBox
                                checked={isSelected()}
                                onToggle={() => toggleRow(m.id)}
                                label={`Select ${m.name}`}
                              />
                            </td>
                            <td class="px-3 py-2.5">
                              <div class="flex items-center gap-2.5">
                                <span
                                  class={`flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold ${AVATAR_TINTS[i() % AVATAR_TINTS.length]}`}
                                  aria-hidden="true"
                                >
                                  {initials(m.name)}
                                </span>
                                <div class="min-w-0">
                                  <div class="truncate font-medium text-foreground">{m.name}</div>
                                  <div class="truncate text-caption text-muted-foreground md:hidden">{m.email}</div>
                                </div>
                              </div>
                            </td>
                            <td class="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                              <span class="truncate">{m.email}</span>
                            </td>
                            <td class="px-3 py-2.5">
                              <span
                                class={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium ${STATUS[m.status].pill}`}
                              >
                                <span class={`size-1.5 rounded-full ${STATUS[m.status].dot}`} aria-hidden="true" />
                                {STATUS[m.status].label}
                              </span>
                            </td>
                            <td class="hidden px-3 py-2.5 sm:table-cell">
                              <span class="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-caption font-medium text-muted-foreground">
                                {m.role}
                              </span>
                            </td>
                            <td class="hidden px-3 py-2.5 text-meta text-muted-foreground tabular-nums lg:table-cell">
                              {m.lastActiveLabel}
                            </td>
                            <td class="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                aria-label={`Actions for ${m.name}`}
                                class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-surface-strong hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </Show>
                </tbody>
              </table>
            </div>

            {/* FOOTER: selection count (left) + pagination (right). */}
            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
              <span class="text-meta text-muted-foreground tabular-nums">
                {selectedCount()} of {filtered().length} row(s) selected.
              </span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page() <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                  class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <For each={Array.from({ length: totalPages() }, (_, idx) => idx + 1)}>
                  {(p) => (
                    <button
                      type="button"
                      onClick={() => setPage(p)}
                      aria-label={`Page ${p}`}
                      aria-current={page() === p ? 'page' : undefined}
                      class="inline-flex size-8 items-center justify-center rounded-md border text-meta font-medium tabular-nums transition-colors"
                      classList={{
                        'border-primary bg-primary text-primary-foreground': page() === p,
                        'border-border bg-background text-muted-foreground hover:bg-surface hover:text-foreground':
                          page() !== p,
                      }}
                    >
                      {p}
                    </button>
                  )}
                </For>
                <button
                  type="button"
                  disabled={page() >= totalPages()}
                  onClick={() => setPage((p) => Math.min(totalPages(), p + 1))}
                  aria-label="Next page"
                  class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `// Showcase composition: a Members data-table screen built from the kit's
// design tokens + raw markup (table, checkboxes, pagination, sort headers are
// all hand-rolled - the kit ships no data-table/grid component). The one
// kai-* element in the page is the toolbar search field:
<kai-search
  value={search}
  placeholder="Search members..."
  onkai-search={(e) => setSearch(e.detail.value)}
></kai-search>
// See proof-data-table.stories.tsx for the full markup.`,
      },
    },
  },
};
