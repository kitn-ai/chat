import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX, createSignal, createMemo, For, Show } from 'solid-js';
import { Copy, RefreshCw, Share2, Image as ImageIcon, Sparkles } from 'lucide-solid';
import { BuilderPanel, type BuilderConstruct } from '../components/builder-panel';
import { BuilderLayout, type BuilderViewport } from '../components/builder-layout';
import { resolveAccentWrapperStyle } from '../components/builder-preview';
import { ChatThread } from '../components/chat-thread';
import { Source, SourceTrigger, SourceContent } from '../components/source';
import { PromptSuggestion } from '../components/prompt-suggestion';
import { Tabs, type KaiTabItem } from '../ui/tabs';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { isRenderableLink } from '../primitives/link-preview';
import type { Source as SourceCitation } from './chat-types';

// Labs/Builder/Research — T-1 build-out (docs/superpowers/specs/
// 2026-08-28-template-builder-design.md), reshaped in an owner design round
// to match the REAL Perplexity Labs anatomy (`elements/perplexity.stories.tsx`,
// read closely line by line before rebuilding any of this) rather than an
// invented shape. layout: 'fullscreen', no conversations sidebar, no Layout
// radio (T-2).
//
// THE ENTRY POINT IS UNCHANGED (owner's own instruction): the preview still
// opens on `ChatThread`'s own centered empty state (no sidebar, no model
// switcher) — same as before this round. What changed is everything AFTER
// a query is submitted.
//
// THE ANSWERED STATE NOW MIRRORS PERPLEXITY'S REAL STRUCTURE, miniaturized:
//  - a question title
//  - a SOURCES STRIP: horizontal cards (favicon + domain + title, Perplexity's
//    own shape — NOT a snippet card, which is what this template had before
//    this round and is not what Perplexity actually shows in the strip) with
//    a "View N sources" / "+K more" overflow card, exactly Perplexity's
//    hand-built overflow behavior (no element does a card-strip-with-
//    overflow, confirmed by reading that story's own comment on it)
//  - an Answer / Sources / Images TAB STRIP — Perplexity's own `kai-tabs
//    variant="underline"`, reused here via the kit's real Solid `Tabs`
//    component (`ui/tabs.tsx`), not a fork
//  - the Answer tab: HAND-WOVEN prose with INLINE numbered citation chips —
//    Perplexity's story states directly why: "the markdown renderer renders
//    a string and can't interleave citation chips at citation offsets," so
//    the cited paragraphs are JSX text runs with real `Source`/
//    `SourceTrigger`/`SourceContent` chips built in, not `ChatThread`
//    message parts. This is a STRUCTURAL correction from the previous
//    round: `message.tsx`'s own citation grouping (used before this round)
//    renders citations as a TRAILING group after the text, never
//    interleaved mid-sentence — a materially different shape from
//    Perplexity's actual inline chips. Confirmed by reading `message.tsx`'s
//    `groupAs` logic again before concluding this. Because the answer is no
//    longer message-shaped, `ChatThread`'s `messages` stays permanently
//    empty and the whole Perplexity-style view renders through its REAL
//    `emptyContent` JSX prop instead (Round R's mechanism, reused) — which
//    also means the SAME `ChatThread` still supplies the composer at the
//    bottom, unchanged in both states, matching Perplexity's own "the top
//    search box and the follow-up composer are the same location."
//  - a media/images strip (placeholder tiles, Perplexity's own shape)
//  - an answer action toolbar (Copy/Rewrite/Share, Perplexity's own three)
//  - a Related follow-up questions list (`PromptSuggestion`, `block` rows,
//    Perplexity's own `kai-suggestions layout="list"` shape)
//  - the Sources tab: the full source list; the Images tab: a placeholder grid
//
// EVERY Perplexity-style region gets an independent toggle (Work-surface-
// round precedent: "someone may want preview-only" chrome), replacing the
// previous round's single citation-DISPLAY-STYLE radio, which didn't match
// Perplexity's actual anatomy (Perplexity never treats "inline" vs "strip"
// as alternatives — it always shows both at once). Inline citations
// themselves stay NON-optional: they are the model's own output, not
// chrome, same "the kit decides HOW, never whether the model's own content
// renders" boundary every other template's citation/message content
// respects.
//
// Message actions (the shared role-scoped picker every other template
// reuses) is DROPPED from this template's panel this round: the answer is
// no longer `ChatMessage[]`-shaped (see above), so a per-message action
// picker has nothing real to attach to — keeping it would have shown a
// control that visibly does nothing, the opposite of deciding loudly.
//
// T-5 (refined against the REAL anatomy, replacing the previous round's
// guesses — item 7 in docs/superpowers/research/
// 2026-08-28-builder-t5-vocabulary-proposals.md):
//  - `capabilities.sources: { strip?: boolean }` — the sources strip's own
//    visibility; inline citations need no flag (content, not chrome).
//  - `capabilities.answerTabs: { enabled?: boolean; images?: boolean }` —
//    the Answer/Sources/Images tab strip; today `layout: 'research'`
//    doesn't exist at all, so this is layout-adjacent, not layout-scoped.
//  - `capabilities.relatedQuestions: boolean` (unchanged from the prior
//    round's proposal — Perplexity's real `kai-suggestions` list is exactly
//    this).
//  - `capabilities.media: boolean` — the images/media strip, a genuinely
//    new finding this round (the previous round didn't know Perplexity had
//    one at all).
//  - Answer action toolbar (Copy/Rewrite/Share) needs NO new vocabulary:
//    it is the same three-ish actions `ChatMessageAction`/`CustomAction`
//    already cover at the component tier; this preview renders them as
//    static buttons only because the answer isn't message-shaped this
//    round, not because the kit lacks the vocabulary.

interface Src { url: string; title: string; snippet: string }

const SOURCES: Src[] = [
  { url: 'https://ui.kitn.ai/docs/wire', title: 'The wire adapter', snippet: 'Parses provider SSE onto message parts; the kit parses, the consumer fetches.' },
  { url: 'https://ui.kitn.ai/docs/state', title: 'State helpers', snippet: 'I/O-free pure folds over ChatMessage[] for building an assistant stream.' },
  { url: 'https://ui.kitn.ai/docs/elements', title: 'kai- elements', snippet: 'Coarse web-component facades wrapping the Solid components.' },
  { url: 'https://ui.kitn.ai/docs/cards', title: 'Generative-UI cards', snippet: 'Cards arrive as tool calls, validated against a JSON Schema envelope.' },
  { url: 'https://ui.kitn.ai/docs/theming', title: 'Theming', snippet: 'Token-driven accent, unread color, and light/dark mode.' },
];
const VISIBLE = 3;

const RELATED = [
  'What are message parts?',
  'How does the kit decode provider SSE?',
  'What is a generative-UI card?',
];

const DEFAULT_CONSTRUCT: BuilderConstruct = {
  name: 'research-assistant',
  layout: 'fullscreen',
  provider: { mode: 'endpoint', url: '/api/chat', wire: 'anthropic' },
  header: { title: 'Research' },
  theme: { accent: '#0f766e', mode: 'system' },
  capabilities: {
    starters: ['How does the wire adapter work?', 'What are message parts?'],
    attachments: { accept: ['application/pdf'] },
    history: { persistence: 'local' },
  },
};

function favicon(url: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}
/** Same guard `Source`'s own root applies to a citation href — a source's
 *  `url` is model-supplied, so it gets the same `javascript:`/`data:` filter
 *  before landing in a real `href`, not a raw pass-through. */
function safeHref(url: string): string | undefined {
  return isRenderableLink(url) ? url : undefined;
}

/** An inline numbered citation — a REAL `Source`/`SourceTrigger`/
 *  `SourceContent` chip with a built-in hover-snippet popover, matching
 *  Perplexity's own `kai-source` chip exactly (not `message.tsx`'s trailing
 *  citation group, which cannot interleave — see the module doc comment). */
function CiteChip(props: { n: number }): JSX.Element {
  const s = SOURCES[props.n - 1];
  return (
    <Source href={s.url}>
      <SourceTrigger label={props.n} />
      <SourceContent title={s.title} description={s.snippet} />
    </Source>
  );
}

/** One source card in the horizontal strip: favicon + domain + title —
 *  Perplexity's own card shape (title + favicon/domain row), NOT a
 *  snippet card (the previous round's shape, which doesn't match). */
function SourceCard(props: { s: Src; n: number }): JSX.Element {
  return (
    <a
      href={safeHref(props.s.url)}
      target="_blank"
      rel="noopener noreferrer"
      class="flex h-full w-40 shrink-0 flex-col gap-2 rounded-lg border border-border bg-background p-2.5 hover:bg-muted/40"
    >
      <span class="line-clamp-2 flex-1 text-xs font-medium leading-snug text-foreground">{props.s.title}</span>
      <span class="flex items-center gap-1.5">
        <img src={favicon(props.s.url)} alt="" width={14} height={14} class="size-3.5 shrink-0 rounded-full" />
        <span class="truncate text-[11px] text-muted-foreground">{domainOf(props.s.url)}</span>
        <span class="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{props.n}</span>
      </span>
    </a>
  );
}

/** The sources strip: `VISIBLE` cards + a "View N sources"/"+K more"
 *  overflow card that expands the strip in place — Perplexity's own
 *  hand-built overflow behavior (no kit element does a card strip with an
 *  overflow card). */
function SourcesStrip(): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const shown = createMemo(() => (expanded() ? SOURCES : SOURCES.slice(0, VISIBLE)));
  return (
    <div class="flex items-stretch gap-2 overflow-x-auto pb-1" data-builder-sources-strip>
      <For each={shown()}>{(s, i) => <SourceCard s={s} n={i() + 1} />}</For>
      <button
        type="button"
        class="flex h-full w-28 shrink-0 flex-col items-start justify-center gap-1 rounded-lg border border-dashed border-border p-2.5 text-left hover:bg-muted/40"
        onClick={() => setExpanded((v) => !v)}
      >
        <span class="text-xs font-medium text-foreground">{expanded() ? 'Show less' : `View ${SOURCES.length} sources`}</span>
        <Show when={!expanded()}>
          <span class="text-[11px] text-muted-foreground">{`+${SOURCES.length - VISIBLE} more`}</span>
        </Show>
      </button>
    </div>
  );
}

const ANSWER_TABS: KaiTabItem[] = [
  { id: 'answer', label: 'Answer' },
  { id: 'sources', label: 'Sources' },
  { id: 'images', label: 'Images' },
];

interface AnatomyToggles {
  sourcesStrip: boolean;
  tabs: boolean;
  media: boolean;
  related: boolean;
  actionToolbar: boolean;
}

/** The Perplexity-shaped answer, miniaturized honestly into the builder
 *  preview — see the module doc comment for the region-by-region mapping
 *  back to `perplexity.stories.tsx`. Rendered through `ChatThread`'s real
 *  `emptyContent` JSX prop (see the module doc comment), so `ChatThread`
 *  itself still supplies the composer below, unchanged. */
function PerplexityAnswerView(props: { query: string; toggles: AnatomyToggles; onRelatedClick: (q: string) => void }): JSX.Element {
  const [tab, setTab] = createSignal<'answer' | 'sources' | 'images'>('answer');
  const activeTab = createMemo(() => (props.toggles.tabs ? tab() : 'answer'));

  return (
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-2 py-4 text-left" data-builder-answer-view>
      <h1 class="text-lg font-semibold leading-snug text-foreground">{props.query}</h1>

      <Show when={props.toggles.sourcesStrip}>
        <SourcesStrip />
      </Show>

      <Show when={props.toggles.tabs}>
        <Tabs items={ANSWER_TABS} value={tab()} variant="underline" onChange={(v) => setTab(v as 'answer' | 'sources' | 'images')} />
      </Show>

      <Show when={activeTab() === 'answer'}>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
            <p>
              The wire adapter parses provider SSE into message parts <CiteChip n={1} />, state helpers fold those parts into an
              assistant stream <CiteChip n={2} />, and the kai- elements wrap the whole thing as web components <CiteChip n={3} />.
            </p>
            <p>
              Generative-UI cards arrive as tool calls rather than structured output <CiteChip n={4} />, and every surface themes
              through the same token set <CiteChip n={5} />.
            </p>
          </div>

          <Show when={props.toggles.media}>
            <div class="flex gap-2 overflow-x-auto">
              <For each={[0, 1, 2, 3]}>
                {() => (
                  <div class="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                    <ImageIcon size={16} class="text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={props.toggles.actionToolbar}>
            <div class="flex items-center gap-1 border-t border-border pt-3">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Copy">
                <Copy size={14} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Rewrite">
                <RefreshCw size={14} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Share">
                <Share2 size={14} aria-hidden="true" />
              </Button>
            </div>
          </Show>

          <Show when={props.toggles.related}>
            <div class="flex flex-col gap-1.5 border-t border-border pt-3">
              <div class="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Sparkles size={14} class="text-muted-foreground" aria-hidden="true" />
                Related
              </div>
              <For each={RELATED}>
                {(q) => (
                  <PromptSuggestion variant="ghost" block onClick={() => props.onRelatedClick(q)}>
                    {q}
                  </PromptSuggestion>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={activeTab() === 'sources'}>
        <div class="grid grid-cols-2 gap-2">
          <For each={SOURCES}>{(s, i) => <SourceCard s={s} n={i() + 1} />}</For>
        </div>
      </Show>

      <Show when={activeTab() === 'images'}>
        <div class="grid grid-cols-3 gap-2">
          <For each={[0, 1, 2, 3, 4, 5]}>
            {() => (
              <div class="flex h-20 items-center justify-center rounded-lg border border-border bg-muted">
                <ImageIcon size={16} class="text-muted-foreground" aria-hidden="true" />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function ResearchPreview(props: {
  construct: BuilderConstruct;
  answered: boolean;
  query: string;
  onSubmit: (value: string) => void;
  toggles: AnatomyToggles;
  viewport: BuilderViewport;
}): JSX.Element {
  const frameStyle = createMemo(() => ({
    ...resolveAccentWrapperStyle(props.construct.theme),
    height: 'calc(100vh - 9rem)',
    width: 'calc(100vw - 27rem)',
    'max-width': '100%',
  }));

  return (
    <div
      class="flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      style={frameStyle()}
      data-builder-research-frame
      data-builder-viewport={props.viewport}
    >
      <div class="flex min-h-0 flex-1 flex-col">
        <ChatThread
          class="h-full"
          messages={[]}
          chatTitle={props.answered ? props.construct.header?.title : undefined}
          suggestions={props.construct.capabilities?.starters}
          emptyContent={props.answered ? <PerplexityAnswerView query={props.query} toggles={props.toggles} onRelatedClick={props.onSubmit} /> : undefined}
          onSuggestionClick={(value) => props.onSubmit(value)}
          onSubmit={(detail) => props.onSubmit(detail.value || 'How does the wire adapter work?')}
        />
      </div>
    </div>
  );
}

function AnatomySection(props: {
  toggles: AnatomyToggles;
  onTogglesChange: (v: AnatomyToggles) => void;
  answered: boolean;
  onReset: () => void;
}): JSX.Element {
  const set = (k: keyof AnatomyToggles, v: boolean): void => props.onTogglesChange({ ...props.toggles, [k]: v });
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Answer layout</h3>
      <p class="text-xs text-muted-foreground">Modeled on the real Perplexity Labs story — each region below is independently optional.</p>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">Sources strip</span>
        <Switch checked={props.toggles.sourcesStrip} label="Sources strip" onChange={(v) => set('sourcesStrip', v)} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">Answer/Sources/Images tabs</span>
        <Switch checked={props.toggles.tabs} label="Answer/Sources/Images tabs" onChange={(v) => set('tabs', v)} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">Media strip</span>
        <Switch checked={props.toggles.media} label="Media strip" onChange={(v) => set('media', v)} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">Answer action toolbar</span>
        <Switch checked={props.toggles.actionToolbar} label="Answer action toolbar" onChange={(v) => set('actionToolbar', v)} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">Related questions</span>
        <Switch checked={props.toggles.related} label="Related questions" onChange={(v) => set('related', v)} />
      </div>
      <p class="text-xs text-muted-foreground">
        Preview-only — construct.v1 has no answer-layout vocabulary today (T-5, see this file's module doc comment). Inline citations
        are always on — they're the model's own output, not chrome.
      </p>
      {props.answered && (
        <button type="button" class="self-start text-xs font-medium text-primary underline" onClick={props.onReset}>
          Reset to search state
        </button>
      )}
    </section>
  );
}

const DEFAULT_TOGGLES: AnatomyToggles = { sourcesStrip: true, tabs: true, media: true, related: true, actionToolbar: true };

function ResearchBuilderDemo(): JSX.Element {
  const [construct, setConstruct] = createSignal<BuilderConstruct>(DEFAULT_CONSTRUCT);
  const [answered, setAnswered] = createSignal(false);
  const [query, setQuery] = createSignal('How does the wire adapter work?');
  const [toggles, setToggles] = createSignal<AnatomyToggles>(DEFAULT_TOGGLES);
  const [viewport, setViewport] = createSignal<BuilderViewport>('desktop');

  const submit = (value: string): void => {
    setQuery(value || 'How does the wire adapter work?');
    setAnswered(true);
  };

  return (
    <div class="h-screen w-screen">
      <BuilderLayout
        name={construct().name}
        panel={
          <>
            <BuilderPanel value={construct()} onChange={setConstruct} sections={{ layout: false, widget: 'never', provider: true, home: false }} />
            <AnatomySection toggles={toggles()} onTogglesChange={setToggles} answered={answered()} onReset={() => setAnswered(false)} />
          </>
        }
        preview={
          <ResearchPreview
            construct={construct()}
            answered={answered()}
            query={query()}
            onSubmit={submit}
            toggles={toggles()}
            viewport={viewport()}
          />
        }
        viewport={viewport()}
        onViewportChange={setViewport}
      />
    </div>
  );
}

const meta = { title: 'Labs/Builder/Research', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

/**
 * The Research template's builder, reshaped in an owner design round to
 * mirror the REAL Perplexity Labs story's anatomy (see the module doc
 * comment for the full region-by-region mapping). The preview still opens
 * on `ChatThread`'s own centered empty state (unchanged entry point);
 * submitting the composer or a starter swaps in a Perplexity-shaped answer
 * — a sources strip with overflow, an Answer/Sources/Images tab strip,
 * hand-woven prose with inline numbered citation chips, a media strip, an
 * action toolbar, and related follow-up questions — rendered through
 * `ChatThread`'s real `emptyContent` prop, so the SAME composer serves both
 * the initial search and every follow-up. Panel: Identity, Provider,
 * Theme, Capabilities, and an Answer-layout section with one toggle per
 * region.
 */
export const Research: Story = {
  render: () => <ResearchBuilderDemo />,
};
