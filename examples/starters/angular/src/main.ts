import '@kitn.ai/ui/elements'; // registers the kai-* custom elements (async)
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

// The kai-* elements register ASYNCHRONOUSLY. Angular sets array/object DOM
// properties ([conversations], [messages], [triggers], …) the moment it stamps a
// <kai-*> tag; if that happens before the element upgrades, the property write hits
// a plain, not-yet-upgraded node and is clobbered by the element's empty defaults on
// upgrade. Raw web-component consumers have no upgrade-race guard (unlike the React
// wrappers), so we gate bootstrap on `whenDefined` for every tag we use — Angular
// then binds against UPGRADED elements. Attributes survive upgrade; properties do not.
const TAGS = ['kai-resizable', 'kai-resizable-item', 'kai-conversations', 'kai-thread', 'kai-prompt-input', 'kai-button'];
Promise.all(TAGS.map((t) => customElements.whenDefined(t)))
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
