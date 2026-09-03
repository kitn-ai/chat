import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For, Show } from 'solid-js';
import { Copy, RefreshCw } from 'lucide-solid';
import './register'; // every kai-* element used below
import type { KaiNavItem } from '../ui/nav';
import type { KaiTabItem } from '../ui/tabs';
import type { ConversationSummary, ConversationGroup } from '../types';
import type { KaiNavElement } from './element-types';

// Labs/Apps: a third dogfood — "Perplexity", an answer-engine UI, built on the
// re-cast kai-workspace SHELL (five layout slots; the rail is a real
// <kai-conversations slot="start"> with the brand + nav chrome in its header
// slot) + the kai-* elements exactly as a consumer would. It assembles
// the answer-with-sources composite: a sources strip, a tabbed Answer/Sources/
// Images header, streamed prose with INLINE numbered citation chips that
// hover-preview their source, a media strip, an answer action toolbar, and a
// follow-up composer with a related-questions list.
//
// The kit ships <kai-source> / <kai-sources> — a citation link with a built-in
// hover-snippet popover (favicon + domain + headline + description), and a
// `numbered` mode that renders [1][2] bound to a source. So the citation chip +
// hover snippet + link binding is used for real here (kai-source inline,
// kai-sources in the Sources tab). kai-badge's `citation` variant is only a BARE
// marker (filled pill, no popover, no binding) — the lesser fit, not used here.
// The cited prose is hand-woven JSX (text runs + kai-source chips) because the
// markdown renderer renders a string and can't interleave chips at citation offsets.

// These kai-* tags are used as JSX elements below. The other story files declare
// the same tags (TypeScript merges identical global augmentations across the
// compilation — the types must match BYTE-FOR-BYTE or it errors TS2717), so the
// shared ones are copied verbatim; kai-switch and kai-sources are declared here
// for the first time.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-workspace': JSX.HTMLAttributes<HTMLElement> & { 'collapse-below'?: string | number; 'drawer-below'?: string | number };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-nav': JSX.HTMLAttributes<HTMLElement> & { value?: string; 'default-value'?: string; theme?: string };
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string; full?: boolean };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; 'web-search'?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-separator': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-tabs': JSX.HTMLAttributes<HTMLElement> & { variant?: string; value?: string; 'default-value'?: string; disabled?: boolean; theme?: string };
      'kai-suggestions': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: 'md' | 'lg'; block?: boolean | string; highlight?: string };
      'kai-avatar': JSX.HTMLAttributes<HTMLElement> & { src?: string; alt?: string; fallback?: string; size?: string };
      'kai-icon': JSX.HTMLAttributes<HTMLElement> & { name?: string; size?: string };
      'kai-tooltip': JSX.HTMLAttributes<HTMLElement> & { content?: string; 'open-delay'?: number | string };
      'kai-source': JSX.HTMLAttributes<HTMLElement> & { href?: string; label?: string; headline?: string; description?: string; 'show-favicon'?: boolean | '' };
      'kai-sources': JSX.HTMLAttributes<HTMLElement> & { 'show-favicon'?: boolean | ''; numbered?: boolean | '' };
      'kai-switch': JSX.HTMLAttributes<HTMLElement> & { checked?: boolean; 'default-checked'?: boolean; disabled?: boolean; label?: string };
      'kai-card': JSX.HTMLAttributes<HTMLElement> & {
        appearance?: 'outlined' | 'filled' | 'plain' | 'accent';
        orientation?: 'vertical' | 'horizontal' | 'responsive';
        collapse?: string;
        dense?: boolean;
        dismissible?: boolean;
        href?: string;
        target?: string;
        rel?: string;
        clickable?: boolean;
      };
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// The left rail. kai-nav is a flat list of named-icon rows. NOTE: the named-icon
// registry (src/ui/icon.tsx) is curated — Perplexity's own glyphs (Compass for
// Discover, a Layers/Spaces mark, an Image mark) are NOT registered, so Discover
// and Spaces use stand-in icons here (globe / box).
const NAV: KaiNavItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'discover', label: 'Discover', icon: 'globe' },
  { id: 'spaces', label: 'Spaces', icon: 'box' },
  { id: 'library', label: 'Library', icon: 'book-open' },
];

// Recent threads for the <kai-conversations> rail (the rail's "Library").
// Times are spread so the kit auto-derives varied relative labels.
const GROUPS: ConversationGroup[] = [
  { id: 'library', name: 'Library', sortOrder: 0, createdAt: '2026-06-01' },
];
const RECENTS: ConversationSummary[] = ([
  ['What is retrieval-augmented generation?', '2026-06-27T14:10:00Z'],
  ['Best mirrorless cameras for video 2026', '2026-06-27T11:00:00Z'],
  ['How does a vector database work?', '2026-06-26T18:00:00Z'],
  ['Tax deadlines for freelancers', '2026-06-25T09:00:00Z'],
  ['Compare Rust vs Go for backends', '2026-06-23T12:00:00Z'],
  ['Why is the sky blue, simply?', '2026-06-20T10:00:00Z'],
] as const).map(([title, ts], i) => ({ id: `q${i}`, title, groupId: 'library', scope: { type: 'document' }, messageCount: 2, lastMessageAt: ts, updatedAt: ts }));

// The cited sources for the answer. Each carries the favicon-deriving `href`, a
// `domain` + `title` for the source cards, and a `snippet` that becomes the
// hover-preview popover body (kai-source's `description`).
interface Src { href: string; domain: string; title: string; snippet: string }
const SOURCES: Src[] = [
  { href: 'https://en.wikipedia.org/wiki/Retrieval-augmented_generation', domain: 'wikipedia.org', title: 'Retrieval-augmented generation', snippet: 'Overview of RAG: combining a retrieval step over an external corpus with a generative language model to ground responses.' },
  { href: 'https://arxiv.org/abs/2005.11401', domain: 'arxiv.org', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', snippet: 'The 2020 paper that introduced RAG, pairing a parametric seq2seq model with a non-parametric dense vector index of Wikipedia.' },
  { href: 'https://www.pinecone.io/learn/retrieval-augmented-generation/', domain: 'pinecone.io', title: 'Retrieval Augmented Generation (RAG)', snippet: 'How a vector database supplies relevant context chunks to an LLM at query time, cutting hallucination on private data.' },
  { href: 'https://huggingface.co/docs/transformers/model_doc/rag', domain: 'huggingface.co', title: 'RAG — Transformers documentation', snippet: 'The reference implementation: a question encoder, a retriever over a FAISS index, and a generator, trained end to end.' },
  { href: 'https://www.ibm.com/topics/retrieval-augmented-generation', domain: 'ibm.com', title: 'What is retrieval-augmented generation?', snippet: 'A plain-language explainer of why grounding a model in retrieved documents improves factuality and freshness.' },
  { href: 'https://aws.amazon.com/what-is/retrieval-augmented-generation/', domain: 'aws.amazon.com', title: 'What is RAG? — AWS', snippet: 'RAG optimizes LLM output by referencing an authoritative knowledge base outside its training data before responding.' },
  { href: 'https://docs.langchain.com/docs/use-cases/question-answering', domain: 'langchain.com', title: 'Q&A with RAG — LangChain', snippet: 'A practical pipeline: load and split documents, embed and store them, then retrieve and stuff context into the prompt.' },
  { href: 'https://www.nvidia.com/en-us/glossary/retrieval-augmented-generation/', domain: 'nvidia.com', title: 'Retrieval-Augmented Generation (RAG)', snippet: 'How RAG connects generative AI services to external resources, especially fresh and domain-specific data.' },
];
const VISIBLE = 4; // source cards shown before the overflow card

// The focus / source-mode selector (Web / Academic / Social / Video / Math).
// A flat kai-menu items tree. Icons are registry names; Math falls back to
// `sparkles` (no calculator glyph is registered).
const FOCUS = [
  { heading: true, label: 'Focus' },
  { id: 'web', label: 'Web', icon: 'globe', checked: true },
  { id: 'academic', label: 'Academic', icon: 'book-open' },
  { id: 'social', label: 'Social', icon: 'message-square' },
  { id: 'video', label: 'Video', icon: 'monitor' },
  { id: 'math', label: 'Math', icon: 'sparkles' },
];

const ACCOUNT = [
  { heading: true, label: 'ada@example.com' },
  { id: 'settings', label: 'Settings', icon: 'settings', shortcut: '⌘,' },
  { id: 'spaces', label: 'Spaces', icon: 'box' },
  { id: 'help', label: 'Get help', icon: 'message-circle' },
  { separator: true },
  { id: 'upgrade', label: 'Upgrade', icon: 'sparkles' },
  { id: 'logout', label: 'Log out' },
];

const TABS: KaiTabItem[] = [
  { id: 'answer', label: 'Answer' },
  { id: 'sources', label: 'Sources' },
  { id: 'images', label: 'Images' },
];

// A markdown sub-block rendered by the kit's real markdown (kai-message). It
// demonstrates that prose WITHOUT inline citations renders as a real element —
// the citation-binding gap is precisely that [n] chips can't live inside this.
const PIPELINE_MD = `**Typical pipeline**

1. Split source documents into chunks and embed them.
2. Store the vectors in an index (a vector database).
3. Embed the incoming question and retrieve the nearest chunks.
4. Concatenate those chunks into the prompt and generate the answer.`;

const RELATED = [
  'How is RAG different from fine-tuning?',
  'What is a vector database and why does RAG need one?',
  'How do you reduce hallucination in a RAG pipeline?',
  'Which chunking strategy works best for RAG?',
];

const favicon = (href: string) => `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(href)}`;

// An inline numbered citation: a REAL <kai-source> chip bound to a source, with a
// built-in hover-snippet popover (favicon + domain + headline + description). The
// `label` shows the 1-based index, matching Perplexity's [1][2] markers.
function Cite(props: { i: number }) {
  const s = SOURCES[props.i];
  return (
    <kai-source
      class="kai-cite"
      href={s.href}
      label={String(props.i + 1)}
      headline={s.title}
      description={s.snippet}
    ></kai-source>
  );
}

// Every card in the strip (source cards AND the overflow card) shares this body
// min-height so they render the SAME height regardless of title line-count. The
// card surface is sized by its slotted body, so an equal-height floor on the body
// (taller than the worst-case 2-line title + favicon row) equalizes the surfaces;
// items-stretch on the row keeps the hosts in lock-step too. mt-auto/justify-center
// then place content within that floor.
const CARD_BODY = 'flex h-full min-h-[3.75rem] flex-col';

// One source card in the horizontal strip: favicon + domain + title. kai-card is
// the kit's generic card; the favicon/domain/title markup is the slotted body.
function SourceCard(props: { s: Src; n: number }) {
  return (
    <kai-card appearance="filled" href={props.s.href} target="_blank" dense class="block w-44 shrink-0">
      <div class={`${CARD_BODY} gap-2`}>
        <div class="line-clamp-2 text-xs font-medium leading-snug text-foreground">{props.s.title}</div>
        <div class="mt-auto flex items-center gap-1.5">
          <img src={favicon(props.s.href)} alt="" width="14" height="14" class="size-3.5 shrink-0 rounded-full" />
          <span class="truncate text-[0.6875rem] text-muted-foreground">{props.s.domain}</span>
          <span class="ml-auto text-[0.6875rem] tabular-nums text-muted-foreground">{props.n}</span>
        </div>
      </div>
    </kai-card>
  );
}

export const Perplexity: Story = {
  name: 'Perplexity',
  render: () => {
    // Answer / Sources / Images — the kai-tabs selection swaps the panel below.
    const [tab, setTab] = createSignal<'answer' | 'sources' | 'images'>('answer');
    // The horizontal sources strip collapses to VISIBLE + an overflow card; the
    // overflow card expands it (the "View N sources" / "+N more" affordance — a
    // hand-built behavior, since no element does a card strip with an overflow).
    const [expanded, setExpanded] = createSignal(false);

    // Array/object props (and event wiring) are applied in each element's ref
    // callback, NOT a one-shot onMount, so they survive remounts (the tab panels
    // live inside <Show>, so they unmount/remount on tab switch).
    return (
      <div class="relative h-screen w-full">
        {/* Nudge the inline citation chips so they sit snug against the prose. */}
        <style>{`.kai-cite { margin: 0 1px; vertical-align: baseline }`}</style>
        <kai-workspace
          ref={(el) => {
            const w = el;
            w.compact = true;
            // Rail geometry is CSS custom properties on the shell (the kai-dock
            // rule), not props.
            el.style.setProperty('--kai-workspace-start-min-width', '240px');
            el.style.setProperty('--kai-workspace-start-max-width', '420px');
          }}
          class="block h-full"
          collapse-below="720"
        >
          {/* start: the rail is a real <kai-conversations>. The brand, New Thread
              and the flat rail nav ride in its header slot; the account menu +
              settings in its footer slot; the Library recents are its own
              conversations/groups props. */}
          <kai-conversations
            slot="start"
            ref={(el) => { const c = el; c.groups = GROUPS; c.conversations = RECENTS; }}
            style={{ display: 'block', height: '100%' }}
          >
            <div slot="header" class="flex flex-col gap-2 px-2.5 pt-2.5 pb-1">
              <div class="flex items-center gap-2 px-1.5 pb-1">
                <kai-icon name="sparkles" class="text-primary"></kai-icon>
                <span class="text-sm font-semibold tracking-tight">perplexity</span>
              </div>
              <kai-button variant="outline" full align="start" icon="square-pen">New Thread</kai-button>
              <kai-nav ref={(el) => { const n = el; n.items = NAV as KaiNavElement['items']; n.defaultValue = 'home'; }}></kai-nav>
            </div>

            {/* footer: the account menu + settings */}
            <div slot="footer" class="flex items-center px-2 py-1.5">
              {/* `full` + flex-1: the account row stretches across the rail (a
                  full-width clickable row) with the settings button at its end. */}
              <kai-menu ref={(el) => { el.items = ACCOUNT; }} label="Account menu" full class="min-w-0 flex-1">
                {/* Trigger content is NON-interactive: kai-menu supplies its own
                    <button>, so a button/kai-button here would double-nest. */}
                <div slot="trigger" class="flex w-full items-center gap-2 text-left">
                  <kai-avatar fallback="AR" size="sm"></kai-avatar>
                  <span class="text-sm font-medium">Ada</span>
                  <span class="text-[0.8125rem] text-muted-foreground">Pro</span>
                </div>
              </kai-menu>
              <kai-tooltip content="Settings" class="ml-auto">
                <kai-button variant="ghost" size="icon-sm" icon="settings" label="Settings"></kai-button>
              </kai-tooltip>
            </div>
          </kai-conversations>

          {/* main: the answer view (scrolls) above the follow-up composer (pinned) */}
          <div slot="main" class="flex h-full flex-col">
            <div class="min-h-0 flex-1 overflow-y-auto">
              <div class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-7">
                {/* the question */}
                <h1 class="text-2xl font-semibold leading-snug">What is retrieval-augmented generation?</h1>

                {/* SOURCES STRIP — a horizontal row of cited source cards ending in
                    a "View N sources" overflow card. The strip + overflow are
                    hand-built; kai-card supplies each card. */}
                <div class="flex items-stretch gap-2 overflow-x-auto pb-1">
                  <For each={expanded() ? SOURCES : SOURCES.slice(0, VISIBLE)}>
                    {(s, i) => <SourceCard s={s} n={i() + 1} />}
                  </For>
                  <kai-card
                    ref={(el) => { el.addEventListener('kai-card-click', () => setExpanded((v) => !v)); }}
                    appearance="outlined"
                    clickable
                    dense
                    class="block w-32 shrink-0"
                  >
                    <div class={`${CARD_BODY} items-start justify-center gap-1`}>
                      <span class="text-xs font-medium text-foreground">{expanded() ? 'Show less' : `View ${SOURCES.length} sources`}</span>
                      <Show when={!expanded()}>
                        <span class="text-[0.6875rem] text-muted-foreground">{`+${SOURCES.length - VISIBLE} more`}</span>
                      </Show>
                    </div>
                  </kai-card>
                </div>

                {/* Answer / Sources / Images */}
                <kai-tabs
                  ref={(el) => {
                    const t = el;
                    t.items = TABS; t.defaultValue = 'answer';
                    el.addEventListener('kai-tab-change', (e) => setTab((e as CustomEvent).detail.value));
                  }}
                  variant="underline"
                ></kai-tabs>

                <Show when={tab() === 'answer'}>
                  <div class="flex flex-col gap-5">
                    {/* PROSE with INLINE numbered citations. Each [n] is a real
                        <kai-source> chip (hover it for the source snippet popover).
                        kai-badge variant="citation" is the BARE-marker alternative
                        (filled pill, no popover/binding) — the lesser fit, unused. */}
                    <div class="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-foreground">
                      <p>
                        Retrieval-augmented generation (RAG) pairs a large language model with a separate
                        retrieval step, so the model answers from documents fetched at query time rather than
                        from its weights alone <Cite i={0} /> <Cite i={1} />. A retriever embeds the question,
                        searches a vector index of an external corpus, and passes the most relevant chunks to
                        the model as context <Cite i={2} />.
                      </p>
                      <p>
                        The approach was introduced in 2020 by Lewis et al., who combined a sequence-to-sequence
                        generator with a dense vector index of Wikipedia <Cite i={1} />. Because the knowledge
                        lives outside the model, you can update it without retraining, which keeps answers
                        current and grounded in a source you control <Cite i={4} /> <Cite i={5} />.
                      </p>
                    </div>

                    {/* A markdown sub-block via kai-message (REAL markdown). It can
                        render prose/lists/tables; the cited prose above is hand-woven
                        JSX because a markdown string can't host inline citation chips. */}
                    <kai-message
                      ref={(el) => {
                        const m = el;
                        m.message = { id: 'perplexity-pipeline', role: 'assistant', parts: [{ type: 'text', text: PIPELINE_MD }] };
                        m.avatar = 'none';
                      }}
                      style={{ display: 'block' }}
                    ></kai-message>

                    {/* a media / images strip */}
                    <div class="flex flex-col gap-1.5">
                      <div class="flex gap-2 overflow-x-auto">
                        <For each={[0, 1, 2, 3]}>
                          {(n) => (
                            <div class="flex h-24 w-36 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                              <kai-icon name="image" class="text-muted-foreground"></kai-icon>
                              <span class="sr-only">media {n}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>

                    {/* the answer action toolbar. kai-message also exposes a built-in
                        action bar; here a kai-button row stands alone under the answer. */}
                    <div class="flex items-center gap-1 border-t border-border pt-3">
                      <kai-tooltip content="Copy">
                        <kai-button variant="ghost" size="icon-sm" label="Copy"><Copy slot="icon" class="size-4" /></kai-button>
                      </kai-tooltip>
                      <kai-tooltip content="Rewrite">
                        <kai-button variant="ghost" size="icon-sm" label="Rewrite"><RefreshCw slot="icon" class="size-4" /></kai-button>
                      </kai-tooltip>
                      <kai-tooltip content="Share">
                        <kai-button variant="ghost" size="icon-sm" icon="share" label="Share"></kai-button>
                      </kai-tooltip>
                    </div>

                    {/* Related follow-up questions */}
                    <div class="flex flex-col gap-1.5 border-t border-border pt-3">
                      <div class="flex items-center gap-1.5 text-sm font-medium">
                        <kai-icon name="sparkles" class="text-muted-foreground"></kai-icon> Related
                      </div>
                      <kai-suggestions
                        ref={(el) => { const s = el; s.suggestions = RELATED; s.layout = 'list'; }}
                        variant="ghost"
                      ></kai-suggestions>
                    </div>
                  </div>
                </Show>

                <Show when={tab() === 'sources'}>
                  <div class="flex flex-col gap-3">
                    {/* The full source list via <kai-sources> numbered (REAL): each
                        chip is a citation link with a hover-snippet popover. */}
                    <kai-sources
                      ref={(el) => { el.sources = SOURCES.map((s) => ({ href: s.href, title: s.title, description: s.snippet })); }}
                      numbered
                      show-favicon
                    ></kai-sources>
                  </div>
                </Show>

                <Show when={tab() === 'images'}>
                  <div class="flex flex-col gap-2">
                    <div class="grid grid-cols-3 gap-2">
                      <For each={[0, 1, 2, 3, 4, 5]}>
                        {(n) => (
                          <div class="flex h-32 items-center justify-center rounded-lg border border-border bg-muted">
                            <kai-icon name="image" class="text-muted-foreground"></kai-icon>
                            <span class="sr-only">image {n}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>

            {/* the follow-up composer: focus/source-mode menu + Pro switch (both REAL) */}
            <div class="shrink-0 border-t border-border p-3">
              <div class="mx-auto max-w-3xl">
                <kai-prompt-input ref={(el) => { el.attach = false; }} placeholder="Ask a follow-up">
                  <div slot="toolbar-start" class="flex items-center gap-1.5">
                    <kai-menu
                      ref={(el) => { el.items = FOCUS; }}
                      trigger-icon="globe"
                      trigger-label="Web"
                      trigger-icon-trailing="chevron-down"
                      label="Focus"
                    ></kai-menu>
                    <kai-tooltip content="Attach">
                      <kai-button variant="ghost" size="icon-sm" icon="paperclip" label="Attach"></kai-button>
                    </kai-tooltip>
                  </div>
                  <div slot="toolbar-end" class="flex items-center gap-2">
                    <span class="text-xs font-medium text-muted-foreground">Pro</span>
                    <kai-switch default-checked label="Pro"></kai-switch>
                  </div>
                </kai-prompt-input>
              </div>
            </div>
          </div>
        </kai-workspace>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        // A representative skeleton of the composition (not the full interactive
        // render). The tabs swap the panel; the strip overflow expands the cards;
        // inline citations + the Sources tab use the REAL kai-source/kai-sources
        // (chip + hover snippet).
        code: `<kai-workspace collapse-below="720"
  style="--kai-workspace-start-min-width: 240px; --kai-workspace-start-max-width: 420px">
  <!-- start: the rail is a <kai-conversations>; chrome rides in ITS slots -->
  <kai-conversations slot="start">
    <div slot="header">
      <span>perplexity</span>
      <kai-button variant="outline" icon="square-pen">New Thread</kai-button>
      <kai-nav></kai-nav>
      <!-- stand-in icons: the named-icon registry has no Compass/Layers/Image glyphs -->
    </div>
    <div slot="footer">
      <kai-menu label="Account menu" full>
        <div slot="trigger"><kai-avatar fallback="AR"></kai-avatar> Ada · Pro</div>
      </kai-menu>
      <kai-button variant="ghost" size="icon-sm" icon="settings" label="Settings"></kai-button>
    </div>
  </kai-conversations>

  <!-- main: the answer view + the follow-up composer -->
  <div slot="main">
    <h1>What is retrieval-augmented generation?</h1>

    <!-- SOURCES STRIP: kai-card per source + a "View N sources" overflow card.
         items-stretch on the row + a shared body min-height keep every card
         (sources AND the overflow card) the same height across line-counts. -->
    <div class="sources-strip" style="display:flex;align-items:stretch;gap:.5rem">
      <kai-card appearance="filled" href="https://arxiv.org/abs/2005.11401">…favicon · domain · title…</kai-card>
      <!-- the "View N sources / +N more" overflow card -->
      <kai-card clickable>View 8 sources<br />+4 more</kai-card>
    </div>

    <!-- Answer / Sources / Images (selection swaps the panel) -->
    <kai-tabs variant="underline"></kai-tabs>

    <!-- kai-message renders a markdown STRING and can't interleave citation chips,
         so the cited prose below is hand-woven (text runs + kai-source chips). -->

    <!-- ANSWER tab: prose with INLINE numbered citations — each [n] is a REAL
         kai-source chip with a built-in hover-snippet popover (NOT a gap). -->
    <p>
      RAG pairs an LLM with a retrieval step
      <kai-source href="…wikipedia…" label="1" headline="…" description="…"></kai-source>
      <kai-source href="…arxiv…" label="2" headline="…" description="…"></kai-source>.
    </p>
    <!-- a markdown sub-block via kai-message (real markdown; can't host inline chips) -->
    <kai-message><!-- message set as a property: a numbered pipeline list --></kai-message>
    <!-- media / images strip: thumbnail tiles -->
    <div class="media-strip">…tiles…</div>
    <!-- answer action toolbar -->
    <kai-button variant="ghost" size="icon-sm" label="Copy"><svg slot="icon">…</svg></kai-button>
    <kai-button variant="ghost" size="icon-sm" label="Rewrite"><svg slot="icon">…</svg></kai-button>
    <kai-button variant="ghost" size="icon-sm" icon="share" label="Share"></kai-button>
    <!-- Related follow-ups -->
    <kai-suggestions></kai-suggestions>

    <!-- SOURCES tab: the full list via kai-sources numbered (REAL: chip + popover) -->
    <kai-sources numbered show-favicon></kai-sources>

    <!-- follow-up composer: focus/source-mode menu + Pro switch (both REAL) -->
    <kai-prompt-input placeholder="Ask a follow-up">
      <div slot="toolbar-start">
        <kai-menu trigger-icon="globe" trigger-label="Web" trigger-icon-trailing="chevron-down" label="Focus"></kai-menu>
        <kai-button variant="ghost" size="icon-sm" icon="paperclip" label="Attach"></kai-button>
      </div>
      <div slot="toolbar-end">Pro <kai-switch></kai-switch></div>
    </kai-prompt-input>
  </div>
</kai-workspace>

<script type="module">
  // Array/object props are JS properties (the kai- contract); scalars are attributes.
  // The recents live on the rail part now, not the layout shell.
  const rail = document.querySelector('kai-conversations');
  rail.groups = [{ id: 'library', name: 'Library', sortOrder: 0, createdAt: '2026-06-01' }];
  rail.conversations = [/* ConversationSummary[] - groupId: 'library' */];
  document.querySelector('kai-nav').items = [/* { id, label, icon } rail rows */];
  document.querySelector('kai-tabs').items = [{ id: 'answer', label: 'Answer' }, { id: 'sources', label: 'Sources' }, { id: 'images', label: 'Images' }];
  document.querySelector('kai-tabs').defaultValue = 'answer';
  document.querySelector('kai-message').message = {
    id: 'pipeline', role: 'assistant',
    parts: [{ type: 'text', text: '**Typical pipeline**\\n\\n1. …' }],
  };
  document.querySelector('kai-sources').sources = [{ href: '…', title: '…', description: '…' }, /* … */];
  document.querySelector('kai-suggestions').suggestions = [/* related questions */];
  document.querySelector('kai-suggestions').layout = 'list';
  document.querySelector('kai-switch').checked = true;

  // Interactions: tabs swap the panel; the overflow card expands the strip.
  document.querySelector('kai-tabs').addEventListener('kai-tab-change', (e) => showPanel(e.detail.value));
</script>`,
      },
    },
  },
};
