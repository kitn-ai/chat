<script setup lang="ts">
import { computed, ref } from 'vue';
import { CONVERSATIONS, THREADS, SUGGESTIONS, TRIGGERS, newId, streamFakeReply } from './chat-data';
import type { Theme } from './types';
import { useChat, useConversations } from './composables';
import Sidebar from './components/Sidebar.vue';
import ThreadView from './components/ThreadView.vue';
import Composer from './components/Composer.vue';
import ThemeToggle from './components/ThemeToggle.vue';

/**
 * A mini chat workspace COMPOSED BY HAND from @kitn.ai/ui's individual elements —
 * the Vue mirror of `examples/react`. It shows how the raw `kai-*` web components
 * fit together (vs. dropping in one batteries-included `<kai-chat>`/`<kai-workspace>`):
 *
 *   <kai-resizable>/<kai-resizable-item>  — the draggable sidebar | main split (the
 *                                           divider is the kit's default `line` hairline)
 *   <kai-conversations>  — the sidebar list (fed `conversations`, emits select/new)
 *   <kai-thread>         — the scrolling message list (stick-to-bottom built in)
 *   <kai-prompt-input>   — the composer at the bottom
 *
 * The pieces are split into `components/` (the UI subcomponents + the example's own
 * moon/sun icons) and `composables/` (`useChat` owns the message array + streaming,
 * `useConversations` the conversation stash, `useVoiceInput` the mic). Everything
 * else is plain Vue refs. Swap `streamFakeReply` for a real model call to ship.
 */
const theme = ref<Theme>('dark');
const collapsed = ref(false);
const chat = useChat(THREADS[CONVERSATIONS[0].id] ?? []);
const { messages, loading } = chat;
const { conversations, activeId, selectConversation, newChat } = useConversations(chat, CONVERSATIONS);

const suggestions = computed(() => (messages.value.length <= 1 ? SUGGESTIONS : []));

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

<template>
  <div class="app" :class="{ dark: theme === 'dark' }">
    <!-- <kai-resizable> owns the sidebar width + the divider. The handle defaults to
         the `line` hairline (transparent at rest, tinting on hover/drag); collapsing
         the sidebar maps to <kai-resizable-item :collapsed>. Pass `theme` to the group
         AND every item so slotted chrome inherits the right light/dark tokens. -->
    <kai-resizable :theme="theme" orientation="horizontal">
      <kai-resizable-item :theme="theme" size="280px" min="220px" max="420px" :collapsed.prop="collapsed">
        <Sidebar
          :theme="theme"
          :conversations="conversations"
          :active-id="activeId"
          :collapsed="collapsed"
          @select="selectConversation"
          @new-chat="newChat"
          @toggle="collapsed = !collapsed"
        />
      </kai-resizable-item>

      <kai-resizable-item :theme="theme">
        <main class="main">
          <header class="bar">
            <div class="bar-left">
              <kai-button
                v-if="collapsed"
                :theme="theme"
                variant="ghost"
                size="icon"
                icon="panel-left"
                label="Show sidebar"
                @click="collapsed = false"
              ></kai-button>
              <span class="brand">@kitn.ai/ui · composed chat</span>
            </div>
            <ThemeToggle :theme="theme" @toggle="theme = theme === 'light' ? 'dark' : 'light'" />
          </header>

          <ThreadView :theme="theme" :messages="messages" />

          <Composer
            :theme="theme"
            :loading="loading"
            :suggestions="suggestions"
            :triggers="TRIGGERS"
            @submit="send"
            @suggestion="send"
          />
        </main>
      </kai-resizable-item>
    </kai-resizable>
  </div>
</template>
