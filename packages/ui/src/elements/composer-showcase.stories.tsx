import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onMount, onCleanup } from 'solid-js';
import { action } from 'storybook/actions';
import './register'; // side-effect: registers kai-prompt-input, kai-menu, kai-model-switcher, etc.
import { attachKaiActions } from '../stories/docs/story-actions';
import type { KaiMenuItem } from './menu';
import type { ModelOption } from '../types';

// Declare custom element tags used in this story for Solid JSX.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & {
        theme?: string;
        placeholder?: string;
        loading?: boolean;
        disabled?: boolean;
        voice?: boolean;
        'web-search'?: boolean;
        attach?: boolean;
        submit?: string;
        'suggestion-mode'?: string;
      };
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string; full?: boolean };
      'kai-model-switcher': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'current-model'?: string };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-suggestions': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: 'md' | 'lg'; block?: boolean | string; highlight?: string };
      'kai-notice': JSX.HTMLAttributes<HTMLElement> & { severity?: string; icon?: string; dismissible?: boolean };
    }
  }
}


interface MenuEl extends HTMLElement {
  items?: KaiMenuItem[];
}

interface ModelSwitcherEl extends HTMLElement {
  models?: ModelOption[];
}

interface PromptInputEl extends HTMLElement {
  // no suggestions, the chips below the card are a separate <kai-suggestions>
}

interface SuggestionsEl extends HTMLElement {
  suggestions?: { label: string; value?: string; icon?: string }[];
}

const meta = {
  title: 'Labs/Composer',
  parameters: {
    layout: 'fullscreen',
    // Theme-driven: the whole showcase follows the Storybook light/dark toggle
    // (preview.ts syncs it onto every kai-* element). We default the toggle to
    // dark so it opens matching the reference, but it's fully theme-aware; flip
    // the toggle for light. No per-element theme, no forced palette.
    darkMode: { current: 'dark' },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Production-quality composer showcase, theme-driven (light/dark via the toggle)
// ---------------------------------------------------------------------------

function ComposerShowcase() {
  let plusMenuEl: MenuEl | undefined;
  let effortMenuEl: MenuEl | undefined;
  let modelEl: ModelSwitcherEl | undefined;
  let inputEl: PromptInputEl | undefined;
  let suggestionsEl: SuggestionsEl | undefined;
  let noticeEl: HTMLElement | undefined;

  onMount(() => {
    // Wire the + menu items (realistic context-attach actions).
    if (plusMenuEl) {
      const plusItems: KaiMenuItem[] = [
        {
          id: 'add-files',
          label: 'Add files or photos',
          icon: 'paperclip',
          shortcut: '⌘U',
        },
        {
          id: 'add-github',
          label: 'Add from GitHub',
          icon: 'github',
        },
        {
          label: 'Skills',
          icon: 'sparkles',
          items: [
            { id: 'skill-creator', label: 'skill-creator', icon: 'sparkles' },
            { id: 'manage-skills', label: 'Manage skills', icon: 'settings' },
            { id: 'add-skill', label: 'Add skill', icon: 'file-text' },
          ],
        },
        { separator: true },
        { id: 'web-search', label: 'Web search', icon: 'globe', checked: false },
      ];
      plusMenuEl.items = [...plusItems];

      // Custom labeled logging disambiguates the two menus, the two buttons, and
      // the suggestion chips (the plain event name alone wouldn't). The shared
      // helper covers each element's REMAINING declared events (e.g. kai-open-change)
      // with `only`, so every event still logs exactly once.
      plusMenuEl.addEventListener('kai-select', (e) => {
        const detail = (e as CustomEvent<{ id: string; checked?: boolean }>).detail;
        action('+ menu: kai-select')(detail);
        if (detail.id === 'web-search' && detail.checked !== undefined) {
          plusMenuEl!.items = plusMenuEl!.items!.map((item) =>
            item.id === 'web-search' ? { ...item, checked: detail.checked } : item,
          );
        }
      });
      onCleanup(attachKaiActions(plusMenuEl, undefined, ['kai-open-change']));
    }

    // Wire the effort selector menu.
    if (effortMenuEl) {
      effortMenuEl.items = [
        { heading: true, label: 'Effort' },
        { id: 'high', label: 'High' },
        { id: 'medium', label: 'Medium' },
        { id: 'low', label: 'Low' },
      ];
      effortMenuEl.addEventListener('kai-select', (e) => {
        action('effort menu: kai-select')((e as CustomEvent).detail);
      });
      onCleanup(attachKaiActions(effortMenuEl, undefined, ['kai-open-change']));
    }

    // Wire the model switcher.
    if (modelEl) {
      modelEl.models = [
        { id: 'opus-4-8', name: 'Opus 4.8' },
        { id: 'sonnet', name: 'Sonnet' },
        { id: 'haiku', name: 'Haiku' },
      ];
      // kai-model-change + kai-open-change, both declared; the helper covers both.
      onCleanup(attachKaiActions(modelEl));
    }

    // Wire the prompt input, log all of its declared events (kai-submit,
    // kai-value-change, …). No suggestions here (custom chips rendered below).
    if (inputEl) {
      onCleanup(attachKaiActions(inputEl));
    }

    // The self-dismissing notice: log its kai-dismiss event.
    if (noticeEl) {
      onCleanup(attachKaiActions(noticeEl));
    }

    // Suggestion chips: data is a JS property; each item carries an icon name.
    if (suggestionsEl) {
      suggestionsEl.suggestions = [
        { label: 'Write', icon: 'pencil' },
        { label: 'Learn', icon: 'book-open' },
        { label: 'Code', icon: 'code' },
        { label: 'Life stuff', icon: 'smile' },
      ];
      suggestionsEl.addEventListener('kai-select', (e) => {
        action('suggestion: kai-select')((e as CustomEvent).detail);
      });
    }
  });

  return (
    // Theme-following page surface, tracks the kit's tokens via the toggle.
    <div class="flex min-h-screen items-center justify-center bg-background px-5 py-10 font-sans">
      <div class="flex w-full max-w-[720px] flex-col gap-3">
        {/* A self-dismissing kit notice, placed above the composer. The dev owns
            the placement; the notice owns its box, icon, a11y role, and dismiss. */}
        <kai-notice severity="warning" dismissible ref={(e) => (noticeEl = e as HTMLElement)}>
          Claude Fable 5 is currently unavailable.
          <a
            slot="action"
            href="#"
            class="font-medium text-foreground underline underline-offset-2"
            onClick={(e) => e.preventDefault()}
          >
            Learn more
          </a>
        </kai-notice>

        <kai-prompt-input
          ref={(e) => (inputEl = e as PromptInputEl)}
          placeholder="How can I help you today?"
          attach={false}
          submit="auto"
          class="block w-full"
        >
          {/* toolbar-start: the + menu, built-in trigger via props. */}
          <kai-menu slot="toolbar-start" trigger-icon="plus" label="Add" ref={(e) => (plusMenuEl = e as MenuEl)} />

          {/* toolbar-end: model switcher + effort + mic + waveform */}
          <div slot="toolbar-end" class="flex items-center gap-1">
            {/* Model switcher, follows the theme toggle (no hard-coded theme). */}
            <kai-model-switcher ref={(e) => (modelEl = e as ModelSwitcherEl)} class="inline-flex" />

            {/* Effort selector, built-in label trigger via props. */}
            <kai-menu trigger-label="High" trigger-icon-trailing="chevron-down" ref={(e) => (effortMenuEl = e as MenuEl)} />

            {/* Mic + voice, kit buttons; variant + icon do the styling. Each
                emits kai-click → logged to the Actions panel. */}
            <kai-button variant="subtle" size="icon-sm" icon="mic" label="Voice input"
              ref={(e) => e.addEventListener('kai-click', () => action('mic: kai-click')())} />
            <kai-button variant="subtle" size="icon-sm" icon="audio-lines" label="Voice mode"
              ref={(e) => e.addEventListener('kai-click', () => action('voice: kai-click')())} />
          </div>
        </kai-prompt-input>

        {/* Suggestion chips, centered by the dev's own layout. */}
        <div class="mt-2 flex justify-center">
          <kai-suggestions
            ref={(e) => (suggestionsEl = e as SuggestionsEl)}
            variant="outline"
            size="md"
            class="inline-flex"
          />
        </div>
      </div>
    </div>
  );
}

// Named distinctly from the "Composer" group so Storybook does NOT single-story-
// hoist it; keeps every Lab a consistent topic folder, not a lone leaf.
export const ProductionComposer: Story = {
  render: () => <ComposerShowcase />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-notice severity="warning" dismissible>Claude Fable 5 is currently unavailable.</kai-notice>

<kai-prompt-input placeholder="How can I help you today?">
  <!-- left: a "+" cascading menu -->
  <kai-menu slot="toolbar-start" trigger-icon="plus" label="Add"></kai-menu>

  <!-- right: model switcher · effort menu · mic / voice -->
  <div slot="toolbar-end" class="flex items-center gap-1">
    <kai-model-switcher></kai-model-switcher>
    <kai-menu trigger-label="High" trigger-icon-trailing="chevron-down"></kai-menu>
    <kai-button variant="subtle" size="icon-sm" icon="mic" label="Voice input"></kai-button>
    <kai-button variant="subtle" size="icon-sm" icon="audio-lines" label="Voice mode"></kai-button>
  </div>
</kai-prompt-input>

<kai-suggestions></kai-suggestions>

<script type="module">
  // Array/object props are set as JS properties, never attributes.
  document.querySelector('kai-menu[slot="toolbar-start"]').items = [/* … */];
  document.querySelector('kai-model-switcher').models = [/* … */];
  document.querySelector('kai-suggestions').suggestions = [/* … */];
  document.querySelector('kai-prompt-input')
    .addEventListener('kai-submit', (e) => console.log(e.detail.value));
</script>`,
      },
    },
  },
};
