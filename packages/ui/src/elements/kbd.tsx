import { defineWebComponent } from './define';
import { Kbd, type KbdPlatform } from '../ui/kbd';

interface Props extends Record<string, unknown> {
  /** Shortcut spec: tokens joined by `+` (e.g. `Mod+Shift+K`). Omit it to show
   *  default-slot content instead. Display only; the element does not bind keys. */
  keys?: string;
  /** `mac` uses ⌘/⌥, `other` uses Ctrl. `auto` (default) sniffs the OS. */
  platform?: KbdPlatform;
  /** Cap size: `sm` or `md`. Defaults to `md`. */
  size?: 'sm' | 'md';
}

/**
 * `<kai-kbd>` — a keyboard-shortcut display. Feed it `keys` (tokens joined by
 * `+`) and it renders one inset cap per token, mapping each to a platform glyph
 * (`Mod` → ⌘ on mac else Ctrl, `Shift` → ⇧, `ArrowUp` → ↑, `Enter` → ⏎, …).
 * Display only — it does not bind keys.
 *
 * ```html
 * <kai-kbd keys="Mod+K"></kai-kbd>
 * <kai-kbd keys="Mod+Shift+ArrowUp" platform="mac"></kai-kbd>
 * <kai-kbd>Esc</kai-kbd> <!-- omit keys to show your own content -->
 * ```
 *
 * `platform="auto"` (default) sniffs the OS for ⌘ vs Ctrl. Restyle the caps via
 * `::part(key)` and the gaps via `::part(separator)`.
 */
defineWebComponent<Props>('kai-kbd', {
  keys: undefined,
  platform: 'auto',
  size: 'md',
}, (props) => (
  <>
    {/* Base sets `:host{display:block}`; a shortcut hint flows inline like a chip. */}
    <style>{':host{display:inline-flex}'}</style>
    <Kbd
      keys={props.keys as string | undefined}
      platform={(props.platform as KbdPlatform) ?? 'auto'}
      size={(props.size as 'sm' | 'md') ?? 'md'}
    >
      <slot />
    </Kbd>
  </>
));
