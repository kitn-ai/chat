import '@kitn.ai/ui/elements'; // registers the kai-* custom elements (async)
import '@kitn.ai/ui/theme.tokens.css'; // --color-* tokens; the host page uses its own palette
import './index.css';
import { createSupportChat, type ChatElement } from './chat';

/**
 * Rung 1 of the iteration ladder: a docked support widget on somebody else's
 * product page. Launcher, panel, one conversation, no history.
 *
 * The launcher/panel mechanics — open/close, Escape, `aria-expanded`, focus
 * return, the corner placement — belong to `<kai-dock>` in index.html now, not
 * to this file. What is left here is only the product: wiring the chat turn.
 *
 * Two contract details this file owns, both of which a framework wrapper would
 * otherwise hide:
 *
 *  1. THE UPGRADE RACE. `@kitn.ai/ui/elements` registers asynchronously, and an
 *     array/object PROPERTY set on a tag that has not upgraded yet is lost. So
 *     nothing touches `<kai-chat>` until `customElements.whenDefined` resolves.
 *  2. NON-BUBBLING EVENTS. `kai-submit` is a plain CustomEvent with
 *     `bubbles: false`, so the listener goes on the element itself — a delegated
 *     listener on document would never fire. The text is `event.detail.value`.
 */

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`support widget markup missing: #${id} (see index.html)`);
  return element as T;
}

const chat = must<HTMLElement>('support-chat') as ChatElement;

async function boot(): Promise<void> {
  await customElements.whenDefined('kai-chat'); // gotcha 1
  const support = createSupportChat(chat);

  chat.addEventListener('kai-submit', (event) => {
    // gotcha 2: the text is on detail.value (attachments ride alongside it; this
    // widget does not offer them).
    const { value } = (event as CustomEvent<{ value: string }>).detail;
    void support.send(value);
  });
}

void boot();
