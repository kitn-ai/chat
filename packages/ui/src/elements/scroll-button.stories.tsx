import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For, type JSX } from 'solid-js';
// TWO SEPARATE HAZARDS live here. They look alike and are not.
//
// HAZARD 1 -- why this import is `./scroll-button` and never `./register`.
// `register` defines the elements through an SSR-gated dynamic `import()`, so
// the tags exist a MICROTASK LATE: a property set before the upgrade is
// silently overwritten by the accessor's default. Importing the facade module
// directly defines the tag synchronously. `nav.stories.tsx` does the same.
//
// HAZARD 2 -- which CODE this story actually runs, which the import above does
// NOT control. `.storybook/preview.ts` imports `elementsReady` from the BUILT
// `../dist/kai.es.js`. That bundle registers every kai-* element and wins the
// `customElements.define` race, so a Labs facade story paints `dist/`, never
// `src/`, however the story imports the module. Edit a facade and this story
// keeps showing the old glyph until someone rebuilds. Fixing hazard 1 does
// nothing for hazard 2, and a dev-server fetch returning your new source
// proves nothing about what the page ran.
import './scroll-button';

// Declare the custom element tag for SolidJS JSX.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-scroll-button': JSX.HTMLAttributes<HTMLElement> & {
        for?: string;
        variant?: string;
        size?: string;
        label?: string;
        'show-label'?: string | boolean;
        theme?: string;
      };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/ScrollButton',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

/**
 * A scrollable feed with the button pinned over it. `id` is what `for` points at.
 *
 * `holder` overrides the absolutely positioned wrapper the button sits in. That
 * wrapper is the whole positioning mechanism: see `FloatingOverContent`.
 */
function Feed(props: {
  id: string;
  children: JSX.Element;
  holder?: JSX.CSSProperties;
  composer?: boolean;
}) {
  return (
    <div style={{ position: 'relative', width: '22rem' }}>
      <div
        id={props.id}
        style={{
          height: '15rem',
          'overflow-y': 'auto',
          border: '1px solid var(--color-border)',
          'border-radius': '0.5rem',
          padding: '0.75rem',
          background: 'var(--color-background)',
        }}
      >
        <For each={Array.from({ length: 20 })}>
          {(_, i) => (
            <div
              style={{
                background: 'var(--color-muted)',
                'border-radius': '0.375rem',
                padding: '0.5rem 0.75rem',
                'margin-bottom': '0.5rem',
                'font-size': '0.875rem',
                color: 'var(--color-foreground)',
              }}
            >
              Message {i() + 1}: a line of thread content for the button to float over.
            </div>
          )}
        </For>
      </div>
      <div
        style={
          props.holder ?? {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '0.75rem',
            display: 'flex',
            'justify-content': 'center',
          }
        }
      >
        {props.children}
      </div>
      {props.composer ? (
        <div
          style={{
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '0',
            padding: '0.5rem 0.75rem',
            'border-top': '1px solid var(--color-border)',
            background: 'var(--color-background)',
            'border-radius': '0 0 0.5rem 0.5rem',
            'font-size': '0.875rem',
            color: 'var(--color-muted-foreground)',
          }}
        >
          Send a message...
        </div>
      ) : null}
    </div>
  );
}

/**
 * One panel, used by every story below so the panels are always structurally
 * identical. The asymmetry this replaces is what made `LightAndDark` look like
 * it was demonstrating two different placements when it was not.
 */
function Panel(props: { title: string; dark?: boolean; children: JSX.Element }) {
  return (
    <div
      class={props.dark ? 'dark' : undefined}
      style={{
        background: 'var(--color-background)',
        border: '1px solid var(--color-border)',
        padding: '0.75rem',
        'border-radius': '0.5rem',
      }}
    >
      <div style={{ 'font-size': '0.75rem', 'font-weight': '500', color: 'var(--color-muted-foreground)', 'margin-bottom': '0.5rem' }}>
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

// `theme` is pinned to `light` on the three basic stories. The element defaults
// to `theme="auto"`, which follows the VIEWER's `prefers-color-scheme` while the
// surrounding Storybook page stays light, so on a dark-preferring machine the
// element rendered a near-black chip over a white feed. `LightAndDark` below is
// where both looks are shown deliberately.

/** Icon only, the default. Scroll the feed up and the button fades in. */
export const IconOnly: StoryObj = {
  render: () => (
    <Panel title="Icon only">
      <Feed id="labs-feed-icon">
        <kai-scroll-button for="labs-feed-icon" theme="light"></kai-scroll-button>
      </Feed>
    </Panel>
  ),
  parameters: src(`<div id="my-feed" style="height:400px; overflow-y:auto"></div>
<kai-scroll-button for="my-feed"></kai-scroll-button>`),
};

/** `show-label` renders the name beside the arrow, and it becomes the accessible name. */
export const Labelled: StoryObj = {
  render: () => (
    <Panel title="Labelled">
      <Feed id="labs-feed-labelled">
        <kai-scroll-button for="labs-feed-labelled" theme="light" show-label></kai-scroll-button>
      </Feed>
    </Panel>
  ),
  parameters: src(`<kai-scroll-button for="my-feed" show-label></kai-scroll-button>`),
};

/** `label` sets what gets announced. Set it alone to localise the icon-only button. */
export const CustomLabel: StoryObj = {
  render: () => (
    <Panel title="Custom label">
      <Feed id="labs-feed-custom">
        <kai-scroll-button for="labs-feed-custom" theme="light" show-label label="Jump to latest"></kai-scroll-button>
      </Feed>
    </Panel>
  ),
  parameters: src(`<kai-scroll-button for="my-feed" show-label label="Jump to latest"></kai-scroll-button>`),
};

/**
 * Both themes over real content, so the opaque fill and the elevation can be
 * judged in situ.
 *
 * The two panels are now structurally IDENTICAL and differ only by `dark`. They
 * did not used to be: the dark one was wrapped in a padded, backgrounded card
 * and the light one was not, so the light feed sat flush against the canvas
 * edge with its border clipped while the dark one looked neatly inset. That
 * read as two different placements. It was not one. Placement is
 * `FloatingOverContent`.
 */
export const LightAndDark: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: '1.5rem', 'flex-wrap': 'wrap' }}>
      <Panel title="Light">
        <Feed id="labs-feed-light">
          <kai-scroll-button for="labs-feed-light" theme="light" show-label></kai-scroll-button>
        </Feed>
      </Panel>
      <Panel title="Dark" dark>
        <Feed id="labs-feed-dark">
          <kai-scroll-button for="labs-feed-dark" theme="dark" show-label></kai-scroll-button>
        </Feed>
      </Panel>
    </div>
  ),
  parameters: src(`<kai-scroll-button for="my-feed" theme="dark" show-label></kai-scroll-button>`),
};

/**
 * HOW TO FLOAT THE BUTTON OVER THE THREAD. This is the whole technique.
 *
 * There is no `placement` prop and no positioning CSS inside the element. It
 * draws a button; where that button sits is your layout. Three rules make it
 * float over the messages instead of scrolling with them:
 *
 * 1. Put `position: relative` on a box that does NOT scroll, wrapping the
 *    scroll container. Not on the scroll container itself: an absolutely
 *    positioned child of a scrolling element is placed against its padding box
 *    and then scrolls away with the content, which looks correct until you
 *    scroll.
 * 2. Give the button `position: absolute` and an offset from the bottom.
 * 3. Centre it, or anchor it to a corner. Both are shown below.
 *
 * This is the same shape the kit uses on itself: `thread.tsx` and
 * `chat-thread.tsx` both put `relative` on the non-scrolling box around
 * `ChatContainer`, then position the button `absolute bottom-4` inside it. The
 * one refinement worth copying from them is the last panel: centring on a
 * max-width band rather than the full container, so the button tracks the
 * message column on a wide screen instead of drifting to the middle of the
 * window.
 */
export const FloatingOverContent: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: '1.5rem', 'flex-wrap': 'wrap' }}>
      <Panel title="Centred: left 0, right 0, justify-content center">
        <Feed id="labs-pos-centre">
          <kai-scroll-button for="labs-pos-centre" theme="light"></kai-scroll-button>
        </Feed>
      </Panel>

      <Panel title="Corner: right 0.75rem">
        <Feed
          id="labs-pos-corner"
          holder={{ position: 'absolute', right: '0.75rem', bottom: '0.75rem' }}
        >
          <kai-scroll-button for="labs-pos-corner" theme="light"></kai-scroll-button>
        </Feed>
      </Panel>

      <Panel title="Clear of a composer: bottom 3.5rem">
        <Feed
          id="labs-pos-composer"
          composer
          holder={{ position: 'absolute', left: '0', right: '0', bottom: '3.5rem', display: 'flex', 'justify-content': 'center' }}
        >
          <kai-scroll-button for="labs-pos-composer" theme="light"></kai-scroll-button>
        </Feed>
      </Panel>

      <Panel title="Centred on a max-width band, the way the kit does it">
        <Feed
          id="labs-pos-band"
          holder={{ position: 'absolute', left: '50%', bottom: '0.75rem', transform: 'translateX(-50%)', width: '100%', 'max-width': '48rem', display: 'flex', 'justify-content': 'center' }}
        >
          <kai-scroll-button for="labs-pos-band" theme="light" show-label></kai-scroll-button>
        </Feed>
      </Panel>
    </div>
  ),
  parameters: src(`<!-- 1. relative on a box that does NOT scroll -->
<div style="position:relative; height:400px">

  <!-- 2. the scroll container fills it -->
  <div id="my-feed" style="height:100%; overflow-y:auto">
    <!-- messages -->
  </div>

  <!-- 3a. centred over the content -->
  <kai-scroll-button for="my-feed"
    style="position:absolute; left:0; right:0; bottom:12px; margin:0 auto; width:max-content">
  </kai-scroll-button>

  <!-- 3b. or anchored to the corner -->
  <kai-scroll-button for="my-feed"
    style="position:absolute; right:12px; bottom:12px">
  </kai-scroll-button>

  <!-- 3c. or centred on the message column, so it does not drift
       to the middle of a wide window -->
  <kai-scroll-button for="my-feed"
    style="position:absolute; left:50%; bottom:12px; transform:translateX(-50%)">
  </kai-scroll-button>
</div>`),
};
