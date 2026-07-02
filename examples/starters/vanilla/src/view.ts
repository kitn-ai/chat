import type { ChatMessage } from '@kitn.ai/ui';
import type { AppState, Theme } from './state';
import { SUGGESTIONS, TRIGGERS, type Conversation } from './chat-data';
import { createVoiceInput } from './voice-input';

/**
 * The whole view: builds the hand-composed `kai-*` workspace imperatively, wires
 * every element's CustomEvents, and returns a `render(state)` that syncs app state
 * onto element properties. There is no framework here, so this file owns the two
 * cross-framework gotchas directly:
 *
 *  1. UPGRADE RACE. main.ts `await customElements.whenDefined(...)` BEFORE calling
 *     createView, so every element created below is already upgraded and the
 *     array/object PROPERTIES we set (messages, conversations, triggers) land.
 *  2. BOOLEAN FLAGS as PROPERTIES. `promptInput.voice = true`, not a bare `voice`
 *     attribute (the facade's flag() reads a value-less attribute as false).
 *
 * The composed split is <kai-resizable>/<kai-resizable-item> (sidebar | main), the
 * sidebar is <kai-conversations>, the messages are a <kai-thread>, and the composer
 * is a <kai-prompt-input>. Scalars (theme, placeholder, active-id) go on as
 * attributes; arrays/objects go on as properties.
 */

// Custom-element property shapes we set from render (typed so we avoid `any`).
type ConversationsEl = HTMLElement & { groups?: unknown[]; conversations?: Conversation[]; collapsed?: boolean };
type ThreadEl = HTMLElement & { messages?: ChatMessage[] };
type PromptEl = HTMLElement & {
  value?: unknown;
  clear?: () => void;
  loading?: boolean;
  suggestions?: string[];
  triggers?: unknown[];
  voice?: boolean;
};
type ItemEl = HTMLElement & { collapsed?: boolean };

export interface ViewCallbacks {
  onConversationSelect(id: string): void;
  onNewChat(): void;
  onToggleSidebar(): void;
  onShowSidebar(): void;
  onToggleTheme(): void;
  onSubmit(value: string): void;
  onSuggestion(value: string): void;
}

export interface View {
  render(state: AppState): void;
}

/** Tiny hyperscript: create an element, set string attributes, append children. */
function el(tag: string, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** Parse an inline SVG string to a live node (moon/sun aren't in the kit's icons). */
function svgIcon(markup: string): SVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGElement;
}

const MOON_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" slot="icon" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const SUN_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" slot="icon" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';

// Stable references so re-setting them on every render is a no-op (only a NEW
// array reference re-renders a facade). Streaming re-runs render each chunk.
const NO_SUGGESTIONS: string[] = [];

export function createView(root: HTMLElement, callbacks: ViewCallbacks): View {
  // ── Build the DOM (elements are already upgraded — see gotcha 1) ────────────
  const conversations = el('kai-conversations') as ConversationsEl;
  const aside = el('aside', { class: 'sidebar' }, [conversations]);
  const sidebarItem = el('kai-resizable-item', { size: '280px', min: '220px', max: '420px' }, [aside]) as ItemEl;

  const showSidebarBtn = el('kai-button', { variant: 'ghost', size: 'icon', icon: 'panel-left', label: 'Show sidebar' });
  const brand = el('span', { class: 'brand' });
  brand.textContent = '@kitn.ai/ui · composed chat';
  const themeToggleBtn = el('kai-button', { variant: 'ghost', size: 'icon', label: 'Toggle light/dark theme' });
  const barLeft = el('div', { class: 'bar-left' }, [showSidebarBtn, brand]);
  const bar = el('header', { class: 'bar' }, [barLeft, themeToggleBtn]);

  const thread = el('kai-thread', { class: 'thread' }) as ThreadEl;

  const promptInput = el('kai-prompt-input', { placeholder: 'Message the demo…' }) as PromptEl;
  const hint = el('p', { class: 'composer-hint' });
  hint.innerHTML = 'Type <kbd>/</kbd> for skills · <kbd>@</kbd> for agents';
  const composer = el('div', { class: 'composer' }, [promptInput, hint]);

  const main = el('main', { class: 'main' }, [bar, thread, composer]);
  const mainItem = el('kai-resizable-item', {}, [main]) as ItemEl;

  const resizable = el('kai-resizable', { orientation: 'horizontal' }, [sidebarItem, mainItem]);
  const app = el('div', { class: 'app' }, [resizable]);
  root.append(app);

  // Static properties (never change) — set once. `groups` is always empty (we feed
  // a flat `conversations`); the composer's triggers + voice flag are constant.
  conversations.groups = [];
  promptInput.triggers = TRIGGERS;
  promptInput.voice = true; // gotcha 2: a truthy PROPERTY, not a bare attribute

  // Persistent theme-toggle glyphs, swapped by theme (avoids re-parsing per render).
  const moonIcon = svgIcon(MOON_SVG);
  const sunIcon = svgIcon(SUN_SVG);

  // ── Composer state (kept uncontrolled so the /+@ trigger menus keep a caret) ──
  // liveText mirrors the input text (from kai-value-change) so voice can append to
  // it. We NEVER assign a plain string `value` (that flips the element into
  // controlled mode and breaks the caret-anchored menus); voice seeds a ComposerDoc
  // and clear-on-submit goes through the element's clear() method.
  let liveText = '';
  const voice = createVoiceInput((transcript) => {
    const next = (liveText ? liveText + ' ' : '') + transcript;
    liveText = next;
    promptInput.value = [{ type: 'text', text: next }]; // ComposerDoc seed, not a string
  });

  // ── Wire events (non-bubbling kai-* CustomEvents; kai-button uses native click) ──
  conversations.addEventListener('kai-conversation-select', (e) =>
    callbacks.onConversationSelect((e as CustomEvent<{ id: string }>).detail.id),
  );
  conversations.addEventListener('kai-new-chat', () => callbacks.onNewChat());
  conversations.addEventListener('kai-toggle-sidebar', () => callbacks.onToggleSidebar());

  showSidebarBtn.addEventListener('click', () => callbacks.onShowSidebar());
  themeToggleBtn.addEventListener('click', () => callbacks.onToggleTheme());

  thread.addEventListener('kai-message-action', (e) => {
    const detail = (e as CustomEvent<{ messageId: string; action: string }>).detail;
    if (detail.action !== 'speak') return;
    // `copy` (and the feedback votes) are handled inside the element; the custom
    // `speak` action is ours — read the message text aloud via speech synthesis.
    const m = currentMessages.find((x) => x.id === detail.messageId);
    if (!m) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(m.content));
  });

  promptInput.addEventListener('kai-voice', () => {
    if (!voice.supported) {
      alert('Voice input needs a Chromium browser.');
      return;
    }
    voice.start();
  });
  promptInput.addEventListener('kai-value-change', (e) => {
    liveText = (e as CustomEvent<{ value: string }>).detail.value;
  });
  promptInput.addEventListener('kai-submit', (e) => {
    // Reset the mirror + clear the uncontrolled input (uncontrolled-safe: clear()
    // fires kai-value-change internally, never a string assignment), then hand the
    // text up. main.ts owns append + streaming.
    liveText = '';
    promptInput.clear?.();
    callbacks.onSubmit((e as CustomEvent<{ value: string }>).detail.value);
  });
  promptInput.addEventListener('kai-suggestion-click', (e) =>
    callbacks.onSuggestion((e as CustomEvent<{ value: string }>).detail.value),
  );

  // ── Render: sync state onto element props ───────────────────────────────────
  let currentMessages: ChatMessage[] = [];
  let renderedTheme: Theme | null = null;

  // Bake the per-message actions onto assistant turns, memoized on the messages
  // reference so a theme-only render doesn't churn <kai-thread>. A NEW array from a
  // streaming chunk produces a new baked array, which re-renders the thread.
  let lastMessages: ChatMessage[] | null = null;
  let lastBaked: ChatMessage[] = [];
  function bakeActions(messages: ChatMessage[]): ChatMessage[] {
    if (messages === lastMessages) return lastBaked;
    lastMessages = messages;
    lastBaked = messages.map((m): ChatMessage =>
      m.role === 'assistant'
        ? { ...m, actions: ['copy', { id: 'speak', label: 'Read aloud', icon: 'volume-2' }] }
        : m,
    );
    return lastBaked;
  }

  function render(state: AppState): void {
    const { theme } = state;
    app.classList.toggle('dark', theme === 'dark');

    // theme on the group AND every item so slotted chrome inherits the right tokens
    for (const node of [resizable, sidebarItem, mainItem, conversations, thread, promptInput, showSidebarBtn, themeToggleBtn]) {
      node.setAttribute('theme', theme);
    }

    // Sidebar collapse: the item's `collapsed` prop drops the panel + its divider,
    // and the conversations rail's `collapsed` is CONTROLLED to stay in sync.
    sidebarItem.collapsed = state.collapsed;
    conversations.conversations = state.conversations;
    conversations.setAttribute('active-id', state.activeId);
    conversations.collapsed = state.collapsed;

    // The reopen button only shows while collapsed (mirrors the React/Vue v-if).
    showSidebarBtn.style.display = state.collapsed ? '' : 'none';

    // Swap the toggle glyph only when the theme actually changes.
    if (theme !== renderedTheme) {
      themeToggleBtn.replaceChildren(theme === 'light' ? moonIcon : sunIcon);
      renderedTheme = theme;
    }

    currentMessages = state.messages;
    thread.messages = bakeActions(state.messages);

    promptInput.loading = state.loading;
    // Suggestions only in the near-empty state (mirrors the React/Vue computed).
    promptInput.suggestions = state.messages.length <= 1 ? SUGGESTIONS : NO_SUGGESTIONS;
  }

  return { render };
}
