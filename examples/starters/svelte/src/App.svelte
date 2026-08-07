<script lang="ts">
  import type { KaiResizableItemElement } from '@kitn.ai/ui/elements';
  import { CONVERSATIONS, THREADS, SUGGESTIONS, TRIGGERS, newId, streamFakeReply } from './chat-data';
  import type { Theme } from './lib/types';
  import { createChat } from './lib/chat.svelte';
  import { createConversations } from './lib/conversations.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import ThreadView from './components/ThreadView.svelte';
  import Composer from './components/Composer.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';

  /**
   * A mini chat workspace COMPOSED BY HAND from @kitn.ai/ui's individual elements —
   * the Svelte mirror of `examples/react` + `examples/vue`. It shows how the raw
   * `kai-*` web components fit together (vs. dropping in one batteries-included
   * `<kai-chat>`/`<kai-workspace>`):
   *
   *   <kai-resizable>/<kai-resizable-item>  — the draggable sidebar | main split (the
   *                                           divider is the kit's default `line` hairline)
   *   <kai-conversations>  — the sidebar list (fed `conversations`, emits select/new)
   *   <kai-thread>         — the scrolling message list (stick-to-bottom built in)
   *   <kai-prompt-input>   — the composer at the bottom
   *
   * The pieces are split into `components/` (the UI subcomponents + the example's own
   * moon/sun icons) and `lib/` (`createChat` owns the message array + streaming,
   * `createConversations` the conversation stash, `createVoiceInput` the mic).
   * Everything else is plain Svelte runes. Swap `streamFakeReply` for a real model
   * call to ship.
   */
  let theme: Theme = $state('dark');
  let collapsed = $state(false);
  const chat = createChat(THREADS[CONVERSATIONS[0].id] ?? []);
  const conversations = createConversations(chat, CONVERSATIONS);

  const suggestions: string[] = $derived(chat.messages.length <= 1 ? SUGGESTIONS : []);

  // The sidebar <kai-resizable-item>'s `collapsed` boolean is a DOM property the
  // parent <kai-resizable> reads (reflected to an attribute the group observes), so
  // drive it imperatively rather than as a bare attribute.
  let sidebarItem: KaiResizableItemElement;
  $effect(() => { sidebarItem.collapsed = collapsed; });

  async function send(raw: string) {
    const text = raw.trim();
    if (!text) return;
    // The Composer already cleared its own input; here we just append the user
    // message and stream the (fake) assistant reply.
    chat.append({ id: newId(), role: 'user', content: text });
    const stream = chat.streamAssistant();
    await streamFakeReply(text, (delta) => stream.appendText(delta));
    stream.done();
  }
</script>

<!-- <kai-resizable> owns the sidebar width + the divider. The handle defaults to the
     `line` hairline (transparent at rest, tinting on hover/drag); collapsing the
     sidebar maps to <kai-resizable-item collapsed>. Pass `theme` to the group AND
     every item so slotted chrome inherits the right light/dark tokens. -->
<div class="app" class:dark={theme === 'dark'}>
  <kai-resizable {theme} orientation="horizontal">
    <kai-resizable-item bind:this={sidebarItem} {theme} size="280px" min="220px" max="420px">
      <Sidebar
        {theme}
        conversations={conversations.conversations}
        activeId={conversations.activeId}
        {collapsed}
        onselect={conversations.selectConversation}
        onnewchat={conversations.newChat}
        ontoggle={() => (collapsed = !collapsed)}
      />
    </kai-resizable-item>

    <kai-resizable-item {theme}>
      <main class="main">
        <header class="bar">
          <div class="bar-left">
            {#if collapsed}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <kai-button
                {theme}
                variant="ghost"
                size="icon"
                icon="panel-left"
                label="Show sidebar"
                onclick={() => (collapsed = false)}
              ></kai-button>
            {/if}
            <span class="brand">@kitn.ai/ui · composed chat</span>
          </div>
          <ThemeToggle {theme} ontoggle={() => (theme = theme === 'light' ? 'dark' : 'light')} />
        </header>

        <ThreadView {theme} messages={chat.messages} />

        <Composer
          {theme}
          loading={chat.loading}
          {suggestions}
          triggers={TRIGGERS}
          onsubmit={send}
          onsuggestion={send}
        />
      </main>
    </kai-resizable-item>
  </kai-resizable>
</div>
