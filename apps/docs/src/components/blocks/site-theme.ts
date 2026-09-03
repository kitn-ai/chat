/**
 * The site's current theme, as a signal, for the kai-* elements to follow.
 *
 * Each element resolves its tokens inside its own shadow root, so an element
 * with no `theme` paints its light palette inside the dark site. Every island
 * on this site fixes that the same way: read
 * `document.documentElement.dataset.theme`, put it on the element, and watch
 * the documentElement for changes to `data-theme` (grep the folder: ChatDemo,
 * ToastDemo, Playground and a dozen more all carry that MutationObserver).
 *
 * This is that mechanism, written once instead of pasted per element. The
 * older islands drive one host element each and can call `setAttribute` in an
 * effect; a card renders several kai elements and re-creates some of them on
 * every mode change, so the readable form here is a signal the JSX binds.
 *
 * Starlight only ever writes `light` or `dark` to the dataset (its `auto`
 * setting is resolved before it lands there), so anything else reads as light.
 */
import { createSignal, onCleanup, type Accessor } from 'solid-js';

export type SiteTheme = 'light' | 'dark';

const read = (): SiteTheme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

export function createSiteTheme(): Accessor<SiteTheme> {
  const [theme, setTheme] = createSignal<SiteTheme>(read());
  const observer = new MutationObserver(() => setTheme(read()));
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  onCleanup(() => observer.disconnect());
  return theme;
}
