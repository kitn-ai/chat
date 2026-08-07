/// <reference types="svelte" />
/// <reference types="vite/client" />

// The raw `kai-*` elements are DOM custom elements (not Svelte components), so they
// have no generated prop types. Declare the tags this example uses so the template
// accepts their scalar attributes (`theme`, `size`, `active-id`, …), their rich
// props, and their `onkai-*` event handlers without type errors. Rich array/object
// props and boolean flags are set imperatively as DOM PROPERTIES in each component
// (see the `bind:this` + `$effect` blocks), which is why a permissive attribute map
// here is enough.
declare namespace svelteHTML {
  interface IntrinsicElements {
    'kai-resizable': Record<string, unknown>;
    'kai-resizable-item': Record<string, unknown>;
    'kai-conversations': Record<string, unknown>;
    'kai-thread': Record<string, unknown>;
    'kai-prompt-input': Record<string, unknown>;
    'kai-button': Record<string, unknown>;
  }
}
