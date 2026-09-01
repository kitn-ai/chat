import { defineWebComponent } from '@kitn.ai/ui/define';
import { App } from './App';

// The one facade. Interior stays pure Solid (no nested element registrations);
// the kit CSS is injected into the shadow root by defineWebComponent itself.
defineWebComponent('support-widget', { theme: 'auto' as 'light' | 'dark' | 'auto' }, () => <App />);
