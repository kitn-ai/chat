import { createSignal } from 'solid-js';
import { defineWebComponent } from './define';
import { Reasoning, ReasoningTrigger, ReasoningContent, type ReasoningController } from '../components/reasoning';
import { ChatConfig, useChatConfig } from '../primitives/chat-config';
import { wireDisclosure } from './disclosure';

interface Props extends Record<string, unknown> {
  /** The reasoning text to display. */
  text: string;
  /** Trigger label. */
  label?: string;
  /** Drive/observe open state (Shoelace-style: settable + reflected to the `open`
   *  attribute; the element still self-manages on trigger click + while
   *  streaming). Set `el.open = true`; listen for `kai-open-change`. */
  open?: boolean;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** While true, auto-expands (and re-collapses when it flips false). */
  streaming?: boolean;
  /** Render `text` as markdown. */
  markdown?: boolean;
  /** Gate the disclosure trigger: programmatic `show()/hide()/toggle()` still
   *  work, but the trigger click no longer toggles. */
  disabled?: boolean;
}

/** Events fired by `<kai-reasoning>`. */
interface Events {
  /** The reasoning block expanded or collapsed (via the trigger, streaming
   *  auto-open, or a method). */
  'kai-open-change': { open: boolean };
}

/**
 * `<kai-reasoning>` — a collapsible reasoning/thinking block that auto-expands
 * while `streaming`. Text via the `text` property; `markdown`/`streaming` flags.
 * Open state is the standard disclosure surface: settable+reflecting `open`,
 * `kai-open-change`, and `show()`/`hide()`/`toggle()` (gated by `disabled`);
 * seed with `defaultOpen`.
 */
defineWebComponent<Props, Events>('kai-reasoning', {
  text: '',
  label: 'Reasoning',
  open: undefined,
  defaultOpen: undefined,
  streaming: false,
  markdown: true,
  disabled: undefined,
}, (props, ctx) => {
  const { flag } = ctx;
  const outer = useChatConfig();
  // V2-PORT: a reactive signal, not a plain `let` — the disclosure/controller
  // effects track it, and ownedWrite sanctions the synchronous hand-up from
  // the primitive's body (see elements/tool.tsx, the same fix).
  const [api, setApi] = createSignal<ReasoningController | undefined>(undefined, { ownedWrite: true });

  // The standard disclosure surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle, disabled-gating. See ./disclosure. This is the SOLE emitter
  // of kai-open-change — we no longer dispatch it from Reasoning's onOpenChange.
  wireDisclosure(ctx, api, () => props.open);

  return (
    <ChatConfig portalMount={outer.portalMount()}>
      <Reasoning
        defaultOpen={flag('defaultOpen')}
        isStreaming={flag('streaming')}
        disabled={flag('disabled')}
        controllerRef={(a) => setApi(a)}
      >
        <ReasoningTrigger>{props.label}</ReasoningTrigger>
        <ReasoningContent markdown={flag('markdown')}>{props.text}</ReasoningContent>
      </Reasoning>
    </ChatConfig>
  );
});
