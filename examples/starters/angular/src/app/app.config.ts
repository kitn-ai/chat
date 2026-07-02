import { type ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';

// Minimal standalone bootstrap config. No router/HTTP needed for the demo; the kit
// elements register in main.ts before bootstrap. Angular 22 is zoneless by default —
// no zone.js polyfill. The app is fully signal-based (the chat/conversation stores
// use signals, components are OnPush-friendly) and the template `(kai-*)` event
// bindings schedule change detection, so streaming/theme/switch/collapse all update
// without Zone.
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection()],
};
