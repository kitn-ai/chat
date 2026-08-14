import { Show } from 'solid-js';
import { Button } from '@kitn.ai/ui/solid';
import { MoonIcon, SunIcon } from './icons';
import type { Theme } from '../lib/types';

interface ThemeToggleProps {
  theme: () => Theme;
  onToggle: () => void;
}

/**
 * Light/dark switch for the top bar. Shows the moon in light mode (tap → dark)
 * and the sun in dark mode. The button is icon-only, so the glyph is decorative
 * (`aria-hidden`) and the accessible name comes from the `sr-only` span.
 */
export function ThemeToggle(props: ThemeToggleProps) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={props.onToggle}>
      <Show when={props.theme() === 'light'} fallback={<SunIcon size={18} aria-hidden />}>
        <MoonIcon size={18} aria-hidden />
      </Show>
      <span class="sr-only">Toggle light/dark theme</span>
    </Button>
  );
}
