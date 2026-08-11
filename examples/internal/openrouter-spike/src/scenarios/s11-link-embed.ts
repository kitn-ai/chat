import type { Scenario } from './types';
import { pickTools } from '../tools';
import { seesRole, seesText } from './dom';

/** S11 — the two NON-interactive card types, which take a different route
 *  through the registry (they emit via `onEmit`, not a CardHost) and so can
 *  break independently of confirm/choice/form/tasks. */
export const s11LinkEmbed: Scenario = {
  id: 'S11-link-embed',
  title: 'Link + embed cards',
  proves: 'link and embed cards render from card parts, with their real link chrome and play facade',
  prompt:
    'Show me a preview card for https://ui.kitn.ai/guides/theming, and then embed the YouTube video with id aqz-KE-bpKQ.',
  tools: pickTools('preview_link', 'embed_video'),
  mode: 'live',
  maxRounds: 5,
  async assert(page) {
    // LinkPreview's accessible name is composed by the card itself
    // (`Open <title> on <domain>`), so matching it proves the real component
    // rendered rather than a markdown link the model wrote.
    await seesRole(page, 'link', /Open .* on ui\.kitn\.ai/, { because: 'the link card renders its own anchor' });
    await seesText(page, 'ui.kitn.ai', { because: 'the link card shows the domain line' });

    // The embed renders a click-to-play facade before any iframe exists.
    await seesRole(page, 'button', /^Play /, { because: 'the embed card renders its play facade' });
    await seesText(page, 'Open on YouTube', { because: 'the embed card offers the provider escape hatch' });
  },
};
