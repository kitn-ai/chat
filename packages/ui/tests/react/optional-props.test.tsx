/**
 * TYPE + RUNTIME regression — an element's props interface must say what the
 * element actually needs.
 *
 * The defect class: a facade declares a prop as REQUIRED in its `Props` interface
 * while `defineWebComponent` registers a runtime default for it. The generated
 * React wrapper inherits the required-ness, so a consumer who legitimately wants
 * the element WITHOUT that value still has to invent one — `error TS2741:
 * Property 'x' is missing`. Nineteen props across the catalog were in that state.
 *
 * It is NOT a blanket "required + default = widen" rule. A default is only
 * evidence of optionality when the element has a real way to be useful without
 * the value: light-DOM children it merges in, an imperative API that fills it, a
 * designed empty state, or a second mode that does not use it. Where the prop IS
 * the element's only content, the type stays required and the default is merely
 * defensive — those five are pinned as REQUIRED below so a future sweep cannot
 * quietly widen them too.
 *
 * The assertions run on TWO surfaces, because each catches what the other misses:
 *
 *   - COMPILE TIME, against `packages/ui/frameworks/react/index.tsx` — the
 *     GENERATED wrapper a React consumer actually imports, not the internal
 *     facade types. Checked by `tsc --noEmit -p tsconfig.react.test.json` (the
 *     third pass of `npm run typecheck`).
 *   - RUNTIME, under `npm run test:react`, where `@kitn.ai/ui/elements` resolves
 *     to the prebuilt `dist/kai.es.js`. Rendering a widened element with the prop
 *     omitted really upgrades the custom element, so a facade that still reaches
 *     into `props.x.length` throws here instead of shipping.
 */
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  Artifact,
  Attachments,
  ChainOfThought,
  Chat,
  Conversations,
  ModelSwitcher,
  ScopePicker,
  Skills,
  Sources,
  Suggestions,
  ToastRegion,
  Workspace,
  type ArtifactProps,
  type AttachmentsProps,
  type ChainOfThoughtProps,
  type ChatProps,
  type CodeBlockProps,
  type ConversationsProps,
  type FileTreeProps,
  type MarkdownProps,
  type ModelSwitcherProps,
  type ReasoningProps,
  type ScopePickerProps,
  type SegmentedProps,
  type SkillsProps,
  type SourcesProps,
  type SuggestionsProps,
  type ToastRegionProps,
  type WorkspaceProps,
} from '@kitn.ai/ui/react';

afterEach(cleanup);

// ─── type-level helpers ──────────────────────────────────────────────────────
// The keys a consumer is FORCED to pass. `{}` is assignable to `{ k?: X }` but
// not to `{ k: X }`, which is exactly the optional/required distinction — and it
// is the only test that survives `exactOptionalPropertyTypes` either way. (A
// `undefined extends T[K]` test would be wrong: it also passes for a REQUIRED
// prop typed `X | undefined`.)
// eslint-disable-next-line @typescript-eslint/ban-types
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];
type Assert<T extends true> = T;
type IsRequired<P, K extends keyof P> = K extends RequiredKeys<P> ? true : false;

// ─── the 14 widened props ────────────────────────────────────────────────────
// Each is `{}`-assignable: a React consumer can render the element with NO props
// at all. If one goes back to required, its line stops compiling (TS2741).
const _artifact: ArtifactProps = {};
const _attachments: AttachmentsProps = {};
const _chainOfThought: ChainOfThoughtProps = {};
const _chat: ChatProps = {};
const _conversations: ConversationsProps = {};
const _modelSwitcher: ModelSwitcherProps = {};
const _scopePicker: ScopePickerProps = {};
const _skills: SkillsProps = {};
const _sources: SourcesProps = {};
const _suggestions: SuggestionsProps = {};
const _toastRegion: ToastRegionProps = {};
const _workspace: WorkspaceProps = {};

// ─── the 5 props that stay REQUIRED ──────────────────────────────────────────
// `<kai-code-block>`, `<kai-markdown>` and `<kai-reasoning>` render exactly one
// string and offer no other source for it; `<kai-file-tree>` and `<kai-segmented>`
// are their list. Omitting the prop yields a silently blank element, so the
// compiler should keep asking for it. These lines fail if it stops.
type _codeStaysRequired = Assert<IsRequired<CodeBlockProps, 'code'>>;
type _contentStaysRequired = Assert<IsRequired<MarkdownProps, 'content'>>;
type _textStaysRequired = Assert<IsRequired<ReasoningProps, 'text'>>;
type _filesStayRequired = Assert<IsRequired<FileTreeProps, 'files'>>;
type _optionsStayRequired = Assert<IsRequired<SegmentedProps, 'options'>>;

// Referenced so the aliases above are not dead code to a reader (they are already
// load-bearing to tsc).
export type PinnedRequired = [
  _codeStaysRequired,
  _contentStaysRequired,
  _textStaysRequired,
  _filesStayRequired,
  _optionsStayRequired,
];

// ─── runtime: every widened element mounts with the prop omitted ─────────────
// Not a formality — several of these facades read the prop's `.length` or spread
// it, which throws on `undefined` unless the call site applies the default.
const widened: [string, () => React.ReactElement][] = [
  ['kai-artifact', () => <Artifact />],
  ['kai-attachments', () => <Attachments />],
  ['kai-chain-of-thought', () => <ChainOfThought />],
  ['kai-chat', () => <Chat />],
  ['kai-conversations', () => <Conversations />],
  ['kai-model-switcher', () => <ModelSwitcher />],
  ['kai-scope-picker', () => <ScopePicker />],
  ['kai-skills', () => <Skills />],
  ['kai-sources', () => <Sources />],
  ['kai-suggestions', () => <Suggestions />],
  ['kai-toast-region', () => <ToastRegion />],
  ['kai-workspace', () => <Workspace />],
];

test.each(widened)('<%s> mounts with every defaulted prop omitted', (tag, el) => {
  const { container } = render(el());
  expect(container.querySelector(tag)).toBeTruthy();
});

// A consumer who explicitly assigns `undefined` (a controlled value that has not
// arrived yet) must land on the same path as omitting it.
test.each(widened.map(([tag]) => tag))('<%s> survives an explicit undefined', (tag) => {
  const { container } = render(<div />);
  const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
  container.appendChild(el);
  for (const key of ['files', 'items', 'steps', 'messages', 'conversations', 'models',
    'availableAuthors', 'availableTags', 'skills', 'sources', 'suggestions', 'toasts']) {
    if (key in el) el[key] = undefined;
  }
  expect(el.isConnected).toBe(true);
});

// ─── the original `groups` case, kept ────────────────────────────────────────
const conversations = [
  {
    id: 'c1',
    title: 'Hello world',
    scope: { type: 'collection' as const },
    messageCount: 2,
    lastMessageAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
];

const _conversationsWithoutGroups: ConversationsProps = { conversations, activeId: 'c1' };
const _workspaceWithoutGroups: WorkspaceProps = { conversations, activeId: 'c1' };

test('<Conversations> renders with no `groups` prop', () => {
  const { container } = render(<Conversations conversations={conversations} activeId="c1" />);
  expect(container.querySelector('kai-conversations')).toBeTruthy();
  expect(_conversationsWithoutGroups.conversations).toHaveLength(1);
});

test('<Workspace> renders with no `groups` prop', () => {
  const { container } = render(<Workspace conversations={conversations} activeId="c1" />);
  expect(container.querySelector('kai-workspace')).toBeTruthy();
  expect(_workspaceWithoutGroups.conversations).toHaveLength(1);
});

// The populated forms must keep compiling — every change here is a WIDENING, not
// a swap. One representative per widened prop, with a real value.
const _stillPopulated = {
  artifact: { files: [{ path: 'a.ts', code: 'x' }] } satisfies ArtifactProps,
  attachments: { items: [{ id: 'a1', type: 'file' as const, filename: 'a.png' }] } satisfies AttachmentsProps,
  chainOfThought: { steps: [{ label: 'Search' }] } satisfies ChainOfThoughtProps,
  chat: { messages: [{ id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] }] } satisfies ChatProps,
  conversations: {
    conversations: [{ ...conversations[0], groupId: 'g1' }],
    groups: [{ id: 'g1', name: 'Today', sortOrder: 0, createdAt: '2026-06-01' }],
  } satisfies ConversationsProps,
  modelSwitcher: { models: [{ id: 'gpt-4o', name: 'GPT-4o' }] } satisfies ModelSwitcherProps,
  scopePicker: { availableAuthors: ['ada'], availableTags: ['docs'] } satisfies ScopePickerProps,
  skills: { skills: [{ id: 's1', name: 'search' }] } satisfies SkillsProps,
  sources: { sources: [{ href: 'https://example.com' }] } satisfies SourcesProps,
  suggestions: { suggestions: ['Summarize this'] } satisfies SuggestionsProps,
  toastRegion: { toasts: [{ id: 't1', message: 'Saved' }] } satisfies ToastRegionProps,
  workspace: { conversations, messages: [] } satisfies WorkspaceProps,
};

test('the populated forms still type-check and render', () => {
  const { container } = render(<Conversations {..._stillPopulated.conversations} />);
  expect(container.querySelector('kai-conversations')).toBeTruthy();
  expect(Object.keys(_stillPopulated)).toHaveLength(12);
});
