import { createSignal, For, Show } from 'solid-js';
import {
  Button,
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
  PromptSuggestion,
} from '@kitn.ai/ui/solid';
import { ArrowUpIcon, PlusIcon } from './icons';

interface ComposerProps {
  loading: () => boolean;
  suggestions: () => string[];
  onSubmit: (value: string) => void;
}

/**
 * The bottom composer: the suggestion chips, the text input and the send button.
 *
 * It owns the DRAFT — the text being typed — and nothing else. That is the seam
 * worth noticing: the draft is the composer's business, and the moment it is
 * submitted it stops being a draft and becomes a message, which is `App`'s. So
 * `onSubmit` hands the text up and the input clears itself here; the parent
 * never sees a keystroke.
 *
 * `<PromptInput>` is CONTROLLED here (`value` + `onValueChange`), which is the
 * plain-string case and is fine. The React starter deliberately leaves its
 * `<kai-prompt-input>` uncontrolled instead, because assigning a string value to
 * the ELEMENT re-applies the property and collapses its shadow-DOM selection,
 * which breaks the caret-anchored `/` and `@` trigger menus. That is a web
 * component concern; these are Solid components rendering into the light DOM,
 * with no shadow root and no trigger menus, so the simple form applies.
 */
export function Composer(props: ComposerProps) {
  const [draft, setDraft] = createSignal('');

  const submit = () => {
    const text = draft().trim();
    if (!text || props.loading()) return;
    setDraft('');
    props.onSubmit(text);
  };

  return (
    <div class="shrink-0 bg-background px-3 pb-3 md:px-5 md:pb-5">
      <div class="mx-auto max-w-3xl">
        {/* Suggestions fill the draft rather than sending it, so the user can edit
            before committing. They fall away once the thread is underway. */}
        <Show when={props.suggestions().length > 0}>
          <div class="flex flex-wrap gap-2 pb-3">
            <For each={props.suggestions()}>
              {(text) => (
                <PromptSuggestion onClick={() => setDraft(text)}>{text}</PromptSuggestion>
              )}
            </For>
          </div>
        </Show>

        <PromptInput value={draft()} onValueChange={setDraft} onSubmit={submit}>
          <div class="flex flex-col">
            <PromptInputTextarea placeholder="Ask about SolidJS…" class="min-h-[44px] pt-3 pl-4" />
            <PromptInputActions class="mt-2 flex w-full items-center justify-between gap-2 px-3 pb-3">
              <div class="flex items-center gap-2">
                {/* Disabled on purpose: attachments are a real feature of the kit
                    (<kai-attachments>), and wiring them is beyond a starter. */}
                <Button variant="outline" size="icon-sm" class="rounded-full" disabled>
                  <PlusIcon size={16} aria-hidden />
                  <span class="sr-only">Attach a file</span>
                </Button>
              </div>
              <Button
                size="icon-sm"
                class="rounded-full"
                disabled={!draft().trim() || props.loading()}
                onClick={submit}
              >
                <ArrowUpIcon size={16} aria-hidden />
                <span class="sr-only">Send message</span>
              </Button>
            </PromptInputActions>
          </div>
        </PromptInput>

        <p class="mt-2 text-center text-xs text-muted-foreground">
          Replies come from the kit's mock responder — no model was contacted.
        </p>
      </div>
    </div>
  );
}
