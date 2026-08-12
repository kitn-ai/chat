import { For, Show } from 'solid-js';
import { PromptInput, PromptInputTextarea, PromptInputActions } from '../components/prompt-input';
import type { TriggerDef, ComposerChange } from '../components/composer';
import { type ComposerDoc, normalizeValue, serializeToText } from '../primitives/composer-model';
import { PromptSuggestion } from '../components/prompt-suggestion';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { Paperclip, Globe, Mic, Square } from 'lucide-solid';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
  type AttachmentData,
} from '../components/attachments';
import { actionIcon } from '../ui/action-icons';
import type { CustomAction } from './chat-types';

export interface DefaultPromptInputProps {
  /** String = controlled text mirror; ComposerDoc = a seed that pre-populates pills. */
  value: string | ComposerDoc;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  suggestions?: string[];
  /** Attachments staged in the input. Provide `onAttachmentsChange` to enable
   *  the attach button + removable previews. */
  attachments?: AttachmentData[];
  /** When `false`, the built-in paperclip attach button is hidden even if
   *  `onAttachmentsChange` is provided (e.g. when a `+` menu already covers
   *  file-attach). Defaults to `true`. */
  attach?: boolean;
  /** Show a Search (Globe) button in the left toolbar; calls `onSearch`. */
  search?: boolean;
  /** Show a Voice (Mic) button in the left toolbar; calls `onVoice`. */
  voice?: boolean;
  /** Send-button visibility. `'always'` (default) always shows it; `'auto'` shows
   *  it only when there's text/attachments (an empty composer hides it, though
   *  Enter still submits). To hide it entirely (Enter-only), it's pure CSS:
   *  `::part(send){display:none}`, no prop needed. Restyle via `::part(send)`.
   *  The Stop button (stoppable + loading) is unaffected. */
  submit?: 'always' | 'auto';
  onValueChange: (v: string) => void;
  onSubmit: () => void;
  onSuggestionClick: (v: string) => void;
  onAttachmentsChange?: (attachments: AttachmentData[]) => void;
  onSearch?: () => void;
  onVoice?: () => void;
  /** When `true` and `loading` is also `true`, the send button is replaced by
   *  a Stop button that calls `onStop`. */
  stoppable?: boolean;
  /** Called when the user clicks the Stop button. */
  onStop?: () => void;
  /** Custom toolbar action buttons declared as `<kai-action>` light-DOM children. */
  toolbarActions?: CustomAction[];
  /** Called when a custom toolbar action button is clicked, with the action id. */
  onAction?: (id: string) => void;
  /** Rich entity triggers (`/` skills, `@` agents) passed to the composer. */
  triggers?: TriggerDef[];
  /** Default icon per entity kind (kind → image src) passed to the composer. */
  kindIcons?: Record<string, string>;
  /** Structured change (doc + entities) from the composer, on every edit. */
  onComposerChange?: (change: ComposerChange) => void;
}

function fileToAttachment(file: File): AttachmentData {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${file.name}-${file.size}-${file.lastModified}`;
  return {
    id,
    type: 'file',
    filename: file.name,
    mediaType: file.type || undefined,
    url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  };
}

export function DefaultPromptInput(props: DefaultPromptInputProps) {
  let fileInput: HTMLInputElement | undefined;
  const attachments = () => props.attachments ?? [];
  const canAttach = () => !!props.onAttachmentsChange;

  const addFiles = (files: FileList | null) => {
    if (!files?.length || !props.onAttachmentsChange) return;
    props.onAttachmentsChange([...attachments(), ...Array.from(files).map(fileToAttachment)]);
  };
  const removeAttachment = (id: string) =>
    props.onAttachmentsChange?.(attachments().filter((a) => a.id !== id));

  // `value` may be a string or a seeded ComposerDoc — compute emptiness from the
  // flattened text so a pill-only seed still enables Send.
  const valueText = () => serializeToText(normalizeValue(props.value));
  const sendDisabled = () =>
    props.disabled || props.loading || (!valueText().trim() && attachments().length === 0);

  const showStop = () => !!props.loading && !!props.stoppable;
  const hasContent = () => !!valueText().trim() || attachments().length > 0;
  // Send-button visibility: 'always' (default) or 'auto' (only with content).
  // Full-hide (Enter-only) is CSS: `::part(send){display:none}`.
  const showSend = () => {
    const mode = props.submit ?? 'always';
    return mode === 'always' || (mode === 'auto' && hasContent());
  };

  return (
    <>
      <Show when={props.suggestions?.length}>
        <div class="mb-2 flex flex-wrap gap-2">
          <For each={props.suggestions}>
            {(s) => (
              <PromptSuggestion onClick={() => props.onSuggestionClick(s)}>{s}</PromptSuggestion>
            )}
          </For>
        </div>
      </Show>
      <PromptInput
        value={props.value}
        onValueChange={props.onValueChange}
        onSubmit={props.onSubmit}
        isLoading={props.loading}
        disabled={props.disabled}
        class="relative"
      >
        <Show when={canAttach() && attachments().length}>
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
        {/* Consumer-injected content inside the card, above the textarea (e.g. an
            inline status strip). A shadow-internal hole — unreachable from outside.
            Native slot; inert outside a shadow root, projected by the custom element. */}
        <slot name="input-top" />
        <PromptInputTextarea placeholder={props.placeholder} aria-label={props.placeholder || 'Message'} class="min-h-[44px] pt-3 pl-4" triggers={props.triggers} kindIcons={props.kindIcons} onComposerChange={props.onComposerChange} />
        <PromptInputActions class="mt-2 flex w-full items-center justify-between gap-2 px-3 pb-0">
          <div class="flex items-center gap-2">
            {/* Consumer-injected leading toolbar controls (e.g. a + menu). display:contents
                ensures an empty slot adds no stray gap; projected nodes lay out as toolbar
                items. Native slot; projected by the custom element. */}
            <slot name="toolbar-start" style={{ display: 'contents' }} />
            <Show when={canAttach() && props.attach !== false}>
              <input
                ref={fileInput}
                type="file"
                multiple
                class="hidden"
                onChange={(e) => {
                  addFiles(e.currentTarget.files);
                  e.currentTarget.value = ''; // allow re-picking the same file
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                class="rounded-full"
                aria-label="Attach files"
                disabled={props.disabled}
                onClick={() => fileInput?.click()}
              >
                <Paperclip class="size-4" />
              </Button>
            </Show>
            <Show when={props.search}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="rounded-full gap-1"
                aria-label="Search the web"
                disabled={props.disabled}
                onClick={() => props.onSearch?.()}
              >
                <Globe class="size-4" />
                Search
              </Button>
            </Show>
            <Show when={props.voice}>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                class="rounded-full"
                aria-label="Voice input"
                disabled={props.disabled}
                onClick={() => props.onVoice?.()}
              >
                <Mic class="size-4" />
              </Button>
            </Show>
            <For each={props.toolbarActions ?? []}>
              {(action) => {
                const Icon = actionIcon(action.icon);
                const label = action.tooltip ?? action.label;
                const btn = (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    class="rounded-full"
                    aria-label={action.label}
                    data-action={action.id}
                    disabled={props.disabled}
                    onClick={() => props.onAction?.(action.id)}
                  >
                    <Show when={Icon} fallback={<span class="px-1 text-xs">{action.label}</span>}>
                      {(I) => { const C = I(); return <C class="size-4" />; }}
                    </Show>
                  </Button>
                );
                return Icon ? <Tooltip content={label}>{btn}</Tooltip> : btn;
              }}
            </For>
          </div>
          {/* Right cluster — consumer trailing controls (model/effort/voice…)
              hug the send button, right-aligned. The `toolbar-end` slot and the send
              button live together so justify-between pins them to the right edge
              (left group stays left). Native slot; projected by the element. */}
          <div class="flex items-center gap-2">
            <slot name="toolbar-end" />
            <Show
              when={showStop()}
              fallback={
                <Show when={showSend()}>
                  <Button
                    size="icon-sm"
                    class="rounded-full"
                    part="send"
                    data-testid="send"
                    aria-label="Send message"
                    disabled={sendDisabled()}
                    onClick={props.onSubmit}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                    </svg>
                  </Button>
                </Show>
              }
            >
              <Button
                size="icon-sm"
                variant="outline"
                class="rounded-full"
                data-testid="stop"
                aria-label="Stop"
                onClick={props.onStop}
              >
                <Square class="size-3" />
              </Button>
            </Show>
          </div>
        </PromptInputActions>
      </PromptInput>
    </>
  );
}
