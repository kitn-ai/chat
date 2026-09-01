/**
 * The builder's HOME screen (owner ask, 2026-08-31): when the project
 * directory already holds `*.construct.json` files, `kai dev --builder`
 * starts HERE — a card per construct (name, template, last modified) that
 * opens straight into the panel, plus a "New construct" tile leading to the
 * template picker. An empty directory never sees this screen (the server's
 * `/api/state` answers `phase: 'start'` and the picker renders as before).
 *
 * A separate FILE from App.tsx deliberately: App.tsx is concurrently edited
 * on another branch (theme takeover region), so the whole surface lives here
 * and App.tsx only routes to it.
 *
 * Invalid construct files are LISTED but not openable (decide loudly):
 * hiding a broken file would make it unfindable, and opening it would mount
 * a panel over a construct the write doorway rejects — so the card names the
 * problem and stays inert.
 */
import { For, Show } from 'solid-js';
import { Plus, FileWarning } from 'lucide-solid';
// From templates.ts, not dev.ts: dev.ts is Node-only and emits no dist
// declaration, so a type imported from it breaks the d.ts-boundary build gate.
import type { ConstructListing } from '../../src/agent-tooling/construct/templates';

export type { ConstructListing };

/** Compact "last modified" wording, exported so the test asserts the strings
 *  the cards actually render. Falls back to a plain date past a month. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

export interface HomeScreenProps {
  constructs: readonly ConstructListing[];
  /** Open one construct (basename) — POSTs /api/open upstream. */
  onOpen: (file: string) => void;
  /** The "New construct" tile — routes to the template picker. */
  onNew: () => void;
  /** The file currently being opened, for an honest in-flight card. */
  opening?: string;
}

/** Card chrome shared by the construct cards and the New tile. Tokens only —
 *  the same utility vocabulary the rest of the builder page uses. */
const CARD =
  'flex min-h-32 flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left ' +
  'transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border';

export function HomeScreen(props: HomeScreenProps) {
  return (
    <section class="flex flex-col gap-6" data-builder-home>
      <div class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold text-foreground">Your constructs</h1>
        <p class="text-sm text-muted-foreground">
          Pick up where you left off, or start a new one. Each card is a construct file in this directory.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={props.constructs}>
          {(c) => (
            <button
              type="button"
              class={CARD}
              disabled={!c.valid || props.opening !== undefined}
              onClick={() => props.onOpen(c.file)}
              data-construct-card={c.file}
              aria-label={`Open ${c.name}`}
            >
              <span class="font-mono text-sm font-semibold text-foreground">&lt;{c.name}&gt;</span>
              <Show
                when={c.valid}
                fallback={
                  <span class="flex items-center gap-1 text-xs text-destructive">
                    <FileWarning size={12} aria-hidden="true" />
                    invalid construct file — fix {c.file} by hand
                  </span>
                }
              >
                <span class="text-xs text-muted-foreground">{c.templateName ?? 'Custom'}</span>
              </Show>
              <span class="mt-auto text-xs text-muted-foreground">
                {props.opening === c.file ? 'Opening…' : `Edited ${relativeTime(c.updatedAt)}`}
              </span>
            </button>
          )}
        </For>
        <button
          type="button"
          class={`${CARD} border-dashed`}
          disabled={props.opening !== undefined}
          onClick={() => props.onNew()}
          data-new-construct
        >
          <span class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Plus size={16} aria-hidden="true" />
            New construct
          </span>
          <span class="text-xs text-muted-foreground">Start from a template.</span>
        </button>
      </div>
    </section>
  );
}
