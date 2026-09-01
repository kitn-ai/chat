import { Panel, PanelBody, PanelFooter, PanelHeader } from '../components/panel';
import { defineWebComponent } from './define';

interface PanelElementProps extends Record<string, unknown> {
  /** Standalone widget-box chrome: border, radius and shadow on the panel
   *  itself. Off (the default), the panel inherits its container's radius
   *  and clips to it, the right posture inside an already-framed container
   *  such as `kai-dock`'s floating panel. */
  frame?: boolean;
}

/**
 * `<kai-panel>` is the widget panel frame, public: the surface every
 * widget-family composition sits on, painted from kit tokens so a
 * `--kai-color-*` override retints the chrome together with the elements
 * inside it. Regions: a `header` slot (put a `<kai-panel-header>` there, or
 * anything), the default slot as the view container (fills the remaining
 * height, clips, and anchors floating children), and a `footer` slot that
 * never scrolls away.
 *
 * Size the host; the panel fills it. With `frame` the panel carries its own
 * border, radius and shadow (a standalone widget box); without it, it
 * inherits the container's radius, so it drops into `<kai-dock>`'s panel
 * slot with no extra CSS.
 *
 * ```html
 * <kai-panel frame style="width: 380px; height: 560px">
 *   <kai-panel-header slot="header">Support</kai-panel-header>
 *   <kai-thread></kai-thread>
 *   <div slot="footer">Powered by Aurora</div>
 * </kai-panel>
 * ```
 *
 * Parts: `panel` (the frame) · `header` (the header region) · `body` (the
 * view container) · `footer`.
 */
defineWebComponent<PanelElementProps>('kai-panel', {
  frame: false,
}, (props, { flag, reflectFlag }) => {
  void props;
  // Reflect so `[frame]` is styleable/inspectable on the host and the
  // property reads back what an attribute write set (define.tsx G-05).
  reflectFlag('frame');
  return (
    <>
      {/* The host is the sized box; the panel fills it. `height:100%` would be
          wrong on the shadow content alone, so the flex column carries h-full
          against a stretched host block. */}
      {/* Default-slot children are the view content (a kai-thread, a home
          screen): stretch them to fill the body region. The named slots are
          exempt on purpose, so header/footer content keeps its natural
          height. */}
      <style>{':host{display:block}slot:not([name])::slotted(*){flex:1 1 0%;min-height:0}'}</style>
      <Panel frame={flag('frame')} part="panel">
        <div part="header" class="shrink-0"><slot name="header" /></div>
        <PanelBody part="body"><slot /></PanelBody>
        <PanelFooter part="footer"><slot name="footer" /></PanelFooter>
      </Panel>
    </>
  );
});

/**
 * `<kai-panel-header>` is the panel's header row, the exact chrome the
 * `kai-chat` facade paints for its own built-in header: a 56px row with a
 * bottom border, a leading cluster, a semibold title, and a trailing
 * cluster. Back arrows and close buttons are slotted CONTENT, never props:
 * put them in the `start` and `end` slots.
 *
 * ```html
 * <kai-panel-header>
 *   <kai-button slot="start" variant="ghost" aria-label="Back">...</kai-button>
 *   Aurora Support
 *   <kai-button slot="end" variant="ghost" aria-label="Close">...</kai-button>
 * </kai-panel-header>
 * ```
 *
 * Parts: `header` (the row) · `start` · `title` · `end`.
 */
defineWebComponent<Record<string, unknown>>('kai-panel-header', {}, () => (
  <>
    <style>{':host{display:block}'}</style>
    <PanelHeader part="header" start={<slot name="start" />} end={<slot name="end" />}>
      <slot />
    </PanelHeader>
  </>
));
