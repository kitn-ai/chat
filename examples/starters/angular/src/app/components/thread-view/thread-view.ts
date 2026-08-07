import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, input } from '@angular/core';
import type { ChatMessage } from '@kitn.ai/ui';
import type { Theme } from '../../types';

/**
 * The scrolling message list. `<kai-thread>` owns the message rendering, the
 * centered fixed-width column, and stick-to-bottom scroll, so this component just
 * bakes the per-message actions onto the assistant turns and wires the custom
 * `speak` action to the browser's speech synthesis. `copy` (and the feedback votes)
 * are handled inside the element.
 *
 * `messages` reaches the element as a DOM PROPERTY (`[messages]`); a NEW array
 * reference per streaming chunk is what re-renders it. `withActions` is a computed
 * that derives that fresh array whenever the `messages` signal input changes.
 */
@Component({
  selector: 'app-thread-view',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './thread-view.html',
  styleUrl: './thread-view.css',
})
export class ThreadView {
  theme = input.required<Theme>();
  messages = input.required<ChatMessage[]>();

  // <kai-thread> reads `actions` off each message; only assistant replies get them.
  withActions = computed<ChatMessage[]>(() =>
    this.messages().map((m) =>
      m.role === 'assistant'
        ? { ...m, actions: ['copy', { id: 'speak', label: 'Read aloud', icon: 'volume-2' }] }
        : m,
    ),
  );

  onMessageAction(e: Event) {
    const detail = (e as CustomEvent<{ messageId: string; action: string }>).detail;
    if (detail.action === 'speak') {
      const m = this.messages().find((x) => x.id === detail.messageId);
      if (!m) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(m.content));
    }
  }
}
