import type { Component, JSX } from 'solid-js';
import {
  Plus, Paperclip, Github, Globe, Sparkles, Settings,
  FileText, Folder, Image, Monitor, MessageCircle, MessageSquare, Search,
  Mic, AudioLines, X, ChevronDown, ChevronLeft,
  Pencil, BookOpen, Code, Smile,
  Share, ArrowLeft, MoreHorizontal,
  House, Clock, Lock, Box, Briefcase, PanelLeft, Circle, SlidersHorizontal, Workflow, SquarePen,
  Archive, ArrowUp, Bookmark, Copy, Ellipsis, ExternalLink, Flag,
  GitBranch, GitPullRequest, ListFilter, RotateCw,
  Moon, Sun,
  // Device / viewport glyphs.
  Tablet, Smartphone, Laptop,
  // Direction glyphs completing the chevron + arrow quartets.
  ChevronRight, ChevronUp, ArrowRight, ArrowDown, PanelRight,
  // Status glyphs (kai-notice / kai-toast / kai-tool render these already).
  Check, Info, TriangleAlert, CircleCheck, CircleAlert, CircleX,
  // Action glyphs the kit performs but could not be named.
  Trash2, Download, Upload, Link, RotateCcw,
  // Pane / media chrome.
  Maximize2, Minimize2, Eye, EyeOff, Bell, Square, Minus, Play,
} from 'lucide-solid';

type IconComponent = Component<{ class?: string }>;

/** Curated name → lucide-solid component map for item icons in kai-menu /
 *  kai-command. Extend here when new named icons are needed. */
const NAMED_ICONS: Record<string, IconComponent> = {
  plus: Plus,
  paperclip: Paperclip,
  github: Github,
  globe: Globe,
  sparkles: Sparkles,
  settings: Settings,
  'file-text': FileText,
  folder: Folder,
  image: Image,
  monitor: Monitor,
  'message-circle': MessageCircle,
  'message-square': MessageSquare,
  search: Search,
  mic: Mic,
  'audio-lines': AudioLines,
  x: X,
  'chevron-down': ChevronDown,
  pencil: Pencil,
  'book-open': BookOpen,
  code: Code,
  smile: Smile,
  // Header / chrome glyphs.
  share: Share,
  'arrow-left': ArrowLeft,
  'more-horizontal': MoreHorizontal,
  'chevron-left': ChevronLeft,
  // App-shell glyphs (sidebar nav, recents, filters).
  home: House,
  clock: Clock,
  lock: Lock,
  box: Box,
  briefcase: Briefcase,
  'panel-left': PanelLeft,
  circle: Circle,
  'sliders-horizontal': SlidersHorizontal,
  workflow: Workflow,
  'square-pen': SquarePen,
  // Code-app / dev-tool glyphs (git, filters, list actions).
  archive: Archive,
  'arrow-up': ArrowUp,
  bookmark: Bookmark,
  copy: Copy,
  ellipsis: Ellipsis,
  'external-link': ExternalLink,
  flag: Flag,
  'git-branch': GitBranch,
  'git-pull-request': GitPullRequest,
  'list-filter': ListFilter,
  'rotate-cw': RotateCw,
  // Theme / appearance glyphs.
  moon: Moon,
  sun: Sun,
  // Device / viewport glyphs. `desktop` and `mobile` are aliases onto the same
  // components as `monitor`/`smartphone` — lucide's names are not the words a
  // consumer reaches for, and an alias costs nothing in the bundle.
  desktop: Monitor,
  laptop: Laptop,
  tablet: Tablet,
  smartphone: Smartphone,
  mobile: Smartphone,
  // Direction glyphs — chevron-down/left and arrow-left/up were here without
  // their opposites; both quartets are now complete.
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'arrow-right': ArrowRight,
  'arrow-down': ArrowDown,
  'panel-right': PanelRight,
  // Status glyphs. kai-notice / kai-toast / kai-tool already paint these, so a
  // host building matching UI needs to be able to name them.
  check: Check,
  info: Info,
  'triangle-alert': TriangleAlert,
  'circle-check': CircleCheck,
  'circle-alert': CircleAlert,
  'circle-x': CircleX,
  // Action glyphs. `trash`/`download`/`link` match the keys action-icons.ts
  // already uses for message actions; `upload` is download's missing sibling.
  trash: Trash2,
  download: Download,
  upload: Upload,
  link: Link,
  'rotate-ccw': RotateCcw,
  // Pane / media chrome (kai-pane, kai-artifact, kai-embed, kai-agent-card).
  'maximize-2': Maximize2,
  'minimize-2': Minimize2,
  eye: Eye,
  'eye-off': EyeOff,
  bell: Bell,
  square: Square,
  minus: Minus,
  play: Play,
};

/** Every curated icon name, sorted. Derived from `NAMED_ICONS` so a gallery,
 *  a story control or a test can never drift from the map itself. */
export const ICON_NAMES: readonly string[] = Object.keys(NAMED_ICONS).sort();

/** Render an item icon.
 *
 *  Resolution order:
 *  1. Known icon name (e.g. `"paperclip"`) → lucide-solid component.
 *  2. URL / absolute path / data-URI → `<img>`.
 *  3. Anything else → `<span>` text fallback.
 *  Returns `null` when `icon` is undefined/empty.
 *
 *  The img and span branches render different markup, so they accept different
 *  class options: `imgClass` for the `<img>`, `spanClass` for the `<span>`.
 *  `class` is a shared fallback. Pass `ariaHidden` to mark the span decorative. */
export function renderIcon(
  icon: string | undefined,
  opts?: { class?: string; imgClass?: string; spanClass?: string; ariaHidden?: boolean },
): JSX.Element {
  if (!icon) return null;
  const Named = NAMED_ICONS[icon];
  if (Named) {
    return <Named class={opts?.imgClass ?? opts?.class ?? 'mr-2 size-4 shrink-0'} />;
  }
  const isUrl = /^(https?:|\/|data:)/.test(icon);
  // DEV footgun guard: a kebab/identifier-shaped string that isn't a URL and
  // isn't a known name is almost certainly a typo'd/unregistered icon (e.g.
  // `icon="share"` before it was added) — it would silently paint as literal
  // text. Warn in dev only; emoji/arbitrary text passes through untouched.
  if (import.meta.env.DEV && !isUrl && /^[a-z][a-z0-9-]*$/.test(icon)) {
    console.warn(
      `[kai-icon] unknown icon name "${icon}" — rendering as text. ` +
        'Add it to NAMED_ICONS in src/ui/icon.tsx, or pass a URL / an inline SVG via slot="icon".',
    );
  }
  return isUrl
    ? <img src={icon} alt="" class={opts?.imgClass ?? opts?.class ?? 'size-4 shrink-0'} />
    : (
      <span
        class={opts?.spanClass ?? opts?.class ?? 'size-4 shrink-0'}
        aria-hidden={opts?.ariaHidden ? 'true' : undefined}
      >
        {icon}
      </span>
    );
}
