/** Live demos for "Attachments flow".
 *
 *  PRIMARY (InlineAttachDemo): the realistic, ship-it path. A bare
 *  <kai-prompt-input> exposes its built-in paperclip — clicking it stages files
 *  as removable chips inside the composer, no extra wiring. On kai-submit the
 *  user turn renders as a kai-message with attachments; the assistant replies.
 *
 *  SECONDARY (DropZoneAttachDemo): the optional "dedicated drop target" variant.
 *  A standalone <kai-file-upload> drop zone sits above the thread and feeds files
 *  into the composer via kai-files-added → prompt.attachments.
 *
 *  Both use imperative DOM so kai-* props are set as JS properties, not HTML
 *  attributes. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

type AnyEl = HTMLElement & Record<string, unknown>;

interface AttachmentData {
  id: string;
  type: 'file' | 'source-document';
  filename?: string;
  mediaType?: string;
  url?: string;
  title?: string;
}

interface MessagePart {
  type: 'text' | 'file';
  text?: string;
  attachment?: AttachmentData;
}

/** The staged file as a `data:` URI — the same thing `<kai-prompt-input>`'s own
 *  paperclip does (see `readAsDataUrl` in `src/elements/default-input.tsx`).
 *
 *  NOT `URL.createObjectURL`. An object URL resolves only inside the tab that
 *  minted it, so it renders a perfect thumbnail here and is meaningless to
 *  anything downstream — `toOpenAIMessages` / `toAnthropicMessages` refuse it.
 *  A data URI previews identically and is the one form both providers take. */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

const REPLY = (filenames: string[]) =>
  filenames.length === 0
    ? "No files this time — that's fine. Send text alone whenever you need to."
    : `Received ${
        filenames.length === 1
          ? `**${filenames[0]}**`
          : `${filenames.length} files (${filenames.map((f) => `**${f}**`).join(', ')})`
      }. The \`kai-submit\` event carries \`{ value, attachments }\` — forward the \`attachments\` array straight to your model API.`;

let uid = 0;
const nextId = () => `af${++uid}`;

/** Shared streaming thread + submit handling used by both demos. */
function useThread(getPrompt: () => AnyEl | undefined) {
  let threadEl: HTMLElement | undefined;
  let timer: number | undefined;
  const theme = () => document.documentElement.dataset.theme ?? 'light';

  let thread: ChatMessage[] = [];

  const setThreadEl = (el: HTMLElement) => {
    threadEl = el;
  };
  const setSeed = (seed: ChatMessage[]) => {
    thread = [...seed];
  };

  const renderThread = () => {
    if (!threadEl) return;
    const existing = Array.from(threadEl.children) as AnyEl[];
    thread.forEach((m, i) => {
      let el = existing[i];
      if (!el) {
        el = document.createElement('kai-message') as unknown as AnyEl;
        el.setAttribute('theme', theme());
        threadEl!.append(el as unknown as HTMLElement);
      }
      el.message = m;
    });
    while (threadEl.children.length > thread.length) {
      threadEl.removeChild(threadEl.lastChild!);
    }
    const scroll = threadEl.parentElement;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  };

  const onSubmit = (e: Event) => {
    const { value, attachments } = (e as CustomEvent).detail as {
      value: string;
      attachments: AttachmentData[];
    };
    const text = value.trim();
    if (!text && attachments.length === 0) return;

    const aId = nextId();
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      parts: [
        ...attachments.map((a): MessagePart => ({ type: 'file', attachment: a })),
        ...(text ? [{ type: 'text' as const, text }] : []),
      ],
    };
    thread = [...thread, userMsg, { id: aId, role: 'assistant', parts: [] }];
    renderThread();
    const prompt = getPrompt();
    if (prompt) prompt.loading = true;

    const filenames = attachments.map((a) => a.filename ?? 'file').filter(Boolean);
    const words = REPLY(filenames).split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const done = i >= words.length;
      thread = thread.map((m) =>
        m.id === aId
          ? { ...m, parts: [{ type: 'text', text: words.slice(0, i).join('') }], ...(done ? { actions: ['copy'] } : {}) }
          : m,
      );
      renderThread();
      if (!done) timer = window.setTimeout(tick, 38);
      else if (prompt) prompt.loading = false;
    };
    timer = window.setTimeout(tick, 260);
  };

  const retheme = () => {
    if (!threadEl) return;
    for (const child of Array.from(threadEl.children)) {
      (child as HTMLElement).setAttribute('theme', theme());
    }
  };

  const dispose = () => clearTimeout(timer);

  return { setThreadEl, setSeed, renderThread, onSubmit, retheme, dispose, theme };
}

// ============================================================================
// PRIMARY — inline composer attach (built-in paperclip)
// ============================================================================

const INLINE_SEED: ChatMessage[] = [
  {
    id: 'i-u0',
    role: 'user',
    parts: [
      { type: 'file', attachment: { id: 'i-prev-1', type: 'file', filename: 'design-spec.pdf', mediaType: 'application/pdf' } },
      { type: 'text', text: 'Can you review this design spec?' },
    ],
  },
  {
    id: 'i-a0',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: "Got it — I can see **design-spec.pdf** on your message above. Click the paperclip in the composer to attach a file of your own, then hit send.",
      },
    ],
    actions: ['copy'],
  },
];

function InlineAttachDemo() {
  let promptEl: AnyEl | undefined;
  const t = useThread(() => promptEl);

  onMount(async () => {
    await loadKit();
    t.setSeed(INLINE_SEED);

    if (promptEl) {
      customElements.upgrade(promptEl as HTMLElement);
      promptEl.setAttribute('placeholder', 'Attach a file with the paperclip, then ask…');
      promptEl.setAttribute('theme', t.theme());
      promptEl.addEventListener('kai-submit', t.onSubmit);
    }
    t.renderThread();

    const obs = new MutationObserver(() => {
      promptEl?.setAttribute('theme', t.theme());
      t.retheme();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      t.dispose();
      promptEl?.removeEventListener('kai-submit', t.onSubmit);
      obs.disconnect();
    });
  });

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface"
      style={{ height: '520px', display: 'flex', 'flex-direction': 'column' } as any}
    >
      <div
        style={{ flex: '1', 'min-height': '0', 'overflow-y': 'auto', padding: '16px' } as any}
      >
        <div
          ref={(el: HTMLElement) => t.setThreadEl(el)}
          style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' } as any}
        />
      </div>
      <div
        style={{
          'border-top': '1px solid var(--color-line, rgba(0,0,0,0.09))',
          padding: '12px 16px',
          'flex-shrink': '0',
        } as any}
      >
        {/* @ts-expect-error custom element */}
        <kai-prompt-input
          ref={(el: HTMLElement) => (promptEl = el as AnyEl)}
          style={{ display: 'block' }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// SECONDARY — standalone drop zone wired into the composer (optional variant)
// ============================================================================

const DROP_SEED: ChatMessage[] = [
  {
    id: 'd-a0',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Drop files onto the zone above (or click to browse). They stage in the composer below as removable chips — then hit send.',
      },
    ],
    actions: ['copy'],
  },
];

function DropZoneAttachDemo() {
  let promptEl: AnyEl | undefined;
  let uploadEl: AnyEl | undefined;
  const t = useThread(() => promptEl);
  const [stagedCount, setStagedCount] = createSignal(0);

  const onFilesAdded = async (e: Event) => {
    // Snapshot before the first await: <kai-file-upload> is free to clear its
    // own list as soon as this handler yields.
    const files: File[] = Array.from((e as CustomEvent).detail?.files ?? []);
    if (!files.length || !promptEl) return;
    const added: AttachmentData[] = await Promise.all(
      files.map(async (f) => ({
        id: crypto.randomUUID(),
        type: 'file' as const,
        filename: f.name,
        mediaType: f.type || undefined,
        // Every file, not just images, and a `data:` URI rather than
        // URL.createObjectURL. An object URL previews identically and resolves
        // only inside this tab, so the wire encoders refuse it; a document with
        // no `url` at all is unencodable for the same reason.
        url: await readAsDataUrl(f),
      })),
    );
    // The element may have gone away while we were reading.
    if (!promptEl) return;
    // Re-read AFTER the await rather than reusing a value captured before it,
    // so a second drop landing mid-read is appended to instead of overwritten.
    const current: AttachmentData[] = (promptEl.attachments as AttachmentData[] | undefined) ?? [];
    promptEl.attachments = [...current, ...added];
    setStagedCount((promptEl.attachments as AttachmentData[]).length);
  };

  const onSubmitWrapped = (e: Event) => {
    setStagedCount(0);
    t.onSubmit(e);
  };

  onMount(async () => {
    await loadKit();
    t.setSeed(DROP_SEED);

    if (uploadEl) {
      customElements.upgrade(uploadEl as HTMLElement);
      uploadEl.setAttribute('theme', t.theme());
      uploadEl.addEventListener('kai-files-added', onFilesAdded);
    }
    if (promptEl) {
      customElements.upgrade(promptEl as HTMLElement);
      promptEl.setAttribute('placeholder', 'Files dropped above land here…');
      promptEl.setAttribute('theme', t.theme());
      promptEl.addEventListener('kai-submit', onSubmitWrapped);
    }
    t.renderThread();

    const obs = new MutationObserver(() => {
      const th = t.theme();
      uploadEl?.setAttribute('theme', th);
      promptEl?.setAttribute('theme', th);
      t.retheme();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      t.dispose();
      uploadEl?.removeEventListener('kai-files-added', onFilesAdded);
      promptEl?.removeEventListener('kai-submit', onSubmitWrapped);
      obs.disconnect();
    });
  });

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface"
      style={{ height: '560px', display: 'flex', 'flex-direction': 'column' } as any}
    >
      <div
        style={{
          'border-bottom': '1px solid var(--color-line, rgba(0,0,0,0.09))',
          padding: '10px 16px',
          'flex-shrink': '0',
        } as any}
      >
        {/* @ts-expect-error custom element */}
        <kai-file-upload
          ref={(el: HTMLElement) => (uploadEl = el as AnyEl)}
          label="Drop files here or click to browse"
          style={{ display: 'block' }}
        />
      </div>

      <div style={{ flex: '1', 'min-height': '0', 'overflow-y': 'auto', padding: '16px' } as any}>
        <div
          ref={(el: HTMLElement) => t.setThreadEl(el)}
          style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' } as any}
        />
      </div>

      <div
        style={{
          'border-top': '1px solid var(--color-line, rgba(0,0,0,0.09))',
          padding: '12px 16px',
          'flex-shrink': '0',
        } as any}
      >
        {stagedCount() > 0 && (
          <div
            style={{
              'font-size': '0.75rem',
              color: 'var(--color-muted-foreground, #888)',
              'margin-bottom': '6px',
            } as any}
          >
            {stagedCount()} file{stagedCount() !== 1 ? 's' : ''} staged — hit send to attach
          </div>
        )}
        {/* @ts-expect-error custom element */}
        <kai-prompt-input
          ref={(el: HTMLElement) => (promptEl = el as AnyEl)}
          style={{ display: 'block' }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Exports — named, so the MDX can place each demo next to its narrative.
// ============================================================================

export { InlineAttachDemo, DropZoneAttachDemo };

/** Default export keeps the primary (inline) demo as the headline. */
export default InlineAttachDemo;
