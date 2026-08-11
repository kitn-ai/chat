// Component registration implementation. Importing this file defines all kitn
// custom elements as a side effect. It is dynamically imported (browser-only)
// from ./register.ts so the elements entry is SSR-import-safe — see the comment
// there. This file is hand-maintained (the generator gen-element-api.mjs SKIPs
// register.ts AND this file); keep the component import list here in sync.
import './conversation-list';
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
// Input & search field family
import './input';
import './search';
import './kbd';
import './editable-label';
