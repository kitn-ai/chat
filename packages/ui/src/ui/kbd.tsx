import { For, Show, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export type KbdPlatform = 'auto' | 'mac' | 'other';

export interface KbdProps extends JSX.HTMLAttributes<HTMLElement> {
  /** Shortcut spec — tokens joined by `+` (e.g. `Mod+Shift+K`). When omitted,
   *  children render verbatim. Display only; `kai-kbd` does not bind keys. */
  keys?: string;
  /** Glyph platform. `mac` uses ⌘/⌥; `other` uses Ctrl. `auto` (default for the
   *  facade) sniffs the OS, SSR-safe (falls back to `other` on the server). */
  platform?: KbdPlatform;
  /** Cap size. Defaults to `md`. */
  size?: 'sm' | 'md';
}

/** SSR-safe mac check: prefers UA-CH `platform`, falls back to `navigator.platform`. */
function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /mac/i.test(platform);
}

/** Resolve `auto` to a concrete platform; `mac`/`other` pass through. */
function resolvePlatform(platform: KbdPlatform): 'mac' | 'other' {
  if (platform === 'mac') return 'mac';
  if (platform === 'other') return 'other';
  return isMacOS() ? 'mac' : 'other';
}

/** Map a single token to its display glyph. Unknown tokens uppercase (so `k` → `K`). */
function glyph(token: string, mac: boolean): string {
  const t = token.trim();
  switch (t.toLowerCase()) {
    case 'mod':
      return mac ? '⌘' : 'Ctrl';
    case 'cmd':
    case 'command':
    case 'meta':
      return '⌘';
    case 'ctrl':
    case 'control':
      return 'Ctrl';
    case 'shift':
      return '⇧';
    case 'alt':
    case 'opt':
    case 'option':
      return '⌥';
    case 'arrowup':
      return '↑';
    case 'arrowdown':
      return '↓';
    case 'arrowleft':
      return '←';
    case 'arrowright':
      return '→';
    case 'enter':
    case 'return':
      return '⏎';
    case 'esc':
    case 'escape':
      return 'Esc';
    case 'space':
      return 'Space';
    default:
      return t.toUpperCase();
  }
}

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-5 min-w-5 px-1 text-[11px]',
  md: 'h-6 min-w-6 px-1.5 text-xs',
};

/**
 * `Kbd`: a keyboard-shortcut display. Splits `keys` on `+`, maps each token to a
 * platform glyph (`Mod` → ⌘ on mac else Ctrl, `Shift` → ⇧, `ArrowUp` → ↑, …) and
 * renders each as an inset `part="key"` cap, with an empty `part="separator"` hook
 * between caps. Token-driven, light + dark. Display only — it does not bind keys.
 *
 * When `keys` is omitted, the children render verbatim (use any custom content).
 */
export function Kbd(props: KbdProps): JSX.Element {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'keys', 'platform', 'size', 'class', 'children');
  const mac = () => resolvePlatform(local.platform ?? 'other') === 'mac';
  const tokens = () =>
    (local.keys ?? '')
      .split('+')
      .map((t) => t.trim())
      .filter(Boolean);

  return (
    <kbd {...rest} class={cn('inline-flex items-center gap-0.5 align-middle font-sans', local.class)}>
      <Show when={local.keys != null} fallback={local.children}>
        <For each={tokens()}>
          {(token, i) => (
            <>
              <Show when={i() > 0}>
                <span part="separator" aria-hidden="true" class="text-muted-foreground" />
              </Show>
              <span
                part="key"
                class={cn(
                  'inline-flex items-center justify-center rounded border border-border bg-muted font-medium leading-none tabular-nums text-muted-foreground',
                  SIZE[local.size ?? 'md'],
                )}
              >
                {glyph(token, mac())}
              </span>
            </>
          )}
        </For>
      </Show>
    </kbd>
  );
}
