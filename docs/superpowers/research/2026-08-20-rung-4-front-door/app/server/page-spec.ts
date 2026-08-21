/**
 * The "model" behind the mock: a deterministic prompt -> page-spec folder.
 *
 * The client sends the whole thread on every turn (toOpenAIMessages), and card
 * parts are never encoded — so the server sees the user's words and nothing
 * else. That makes folding the spec out of the history the simplest correct
 * thing: no session state, and a reload replays to the same page.
 */

export type PageSpec = {
  /** Brand shown in the header and the hero. */
  brand: string;
  /** What the site is about, in the user's own words ("coffee shop"). */
  subject: string;
  tagline: string;
  blurb: string;
  cta: string;
  features: { title: string; body: string; icon: string }[];
  accent: string;
  /** Page background/base scheme. */
  scheme: 'light' | 'dark';
  /** The header bar specifically — the "make the header dark" knob. */
  headerDark: boolean;
  font: 'sans' | 'serif' | 'mono';
  radius: number;
  heroSize: 'regular' | 'large';
  sections: {
    pricing: boolean;
    testimonials: boolean;
    faq: boolean;
    contact: boolean;
    gallery: boolean;
  };
};

type Preset = Pick<PageSpec, 'brand' | 'tagline' | 'blurb' | 'cta' | 'features' | 'accent'>;

const PRESETS: Record<string, Preset> = {
  coffee: {
    brand: 'Ember & Oak',
    tagline: 'Small-batch coffee, roasted the morning you drink it.',
    blurb:
      'A neighbourhood roastery pulling shots from single-origin beans we cup ourselves. Pastries out of the oven at seven, doors open until four.',
    cta: 'Find the shop',
    accent: '#b4531f',
    features: [
      { icon: '☕', title: 'Roasted in-house', body: 'Every bag leaves the drum within 24 hours of hitting your cup.' },
      { icon: '🥐', title: 'Baked at dawn', body: 'Laminated pastry, sourdough and a rotating seasonal tart.' },
      { icon: '🌍', title: 'Traceable beans', body: 'One farm, one lot, one price we publish on the bag.' },
    ],
  },
  bakery: {
    brand: 'Flourish',
    tagline: 'Bread with a long, slow, stubborn rise.',
    blurb: 'Forty-eight hour ferments, stone-milled flour, and a queue that starts before we unlock the door.',
    cta: 'See today’s bakes',
    accent: '#c2761a',
    features: [
      { icon: '🍞', title: '48-hour ferment', body: 'Wild starter kept alive since the shop opened.' },
      { icon: '🌾', title: 'Stone-milled flour', body: 'Milled by a farm two valleys over, never bleached.' },
      { icon: '🧺', title: 'Standing orders', body: 'Reserve a loaf a week and it’s bagged before you arrive.' },
    ],
  },
  restaurant: {
    brand: 'Table Nine',
    tagline: 'A short menu that changes when the market does.',
    blurb: 'Nine tables, one kitchen, and whatever looked best at the market this morning. Dinner from six, Tuesday to Saturday.',
    cta: 'Book a table',
    accent: '#8b2f3f',
    features: [
      { icon: '🍽️', title: 'Daily menu', body: 'Written each afternoon, printed each evening.' },
      { icon: '🥬', title: 'Market-led', body: 'Produce from growers we can name and usually visit.' },
      { icon: '🍷', title: 'Low-intervention list', body: 'Forty bottles, all of them poured by the glass.' },
    ],
  },
  gym: {
    brand: 'Basecamp Strength',
    tagline: 'Coaching that starts where you actually are.',
    blurb: 'Small-group barbell classes and one-to-one coaching, programmed by people who write it down and check on it.',
    cta: 'Book a free session',
    accent: '#1f7a5a',
    features: [
      { icon: '🏋️', title: 'Six to a class', body: 'Enough eyes on the bar to fix it before it becomes a habit.' },
      { icon: '📈', title: 'Written programming', body: 'Your block is planned twelve weeks out and adjusted weekly.' },
      { icon: '🕕', title: 'Open 5am–9pm', body: 'Staffed hours every day, open gym in between.' },
    ],
  },
  saas: {
    brand: 'Northpass',
    tagline: 'Ship your changelog before your users ask for it.',
    blurb: 'Northpass turns your merged pull requests into a release note your customers actually read. Set it up once, forget it exists.',
    cta: 'Start free',
    accent: '#4f46e5',
    features: [
      { icon: '⚡', title: 'Zero-config import', body: 'Point it at a repo; the first draft is waiting in ten minutes.' },
      { icon: '🧭', title: 'Written for humans', body: 'Grouped by what changed for the user, not by commit.' },
      { icon: '🔒', title: 'SOC 2 Type II', body: 'Your source never leaves the region you pick.' },
    ],
  },
  portfolio: {
    brand: 'Ines Alvara',
    tagline: 'Design work for people who ship.',
    blurb: 'Ten years of product design across fintech, health and a stubborn amount of developer tooling. Currently taking projects for the spring.',
    cta: 'See selected work',
    accent: '#7c3aed',
    features: [
      { icon: '🎯', title: 'Product design', body: 'From the messy first map to the pixels that ship.' },
      { icon: '🧪', title: 'Research', body: 'Five users, one week, findings you can act on.' },
      { icon: '🧩', title: 'Design systems', body: 'Tokens, components, and the docs nobody else writes.' },
    ],
  },
  agency: {
    brand: 'Fieldwork',
    tagline: 'A small studio for brands that need to move.',
    blurb: 'Strategy, identity and the site to put it on. Four people, one project at a time, six weeks start to finish.',
    cta: 'Start a project',
    accent: '#0f766e',
    features: [
      { icon: '🧭', title: 'Strategy first', body: 'A week of interviews before anyone opens a design tool.' },
      { icon: '🎨', title: 'Identity', body: 'Marks, type, motion, and the rules that keep it together.' },
      { icon: '🚀', title: 'Build', body: 'We hand over a site your team can edit without us.' },
    ],
  },
  event: {
    brand: 'Signal Conf',
    tagline: 'Two days, one track, no filler.',
    blurb: 'Fourteen talks on building software that lasts, in a room small enough to meet everyone in it.',
    cta: 'Get a ticket',
    accent: '#d9480f',
    features: [
      { icon: '🎤', title: 'One track', body: 'Everyone sees every talk. No hallway FOMO.' },
      { icon: '🤝', title: '300 attendees', body: 'Capped deliberately so the hallway works.' },
      { icon: '📼', title: 'Recorded', body: 'Every talk online within a week, free.' },
    ],
  },
};

const SUBJECT_MATCHERS: [RegExp, keyof typeof PRESETS][] = [
  [/\b(coffee|espresso|cafe|café|roaster)\b/, 'coffee'],
  [/\b(bakery|baker|bread|patisserie|pastry)\b/, 'bakery'],
  [/\b(restaurant|bistro|diner|kitchen|eatery)\b/, 'restaurant'],
  [/\b(gym|fitness|crossfit|training|yoga|pilates)\b/, 'gym'],
  [/\b(saas|startup|app|platform|product|api|dev\s?tool)\b/, 'saas'],
  [/\b(portfolio|designer|photographer|freelance|resume|cv)\b/, 'portfolio'],
  [/\b(agency|studio|consultancy|consulting)\b/, 'agency'],
  [/\b(conference|conf|meetup|event|summit|workshop)\b/, 'event'],
];

const COLORS: Record<string, string> = {
  red: '#c02b2b',
  orange: '#d9480f',
  amber: '#b45309',
  yellow: '#ca8a04',
  green: '#15803d',
  emerald: '#047857',
  teal: '#0f766e',
  blue: '#1d4ed8',
  indigo: '#4338ca',
  violet: '#6d28d9',
  purple: '#7c3aed',
  pink: '#be185d',
  magenta: '#a21caf',
  brown: '#7c4a21',
  black: '#111827',
  grey: '#4b5563',
  gray: '#4b5563',
};

/** Pull a plausible brand out of "a landing page for Blue Bottle Coffee". */
function brandFromPrompt(prompt: string): string | null {
  const m = prompt.match(/\b(?:for|called|named)\s+(?:my|our|a|an|the)?\s*([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/);
  if (!m) return null;
  const candidate = m[1].trim();
  // "For Me" and friends are not brands.
  if (/^(me|us|my|our|the|a|an)$/i.test(candidate)) return null;
  return candidate;
}

function subjectFromPrompt(prompt: string): string | null {
  const m = prompt.match(/\b(?:page|site|website|landing page)\s+for\s+(?:a|an|my|our|the)?\s*([\w\s&'-]{2,40})/i);
  if (m) return m[1].trim().replace(/\s+$/, '');
  return null;
}

function basePreset(prompt: string): { preset: Preset; key: string } {
  const lower = prompt.toLowerCase();
  for (const [re, key] of SUBJECT_MATCHERS) {
    if (re.test(lower)) return { preset: PRESETS[key], key };
  }
  return { preset: PRESETS.saas, key: 'saas' };
}

/** The first user turn decides what the page IS. */
function seedSpec(prompt: string): PageSpec {
  const { preset } = basePreset(prompt);
  const subject = subjectFromPrompt(prompt) ?? 'your project';
  const brand = brandFromPrompt(prompt) ?? preset.brand;
  return {
    brand,
    subject,
    tagline: preset.tagline,
    blurb: preset.blurb,
    cta: preset.cta,
    features: preset.features.map((f) => ({ ...f })),
    accent: preset.accent,
    scheme: 'light',
    headerDark: false,
    font: 'sans',
    radius: 14,
    heroSize: 'regular',
    sections: { pricing: false, testimonials: false, faq: false, contact: false, gallery: false },
  };
}

/** One human-readable sentence per edit, so the reply can say what it did. */
export type Edit = { spec: PageSpec; notes: string[] };

const SECTION_WORDS: [RegExp, keyof PageSpec['sections'], string][] = [
  [/\b(pricing|prices|plans?|tiers?)\b/, 'pricing', 'a three-tier pricing block'],
  [/\b(testimonials?|reviews?|quotes?|social proof)\b/, 'testimonials', 'a testimonials row'],
  [/\b(faqs?|questions?)\b/, 'faq', 'an FAQ list'],
  [/\b(contact|get in touch|enquiry|inquiry|email form|sign.?up form)\b/, 'contact', 'a contact form'],
  [/\b(galleries|gallery|photos?|images?|screenshots?)\b/, 'gallery', 'a gallery strip'],
];

/** Later user turns EDIT the page. Every knob the mock understands lives here. */
function applyEdit(spec: PageSpec, prompt: string): string[] {
  const p = prompt.toLowerCase();
  const notes: string[] = [];
  const removing = /\b(remove|delete|drop|get rid of|take out|without)\b/.test(p);

  if (/\bheader\b/.test(p) && /\b(dark|black|night|charcoal)\b/.test(p)) {
    spec.headerDark = true;
    notes.push('darkened the header bar');
  }
  if (/\bheader\b/.test(p) && /\b(light|white|bright)\b/.test(p)) {
    spec.headerDark = false;
    notes.push('lightened the header bar');
  }
  if (/\b(dark mode|dark theme|make it dark|go dark|darker overall|whole page dark)\b/.test(p)) {
    spec.scheme = 'dark';
    spec.headerDark = true;
    notes.push('switched the whole page to a dark scheme');
  }
  if (/\b(light mode|light theme|make it light|back to light)\b/.test(p)) {
    spec.scheme = 'light';
    notes.push('switched the page back to the light scheme');
  }

  for (const [word, hex] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${word}\\b`).test(p) && /\b(accent|colou?r|brand|buttons?|links?|theme|palette|make it)\b/.test(p)) {
      spec.accent = hex;
      notes.push(`moved the accent colour to ${word}`);
      break;
    }
  }
  const hex = p.match(/#[0-9a-f]{6}\b/);
  if (hex) {
    spec.accent = hex[0];
    notes.push(`set the accent to ${hex[0]}`);
  }

  if (/\b(serif|elegant type|classy type)\b/.test(p)) {
    spec.font = 'serif';
    notes.push('switched the type to a serif');
  }
  if (/\b(mono|monospace|technical type)\b/.test(p)) {
    spec.font = 'mono';
    notes.push('switched the type to a monospace');
  }
  if (/\b(sans|clean type|modern type)\b/.test(p) && !/\bserif\b/.test(p)) {
    spec.font = 'sans';
    notes.push('switched the type back to a sans');
  }

  if (/\b(bigger|larger|taller|full.?screen|full.?height)\b.*\bhero\b|\bhero\b.*\b(bigger|larger|taller|full.?screen|full.?height)\b/.test(p)) {
    spec.heroSize = 'large';
    notes.push('grew the hero to full height');
  }
  if (/\b(smaller|shorter|compact)\b.*\bhero\b|\bhero\b.*\b(smaller|shorter|compact)\b/.test(p)) {
    spec.heroSize = 'regular';
    notes.push('brought the hero back to its regular height');
  }

  if (/\b(rounded|round corners|softer corners|pill)\b/.test(p)) {
    spec.radius = 22;
    notes.push('rounded the corners');
  }
  if (/\b(sharp|square corners|no radius|hard edges)\b/.test(p)) {
    spec.radius = 0;
    notes.push('squared off the corners');
  }

  for (const [re, key, label] of SECTION_WORDS) {
    if (re.test(p)) {
      const on = !removing;
      if (spec.sections[key] !== on) {
        spec.sections[key] = on;
        notes.push(`${on ? 'added' : 'removed'} ${label}`);
      }
    }
  }

  const rename = p.match(/\b(?:call it|rename it to|name it|brand it)\s+([\w\s&'.-]{2,40})/);
  if (rename) {
    spec.brand = titleCase(rename[1].trim());
    notes.push(`renamed the brand to ${spec.brand}`);
  }

  const headline = prompt.match(/\b(?:headline|tagline|title)\s+(?:to|reads?|says?)\s*["“']?([^"”'\n]{3,90})["”']?/i);
  if (headline) {
    spec.tagline = headline[1].trim();
    notes.push('rewrote the headline');
  }

  return notes;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Fold the whole user history into one spec.
 *
 * `prompts[0]` seeds; every later prompt edits. Returns the notes for the LAST
 * prompt only — that is what the reply talks about.
 */
export function foldSpec(prompts: string[]): { spec: PageSpec; notes: string[]; isFirst: boolean } {
  const real = prompts.map((p) => p.trim()).filter(Boolean);
  if (real.length === 0) return { spec: seedSpec(''), notes: [], isFirst: true };
  const spec = seedSpec(real[0]);
  let notes: string[] = [];
  // The seed prompt can also carry edits ("dark landing page for a gym").
  notes = applyEdit(spec, real[0]);
  for (let i = 1; i < real.length; i += 1) {
    notes = applyEdit(spec, real[i]);
  }
  return { spec, notes, isFirst: real.length === 1 };
}
