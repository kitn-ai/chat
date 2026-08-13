import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For, Show } from 'solid-js';
import {
  PromptInput, PromptInputTextarea, PromptInputActions,
  PromptSuggestion, ModelSwitcher, Loader, Button,
  Attachments, Attachment, AttachmentPreview, AttachmentInfo, AttachmentRemove,
} from '../index';
import type { ModelOption } from '../types';
import type { AttachmentData } from '../index';
import { ArrowUp, Paperclip, Globe, Mic, Square, Sparkles } from 'lucide-solid';

const meta: Meta = {
  title: 'Test Fixtures/Prompt Input Variants',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

// Hand-written "Show code" snippets so the docs panel shows clean usage
// instead of the auto-generated render() body.
const IMPORT = `import { PromptInput, PromptInputTextarea, PromptInputActions, Button } from '@kitn.ai/ui';`;
const src = (code: string, imports: string = IMPORT) => ({
  parameters: { docs: { source: { code: `${imports}\n\n${code}`, language: 'tsx' } } },
});

export const BasicInput: Story = {
  name: 'Basic Input',
  render: () => {
    const [value, setValue] = createSignal('');
    return (
      <div class="w-full max-w-2xl p-4">
        <PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
          <PromptInputTextarea placeholder="Ask anything..." />
          <PromptInputActions class="justify-end">
            <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
              <ArrowUp class="size-4" />
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>
    );
  },
  ...src(
    `<PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
  <PromptInputTextarea placeholder="Ask anything..." />
  <PromptInputActions class="justify-end">
    <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
      <ArrowUp class="size-4" />
    </Button>
  </PromptInputActions>
</PromptInput>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, Button } from '@kitn.ai/ui';
import { ArrowUp } from 'lucide-solid';`,
  ),
};

export const WithSuggestions: Story = {
  name: 'With Suggestion Chips',
  render: () => {
    const [value, setValue] = createSignal('');

    const suggestionGroups = [
      {
        label: 'Get started',
        items: ['Summarize this document', 'What are the key takeaways?', 'Create an outline'],
      },
      {
        label: 'Go deeper',
        items: ['Compare with similar approaches', 'What are the tradeoffs?', 'Find contradictions'],
      },
    ];

    return (
      <div class="w-full max-w-2xl p-4 space-y-4">
        <For each={suggestionGroups}>
          {(group) => (
            <div class="space-y-2">
              <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.label}</span>
              <div class="flex flex-wrap gap-2">
                <For each={group.items}>
                  {(item) => (
                    <PromptSuggestion onClick={() => setValue(item)}>
                      {item}
                    </PromptSuggestion>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>

        <PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
          <PromptInputTextarea placeholder="Ask about this document..." />
          <PromptInputActions class="justify-end">
            <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
              <ArrowUp class="size-4" />
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>
    );
  },
  ...src(
    `const suggestionGroups = [
  { label: 'Get started', items: ['Summarize this document', 'What are the key takeaways?', 'Create an outline'] },
  { label: 'Go deeper', items: ['Compare with similar approaches', 'What are the tradeoffs?', 'Find contradictions'] },
];

<div class="space-y-4">
  <For each={suggestionGroups}>
    {(group) => (
      <div class="space-y-2">
        <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.label}</span>
        <div class="flex flex-wrap gap-2">
          <For each={group.items}>
            {(item) => <PromptSuggestion onClick={() => setValue(item)}>{item}</PromptSuggestion>}
          </For>
        </div>
      </div>
    )}
  </For>

  <PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
    <PromptInputTextarea placeholder="Ask about this document..." />
    <PromptInputActions class="justify-end">
      <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
        <ArrowUp class="size-4" />
      </Button>
    </PromptInputActions>
  </PromptInput>
</div>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, PromptSuggestion, Button } from '@kitn.ai/ui';
import { For } from 'solid-js';
import { ArrowUp } from 'lucide-solid';`,
  ),
};

export const WithActionButtons: Story = {
  name: 'With Action Buttons',
  render: () => {
    const [value, setValue] = createSignal('');

    return (
      <div class="w-full max-w-2xl p-4">
        <PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
          <PromptInputTextarea placeholder="Message..." />
          <PromptInputActions class="justify-between">
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Attach file"><Paperclip class="size-4 text-muted-foreground" /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Search the web"><Globe class="size-4 text-muted-foreground" /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Voice input"><Mic class="size-4 text-muted-foreground" /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="AI suggestions"><Sparkles class="size-4 text-muted-foreground" /></Button>
            </div>
            <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
              <ArrowUp class="size-4" />
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>
    );
  },
  ...src(
    `<PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
  <PromptInputTextarea placeholder="Message..." />
  <PromptInputActions class="justify-between">
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" aria-label="Attach file"><Paperclip class="size-4 text-muted-foreground" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Search the web"><Globe class="size-4 text-muted-foreground" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Voice input"><Mic class="size-4 text-muted-foreground" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="AI suggestions"><Sparkles class="size-4 text-muted-foreground" /></Button>
    </div>
    <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
      <ArrowUp class="size-4" />
    </Button>
  </PromptInputActions>
</PromptInput>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, Button } from '@kitn.ai/ui';
import { ArrowUp, Paperclip, Globe, Mic, Sparkles } from 'lucide-solid';`,
  ),
};

export const StreamingState: Story = {
  name: 'Streaming / Loading State',
  render: () => (
    <div class="w-full max-w-2xl p-4 space-y-6">
      <div>
        <p class="text-sm text-muted-foreground mb-2">Disabled while streaming (with stop button)</p>
        <PromptInput disabled isLoading>
          <PromptInputTextarea placeholder="Generating response..." />
          <PromptInputActions class="justify-between">
            <div class="flex items-center gap-2">
              <Loader variant="typing" size="sm" />
              <span class="text-xs text-foreground">Generating...</span>
            </div>
            <Button variant="outline" size="icon-sm" class="rounded-full" aria-label="Stop">
              <Square class="size-3" />
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>

      <div>
        <p class="text-sm text-muted-foreground mb-2">Disabled while waiting for first token</p>
        <PromptInput disabled isLoading>
          <PromptInputTextarea placeholder="Waiting for response..." />
          <PromptInputActions class="justify-between">
            <div class="flex items-center gap-2">
              <Loader variant="dots" size="sm" />
              <span class="text-xs text-foreground">Thinking...</span>
            </div>
            <Button variant="outline" size="icon-sm" class="rounded-full" aria-label="Stop">
              <Square class="size-3" />
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  ),
  ...src(
    `<div class="space-y-6">
  <PromptInput disabled isLoading>
    <PromptInputTextarea placeholder="Generating response..." />
    <PromptInputActions class="justify-between">
      <div class="flex items-center gap-2">
        <Loader variant="typing" size="sm" />
        <span class="text-xs text-foreground">Generating...</span>
      </div>
      <Button variant="outline" size="icon-sm" class="rounded-full" aria-label="Stop">
        <Square class="size-3" />
      </Button>
    </PromptInputActions>
  </PromptInput>

  <PromptInput disabled isLoading>
    <PromptInputTextarea placeholder="Waiting for response..." />
    <PromptInputActions class="justify-between">
      <div class="flex items-center gap-2">
        <Loader variant="dots" size="sm" />
        <span class="text-xs text-foreground">Thinking...</span>
      </div>
      <Button variant="outline" size="icon-sm" class="rounded-full" aria-label="Stop">
        <Square class="size-3" />
      </Button>
    </PromptInputActions>
  </PromptInput>
</div>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, Loader, Button } from '@kitn.ai/ui';
import { Square } from 'lucide-solid';`,
  ),
};

export const WithModelSelector: Story = {
  name: 'With Model Selector',
  render: () => {
    const [value, setValue] = createSignal('');
    const [modelId, setModelId] = createSignal('claude-4');

    const models: ModelOption[] = [
      { id: 'claude-4', name: 'Claude 4 Opus', provider: 'Anthropic' },
      { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', provider: 'Anthropic' },
      { id: 'gemini-2', name: 'Gemini 2.5 Pro', provider: 'Google' },
    ];

    return (
      <div class="w-full max-w-2xl p-4">
        <PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
          <PromptInputTextarea placeholder="Ask anything..." />
          <PromptInputActions class="justify-between">
            <ModelSwitcher models={models} currentModelId={modelId()} onModelChange={setModelId} />
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Attach file"><Paperclip class="size-4 text-muted-foreground" /></Button>
              <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
                <ArrowUp class="size-4" />
              </Button>
            </div>
          </PromptInputActions>
        </PromptInput>
      </div>
    );
  },
  ...src(
    `const models: ModelOption[] = [
  { id: 'claude-4', name: 'Claude 4 Opus', provider: 'Anthropic' },
  { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', provider: 'Anthropic' },
  { id: 'gemini-2', name: 'Gemini 2.5 Pro', provider: 'Google' },
];

<PromptInput value={value()} onValueChange={setValue} onSubmit={() => setValue('')}>
  <PromptInputTextarea placeholder="Ask anything..." />
  <PromptInputActions class="justify-between">
    <ModelSwitcher models={models} currentModelId={modelId()} onModelChange={setModelId} />
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" aria-label="Attach file"><Paperclip class="size-4 text-muted-foreground" /></Button>
      <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message">
        <ArrowUp class="size-4" />
      </Button>
    </div>
  </PromptInputActions>
</PromptInput>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, ModelSwitcher, Button } from '@kitn.ai/ui';
import type { ModelOption } from '@kitn.ai/ui';
import { ArrowUp, Paperclip } from 'lucide-solid';`,
  ),
};

/** The staged file as a `data:` URI — the same thing `<kai-prompt-input>` does
 *  for you internally (see `elements/default-input.tsx`).
 *
 *  NOT `URL.createObjectURL`. An object URL resolves only inside the tab that
 *  minted it, so it renders a perfect thumbnail here and is meaningless to
 *  anything downstream — `toOpenAIMessages` / `toAnthropicMessages` refuse it
 *  with a written reason. A data URI previews identically and is the one form
 *  both providers actually take. */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

export const WithFileAttachments: Story = {
  name: 'With File Attachments',
  render: () => {
    const [value, setValue] = createSignal('');
    // Illustrative seeds: they populate the previews so the story has something
    // to show before you attach anything. The remote one carries `mediaType`,
    // which is what makes an https URL encodable; the pdf has no `url` at all
    // and is a preview only — files staged by `addFiles` below get the real
    // treatment.
    const [attachments, setAttachments] = createSignal<AttachmentData[]>([
      { id: 'a1', type: 'file', filename: 'architecture.pdf', mediaType: 'application/pdf' },
      { id: 'a2', type: 'file', filename: 'screenshot.png', mediaType: 'image/png', url: 'https://placehold.co/120x80/e2e8f0/94a3b8?text=PNG' },
    ]);
    let fileInput: HTMLInputElement | undefined;

    const addFiles = async (files: FileList | null) => {
      if (!files?.length) return;
      // Snapshot synchronously, before the first await: the caller clears the
      // input immediately after calling this, which empties the live FileList.
      const picked = Array.from(files);
      const staged = await Promise.all(
        picked.map(async (f) => ({
          id: crypto.randomUUID(),
          type: 'file' as const,
          filename: f.name,
          mediaType: f.type || undefined,
          // EVERY file, not just images. A document used to get no `url` at all,
          // which left it unencodable for exactly the same reason a blob: URL is.
          url: await readAsDataUrl(f),
        })),
      );
      setAttachments((prev) => [...prev, ...staged]);
    };

    const removeAttachment = (id: string) =>
      setAttachments((prev) => prev.filter((a) => a.id !== id));

    const handleSubmit = () => {
      console.log('submit', { value: value(), attachments: attachments() });
      setValue('');
      setAttachments([]);
    };

    return (
      <div class="w-full max-w-2xl p-4">
        <input
          ref={fileInput}
          type="file"
          multiple
          class="hidden"
          onChange={(e) => {
            // Reading is async, so this is deliberately not awaited. `addFiles`
            // captures the FileList synchronously, before its first await, so
            // clearing the input below cannot race it.
            void addFiles(e.currentTarget.files);
            e.currentTarget.value = ''; // allow re-picking the same file
          }}
        />
        <PromptInput value={value()} onValueChange={setValue} onSubmit={handleSubmit}>
          <Show when={attachments().length > 0}>
            <div class="px-3 pt-3">
              <Attachments variant="inline">
                <For each={attachments()}>
                  {(att) => (
                    <Attachment data={att} onRemove={() => removeAttachment(att.id)}>
                      <AttachmentPreview />
                      <AttachmentInfo />
                      <AttachmentRemove />
                    </Attachment>
                  )}
                </For>
              </Attachments>
            </div>
          </Show>
          <PromptInputTextarea placeholder="Describe or ask about the attached files..." class="pt-3 pl-4" />
          <PromptInputActions class="justify-between">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Attach file"
              onClick={() => fileInput?.click()}
            >
              <Paperclip class="size-4 text-muted-foreground" />
            </Button>
            <Button
              variant="default"
              size="icon-sm"
              class="rounded-full"
              disabled={!value() && attachments().length === 0}
              aria-label="Send message"
            >
              <ArrowUp class="size-4" />
            </Button>
          </PromptInputActions>
        </PromptInput>
        <p class="mt-2 text-xs text-muted-foreground">
          Note: the <code>kai-prompt-input</code> element handles the full attach UX automatically; this story shows how to wire the Solid primitives manually if you need full control.
        </p>
      </div>
    );
  },
  ...src(
    `const [attachments, setAttachments] = createSignal<AttachmentData[]>([
  { id: 'a1', type: 'file', filename: 'architecture.pdf', mediaType: 'application/pdf' },
  { id: 'a2', type: 'file', filename: 'screenshot.png', mediaType: 'image/png', url: 'https://example.com/screenshot.png' },
]);

// Stage the file as a data: URI, NOT URL.createObjectURL. An object URL resolves
// only inside the tab that minted it: it previews perfectly and is meaningless
// to a model, and toOpenAIMessages / toAnthropicMessages refuse it outright.
// Do it for EVERY file, not just images — a document with no url is unencodable
// for exactly the same reason.
const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const addFiles = async (files: FileList | null) => {
  if (!files?.length) return;
  // Snapshot before the first await: clearing the input empties the FileList.
  const picked = Array.from(files);
  const staged = await Promise.all(
    picked.map(async (f) => ({
      id: crypto.randomUUID(),
      type: 'file' as const,
      filename: f.name,
      mediaType: f.type || undefined,
      url: await readAsDataUrl(f),
    })),
  );
  setAttachments((prev) => [...prev, ...staged]);
};

const removeAttachment = (id: string) =>
  setAttachments((prev) => prev.filter((a) => a.id !== id));

let fileInput: HTMLInputElement | undefined;

<input
  ref={fileInput}
  type="file"
  multiple
  class="hidden"
  onChange={(e) => {
    // Not awaited: addFiles captures the FileList before its first await, so
    // clearing the input below cannot race it.
    void addFiles(e.currentTarget.files);
    e.currentTarget.value = ''; // allow re-picking the same file
  }}
/>
<PromptInput value={value()} onValueChange={setValue} onSubmit={send}>
  <Show when={attachments().length > 0}>
    <div class="px-3 pt-3">
      <Attachments variant="inline">
        <For each={attachments()}>
          {(att) => (
            <Attachment data={att} onRemove={() => removeAttachment(att.id)}>
              <AttachmentPreview />
              <AttachmentInfo />
              <AttachmentRemove />
            </Attachment>
          )}
        </For>
      </Attachments>
    </div>
  </Show>
  <PromptInputTextarea placeholder="Describe or ask about the attached files..." class="pt-3 pl-4" />
  <PromptInputActions class="justify-between">
    <Button variant="ghost" size="icon-sm" aria-label="Attach file" onClick={() => fileInput?.click()}><Paperclip class="size-4 text-muted-foreground" /></Button>
    <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value() && attachments().length === 0} aria-label="Send message">
      <ArrowUp class="size-4" />
    </Button>
  </PromptInputActions>
</PromptInput>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, Attachments, Attachment, AttachmentPreview, AttachmentInfo, AttachmentRemove, Button } from '@kitn.ai/ui';
import type { AttachmentData } from '@kitn.ai/ui';
import { createSignal, Show, For } from 'solid-js';
import { ArrowUp, Paperclip } from 'lucide-solid';`,
  ),
};

const SUGGESTION_GROUPS = [
  { label: 'Get started', items: ['Summarize this document', 'What are the key takeaways?', 'Create an outline'] },
  { label: 'Go deeper', items: ['Compare with similar approaches', 'What are the tradeoffs?', 'Find contradictions'] },
];

const FULL_MODELS: ModelOption[] = [
  { id: 'claude-4-opus', name: 'Claude 4 Opus', provider: 'Anthropic' },
  { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', provider: 'Anthropic' },
  { id: 'gemini-2', name: 'Gemini 2.5 Pro', provider: 'Google' },
];

export const StoppableStreaming: Story = {
  name: 'Stoppable / Stop Button (kai-prompt-input)',
  render: () => {
    const [loading, setLoading] = createSignal(false);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handleSubmit = () => {
      setLoading(true);
      // Simulate a 3-second stream. In production: store the AbortController from
      // your fetch() call and call controller.abort() from onStop instead.
      timer = setTimeout(() => setLoading(false), 3000);
    };

    const handleStop = () => {
      clearTimeout(timer);
      setLoading(false);
    };

    return (
      <div class="w-full max-w-2xl p-4 space-y-4">
        <p class="text-sm text-muted-foreground">
          The Solid primitive equivalent of <code>stoppable</code> on <code>kai-prompt-input</code>:
          when <code>loading</code> is true, the send button is replaced by a Stop button (square icon).
          Clicking Stop fires <code>kai-stop</code>; your handler calls <code>controller.abort()</code>
          then clears the loading flag. Press Submit to start the simulated 3-second stream.
        </p>
        <PromptInput
          isLoading={loading()}
          disabled={loading()}
          onSubmit={handleSubmit}
          value=""
          onValueChange={() => {}}
        >
          <PromptInputTextarea
            placeholder={loading() ? 'Generating...' : 'Type something and hit Submit...'}
          />
          <PromptInputActions class="justify-end">
            <Show
              when={loading()}
              fallback={
                <Button
                  size="icon-sm"
                  class="rounded-full"
                  aria-label="Send message"
                  onClick={handleSubmit}
                >
                  <ArrowUp class="size-4" />
                </Button>
              }
            >
              <Button
                size="icon-sm"
                variant="outline"
                class="rounded-full"
                aria-label="Stop"
                data-testid="story-stop-btn"
                onClick={handleStop}
              >
                <Square class="size-3" />
              </Button>
            </Show>
          </PromptInputActions>
        </PromptInput>
        <p class="text-xs text-muted-foreground">
          Element usage: <code>&lt;kai-prompt-input stoppable loading&gt;</code> then listen for
          {' '}<code>kai-stop</code> to call <code>controller.abort()</code>.
        </p>
      </div>
    );
  },
  ...src(
    `const [loading, setLoading] = createSignal(false);
let timer: ReturnType<typeof setTimeout>;

const handleSubmit = () => {
  setLoading(true);
  // Production: keep the AbortController from your fetch() call and abort it on stop.
  timer = setTimeout(() => setLoading(false), 3000);
};

const handleStop = () => {
  clearTimeout(timer);
  setLoading(false);
};

<PromptInput isLoading={loading()} disabled={loading()} onSubmit={handleSubmit} value="" onValueChange={() => {}}>
  <PromptInputTextarea placeholder={loading() ? 'Generating...' : 'Type something and hit Submit...'} />
  <PromptInputActions class="justify-end">
    <Show
      when={loading()}
      fallback={
        <Button size="icon-sm" class="rounded-full" aria-label="Send message" onClick={handleSubmit}>
          <ArrowUp class="size-4" />
        </Button>
      }
    >
      <Button size="icon-sm" variant="outline" class="rounded-full" aria-label="Stop" onClick={handleStop}>
        <Square class="size-3" />
      </Button>
    </Show>
  </PromptInputActions>
</PromptInput>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, Button } from '@kitn.ai/ui';
import { createSignal, Show } from 'solid-js';
import { ArrowUp, Square } from 'lucide-solid';`,
  ),
};

export const FullExample: Story = {
  name: 'Full Example',
  render: () => {
    const [value, setValue] = createSignal('');
    const [modelId, setModelId] = createSignal('claude-4-opus');
    const [streaming, setStreaming] = createSignal(false);
    let abortRef: ReturnType<typeof setTimeout> | undefined;

    const handleSubmit = () => {
      if (!value().trim()) return;
      setStreaming(true);
      setValue('');
      // Simulate a streaming reply that finishes after 3 s.
      // In production: store the AbortController from your fetch() call here,
      // then call controller.abort() from the Stop button handler instead.
      abortRef = setTimeout(() => setStreaming(false), 3000);
    };

    const handleStop = () => {
      clearTimeout(abortRef);
      setStreaming(false);
    };

    return (
      <div class="w-full max-w-2xl p-4 space-y-4">
        <p class="text-sm text-muted-foreground">
          Production-ready composer: model switcher, grouped suggestions, streaming state with Stop,
          and a send button that enables once you type. Submit → 3-second simulated stream → idle.
        </p>

        <Show when={!streaming()}>
          <For each={SUGGESTION_GROUPS}>
            {(group) => (
              <div class="space-y-2">
                <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.label}</span>
                <div class="flex flex-wrap gap-2">
                  <For each={group.items}>
                    {(item) => (
                      <PromptSuggestion onClick={() => setValue(item)}>
                        {item}
                      </PromptSuggestion>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </Show>

        <PromptInput
          value={value()}
          onValueChange={setValue}
          onSubmit={handleSubmit}
          disabled={streaming()}
          isLoading={streaming()}
        >
          <PromptInputTextarea placeholder={streaming() ? 'Generating response...' : 'Ask anything...'} />
          <PromptInputActions class="justify-between">
            <Show
              when={streaming()}
              fallback={
                <ModelSwitcher
                  models={FULL_MODELS}
                  currentModelId={modelId()}
                  onModelChange={setModelId}
                />
              }
            >
              <div class="flex items-center gap-2">
                <Loader variant="typing" size="sm" />
                <span class="text-xs text-foreground">Generating…</span>
              </div>
            </Show>
            <Show
              when={streaming()}
              fallback={
                <Button
                  variant="default"
                  size="icon-sm"
                  class="rounded-full"
                  disabled={!value()}
                  aria-label="Send message"
                  onClick={handleSubmit}
                >
                  <ArrowUp class="size-4" />
                </Button>
              }
            >
              <Button
                variant="outline"
                size="icon-sm"
                class="rounded-full"
                aria-label="Stop generation"
                onClick={handleStop}
              >
                <Square class="size-3" />
              </Button>
            </Show>
          </PromptInputActions>
        </PromptInput>
      </div>
    );
  },
  ...src(
    `const SUGGESTION_GROUPS = [
  { label: 'Get started', items: ['Summarize this document', 'What are the key takeaways?', 'Create an outline'] },
  { label: 'Go deeper', items: ['Compare with similar approaches', 'What are the tradeoffs?', 'Find contradictions'] },
];

const MODELS: ModelOption[] = [
  { id: 'claude-4-opus', name: 'Claude 4 Opus', provider: 'Anthropic' },
  { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', provider: 'Anthropic' },
  { id: 'gemini-2', name: 'Gemini 2.5 Pro', provider: 'Google' },
];

const [value, setValue] = createSignal('');
const [modelId, setModelId] = createSignal('claude-4-opus');
const [streaming, setStreaming] = createSignal(false);
let abortRef: ReturnType<typeof setTimeout>;

const handleSubmit = () => {
  if (!value().trim()) return;
  setStreaming(true);
  setValue('');
  // Production: keep the AbortController from your fetch() call and abort it on stop.
  abortRef = setTimeout(() => setStreaming(false), 3000);
};

const handleStop = () => {
  clearTimeout(abortRef);
  setStreaming(false);
};

<div class="space-y-4">
  <Show when={!streaming()}>
    <For each={SUGGESTION_GROUPS}>
      {(group) => (
        <div class="space-y-2">
          <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.label}</span>
          <div class="flex flex-wrap gap-2">
            <For each={group.items}>
              {(item) => <PromptSuggestion onClick={() => setValue(item)}>{item}</PromptSuggestion>}
            </For>
          </div>
        </div>
      )}
    </For>
  </Show>

  <PromptInput value={value()} onValueChange={setValue} onSubmit={handleSubmit} disabled={streaming()} isLoading={streaming()}>
    <PromptInputTextarea placeholder={streaming() ? 'Generating response...' : 'Ask anything...'} />
    <PromptInputActions class="justify-between">
      <Show
        when={streaming()}
        fallback={<ModelSwitcher models={MODELS} currentModelId={modelId()} onModelChange={setModelId} />}
      >
        <div class="flex items-center gap-2">
          <Loader variant="typing" size="sm" />
          <span class="text-xs text-foreground">Generating...</span>
        </div>
      </Show>
      <Show
        when={streaming()}
        fallback={
          <Button variant="default" size="icon-sm" class="rounded-full" disabled={!value()} aria-label="Send message" onClick={handleSubmit}>
            <ArrowUp class="size-4" />
          </Button>
        }
      >
        <Button variant="outline" size="icon-sm" class="rounded-full" aria-label="Stop generation" onClick={handleStop}>
          <Square class="size-3" />
        </Button>
      </Show>
    </PromptInputActions>
  </PromptInput>
</div>`,
    `import { PromptInput, PromptInputTextarea, PromptInputActions, PromptSuggestion, ModelSwitcher, Loader, Button } from '@kitn.ai/ui';
import type { ModelOption } from '@kitn.ai/ui';
import { createSignal, Show, For } from 'solid-js';
import { ArrowUp, Square } from 'lucide-solid';`,
  ),
};
