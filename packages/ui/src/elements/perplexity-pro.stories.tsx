import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, createEffect, For, Show } from 'solid-js';
import { Download, Copy, VenetianMask, BatteryMedium, Image as ImageIcon, LayoutGrid } from 'lucide-solid';
import './register'; // every kai-* element used below
import type { KaiNavItem } from '../ui/nav';
import type { KaiTabItem } from '../ui/tabs';

// Labs/Apps: a fourth dogfood - "Perplexity Pro", the Perplexity DESKTOP app
// (the Comet-style native shell), distinct from the web "Perplexity" answer-engine
// story. The point of THIS example is NOT a pixel replica of every screen - it is
// to prove the kit can express the two app SEAMS that matter here and to assemble
// each screen from REAL kit building blocks:
//
//   1. a two-mode SHELL - a segmented Assistant | Computer toggle in the rail that
//      swaps the whole sidebar + main view (the kit seam under test). The rail is
//      the consumer's OWN column in the re-cast kai-workspace's `start` slot —
//      nothing here is a conversation list, which is exactly what the
//      chat-agnostic shell is for;
//   2. WORKING Answer / Sources / Images tab-switching in the answer view;
//   3. the answer assembled from real pieces - kai-message (query + prose),
//      inline kai-source citations, kai-reasoning (the steps disclosure), kai-image
//      (the generated chart), kai-sources (the numbered Sources tab), a kai-image
//      grid (the Images tab), and a follow-up kai-prompt-input;
//   4. the rails (recent sessions / projects) via kai-nav.
//
// The screens themselves are EXAMPLE (consumer) code, deliberately illustrative -
// not bespoke per-screen fidelity; the segmented rail toggle repurposes kai-tabs
// variant="segmented" as the closest fit for the two-mode shell.

// These kai-* tags are used as JSX elements below. Sibling story files declare the
// same shared tags; TypeScript merges identical global augmentations across the
// compilation (they must match BYTE-FOR-BYTE or it errors TS2717), so the shared
// ones are copied verbatim from perplexity.stories.tsx. kai-image and kai-reasoning
// are declared here for the first time (no other story augments them).
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-workspace': JSX.HTMLAttributes<HTMLElement> & { 'collapse-below'?: string | number; 'drawer-below'?: string | number };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
      'kai-nav': JSX.HTMLAttributes<HTMLElement> & { value?: string; 'default-value'?: string; theme?: string };
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string; full?: boolean };
      'kai-badge': JSX.HTMLAttributes<HTMLElement> & { variant?: string };
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-prompt-input': JSX.HTMLAttributes<HTMLElement> & { theme?: string; placeholder?: string; loading?: boolean; disabled?: boolean; voice?: boolean; 'web-search'?: boolean; attach?: boolean; submit?: string; 'suggestion-mode'?: string };
      'kai-separator': JSX.HTMLAttributes<HTMLElement> & { orientation?: string };
      'kai-tabs': JSX.HTMLAttributes<HTMLElement> & { variant?: string; value?: string; 'default-value'?: string; disabled?: boolean; theme?: string };
      'kai-icon': JSX.HTMLAttributes<HTMLElement> & { name?: string; size?: string };
      'kai-tooltip': JSX.HTMLAttributes<HTMLElement> & { content?: string; 'open-delay'?: number | string };
      'kai-source': JSX.HTMLAttributes<HTMLElement> & { href?: string; label?: string; headline?: string; description?: string; 'show-favicon'?: boolean | '' };
      'kai-sources': JSX.HTMLAttributes<HTMLElement> & { 'show-favicon'?: boolean | ''; numbered?: boolean | '' };
      'kai-card': JSX.HTMLAttributes<HTMLElement> & {
        appearance?: 'outlined' | 'filled' | 'plain' | 'accent';
        orientation?: 'vertical' | 'horizontal' | 'responsive';
        collapse?: string;
        dense?: boolean;
        dismissible?: boolean;
        href?: string;
        target?: string;
        rel?: string;
        clickable?: boolean;
      };
      'kai-image': JSX.HTMLAttributes<HTMLElement>;
      'kai-reasoning': JSX.HTMLAttributes<HTMLElement> & { label?: string; 'default-open'?: boolean; streaming?: boolean; markdown?: boolean };
      'kai-search': JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        placeholder?: string;
        icon?: string;
        debounce?: number;
        loading?: boolean;
        shortcut?: string;
        theme?: string;
      };
    }
  }
}

const meta = { title: 'Labs/Apps', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;
type El = HTMLElement & Record<string, unknown>;

// ── generated visuals ────────────────────────────────────────────────────────
// kai-image renders base64/bytes (NOT a URL), so these "generated" charts +
// thumbnails are inline SVGs, base64-encoded, fed to kai-image as real elements.
// They stand in for a consumer's own chart output; the element rendering it is
// real. A faint "perplexity" watermark mimics the app.
const CHART = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNjQwIDMwMCIgZm9udC1mYW1pbHk9InVpLXNhbnMtc2VyaWYsc3lzdGVtLXVpLHNhbnMtc2VyaWYiPgo8cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzBmMTAxMSIvPgo8dGV4dCB4PSIyNCIgeT0iMzQiIGZpbGw9IiNlN2U3ZTciIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSI2MDAiPkNsb3VkIEdQVSBwcmljZSBjb21wYXJpc29uIC0gJC9ociAob24tZGVtYW5kIEExMDAgODBHQik8L3RleHQ+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsOCkiPgo8bGluZSB4MT0iNjAiIHkxPSI4MCIgeDI9IjYwIiB5Mj0iMjUyIiBzdHJva2U9IiMzYTNjM2UiLz4KPGxpbmUgeDE9IjYwIiB5MT0iMjUyIiB4Mj0iNjA4IiB5Mj0iMjUyIiBzdHJva2U9IiMzYTNjM2UiLz4KPGcgZmlsbD0iIzlhOWE5YSIgZm9udC1zaXplPSIxMSIgdGV4dC1hbmNob3I9ImVuZCI+Cjx0ZXh0IHg9IjUyIiB5PSIyNTIiPjA8L3RleHQ+PHRleHQgeD0iNTIiIHk9IjIwOSI+MTwvdGV4dD48dGV4dCB4PSI1MiIgeT0iMTY2Ij4yPC90ZXh0Pjx0ZXh0IHg9IjUyIiB5PSIxMjMiPjM8L3RleHQ+PHRleHQgeD0iNTIiIHk9Ijg0Ij40PC90ZXh0Pgo8L2c+CjxnIHRleHQtYW5jaG9yPSJtaWRkbGUiPgo8cmVjdCB4PSI5MiIgeT0iMTY2IiB3aWR0aD0iODQiIGhlaWdodD0iODYiIHJ4PSIzIiBmaWxsPSIjMjA4MDhkIi8+PHRleHQgeD0iMTM0IiB5PSIyNzAiIGZpbGw9IiNjZmNmY2YiIGZvbnQtc2l6ZT0iMTIiPkFXUzwvdGV4dD48dGV4dCB4PSIxMzQiIHk9IjE1OCIgZmlsbD0iI2U3ZTdlNyIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9IjYwMCI+JDMuMDY8L3RleHQ+CjxyZWN0IHg9IjIxNiIgeT0iMTg3IiB3aWR0aD0iODQiIGhlaWdodD0iNjUiIHJ4PSIzIiBmaWxsPSIjMjA4MDhkIi8+PHRleHQgeD0iMjU4IiB5PSIyNzAiIGZpbGw9IiNjZmNmY2YiIGZvbnQtc2l6ZT0iMTIiPkdDUDwvdGV4dD48dGV4dCB4PSIyNTgiIHk9IjE3OSIgZmlsbD0iI2U3ZTdlNyIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9IjYwMCI+JDIuNDk8L3RleHQ+CjxyZWN0IHg9IjM0MCIgeT0iMTc0IiB3aWR0aD0iODQiIGhlaWdodD0iNzgiIHJ4PSIzIiBmaWxsPSIjMjA4MDhkIi8+PHRleHQgeD0iMzgyIiB5PSIyNzAiIGZpbGw9IiNjZmNmY2YiIGZvbnQtc2l6ZT0iMTIiPkF6dXJlPC90ZXh0Pjx0ZXh0IHg9IjM4MiIgeT0iMTY2IiBmaWxsPSIjZTdlN2U3IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iNjAwIj4kMi44MTwvdGV4dD4KPHJlY3QgeD0iNDY0IiB5PSIyMjMiIHdpZHRoPSI4NCIgaGVpZ2h0PSIyOSIgcng9IjMiIGZpbGw9IiMyZjlhYTYiLz48dGV4dCB4PSI1MDYiIHk9IjI3MCIgZmlsbD0iI2NmY2ZjZiIgZm9udC1zaXplPSIxMiI+TGFtYmRhPC90ZXh0Pjx0ZXh0IHg9IjUwNiIgeT0iMjE1IiBmaWxsPSIjZTdlN2U3IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iNjAwIj4kMS4xMDwvdGV4dD4KPC9nPgo8L2c+Cjx0ZXh0IHg9IjYwMCIgeT0iMjkwIiBmaWxsPSIjM2Y0MTQzIiBmb250LXNpemU9IjM0IiBmb250LXdlaWdodD0iNzAwIiB0ZXh0LWFuY2hvcj0iZW5kIiBvcGFjaXR5PSIwLjUiIHRyYW5zZm9ybT0icm90YXRlKC02IDYwMCAyOTApIj5wZXJwbGV4aXR5PC90ZXh0Pgo8L3N2Zz4=';
const CHART2 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNjQwIDMwMCIgZm9udC1mYW1pbHk9InVpLXNhbnMtc2VyaWYsc3lzdGVtLXVpLHNhbnMtc2VyaWYiPgo8cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzBmMTAxMSIvPgo8dGV4dCB4PSIyNCIgeT0iMzQiIGZpbGw9IiNlN2U3ZTciIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSI2MDAiPkVzdC4gbW9udGhseSBjb3N0IC0gMXggQTEwMCBhdCA1MCUgdXRpbGl6YXRpb24gKCQvbW8pPC90ZXh0Pgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLDgpIj4KPGxpbmUgeDE9IjY4IiB5MT0iODAiIHgyPSI2OCIgeTI9IjI1MiIgc3Ryb2tlPSIjM2EzYzNlIi8+CjxsaW5lIHgxPSI2OCIgeTE9IjI1MiIgeDI9IjYwOCIgeTI9IjI1MiIgc3Ryb2tlPSIjM2EzYzNlIi8+CjxnIGZpbGw9IiM5YTlhOWEiIGZvbnQtc2l6ZT0iMTEiIHRleHQtYW5jaG9yPSJlbmQiPgo8dGV4dCB4PSI2MCIgeT0iMjUyIj4wPC90ZXh0Pjx0ZXh0IHg9IjYwIiB5PSIyMDkiPjFrPC90ZXh0Pjx0ZXh0IHg9IjYwIiB5PSIxNjYiPjJrPC90ZXh0Pjx0ZXh0IHg9IjYwIiB5PSIxMjMiPjNrPC90ZXh0Pjx0ZXh0IHg9IjYwIiB5PSI4NCI+NGs8L3RleHQ+CjwvZz4KPGcgdGV4dC1hbmNob3I9Im1pZGRsZSI+CjxyZWN0IHg9IjEwMCIgeT0iMTU4IiB3aWR0aD0iODQiIGhlaWdodD0iOTQiIHJ4PSIzIiBmaWxsPSIjMjA4MDhkIi8+PHRleHQgeD0iMTQyIiB5PSIyNzAiIGZpbGw9IiNjZmNmY2YiIGZvbnQtc2l6ZT0iMTIiPkFXUzwvdGV4dD48dGV4dCB4PSIxNDIiIHk9IjE1MCIgZmlsbD0iI2U3ZTdlNyIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9IjYwMCI+JDIsMjAzPC90ZXh0Pgo8cmVjdCB4PSIyMjQiIHk9IjE3OCIgd2lkdGg9Ijg0IiBoZWlnaHQ9Ijc0IiByeD0iMyIgZmlsbD0iIzIwODA4ZCIvPjx0ZXh0IHg9IjI2NiIgeT0iMjcwIiBmaWxsPSIjY2ZjZmNmIiBmb250LXNpemU9IjEyIj5HQ1A8L3RleHQ+PHRleHQgeD0iMjY2IiB5PSIxNzAiIGZpbGw9IiNlN2U3ZTciIGZvbnQtc2l6ZT0iMTIiIGZvbnQtd2VpZ2h0PSI2MDAiPiQxLDc5MzwvdGV4dD4KPHJlY3QgeD0iMzQ4IiB5PSIxNjYiIHdpZHRoPSI4NCIgaGVpZ2h0PSI4NiIgcng9IjMiIGZpbGw9IiMyMDgwOGQiLz48dGV4dCB4PSIzOTAiIHk9IjI3MCIgZmlsbD0iI2NmY2ZjZiIgZm9udC1zaXplPSIxMiI+QXp1cmU8L3RleHQ+PHRleHQgeD0iMzkwIiB5PSIxNTgiIGZpbGw9IiNlN2U3ZTciIGZvbnQtc2l6ZT0iMTIiIGZvbnQtd2VpZ2h0PSI2MDAiPiQyLDAyMzwvdGV4dD4KPHJlY3QgeD0iNDcyIiB5PSIyMTgiIHdpZHRoPSI4NCIgaGVpZ2h0PSIzNCIgcng9IjMiIGZpbGw9IiMyZjlhYTYiLz48dGV4dCB4PSI1MTQiIHk9IjI3MCIgZmlsbD0iI2NmY2ZjZiIgZm9udC1zaXplPSIxMiI+TGFtYmRhPC90ZXh0Pjx0ZXh0IHg9IjUxNCIgeT0iMjEwIiBmaWxsPSIjZTdlN2U3IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iNjAwIj4kNzkyPC90ZXh0Pgo8L2c+CjwvZz4KPHRleHQgeD0iNjAwIiB5PSIyOTAiIGZpbGw9IiMzZjQxNDMiIGZvbnQtc2l6ZT0iMzQiIGZvbnQtd2VpZ2h0PSI3MDAiIHRleHQtYW5jaG9yPSJlbmQiIG9wYWNpdHk9IjAuNSIgdHJhbnNmb3JtPSJyb3RhdGUoLTYgNjAwIDI5MCkiPnBlcnBsZXhpdHk8L3RleHQ+Cjwvc3ZnPg==';
const THUMB_A = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMjQwIiB2aWV3Qm94PSIwIDAgMzIwIDI0MCIgZm9udC1mYW1pbHk9InVpLXNhbnMtc2VyaWYsc3lzdGVtLXVpLHNhbnMtc2VyaWYiPgo8cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iIzFiMmEzYSIvPgo8Y2lyY2xlIGN4PSIyNDAiIGN5PSI3MCIgcj0iNDYiIGZpbGw9IiM1YWE5ZTYiIG9wYWNpdHk9IjAuODUiLz4KPHJlY3QgeD0iMjgiIHk9IjE1MCIgd2lkdGg9IjE3MCIgaGVpZ2h0PSIxNCIgcng9IjciIGZpbGw9IiM1YWE5ZTYiIG9wYWNpdHk9IjAuNiIvPgo8cmVjdCB4PSIyOCIgeT0iMTc2IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyIiByeD0iNiIgZmlsbD0iIzVhYTllNiIgb3BhY2l0eT0iMC4zNSIvPgo8dGV4dCB4PSIzMDAiIHk9IjIyNiIgZmlsbD0iI2ZmZmZmZiIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9IjcwMCIgdGV4dC1hbmNob3I9ImVuZCIgb3BhY2l0eT0iMC40NSIgdHJhbnNmb3JtPSJyb3RhdGUoLTYgMzAwIDIyNikiPnBlcnBsZXhpdHk8L3RleHQ+Cjx0ZXh0IHg9IjIwIiB5PSIzNiIgZmlsbD0iI2ZmZmZmZiIgZm9udC1zaXplPSIxMyIgb3BhY2l0eT0iMC44NSI+R1BVIHJhY2tzPC90ZXh0Pgo8L3N2Zz4=';
const THUMB_B = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMjQwIiB2aWV3Qm94PSIwIDAgMzIwIDI0MCIgZm9udC1mYW1pbHk9InVpLXNhbnMtc2VyaWYsc3lzdGVtLXVpLHNhbnMtc2VyaWYiPgo8cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iIzJhMWIyZSIvPgo8Y2lyY2xlIGN4PSIyNDAiIGN5PSI3MCIgcj0iNDYiIGZpbGw9IiNkMThhZDEiIG9wYWNpdHk9IjAuODUiLz4KPHJlY3QgeD0iMjgiIHk9IjE1MCIgd2lkdGg9IjE3MCIgaGVpZ2h0PSIxNCIgcng9IjciIGZpbGw9IiNkMThhZDEiIG9wYWNpdHk9IjAuNiIvPgo8cmVjdCB4PSIyOCIgeT0iMTc2IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyIiByeD0iNiIgZmlsbD0iI2QxOGFkMSIgb3BhY2l0eT0iMC4zNSIvPgo8dGV4dCB4PSIzMDAiIHk9IjIyNiIgZmlsbD0iI2ZmZmZmZiIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9IjcwMCIgdGV4dC1hbmNob3I9ImVuZCIgb3BhY2l0eT0iMC40NSIgdHJhbnNmb3JtPSJyb3RhdGUoLTYgMzAwIDIyNikiPnBlcnBsZXhpdHk8L3RleHQ+Cjx0ZXh0IHg9IjIwIiB5PSIzNiIgZmlsbD0iI2ZmZmZmZiIgZm9udC1zaXplPSIxMyIgb3BhY2l0eT0iMC44NSI+UHJpY2UgY2hhcnQ8L3RleHQ+Cjwvc3ZnPg==';
const THUMB_C = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMjQwIiB2aWV3Qm94PSIwIDAgMzIwIDI0MCIgZm9udC1mYW1pbHk9InVpLXNhbnMtc2VyaWYsc3lzdGVtLXVpLHNhbnMtc2VyaWYiPgo8cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iIzFiMmUyNSIvPgo8Y2lyY2xlIGN4PSIyNDAiIGN5PSI3MCIgcj0iNDYiIGZpbGw9IiM2N2M5OWEiIG9wYWNpdHk9IjAuODUiLz4KPHJlY3QgeD0iMjgiIHk9IjE1MCIgd2lkdGg9IjE3MCIgaGVpZ2h0PSIxNCIgcng9IjciIGZpbGw9IiM2N2M5OWEiIG9wYWNpdHk9IjAuNiIvPgo8cmVjdCB4PSIyOCIgeT0iMTc2IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyIiByeD0iNiIgZmlsbD0iIzY3Yzk5YSIgb3BhY2l0eT0iMC4zNSIvPgo8dGV4dCB4PSIzMDAiIHk9IjIyNiIgZmlsbD0iI2ZmZmZmZiIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9IjcwMCIgdGV4dC1hbmNob3I9ImVuZCIgb3BhY2l0eT0iMC40NSIgdHJhbnNmb3JtPSJyb3RhdGUoLTYgMzAwIDIyNikiPnBlcnBsZXhpdHk8L3RleHQ+Cjx0ZXh0IHg9IjIwIiB5PSIzNiIgZmlsbD0iI2ZmZmZmZiIgZm9udC1zaXplPSIxMyIgb3BhY2l0eT0iMC44NSI+RGF0YWNlbnRlcjwvdGV4dD4KPC9zdmc+';
const IMAGES = [THUMB_A, THUMB_B, THUMB_C, THUMB_C, THUMB_A, THUMB_B];

// ── shell data ───────────────────────────────────────────────────────────────

// The two top-level modes, driven by the segmented control at the top of the rail.
const MODES: KaiTabItem[] = [
  { id: 'assistant', label: 'Assistant', icon: 'search' },
  { id: 'computer', label: 'Computer', icon: 'monitor' },
];

// ~18 recent sessions for the Assistant rail. Titles are pre-truncated (the
// desktop app clips them), so the kai-nav row truncation is incidental.
const RECENTS: KaiNavItem[] = ([
  'i want to find a domain name fo...',
  'Do a price comparison on AWS, G...',
  'Best mirrorless cameras for vide...',
  'Plan a 5 day trip to Lisbon in O...',
  'Summarize the latest on the EU A...',
  'How does a vector database actu...',
  'Cheapest way to self-host Postgr...',
  'Compare Rivian R1S vs Lucid Gra...',
  'Draft a cold email to a design st...',
  'What is retrieval-augmented gen...',
  'Refinance vs keep my 3.1% mortg...',
  'Tax deadlines for freelancers in...',
  'Explain MCP to a backend engin...',
  'Good espresso machine under $7...',
  'Why is my sourdough so dense ev...',
  'Rust vs Go for a high-throughput...',
  'Weekend hikes near the Bay Are...',
  'Is the new M5 MacBook worth th...',
] as const).map((label, i) => ({ id: `s${i}`, label }));

// The Computer-mode rail nav (Projects selected, like the reference).
const COMPUTER_NAV: KaiNavItem[] = [
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'artifacts', label: 'Artifacts', icon: 'workflow' },
  { id: 'customize', label: 'Customize', icon: 'sliders-horizontal' },
];

// The Computer "Projects" page list - a collapsible "Your Projects" group whose
// child rows pair a name with a Private/Public badge and a relative time. kai-nav
// expresses this for real: a single-letter avatar in `icon`, the name as `label`,
// the time as `meta`, and the privacy word as a `badge` pill.
const PROJECTS: KaiNavItem[] = [
  {
    id: 'your-projects',
    label: 'Your Projects',
    children: [
      { id: 'bookmarks', label: 'Bookmarks', icon: 'B', badge: 'Private', meta: '6mo ago' },
      { id: 'polara', label: 'Polara', icon: 'P', badge: 'Public', meta: '9mo ago' },
      { id: 'bullions', label: 'Bullions', icon: 'B', badge: 'Private', meta: '1y ago' },
      { id: 'pricebase', label: 'Pricebase', icon: 'P', badge: 'Public', meta: '1y ago' },
    ],
  },
];

// ── answer-view data ─────────────────────────────────────────────────────────
const QUERY = 'Do a price comparison on AWS, GCP, Azure and Lambda for A100 80GB GPUs';

interface Src { href: string; domain: string; title: string; snippet: string }
const SOURCES: Src[] = [
  { href: 'https://aws.amazon.com/ec2/instance-types/p4/', domain: 'aws.amazon.com', title: 'Amazon EC2 P4d Instances', snippet: 'p4d.24xlarge bundles 8 A100 40/80GB GPUs; the on-demand rate works out to roughly $3.06 per GPU-hour before any savings plan.' },
  { href: 'https://cloud.google.com/compute/gpus-pricing', domain: 'cloud.google.com', title: 'GPU pricing - Compute Engine', snippet: 'A2 and A3 machine families expose A100 80GB GPUs; on-demand list is about $2.49 per GPU-hour, lower with committed-use discounts.' },
  { href: 'https://azure.microsoft.com/en-us/pricing/details/virtual-machines/', domain: 'azure.microsoft.com', title: 'Azure ND A100 v4 pricing', snippet: 'The ND A100 v4 series ships 8 A100 80GB GPUs per VM; pay-as-you-go lands near $2.81 per GPU-hour in US regions.' },
  { href: 'https://lambdalabs.com/service/gpu-cloud', domain: 'lambdalabs.com', title: 'Lambda GPU Cloud pricing', snippet: 'Lambda lists single A100 80GB instances around $1.10 per GPU-hour, undercutting the hyperscalers on raw on-demand rate.' },
  { href: 'https://getdeploying.com/reference/cloud-gpu/nvidia-a100', domain: 'getdeploying.com', title: 'A100 cloud GPU price comparison', snippet: 'A cross-provider table of A100 hourly rates, refreshed regularly; useful for sanity-checking list prices across clouds.' },
  { href: 'https://www.trgdatacenter.com/blog/a100-gpu-pricing/', domain: 'trgdatacenter.com', title: 'How much does an A100 cost to rent?', snippet: 'Breaks down on-demand vs reserved vs colo economics for the A100, and when each option starts to make financial sense.' },
];

// The answer's markdown comparison table - real GFM rendered by kai-message.
const TABLE_MD = `| Provider | Instance | A100 80GB | On-demand $/GPU-hr |
| --- | --- | --- | --- |
| AWS | p4d.24xlarge | 8× | ~$3.06 |
| GCP | a2-ultragpu | 1-8× | ~$2.49 |
| Azure | ND A100 v4 | 8× | ~$2.81 |
| Lambda | gpu_1x_a100 | 1× | ~$1.10 |`;

const CLOSING_MD = `**Bottom line.** If you only need a single GPU on demand, **Lambda** is the cheapest by a wide margin. Across the hyperscalers, **GCP** edges out Azure and AWS on list price, but committed-use and savings-plan discounts can flip the ranking for sustained workloads.`;

// The "7 steps completed" disclosure body - kai-reasoning renders this as markdown
// behind a collapsible "7 steps completed" trigger. This IS the steps indicator.
const STEPS_MD = `1. Parsed the request: on-demand A100 80GB pricing across four providers.
2. Searched AWS EC2 P4d instance pricing.
3. Searched GCP Compute Engine GPU pricing.
4. Searched Azure ND A100 v4 pricing.
5. Searched Lambda GPU Cloud pricing.
6. Normalized every rate to a per-GPU-hour figure.
7. Built the comparison chart and ranked the providers.`;

const favicon = (href: string) => `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(href)}`;

// An inline numbered citation: a REAL <kai-source> chip bound to a source, with a
// built-in hover-snippet popover (favicon + domain + headline + description).
function Cite(props: { i: number }) {
  const s = SOURCES[props.i];
  return (
    <kai-source class="kai-cite" href={s.href} label={String(props.i + 1)} headline={s.title} description={s.snippet}></kai-source>
  );
}

// A small icon-only tool button used in the home composer's tool row. Lucide
// glyphs not in the kit's curated icon registry are slotted as inline SVGs.
function Tool(props: { tip: string; children: import('@solidjs/web').JSX.Element }) {
  return (
    <kai-tooltip content={props.tip}>
      <kai-button variant="ghost" size="icon-sm" label={props.tip}>{props.children}</kai-button>
    </kai-tooltip>
  );
}

export const PerplexityPro: Story = {
  name: 'Perplexity Pro',
  render: () => {
    // The two app SEAMS this example exists to demonstrate:
    //   mode   - Assistant | Computer (the segmented rail toggle: swaps rail + main)
    //   view   - Assistant sub-state: the empty home vs an answer
    //   tab    - the answer's Answer | Sources | Images panel
    const [mode, setMode] = createSignal<'assistant' | 'computer'>('assistant');
    const [view, setView] = createSignal<'home' | 'answer'>('answer');
    const [tab, setTab] = createSignal<'answer' | 'sources' | 'images'>('answer');

    // The Assistant rail's session search is a real kai-search that filters the
    // recent-sessions kai-nav live (dogfood: the input-field family drives an
    // existing kai-nav, replacing a raw <input>).
    const [sessionQuery, setSessionQuery] = createSignal('');
    const filterRecents = (q: string) => {
      const needle = q.trim().toLowerCase();
      return needle ? RECENTS.filter((r) => (r.label ?? '').toLowerCase().includes(needle)) : RECENTS;
    };
    let recentsNavEl: El | undefined;
    // V2-PORT: tracked read in the compute; the element-prop write in the apply.
    createEffect(() => filterRecents(sessionQuery()), (items) => { if (recentsNavEl) recentsNavEl.items = items; });

    // Keep the answer tab-strip's underline (a controlled kai-tabs) in lock-step
    // with the `tab` signal that drives the panel - including across remounts when
    // the top mode toggles away and back.
    let answerTabsEl: El | undefined;
    createEffect(tab, (v) => { if (answerTabsEl) answerTabsEl.value = v; }); // V2-PORT

    // Array/object props (and event wiring) are applied in each element's ref
    // callback, NOT a one-shot onSettled: the rails + main views live inside <Show>,
    // so they unmount/remount on mode/view changes; a ref runs on every (re)mount.
    return (
      <div class="relative h-screen w-full">
        <style>{`.kai-cite { margin: 0 1px; vertical-align: baseline }`}</style>
        <kai-workspace
          ref={(el) => {
            // The two-mode rail is the consumer's OWN column in the start slot
            // (below) — the re-cast shell has no built-in conversation pane to
            // suppress. Rail geometry is CSS custom properties (the kai-dock
            // rule), not props.
            el.style.setProperty('--kai-workspace-start-min-width', '240px');
            el.style.setProperty('--kai-workspace-start-max-width', '300px');
          }}
          class="block h-full"
          collapse-below="720"
        >
          {/* ── start: the mode toggle + the per-mode rail, with Settings pinned ── */}
          <div slot="start" class="flex h-full flex-col">
          <div class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pt-2.5">
            {/* THE shell seam: a segmented Assistant | Computer toggle that swaps
                the whole rail + main view, built on kai-tabs variant="segmented". */}
            <kai-tabs
              ref={(el) => {
                const t = el as El;
                t.items = MODES; t.defaultValue = 'assistant'; t.block = true;
                el.addEventListener('kai-tab-change', (e) => setMode((e as CustomEvent).detail.value));
              }}
              variant="segmented"
            ></kai-tabs>

            {/* ASSISTANT rail */}
            <Show when={mode() === 'assistant'}>
              <div class="flex flex-col gap-2">
                <kai-button
                  ref={(el) => { el.addEventListener('kai-click', () => setView('home')); }}
                  variant="outline"
                  full
                  align="start"
                  icon="square-pen"
                >New Session</kai-button>
                <kai-button variant="ghost" full align="start" icon="folder">Projects</kai-button>
                {/* Session search: a real kai-search that filters the recent-sessions
                    kai-nav below. */}
                <kai-search
                  ref={(el) => { el.addEventListener('kai-search', (e) => setSessionQuery((e as CustomEvent).detail.value)); }}
                  placeholder="Search sessions..."
                ></kai-search>
                <div class="px-1 pt-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Recent</div>
                {/* The recent sessions: a real kai-nav. Selecting a row opens an
                    answer. Bounded height so the rail scrolls instead of overflowing. */}
                <div class="max-h-[42vh] overflow-y-auto">
                  <kai-nav
                    ref={(el) => {
                      const n = el as El;
                      recentsNavEl = n;
                      n.items = filterRecents(sessionQuery()); n.defaultValue = 's1';
                      el.addEventListener('kai-nav-select', () => setView('answer'));
                    }}
                  ></kai-nav>
                </div>
              </div>
            </Show>

            {/* COMPUTER rail */}
            <Show when={mode() === 'computer'}>
              <div class="flex flex-col gap-2">
                <kai-button variant="outline" full align="start" icon="plus">New Task</kai-button>
                <kai-nav ref={(el) => { const n = el as El; n.items = COMPUTER_NAV; n.defaultValue = 'projects'; }}></kai-nav>
                <div class="flex items-center gap-1.5">
                  <kai-search placeholder="Search tasks..." class="min-w-0 flex-1"></kai-search>
                  <kai-tooltip content="Sort">
                    <kai-button variant="ghost" size="icon-sm" icon="sliders-horizontal" label="Sort"></kai-button>
                  </kai-tooltip>
                  <kai-tooltip content="New task">
                    <kai-button variant="ghost" size="icon-sm" icon="plus" label="New task"></kai-button>
                  </kai-tooltip>
                </div>
                <div class="mt-2 flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                  <kai-icon name="monitor" class="text-muted-foreground"></kai-icon>
                  <div class="text-sm font-medium text-foreground">No Computer Tasks Yet</div>
                  <div class="text-xs text-muted-foreground">Start a Computer task to see it here.</div>
                </div>
              </div>
            </Show>
          </div>

          {/* ── the rail footer: Settings + a battery indicator (pinned) ──────── */}
          <div class="shrink-0">
            <kai-separator></kai-separator>
            <div class="flex items-center justify-between px-2.5 py-1.5">
              {/* `full` fills the HOST's box; in a flex row the host is a flex
                  item that hugs content unless it grows, so flex-1 is what hands
                  it the remaining width (min-w-0 keeps long labels truncatable). */}
              <kai-button variant="ghost" align="start" icon="settings" full class="min-w-0 flex-1">Settings</kai-button>
              <kai-tooltip content="On battery - 82%">
                <kai-button variant="ghost" size="icon-sm" label="Battery"><BatteryMedium slot="icon" class="size-4" /></kai-button>
              </kai-tooltip>
            </div>
          </div>
          </div>

          {/* ── main: the per-mode / per-view surface ─────────────────────────── */}
          <div slot="main" class="flex h-full flex-col">
            {/* ASSISTANT · HOME (empty) */}
            <Show when={mode() === 'assistant' && view() === 'home'}>
              <div class="relative flex h-full flex-col">
                <div class="flex justify-end p-3">
                  <kai-tooltip content="Incognito">
                    <kai-button variant="ghost" size="icon-sm" label="Incognito"><VenetianMask slot="icon" class="size-4" /></kai-button>
                  </kai-tooltip>
                </div>
                <div class="flex flex-1 flex-col items-center justify-center gap-7 px-6 pb-24">
                  <div class="text-3xl font-semibold tracking-tight text-foreground">perplexity</div>
                  <div class="flex w-full max-w-2xl flex-col gap-2">
                    <kai-prompt-input ref={(el) => { (el as El).attach = false; }} placeholder="Ask anything...">
                      <div slot="toolbar-start" class="flex items-center gap-1.5">
                        <kai-menu
                          ref={(el) => { (el as El).items = [
                            { id: 'files', label: 'Add files', icon: 'paperclip' },
                            { id: 'project', label: 'From a project', icon: 'box' },
                          ]; }}
                          trigger-icon="plus"
                          label="Add"
                        ></kai-menu>
                      </div>
                      <div slot="toolbar-end" class="flex items-center gap-1.5">
                        <kai-menu
                          ref={(el) => { (el as El).items = [
                            { heading: true, label: 'Model' },
                            { id: 'best', label: 'Best', icon: 'sparkles', checked: true },
                            { id: 'sonnet', label: 'Claude Sonnet 4.6', icon: 'message-square' },
                            { id: 'gpt', label: 'GPT-5', icon: 'message-square' },
                            { id: 'gemini', label: 'Gemini 2.5 Pro', icon: 'message-square' },
                          ]; }}
                          trigger-label="Best"
                          trigger-icon-trailing="chevron-down"
                          label="Model"
                        ></kai-menu>
                        <kai-tooltip content="Dictate">
                          <kai-button variant="ghost" size="icon-sm" icon="mic" label="Dictate"></kai-button>
                        </kai-tooltip>
                        {/* the send arrow is kai-prompt-input's own built-in send button */}
                      </div>
                    </kai-prompt-input>
                    {/* the tool row below the input - a consumer layout of real
                        kai-buttons (apps / folder / image / copy / attach / voice) */}
                    <div class="flex items-center gap-1 px-1">
                      <Tool tip="Apps"><LayoutGrid slot="icon" class="size-4" /></Tool>
                      <kai-tooltip content="Files">
                        <kai-button variant="ghost" size="icon-sm" icon="folder" label="Files"></kai-button>
                      </kai-tooltip>
                      <Tool tip="Image"><ImageIcon slot="icon" class="size-4" /></Tool>
                      <Tool tip="Copy"><Copy slot="icon" class="size-4" /></Tool>
                      <kai-tooltip content="Attach">
                        <kai-button variant="ghost" size="icon-sm" icon="paperclip" label="Attach"></kai-button>
                      </kai-tooltip>
                      <kai-tooltip content="Voice">
                        <kai-button variant="ghost" size="icon-sm" icon="audio-lines" label="Voice"></kai-button>
                      </kai-tooltip>
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* ASSISTANT · ANSWER */}
            <Show when={mode() === 'assistant' && view() === 'answer'}>
              <div class="flex h-full flex-col">
                <div class="min-h-0 flex-1 overflow-y-auto">
                  <div class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
                    {/* tab strip + Share */}
                    <div class="flex items-center justify-between gap-3">
                      <kai-tabs
                        ref={(el) => {
                          const t = el as El;
                          answerTabsEl = t;
                          t.items = [
                            { id: 'answer', label: 'Answer' },
                            { id: 'sources', label: 'Sources' },
                            { id: 'images', label: 'Images' },
                          ];
                          t.value = tab();
                          el.addEventListener('kai-tab-change', (e) => setTab((e as CustomEvent).detail.value));
                        }}
                        variant="underline"
                      ></kai-tabs>
                      <kai-button variant="outline" size="sm" icon="share">Share</kai-button>
                    </div>

                    {/* the user's query, a real kai-message (role=user, right-aligned bubble) */}
                    <kai-message
                      ref={(el) => {
                        const m = el as El;
                        m.message = { id: 'pplx-query', role: 'user', parts: [{ type: 'text', text: QUERY }] };
                        m.avatar = 'none';
                      }}
                      style={{ display: 'block' }}
                    ></kai-message>

                    {/* ── ANSWER tab ─────────────────────────────────────────── */}
                    <Show when={tab() === 'answer'}>
                      <div class="flex flex-col gap-5">
                        {/* the "Generated chart" artifact card: kai-card shell +
                            a real kai-image + a download action. */}
                        <kai-card appearance="outlined" class="block">
                          <div class="flex flex-col gap-2">
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-2 text-sm font-medium">
                                <kai-icon name="sparkles" class="text-muted-foreground"></kai-icon> Generated chart
                              </div>
                              <kai-tooltip content="Download">
                                <kai-button variant="ghost" size="icon-sm" label="Download"><Download slot="icon" class="size-4" /></kai-button>
                              </kai-tooltip>
                            </div>
                            <kai-image
                              ref={(el) => { const i = el as El; i.base64 = CHART; i.mediaType = 'image/svg+xml'; i.alt = 'Cloud GPU price comparison, $/hr'; }}
                              class="block overflow-hidden rounded-md"
                            ></kai-image>
                          </div>
                        </kai-card>

                        {/* the "7 steps completed" indicator - a REAL kai-reasoning
                            disclosure (label is the trigger; expands to the steps). */}
                        <kai-reasoning
                          ref={(el) => { const r = el as El; r.label = '7 steps completed'; r.text = STEPS_MD; }}
                        ></kai-reasoning>

                        {/* heading + cited prose. The inline [n] chips are real
                            kai-source elements (hover for the snippet popover); the
                            prose is hand-woven because kai-message renders a markdown
                            STRING and can't interleave citation chips at offsets. */}
                        <div class="flex flex-col gap-3">
                          <h2 class="text-lg font-semibold text-foreground">On-demand A100 80GB pricing across the major clouds</h2>
                          <div class="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-foreground">
                            <p>
                              For a single A100 80GB on demand, the cheapest option is Lambda at roughly
                              $1.10 per GPU-hour <Cite i={3} />. Among the hyperscalers, Google Cloud is the
                              least expensive at about $2.49 <Cite i={1} />, with Azure's ND A100 v4 near
                              $2.81 <Cite i={2} /> and AWS's p4d instances around $3.06 <Cite i={0} />.
                            </p>
                            <p>
                              List prices move, so cross-check a live comparison before you commit
                              <Cite i={4} /> <Cite i={5} />. Reserved and committed-use discounts can cut the
                              hyperscaler rates by 30-60% for steady workloads.
                            </p>
                          </div>
                        </div>

                        {/* the comparison table - REAL GFM via kai-message */}
                        <kai-message
                          ref={(el) => {
                            const m = el as El;
                            m.message = { id: 'pplx-table', role: 'assistant', parts: [{ type: 'text', text: TABLE_MD }] };
                            m.avatar = 'none';
                          }}
                          style={{ display: 'block' }}
                        ></kai-message>

                        {/* an embedded chart image with a caption - a REAL kai-image */}
                        <figure class="flex flex-col gap-1.5">
                          <kai-image
                            ref={(el) => { const i = el as El; i.base64 = CHART2; i.mediaType = 'image/svg+xml'; i.alt = 'Estimated monthly cost for one A100 at 50% utilization'; }}
                            class="block overflow-hidden rounded-md border border-border"
                          ></kai-image>
                          <figcaption class="text-xs text-muted-foreground">Estimated monthly cost for a single A100 at 50% utilization, by provider.</figcaption>
                        </figure>

                        {/* closing prose - REAL markdown */}
                        <kai-message
                          ref={(el) => {
                            const m = el as El;
                            m.message = { id: 'pplx-closing', role: 'assistant', parts: [{ type: 'text', text: CLOSING_MD }] };
                            m.avatar = 'none';
                          }}
                          style={{ display: 'block' }}
                        ></kai-message>
                      </div>
                    </Show>

                    {/* ── SOURCES tab ────────────────────────────────────────── */}
                    <Show when={tab() === 'sources'}>
                      {/* the numbered source list (number + title + description +
                          favicon/domain) - a REAL kai-sources in numbered mode. */}
                      <kai-sources
                        ref={(el) => { (el as El).sources = SOURCES.map((s) => ({ href: s.href, title: s.title, description: s.snippet })); }}
                        numbered
                        show-favicon
                      ></kai-sources>
                    </Show>

                    {/* ── IMAGES tab ─────────────────────────────────────────── */}
                    <Show when={tab() === 'images'}>
                      <div class="flex flex-col gap-2">
                        {/* the grid arrangement is consumer layout (a few grid
                            classes); each tile is a REAL kai-image. */}
                        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <For each={IMAGES}>
                            {(b64, i) => (
                              <kai-image
                                ref={(el) => { const im = el as El; im.base64 = b64; im.mediaType = 'image/svg+xml'; im.alt = `Related image ${i() + 1}`; }}
                                class="block overflow-hidden rounded-lg border border-border"
                              ></kai-image>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>

                {/* the pinned follow-up composer */}
                <div class="shrink-0 border-t border-border p-3">
                  <div class="mx-auto max-w-3xl">
                    <kai-prompt-input ref={(el) => { (el as El).attach = false; }} placeholder="Ask a follow up... (Cmd K)">
                      <div slot="toolbar-start" class="flex items-center gap-1.5">
                        <kai-menu
                          ref={(el) => { (el as El).items = [
                            { id: 'files', label: 'Add files', icon: 'paperclip' },
                            { id: 'project', label: 'From a project', icon: 'box' },
                          ]; }}
                          trigger-icon="plus"
                          label="Add"
                        ></kai-menu>
                      </div>
                    </kai-prompt-input>
                  </div>
                </div>
              </div>
            </Show>

            {/* COMPUTER · PROJECTS */}
            <Show when={mode() === 'computer'}>
              <div class="h-full overflow-y-auto">
                <div class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-7">
                  <div class="flex items-center justify-between gap-3">
                    <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
                    <kai-button variant="default" size="sm" icon="plus">New Project</kai-button>
                  </div>
                  <kai-search placeholder="Search Projects"></kai-search>
                  {/* the projects list - a REAL kai-nav: a collapsible "Your Projects"
                      group whose child rows carry a letter avatar (icon), the name
                      (label), the relative time (meta) and a Private/Public pill
                      (badge). */}
                  <kai-nav ref={(el) => { const n = el as El; n.items = PROJECTS; }}></kai-nav>
                </div>
              </div>
            </Show>
          </div>
        </kai-workspace>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        // A representative skeleton of the composition (not the full interactive
        // render). The segmented toggle swaps the rail + main; the Answer/Sources/
        // Images tabs swap the answer panel; the answer is assembled from real
        // kai-* pieces.
        code: `<kai-workspace collapse-below="720"
  style="--kai-workspace-start-min-width: 240px; --kai-workspace-start-max-width: 300px">
  <!-- start: the whole rail is the consumer's OWN column (the re-cast shell is
       chat-agnostic — a mode toggle + per-mode nav is as valid as a
       conversation list). Settings pins at the column's bottom. -->
  <div slot="start">
    <!-- the segmented Assistant | Computer toggle, built on kai-tabs
         variant="segmented". Swaps rail + main. -->
    <kai-tabs variant="segmented"></kai-tabs>

    <!-- ASSISTANT rail -->
    <kai-button variant="outline" icon="square-pen">New Session</kai-button>
    <kai-button variant="ghost" icon="folder">Projects</kai-button>
    <kai-search placeholder="Search sessions..."></kai-search> <!-- filters the recent-sessions kai-nav -->
    <div>Recent</div>
    <kai-nav></kai-nav> <!-- ~18 recent sessions; selecting one opens an answer -->

    <!-- COMPUTER rail (when selected): New Task, nav, search, empty state -->

    <!-- pinned at the rail's bottom -->
    <kai-button variant="ghost" icon="settings" full>Settings</kai-button>
    <kai-button variant="ghost" size="icon-sm" label="Battery"><svg slot="icon">…</svg></kai-button>
  </div>

  <div slot="main">
    <!-- ASSISTANT · HOME: incognito icon, "perplexity" wordmark, the composer -->
    <kai-prompt-input placeholder="Ask anything...">
      <div slot="toolbar-start"><kai-menu trigger-icon="plus" label="Add"></kai-menu></div>
      <div slot="toolbar-end">
        <kai-menu trigger-label="Best" trigger-icon-trailing="chevron-down"></kai-menu>
        <kai-button variant="ghost" size="icon-sm" icon="mic" label="Dictate"></kai-button>
        <!-- the send arrow is kai-prompt-input's own built-in send button -->
      </div>
    </kai-prompt-input>
    <!-- a tool row of real kai-buttons (apps / folder / image / copy / attach / voice) -->

    <!-- ASSISTANT · ANSWER -->
    <kai-tabs variant="underline"></kai-tabs> <!-- Answer | Sources | Images (controlled; swaps the panel) -->
    <kai-button variant="outline" icon="share">Share</kai-button>
    <kai-message><!-- role=user: the query bubble (message set as a property) --></kai-message>

    <!-- ANSWER tab -->
    <kai-card appearance="outlined"> <!-- "Generated chart" artifact card -->
      Generated chart <kai-button label="Download"><svg slot="icon">…</svg></kai-button>
      <kai-image></kai-image> <!-- base64 SVG set as a property (no URL support) -->
    </kai-card>
    <kai-reasoning></kai-reasoning> <!-- "7 steps completed" disclosure (REAL; label set as a property) -->
    <p>… cited prose with inline <kai-source label="1" headline="…" description="…"></kai-source> chips …</p>
    <kai-message><!-- the comparison table: GFM markdown, message set as a property --></kai-message>
    <kai-image></kai-image> <!-- an embedded chart image + a caption -->

    <!-- SOURCES tab: the numbered source list (REAL) -->
    <kai-sources numbered show-favicon></kai-sources>

    <!-- IMAGES tab: a grid of real kai-image tiles -->
    <div class="grid grid-cols-3 gap-2"><kai-image></kai-image>…</div>

    <!-- the pinned follow-up composer -->
    <kai-prompt-input placeholder="Ask a follow up... (Cmd K)"></kai-prompt-input>

    <!-- COMPUTER · PROJECTS: heading + search + "New Project" + a kai-nav group -->
    <kai-nav></kai-nav> <!-- "Your Projects" collapsible group: avatar + name + Private/Public badge + time -->
  </div>
</kai-workspace>

<script type="module">
  // Array/object props are JS properties (the kai- contract); scalars are attributes.
  document.querySelector('kai-tabs').items = [
    { id: 'assistant', label: 'Assistant', icon: 'search' },
    { id: 'computer', label: 'Computer', icon: 'monitor' },
  ];
  document.querySelector('kai-tabs').block = true;
  document.querySelector('kai-nav').items = [/* recent sessions / projects (KaiNavItem[]) */];
  // query / table / closing prose
  document.querySelector('kai-message').message = { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: '…' }] };
  document.querySelector('kai-reasoning').label = '7 steps completed';
  document.querySelector('kai-reasoning').text = '1. …';
  document.querySelector('kai-image').base64 = '<base64 SVG>';
  document.querySelector('kai-image').mediaType = 'image/svg+xml';
  document.querySelector('kai-sources').sources = [{ href: '…', title: '…', description: '…' }, /* … */];

  // Interactions: the segmented toggle swaps rail + main; the tab strip swaps the panel.
  document.querySelector('kai-tabs').addEventListener('kai-tab-change', (e) => setMode(e.detail.value));
</script>`,
      },
    },
  },
};
