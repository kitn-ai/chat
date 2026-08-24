// Component registration implementation. Importing this file defines all kitn
// custom elements as a side effect. It is dynamically imported (browser-only)
// from ./register.ts so the elements entry is SSR-import-safe — see the comment
// there. This file is hand-maintained (the generator gen-element-api.mjs SKIPs
// register.ts AND this file); keep the component import list here in sync.
import { installKaiDevtoolsHook } from '../diagnostics/hook';
import { emitElementRegistry } from './element-diagnostics';
import './conversation-list';
import './conversation-item';
import './prompt-input';
import './chat';
import './chat-workspace';
// Message-list composable (the scrolling thread slice, sans composer/header)
import './thread';
// Composable leaf elements (spike — see docs/handoff + examples/composable)
import './thinking-bar';
import './model-switcher';
import './attachments';
// Phase 1 — message-rendering core
import './message';
import './markdown';
import './code-block';
import './reasoning';
import './tool';
// Phase 2 — header / meta
import './context-meter';
import './feedback-bar';
import './chat-scope-picker';
// Phase 3 — input ecosystem
import './prompt-suggestions';
import './file-upload';
import './voice-input';
import './audio-visualizer';
// Phase 4 — indicators & leaves
import './loader';
import './text-shimmer';
import './image';
import './checkpoint';
import './message-skills';
import './source';
import './response-stream';
import './empty';
import './status';
import './nav';
import './progress-bar';
import './coachmark';
import './tabs';
import './voice-output';
import './screen';
import './chain-of-thought';
import './resizable';
import './file-tree';
import './artifact';
import './scroll-button';
import './popover';
import './switch';
import './button';
import './avatar';
import './badge';
import './tooltip';
import './notice';
import './icon';
import './separator';
import './scroll-area';
import './hover-card';
import './skeleton';
import './toast';
// Generative-UI cards (Card Contract)
import './card';
import './form';
import './link-preview';
import './embed';
import './confirm-card';
import './tasks';
import './choice';
import './cards';
// Dual-response comparison (preference capture)
import './compare';
// Rich text composer with entity pills, trigger menus, and keyword highlighting
import './composer';
// W3 phase 2: cascading action menu from a JSON items-tree
import './menu';
// The same Dropdown surface with a consumer-owned body: you slot the rows
// instead of handing over an items tree (the shape a framework consumer needs
// when the rows are their own components).
import './dropdown';
// W4 phase 1: grouped filterable command/mention palette
import './command';
// Prompt dock + settings building blocks (graduated from SolidJS prototypes)
import './prompt-dock';
import './segmented';
import './settings-group';
import './setting-item';
// Multi-agent workspace primitives (graduated from SolidJS prototypes)
import './pane';
import './pane-group';
import './agent-card';
import './dialog';
import './dock';
// Input & search field family
import './input';
import './search';
import './kbd';
import './editable-label';

// The devtools recorder hook, installed HERE because this file is already the
// browser-only half of the elements entry (register.ts gates it behind a window
// check and a dynamic import). So an app that registers the kai-* elements gets
// the hook with no work, while an SSR import of the entry still touches no
// global.
//
// At the BOTTOM, and it makes no difference: `import` declarations are hoisted,
// so every element module above has already evaluated by the time any statement
// in this file runs. Written here anyway so the order you read is the order that
// happens. Nothing above emits a diagnostic event, so there is nothing to miss.
//
// Idempotent and near-free: with no activation signal it allocates no buffer,
// makes no subscription, and leaves emission a guarded no-op. An app importing
// the SolidJS components directly never runs this file and must call
// `installKaiDevtoolsHook()` itself -- see the docblock in ../diagnostics/index.
installKaiDevtoolsHook();

// One registry snapshot, right after the hook installs and therefore after every
// element above has registered (import declarations are hoisted, so they all ran
// before this line).
//
// WHY HERE AND NOT INSIDE THE HOOK. The hook lives in ../diagnostics, which is
// its own rollup bundle and must stay free of any element import -- pulling the
// manifest in there would drag element bytes into a consumer who only parses
// streams. The dependency goes elements -> diagnostics, never back.
//
// WHY EMIT AT ALL WHEN A PANEL IS USUALLY NOT THERE YET. On the recording branch
// the hook has already subscribed by this point, so this snapshot lands in the
// history buffer and a panel attaching seconds later still sees the state at
// load -- which is the state that answers the hydration question. On the dormant
// branch `emitElementRegistry()` short-circuits on the active check and costs a
// symbol read.
//
// A panel attaching mid-session with no history gets no snapshot from here and
// should ask for a fresh one: `emitElementRegistry()` is exported from
// @kitn.ai/ui/elements for exactly that.
emitElementRegistry();
