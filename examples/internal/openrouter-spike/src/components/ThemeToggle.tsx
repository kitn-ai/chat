import { Button } from '@kitn.ai/ui/react';
import type { Theme } from '../App';
import { MoonIcon, SunIcon } from './icons';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/**
 * Light/dark switch for the top bar. Shows the moon in light mode (tap → dark) and
 * the sun in dark mode. The `<Button>` is icon-only, so it carries the accessible
 * label; the glyph is decorative (`aria-hidden`) and sits in the `icon` slot.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const Glyph = theme === 'light' ? MoonIcon : SunIcon;
  return (
    <Button theme={theme} variant="ghost" size="icon" label="Toggle light/dark theme" onClick={onToggle}>
      <Glyph slot="icon" aria-hidden />
    </Button>
  );
}
