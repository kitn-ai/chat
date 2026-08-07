import { Component } from '@angular/core';

/**
 * Moon glyph — shown in light mode (tap the toggle -> dark). moon/sun aren't in the
 * kit's icon set, so the example owns them. The host is `display: inline-flex` so
 * the 20x20 svg it wraps drops cleanly into `<kai-button>`'s icon slot (the parent
 * puts `slot="icon"` on this element).
 */
@Component({
  selector: 'app-moon-icon',
  standalone: true,
  templateUrl: './moon-icon.html',
  styleUrl: './moon-icon.css',
})
export class MoonIcon {}
