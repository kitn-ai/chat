import { createSignal, onMount, onCleanup } from 'solid-js';
import { defineWebComponent } from './define';
import { Artifact, type ArtifactController, type ArtifactFile, type ArtifactTab } from '../components/artifact';

interface Props extends Record<string, unknown> {
  /** URL the preview iframe frames. Consumer-controlled. */
  src?: string;
  /** Files for the Code tab tree + each file's preview `url`. Set as a JS property (array). */
  files: ArtifactFile[];
  /** Controlled active tab: `preview` or `code`. When set, the artifact follows it
   *  (re-asserted on change). Leave unset for an uncontrolled tab (see `defaultTab`). */
  tab?: ArtifactTab;
  /** Uncontrolled INITIAL tab (used only when `tab` is unset). Default `preview`.
   *  Seeds the starting tab; the user can then switch freely without the consumer
   *  re-asserting a controlled `tab`. */
  defaultTab?: ArtifactTab;
  /** Selected file path — syncs the tree highlight, Code source, and preview. */
  activeFile?: string;
  /** iframe `sandbox` override. Secure default `allow-scripts allow-forms` (NOT `allow-same-origin`). */
  sandbox?: string;
  /** Accessible title for the preview iframe. */
  iframeTitle?: string;
  /** Reflects the artifact's own maximized view-state (usually driven by the protocol). */
  maximized?: boolean;
  /** Show the expand-to-fill button (OPT-IN). */
  expandable?: boolean;
  /** Show the open-in-new-tab button (OPT-IN). */
  openInTab?: boolean;
  /** Hide back/forward. */
  noNav?: boolean;
  /** Hide reload. */
  noReload?: boolean;
  /** Hide home. */
  noHome?: boolean;
  /** Hide the address field. */
  noPathField?: boolean;
  /** Hide the Preview|Code toggle. */
  noTabs?: boolean;
  /** Standalone chrome: rounded corners + border (else square, borderless in-panel). */
  standalone?: boolean;
  /** Show the address but make it read-only (visible, nav-tracking, non-editable). */
  readonlyPath?: boolean;
  /** Friendly address shown in the path field instead of the real current url
   *  (read-only, non-navigable). Use when the framed url is not consumer-facing
   *  (e.g. a `data:` blob) so a clean address shows instead of leaking it. Scalar
   *  string: set as the `display-url` attribute or the `displayUrl` property. */
  displayUrl?: string;
}

interface Events extends Record<string, unknown> {
  /** Fired when the preview navigates. `detail.url` = the new location. */
  'kai-navigate': { url: string };
  /** Fired when the Preview|Code tab changes. `detail.tab`. */
  'kai-tab-change': { tab: ArtifactTab };
  /** Fired when a file is selected. `detail.path`. */
  'kai-file-select': { path: string };
  /** Artifact's own maximize button toggled (consumer-observable; non-bubbling). */
  'kai-maximize-change': { maximized: boolean };
  /** The maximize PROTOCOL intent, raised as a raw bubbling + composed CustomEvent
   *  (not through `dispatch`) so an enclosing `<kai-resizable>` can catch it and
   *  maximize the containing panel. Declared here so it is typed and reaches the
   *  generated API — listen for it to drive maximize from your own chrome, or
   *  re-emit it to trigger one. */
  'kai-maximize-intent': { requested: boolean };
}

/**
 * `<kai-artifact>` — a framed, switchable generated-artifact viewer: a sandboxed
 * preview iframe with a functional nav toolbar (back · forward · reload · home +
 * editable path field) and a Preview|Code toggle; the Code tab shows a file tree
 * (`<kai-file-tree>`) + the active file's source via `<kai-code-block>`. The
 * component self-navigates the iframe and emits `kai-navigate` / `kai-tab-change` /
 * `kai-file-select`. Designed to FILL its container (e.g. a `<kai-resizable>` panel).
 */
defineWebComponent<Props, Events>('kai-artifact', {
  src: undefined,
  files: [],
  tab: undefined,
  defaultTab: undefined,
  activeFile: undefined,
  sandbox: 'allow-scripts allow-forms',
  iframeTitle: undefined,
  maximized: false,
  expandable: false,
  openInTab: false,
  noNav: false,
  noReload: false,
  noHome: false,
  noPathField: false,
  noTabs: false,
  standalone: false,
  readonlyPath: false,
  displayUrl: undefined,
}, (props, { element, dispatch, flag, expose }) => {
  const [maximized, setMaximized] = createSignal(flag('maximized'));

  // ── Imperative API (instance methods on the host) ──────────────────────────
  // Pattern C: the Artifact component owns the history stack + tab/file/maximize
  // state and hands up a controller; the facade captures it and exposes delegating
  // methods. Every internal handler still fires its event (navigate → kai-navigate;
  // selectFile → kai-file-select; maximize/restore → kai-maximize-change). Names are
  // collision-checked against the props: openExternal (not openInTab — a prop),
  // maximize/restore (not maximized — a prop), navigate/selectFile (not src/activeFile
  // — props); NO tab-switching method (tab is a prop → switch via `el.tab`).
  let controller: ArtifactController | undefined;
  expose({
    /** Go back in the artifact's own history stack (no-op when there's no prior entry). */
    back: () => controller?.back(),
    /** Go forward in the history stack (no-op when there's no forward entry). */
    forward: () => controller?.forward(),
    /** Force-reload the current preview url (also re-renders an inline PDF). */
    reload: () => controller?.reload(),
    /** Navigate to the `src` home url (no-op when there's no `src`). */
    home: () => controller?.home(),
    /** Push + load a url in the preview — the path-field submit path (fires kai-navigate). */
    navigate: (url: string) => controller?.navigate(url),
    /** Select a file by path: highlights the tree, shows its source, navigates the
     *  preview (fires kai-file-select + kai-navigate). Named selectFile to avoid the
     *  `activeFile` prop. */
    selectFile: (path: string) => controller?.selectFile(path),
    /** Open the current url in a new browser tab (no-op when there's no concrete url).
     *  Named openExternal, NOT openInTab — that's a prop (toolbar button visibility). */
    openExternal: () => controller?.openExternal(),
    /** Enter the maximized view-state (fires kai-maximize-change{maximized:true}).
     *  Named maximize, NOT maximized — that's a prop. */
    maximize: () => controller?.maximize(),
    /** Exit the maximized view-state (fires kai-maximize-change{maximized:false}). */
    restore: () => controller?.restore(),
  });

  const onMaximizeChange = (next: boolean) => {
    setMaximized(next);
    // 1) The PROTOCOL intent — raw, bubbling + composed (NOT via dispatch()).
    element.dispatchEvent(
      new CustomEvent('kai-maximize-intent', { detail: { requested: next }, bubbles: true, composed: true }),
    );
    // 2) The PUBLIC observable event (non-bubbling, on the host).
    dispatch('kai-maximize-change', { maximized: next });
  };

  // Authoritative reconcile: the resizable tells us the effective state.
  onMount(() => {
    const onState = (e: Event) => setMaximized((e as CustomEvent<{ maximized: boolean }>).detail.maximized);
    element.addEventListener('kai-maximize-state', onState);
    onCleanup(() => element.removeEventListener('kai-maximize-state', onState));
  });

  return (
    <>
      {/* The artifact fills its container; the internal column flex (toolbar
          flex-shrink:0, body flex:1/min-height:0) is in the Solid component. Wrap
          in a definite `1fr` grid cell (NOT :host) so the facade's sibling
          portal-mount div can't steal a grid track — see resizable.tsx. */}
      <style>{':host{display:block;height:100%;min-height:0}'}</style>
      <div
        style={{
          display: 'grid',
          'grid-template-rows': 'minmax(0, 1fr)',
          'grid-template-columns': 'minmax(0, 1fr)',
          height: '100%',
          'min-height': '0',
        }}
      >
        <Artifact
          src={props.src}
          files={props.files}
          tab={props.tab}
          defaultTab={props.defaultTab}
          activeFile={props.activeFile}
          sandbox={props.sandbox}
          iframeTitle={props.iframeTitle}
          maximized={maximized()}
          expandable={flag('expandable')}
          openInTab={flag('openInTab')}
          showNav={!flag('noNav')}
          showReload={!flag('noReload')}
          showHome={!flag('noHome')}
          showPathField={!flag('noPathField')}
          showTabs={!flag('noTabs')}
          standalone={flag('standalone')}
          readonlyPath={flag('readonlyPath')}
          displayUrl={props.displayUrl}
          onMaximizeChange={onMaximizeChange}
          onNavigate={(url) => dispatch('kai-navigate', { url })}
          onTabChange={(tab) => dispatch('kai-tab-change', { tab })}
          onFileSelect={(path) => dispatch('kai-file-select', { path })}
          controllerRef={(c) => (controller = c)}
        />
      </div>
    </>
  );
});
