import { Button } from '@kitn.ai/ui/react';
import type { Theme } from '../theme';
import { MoonIcon, SunIcon } from './icons';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/**
 * Light/dark switch for the top bar. Shows the moon in light mode (tap → dark) and
 * the sun in dark mode. The `<Button>` is icon-only, so it carries the accessible
 * label; the glyph is decorative (`aria-hidden`) and sits in the `icon` slot.
 *
 * The glyph is chosen from `theme`, which is client state seeded to the same value
 * on both sides of hydration — NOT from `prefers-color-scheme`, which the server
 * cannot read and which would therefore prerender a different icon than the client
 * builds on hydration.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const Glyph = theme === 'light' ? MoonIcon : SunIcon;
  return (
    <Button theme={theme} variant="ghost" size="icon" label="Toggle light/dark theme" onClick={onToggle}>
      <Glyph slot="icon" aria-hidden />
    </Button>
  );
}
