import { CUSTOM_ELEMENTS_SCHEMA, Component, input, output } from '@angular/core';
import type { Theme } from '../../types';
import { MoonIcon } from '../icons/moon-icon/moon-icon';
import { SunIcon } from '../icons/sun-icon/sun-icon';

/**
 * Light/dark switch for the top bar. Shows the moon in light mode (tap -> dark) and
 * the sun in dark mode. `<kai-button>` is icon-only, so it carries the accessible
 * `label`; the glyph is decorative (`aria-hidden`) in the `icon` slot. The native
 * click on the shadow-root button bubbles (composed), so a plain `(click)` works.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [MoonIcon, SunIcon],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './theme-toggle.html',
})
export class ThemeToggle {
  theme = input.required<Theme>();
  toggle = output<void>();
}
