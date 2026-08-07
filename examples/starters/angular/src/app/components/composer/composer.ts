import { CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, ViewChild, input, output } from '@angular/core';
import type { Theme } from '../../types';
import { useVoiceInput } from '../../state/voice-input';

/** The imperative surface of <kai-prompt-input> this composer drives. */
type PromptInputEl = HTMLElement & { value?: unknown; clear?: () => void };

/**
 * The bottom composer. Wraps `<kai-prompt-input>` and owns the input-DOM concerns:
 * the element ref, a live text mirror, clear-on-submit, and seeding voice.
 *
 * The prompt input stays UNCONTROLLED so the `/`+`@` trigger menus keep a live
 * caret. We NEVER bind `[value]` with a plain STRING: that flips the element into
 * controlled mode, which re-applies the property and collapses the shadow-DOM
 * selection, disabling the caret-anchored menu. So clear-on-submit goes through the
 * element's `clear()` method, and voice seeds a ComposerDoc (a non-string value is a
 * one-time seed that leaves the input uncontrolled). We keep the live text mirrored
 * in `liveText` (from `kai-value-change`) so voice can append.
 *
 * `voice` is set as a truthy PROPERTY (`[voice]="true"`), not a bare `voice`
 * attribute, which the facade's flag() would read as false.
 */
@Component({
  selector: 'app-composer',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './composer.html',
  styleUrl: './composer.css',
})
export class Composer {
  theme = input.required<Theme>();
  loading = input.required<boolean>();
  suggestions = input.required<string[]>();
  triggers = input.required<unknown[]>();

  submit = output<string>();
  suggestion = output<string>();

  // Ref to the underlying <kai-prompt-input> element for the imperative pushes
  // (clear() on submit, ComposerDoc seed from voice); `liveText` mirrors the text.
  @ViewChild('prompt', { static: true }) promptRef!: ElementRef<PromptInputEl>;
  private liveText = '';

  // Voice: on a transcript, append it to the current text and seed the (uncontrolled)
  // input as a ComposerDoc. A non-string `value` is a one-time seed into the
  // element's internal state; a plain STRING would instead flip it into controlled
  // mode and re-break the `/`+`@` triggers and submit.
  private readonly voice = useVoiceInput((transcript) => {
    const next = (this.liveText ? this.liveText + ' ' : '') + transcript;
    this.liveText = next;
    const el = this.promptRef?.nativeElement;
    if (el) el.value = [{ type: 'text', text: next }];
  });

  handleVoice() {
    // Mic is Chromium-only; degrade gracefully everywhere else.
    if (!this.voice.supported) {
      alert('Voice input needs a Chromium browser.');
      return;
    }
    this.voice.start();
  }

  onValueChange(e: Event) {
    this.liveText = (e as CustomEvent<{ value: string }>).detail.value;
  }

  onSubmit(e: Event) {
    // Clear our own uncontrolled input first — reset the mirror + call the element's
    // clear() method (uncontrolled-safe; fires kai-value-change internally, never a
    // string assignment) — then hand the text up. The parent owns append + streaming.
    this.liveText = '';
    this.promptRef?.nativeElement?.clear?.();
    this.submit.emit((e as CustomEvent<{ value: string }>).detail.value);
  }

  onSuggestionClick(e: Event) {
    this.suggestion.emit((e as CustomEvent<{ value: string }>).detail.value);
  }
}
