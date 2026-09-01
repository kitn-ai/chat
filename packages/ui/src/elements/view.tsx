import { defineWebComponent } from './define';

interface Props extends Record<string, unknown> {
  /** The view's name: what `push()` / `selectTab()` / the stack's `view`
   *  attribute address. Attribute: `name`. */
  name?: string;
  /** Marks this view as a TAB ROOT: it shows the tab bar and never a back
   *  affordance, and a tab switch lands on it directly. Views without it are
   *  DRILL views, reached by `push()` and left by `back()`. Attribute:
   *  `tab-root`. */
  tabRoot?: boolean;
}

/**
 * `<kai-view>` — one named view inside `<kai-view-stack>`. A declarative
 * marker plus a slot: put the view's content in the light DOM and the
 * enclosing stack decides which view shows, toggling `hidden` and a
 * `data-active` styling hook on this host. Non-active views stay in the DOM
 * (hidden, never removed), so switching tabs resets nothing: scroll offsets,
 * half-typed inputs and component state all survive.
 *
 * ```html
 * <kai-view-stack>
 *   <kai-view name="home" tab-root>...</kai-view>
 *   <kai-view name="messages" tab-root>...</kai-view>
 *   <kai-view name="chat">...</kai-view>
 * </kai-view-stack>
 * ```
 *
 * Standalone (outside a stack) it is an ordinary block container that shows
 * its content. It fires no events; navigation surfaces on the stack.
 */
defineWebComponent<Props, Record<string, never>>('kai-view', {
  name: undefined,
  tabRoot: undefined,
}, () => {
  return (
    <>
      {/* The shared base sheet sets `:host{display:block}`, which outranks the
          UA's `[hidden]{display:none}` — so the stack's `hidden` toggle needs
          this host rule to actually hide the view. */}
      <style>{':host([hidden]){display:none}'}</style>
      <slot />
    </>
  );
});
