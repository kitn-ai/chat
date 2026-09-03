/**
 * One block on /blocks: header line, contextual toolbar, and either the live
 * preview or the tree `create-kai add` writes.
 *
 * Composed from the kit's own kai-* elements (R1), in the site's existing idiom.
 * Array and object props are set as JS PROPERTIES, never attributes, and
 * kai-* events do not bubble so every listener is `on:` ON the element.
 *
 * THE REFS ARE SIGNALS, and that is not a style choice. The elements that
 * carry properties live inside <Show>, so they do not exist at mount and are
 * RE-CREATED every time the card changes mode. An effect over a plain `let`
 * ref reads no signal, runs once, at mount, against `undefined`: the framework
 * select would never receive its `options`, and a second entry into code mode
 * would leave a brand new kai-file-tree with no `files`. Reading `selectEl()`
 * inside the effect makes the element's arrival the dependency, so every
 * effect re-runs when its element (re)appears.
 *
 * THE TOOLBAR IS CONTEXTUAL AND ITS HEIGHT IS RESERVED. Swapping Preview and
 * Code must move nothing: the row keeps one min-height and only its middle
 * group changes.
 *
 * The file view is highlighted but NOT line-numbered. kai-code-block has no
 * line-number prop (theme, code, language, codeTheme, codeHighlight, copy,
 * proseSize) and a CSS-counter gutter faked around the element would paint
 * numbers beside a shadow root it cannot measure. Filed as a kit ticket
 * instead, and the PR body says so.
 */
import {
  createSignal,
  createEffect,
  createMemo,
  Show,
  type JSX,
} from "solid-js";
import {
  addCommandFor,
  formUrl,
  frameworkOptions,
  languageFor,
  previewUrl,
  type BlockFormId,
  type FormPayload,
  type RegistryItem,
} from "../../lib/blocks-source";
import { storeZip, zipFileName } from "./zip";
import type { SiteTheme } from "./site-theme";

const VIEWPORTS = [
  { value: "desktop", label: "Desktop", icon: "monitor", width: "100%" },
  { value: "tablet", label: "Tablet", icon: "tablet", width: "768px" },
  { value: "mobile", label: "Mobile", icon: "smartphone", width: "390px" },
] as const;

/** Set a JS property on a kai-* element. Array and object props never work as
 *  attributes (the kai- contract), and a fresh reference is what NOTIFIES. */
function prop<T>(el: HTMLElement | undefined, name: string, value: T): void {
  if (el) (el as unknown as Record<string, unknown>)[name] = value;
}

function copyText(text: string): void {
  void Promise.resolve(navigator.clipboard?.writeText(text)).catch(() => {});
}

export interface BlockCardProps {
  item: RegistryItem;
  /** The site's current theme, forwarded to every kai element: each resolves
   *  its tokens inside its own shadow root and would otherwise paint light
   *  inside the dark site. Owned by BlocksPage, one observer for the page. */
  theme: SiteTheme;
  framework: BlockFormId;
  onFramework: (form: BlockFormId) => void;
  loadForm: (id: string, form: BlockFormId) => Promise<FormPayload>;
}

export function BlockCard(props: BlockCardProps): JSX.Element {
  const [mode, setMode] = createSignal<"preview" | "code">("preview");
  const [viewport, setViewport] = createSignal<string>("desktop");
  const [payload, setPayload] = createSignal<FormPayload | undefined>();
  const [error, setError] = createSignal<string | undefined>();
  const [activePath, setActivePath] = createSignal<string | undefined>();
  const [reloadKey, setReloadKey] = createSignal(0);

  // Signals, not `let` bindings: see the header.
  const [treeEl, setTreeEl] = createSignal<HTMLElement | undefined>();
  const [selectEl, setSelectEl] = createSignal<HTMLElement | undefined>();
  const [modeEl, setModeEl] = createSignal<HTMLElement | undefined>();
  const [viewportEl, setViewportEl] = createSignal<HTMLElement | undefined>();
  const [codeEl, setCodeEl] = createSignal<HTMLElement | undefined>();

  // The tree's paths are FormFile.target, byte for byte: the path the CLI
  // writes IS the path the page displays (owner ruling, spec 3.4).
  const treeFiles = createMemo(() =>
    (payload()?.files ?? []).map((f) => ({
      path: f.target,
      code: f.content,
      language: languageFor(f.target),
    })),
  );

  const activeFile = createMemo(() => {
    const files = payload()?.files ?? [];
    return files.find((f) => f.target === activePath()) ?? files[0];
  });

  // Load the selected framework's tree when the card first enters code mode
  // and whenever the framework changes. Nothing is fetched for a card the
  // reader never opens.
  // A plain counter, deliberately NOT a signal: nothing renders from it and no
  // effect should re-run when it moves. It exists only to answer "is this
  // result still the one the reader is waiting for". Switching framework twice
  // on a slow connection can land the FIRST response last, and applying it
  // would show a framework the reader moved away from while the dropdown reads
  // the newer one.
  let latestLoad = 0;

  createEffect(() => {
    if (mode() !== "code") return;
    const form = props.framework;
    const id = props.item.name;
    const token = ++latestLoad;
    setError(undefined);
    void props
      .loadForm(id, form)
      .then((next) => {
        if (token !== latestLoad) return;
        setPayload(next);
        setActivePath(next.files[0]?.target);
      })
      .catch((err: unknown) => {
        if (token !== latestLoad) return;
        setPayload(undefined);
        // Decide loudly, and locally. A form that will not load is a broken
        // copy, not a reason to quietly drop a framework the renderers do
        // emit. The PATH comes from formUrl() here rather than from the
        // rejection: a fetch failure carries no URL, so the card is the only
        // place that still knows which file it asked for.
        setError(
          `Could not load ${formUrl(id, form)}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  });

  createEffect(() => prop(treeEl(), "files", treeFiles()));
  createEffect(() => prop(treeEl(), "activeFile", activeFile()?.target));
  createEffect(() => prop(selectEl(), "options", frameworkOptions()));
  createEffect(() => prop(selectEl(), "value", props.framework));
  createEffect(() =>
    prop(modeEl(), "options", [
      { value: "preview", label: "Preview" },
      { value: "code", label: "Code" },
    ]),
  );
  createEffect(() => prop(modeEl(), "value", mode()));
  createEffect(() =>
    prop(
      viewportEl(),
      "options",
      VIEWPORTS.map((v) => ({ value: v.value, label: v.label, icon: v.icon })),
    ),
  );
  createEffect(() => prop(viewportEl(), "value", viewport()));
  createEffect(() => prop(codeEl(), "code", activeFile()?.content ?? ""));
  createEffect(() =>
    prop(codeEl(), "language", languageFor(activeFile()?.target ?? "")),
  );
  // The element renders its own copy button by default; the file header has
  // one beside the path (spec 4), so two would be two.
  createEffect(() => prop(codeEl(), "copy", false));

  // The zip is keyed on FormFile.target, so it unzips into the project-root
  // shape `create-kai add` writes, not the form's mount-relative layout.
  const download = (): void => {
    const files = payload()?.files ?? [];
    if (files.length === 0) return;
    const blob = new Blob([storeZip(files)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipFileName(props.item.name, props.framework);
    a.click();
    // Revoke on the next frame: a synchronous revoke races the download in
    // WebKit. The kit's own attachment code takes the same shape.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  };

  const iframeWidth = createMemo(
    () => VIEWPORTS.find((v) => v.value === viewport())?.width ?? "100%",
  );

  return (
    <article
      data-testid={`block-card-${props.item.name}`}
      class="@container not-content overflow-hidden rounded-xl border border-line bg-surface"
    >
      {/* Header: title and description on ONE line. */}
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h2 class="text-base font-semibold text-ink">{props.item.title}</h2>
        <p class="min-w-0 flex-1 truncate text-sm text-ink-2">
          {props.item.description}
        </p>
      </div>

      {/* TOOLBAR. Two rows below the container breakpoint, one row above, and
          the SAME height in both modes at every width.

          The single wrapping row this replaces was the defect: at 390px
          preview wrapped to three lines and code to two, so swapping mode
          moved everything below it. Row 1 is the mode toggle and the add
          command; row 2 is the contextual group, which is exactly ONE group in
          either mode. Each row reserves a height and neither wraps, so the two
          modes cannot disagree.

          The breakpoint is a CONTAINER query on the card, not the viewport:
          the card is what the toolbar has to fit inside, and the same card
          appears at different widths on the same viewport (sidebar, splash).
          Measured heights per width are in the task report. */}
      <div class="flex flex-col gap-2 border-b border-line px-4 py-2 @4xl:min-h-12 @4xl:flex-row @4xl:items-center @4xl:gap-3">
        {/* `@4xl:contents` dissolves this row above the breakpoint so its two
            children join the single toolbar row directly. */}
        {/* Row 1 MAY wrap, and that is safe: its content (the mode toggle and
            the add command) is identical in both modes, so whatever it does it
            does the same either way. Letting it wrap is what gives the add
            command a full line on a phone instead of truncating it to half. */}
        <div
          data-testid="toolbar-row-main"
          class="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2 @4xl:contents"
        >
          <kai-segmented
            ref={setModeEl}
            attr:theme={props.theme}
            data-testid="mode-toggle"
            size="sm"
            on:kai-change={(e) =>
              setMode(e.detail.value === "code" ? "code" : "preview")
            }
          />

          {/* The add command: RIGHT, in BOTH modes, derived from this block's
              own id, with no framework in it. */}
          <div class="flex min-w-0 items-center gap-1 @4xl:order-last @4xl:ml-auto">
            <code
              data-testid="add-command"
              class="truncate rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-ink"
            >
              {addCommandFor(props.item.name)}
            </code>
            <kai-button
              attr:theme={props.theme}
              data-testid="add-copy"
              variant="ghost"
              size="icon-sm"
              icon="copy"
              label="Copy the add command"
              on:kai-click={() => copyText(addCommandFor(props.item.name))}
            />
            <kai-tooltip
              attr:theme={props.theme}
              data-testid="add-info"
              content="add detects the framework from your project. With no project it writes the single-file form."
            >
              <kai-button
                attr:theme={props.theme}
                variant="ghost"
                size="icon-sm"
                icon="info"
                label="About this command"
              />
            </kai-tooltip>
          </div>
        </div>

        {/* Row 2: the contextual group. Exactly one child in either mode, which
            is what keeps the row one line high whichever mode is showing. */}
        {/* Row 2 must NEVER wrap: its content is the one thing that differs
            between the modes, so a wrap here is the defect coming back. It
            scrolls instead, which keeps it exactly one line at any width. */}
        <div
          data-testid="toolbar-row-context"
          class="flex min-h-9 min-w-0 items-center overflow-x-auto @4xl:min-h-0 @4xl:overflow-x-visible"
        >
          <Show when={mode() === "preview"}>
            <div class="flex min-w-0 items-center gap-2">
              <div
                data-testid="viewport-group"
                class="flex items-center gap-1 rounded-md border border-line p-0.5"
              >
                <kai-segmented
                  ref={setViewportEl}
                  attr:theme={props.theme}
                  size="sm"
                  on:kai-change={(e) => setViewport(e.detail.value)}
                />
              </div>
              <kai-button
                attr:theme={props.theme}
                data-testid="preview-open"
                variant="ghost"
                size="icon-sm"
                icon="external-link"
                label="Open the preview in a new tab"
                on:kai-click={() =>
                  window.open(previewUrl(props.item.name), "_blank", "noopener")
                }
              />
              <kai-button
                attr:theme={props.theme}
                data-testid="preview-refresh"
                variant="ghost"
                size="icon-sm"
                icon="rotate-cw"
                label="Reload the preview"
                on:kai-click={() => setReloadKey((n) => n + 1)}
              />
            </div>
          </Show>

          <Show when={mode() === "code"}>
            <div class="flex min-w-0 items-center gap-2">
              <kai-select
                ref={setSelectEl}
                attr:theme={props.theme}
                data-testid="framework-select"
                label="Framework"
                on:kai-change={(e) => {
                  // Look the value up in the axis rather than casting the event's
                  // string to BlockFormId. The select's own options are the only
                  // values it can emit, so the lookup is total in practice and it
                  // is the derivation, not an assertion, that makes it so.
                  const chosen = frameworkOptions().find(
                    (o) => o.value === e.detail.value,
                  );
                  if (chosen) props.onFramework(chosen.value);
                }}
              />
              {/* Visible text is the default slot; `label` would be the accessible
              name only and this button would render icon-only. */}
              {/* Disabled until there is something to zip. A live button that
              silently does nothing is a decision made quietly; the disabled
              state says which it is. */}
              <kai-button
                attr:theme={props.theme}
                data-testid="download-zip"
                variant="ghost"
                size="sm"
                icon="download"
                disabled={!payload()}
                on:kai-click={download}
              >
                Download .zip
              </kai-button>
            </div>
          </Show>
        </div>
      </div>

      <Show when={mode() === "preview"}>
        <div class="flex justify-center bg-surface-2 p-4">
          {/* R11: scripts and same-origin, because the block needs both;
              top-level navigation, popups, forms, modals and downloads stay
              withheld. */}
          <iframe
            data-testid="preview-frame"
            title={`${props.item.title} live preview`}
            src={`${previewUrl(props.item.name)}${reloadKey() > 0 ? `?r=${reloadKey()}` : ""}`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: iframeWidth(),
              height: props.item.meta?.iframeHeight ?? "720px",
            }}
            class="max-w-full rounded-lg border border-line bg-surface"
          />
        </div>
      </Show>

      <Show when={mode() === "code"}>
        <Show
          when={!error()}
          fallback={
            <p data-testid="form-error" class="px-4 py-6 text-sm text-ink-2">
              {error()}
            </p>
          }
        >
          <div class="flex min-h-0 flex-col md:flex-row">
            <div class="w-full shrink-0 overflow-y-auto border-b border-line p-2 md:w-72 md:border-b-0 md:border-r">
              <kai-file-tree
                ref={setTreeEl}
                attr:theme={props.theme}
                data-testid="file-tree"
                on:kai-select={(e) => setActivePath(e.detail.path)}
              />
            </div>
            <div class="min-w-0 flex-1 overflow-auto p-3">
              <div class="mb-2 flex items-center gap-2">
                <span
                  data-testid="active-path"
                  class="min-w-0 truncate font-mono text-xs text-ink-2"
                >
                  {activeFile()?.target ?? ""}
                </span>
                <kai-button
                  attr:theme={props.theme}
                  data-testid="file-copy"
                  class="ml-auto"
                  variant="ghost"
                  size="icon-sm"
                  icon="copy"
                  label="Copy this file"
                  on:kai-click={() => copyText(activeFile()?.content ?? "")}
                />
              </div>
              <kai-code-block
                ref={setCodeEl}
                attr:theme={props.theme}
                data-testid="code-block"
              />
            </div>
          </div>
        </Show>
      </Show>
    </article>
  );
}
