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
// The LEAF module, deliberately not the `../wire` barrel: this needs the media
// declaration, and importing the barrel would pull the whole stream adapter into
// the elements bundle for a table of strings. Sharing the module itself (rather
// than copying the list into the composer) is the entire point -- a second list
// here is the drift this design exists to prevent.
import { resolveMediaPolicy, type MediaTypeFilter } from '../wire/media-types';
// Also a leaf, and imported for the same reason: when the browser cannot name a
// file, the question "can this be sent?" is answered by decoding its bytes, and
// this module is where that decode already lives. Asking IT rather than growing
// a second decoder here is what keeps the composer's answer and the encoder's
// answer the same answer, byte for byte, instead of two that agree today.
import { classifyAttachment } from '../wire/files';

/** One file the composer refused, as facts rather than as a message. The kit
 *  says what happened; the application decides what the user reads. */
export interface RejectedAttachment {
  filename: string;
  /** The browser's media type for the file, or `''` when it could not tell. An
   *  empty one is not by itself why a file was rejected: an unnamed file is
   *  decided by decoding its bytes, so `''` here means the decode is what said
   *  no (binary), or that your `accept` left no text type for it to land in. */
  mediaType: string;
  /** `'filtered'` = this kit could have sent it, your `accept` excluded it.
   *  `'unsupported'` = no API takes this as message content at all. */
  reason: 'filtered' | 'unsupported';
}

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
  /** Which attachment media types the user may stage, in HTML `accept` syntax
   *  (`'image/*,application/pdf'`). Omitted means no filter, exactly as before.
   *
   *  NARROWED BY WHAT THE ENCODERS CAN SEND: `'image/*'` here resolves to the
   *  four image formats both APIs actually accept, not to every image type the
   *  OS will offer. It is the same string, resolved by the same function against
   *  the same declaration, as `toOpenAIMessages(msgs, { accept })` -- so a file
   *  the picker allows is a file the wire can carry. */
  accept?: MediaTypeFilter;
  /** Files that were dropped because `accept` excluded them. Carries the facts
   *  (name, media type, reason) and renders nothing itself: what the user should
   *  see is the application's call, not the kit's. */
  onAttachmentsRejected?: (rejected: RejectedAttachment[]) => void;
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

/** The staged file as a `data:` URI.
 *
 *  NOT `URL.createObjectURL`. An object URL resolves only inside the tab that
 *  minted it, so it renders a perfect thumbnail here and is meaningless to
 *  anything downstream — `toOpenAIMessages` / `toAnthropicMessages` refuse it,
 *  and before they refused it the attachment reached the model as nothing at
 *  all. A data URI previews identically and is the one form both providers
 *  actually take. */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

async function fileToAttachment(file: File): Promise<AttachmentData> {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${file.name}-${file.size}-${file.lastModified}`;
  return {
    id,
    type: 'file',
    filename: file.name,
    mediaType: file.type || undefined,
    // EVERY file, not just images. A document used to get no `url` at all,
    // which left it unencodable for exactly the same reason a blob: URL is.
    url: await readAsDataUrl(file),
  };
}

export function DefaultPromptInput(props: DefaultPromptInputProps) {
  let fileInput: HTMLInputElement | undefined;
  const attachments = () => props.attachments ?? [];
  const canAttach = () => !!props.onAttachmentsChange;

  // The SAME resolver the encoders call, on the same declaration. Recomputed
  // reactively so a host that swaps `accept` at runtime moves the picker hint
  // and the filter together.
  const mediaPolicy = () => resolveMediaPolicy({ accept: props.accept });

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !props.onAttachmentsChange) return;

    // The `accept` ATTRIBUTE below is only a hint — every OS dialog offers an
    // "All Files" escape, and it does not apply to drag-and-drop at all. So the
    // filter that actually holds is this one, in JS, on the files as staged.
    const policy = mediaPolicy();
    const picked = Array.from(files);
    // No `accept` means no filtering, which is what every existing consumer gets
    // today. Opting in is what turns the picker into a guarantee.
    const decisions = picked.map((file) =>
      props.accept === undefined ? undefined : policy.decide(file.type),
    );
    // Read a file when its media type says yes, and ALSO when its media type
    // says nothing at all: `undetermined` means the browser could not name it,
    // and the only honest way to answer is to look at the bytes. Reading is the
    // cost of that answer, so it is spent only on files that could still be
    // staged — a file the filter already rejected is never read.
    const needsBytes = (d: (typeof decisions)[number]): boolean =>
      d === undefined || d.status === 'allowed' || d.status === 'undetermined';
    // One parallel pass, index-aligned with `picked`, so the staged order is the
    // PICK order rather than whichever file finished reading first.
    const read = await Promise.all(
      picked.map((file, i) => (needsBytes(decisions[i]) ? fileToAttachment(file) : undefined)),
    );

    const staged: AttachmentData[] = [];
    const rejected: RejectedAttachment[] = [];
    picked.forEach((file, i) => {
      const decision = decisions[i];
      const attachment = read[i];
      if (decision === undefined || decision.status === 'allowed') {
        if (attachment) staged.push(attachment);
        return;
      }
      if (decision.status === 'undetermined') {
        // The bytes are in hand now, so the encoder can answer for real. Its
        // verdict IS the composer's verdict: staging anything it would refuse is
        // the exact defect (#186) this whole design exists to prevent.
        if (attachment && classifyAttachment(attachment, policy).status === 'encodable') {
          staged.push(attachment);
        } else {
          // Not `filtered`: the kit could not encode this either, so pointing
          // the developer at their own `accept` would send them the wrong way.
          rejected.push({ filename: file.name, mediaType: file.type, reason: 'unsupported' });
        }
        return;
      }
      rejected.push({ filename: file.name, mediaType: file.type, reason: decision.status });
    });

    if (rejected.length > 0) props.onAttachmentsRejected?.(rejected);
    if (staged.length === 0) return;
    // Re-read `attachments()` AFTER the await — a second drop while these were
    // being read would otherwise be overwritten by this call's stale snapshot.
    props.onAttachmentsChange?.([...attachments(), ...staged]);
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
                // Derived from the same policy as the filter above, never spelled
                // out again. `accept="image/*"` narrows to the image formats the
                // wire can actually carry, so the OS dialog greys out the SVG
                // that would otherwise 400 at request time.
                accept={props.accept === undefined ? undefined : mediaPolicy().accept}
                onChange={(e) => {
                  // Reading is async now, so this is deliberately not awaited.
                  // `addFiles` captures the FileList synchronously, before its
                  // first await, so clearing the input below cannot race it.
                  void addFiles(e.currentTarget.files);
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
