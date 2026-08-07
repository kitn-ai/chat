import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, signal } from '@angular/core';
import { CONVERSATIONS, THREADS, SUGGESTIONS, TRIGGERS, newId, streamFakeReply } from '../chat-data';
import type { Theme } from './types';
import { createChat } from './state/chat.store';
import { createConversations } from './state/conversations.store';
import { Sidebar } from './components/sidebar/sidebar';
import { ThreadView } from './components/thread-view/thread-view';
import { Composer } from './components/composer/composer';
import { ThemeToggle } from './components/theme-toggle/theme-toggle';

/**
 * A mini chat workspace COMPOSED BY HAND from @kitn.ai/ui's individual elements —
 * the Angular mirror of `examples/react` and `examples/vue`. It shows how the raw
 * `kai-*` web components fit together (vs. dropping in one batteries-included
 * `<kai-chat>`/`<kai-workspace>`):
 *
 *   <kai-resizable>/<kai-resizable-item>  — the draggable sidebar | main split (the
 *                                           divider is the kit's default `line` hairline)
 *   <kai-conversations>  — the sidebar list (fed `conversations`, emits select/new)
 *   <kai-thread>         — the scrolling message list (stick-to-bottom built in)
 *   <kai-prompt-input>   — the composer at the bottom
 *
 * The pieces are split into standalone sub-components + the example's own moon/sun
 * icons, and `state/` (`createChat` owns the message array + streaming,
 * `createConversations` the conversation stash, `useVoiceInput` the mic). Everything
 * else is plain Angular signals. Swap `streamFakeReply` for a real model call to ship.
 *
 * `CUSTOM_ELEMENTS_SCHEMA` tells Angular to allow the unknown `kai-*` tags and pass
 * property/event bindings straight through to the DOM.
 */
@Component({
  selector: 'app-root',
  imports: [Sidebar, ThreadView, Composer, ThemeToggle],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly theme = signal<Theme>('dark');
  readonly collapsed = signal(false);

  readonly chat = createChat(THREADS[CONVERSATIONS[0].id] ?? []);
  private readonly convos = createConversations(this.chat, CONVERSATIONS);
  readonly conversations = this.convos.conversations;
  readonly activeId = this.convos.activeId;

  readonly suggestions = computed(() => (this.chat.messages().length <= 1 ? SUGGESTIONS : []));
  readonly triggers = TRIGGERS;

  toggleTheme() {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
  }

  selectConversation(id: string) {
    this.convos.selectConversation(id);
  }

  newChat() {
    this.convos.newChat();
  }

  async send(raw: string) {
    const text = raw.trim();
    if (!text) return;
    // The Composer already cleared its own input; here we just append the user
    // message and stream the (fake) assistant reply.
    this.chat.append({ id: newId(), role: 'user', content: text });
    const stream = this.chat.streamAssistant();
    await streamFakeReply(text, (delta) => stream.appendText(delta));
    stream.done();
  }
}
