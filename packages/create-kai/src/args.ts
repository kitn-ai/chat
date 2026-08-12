/**
 * Flag parsing, kept dependency-free and pure so the non-interactive path a CI
 * run takes is testable without spawning a process.
 */
import { DEFAULT_FEATURES } from './features';
import { DEFAULT_FRAMEWORK } from './frameworks';

export interface ParsedArgs {
  /** positional target directory, if given */
  dir?: string;
  framework?: string;
  layout?: string;
  widgetStyle?: string;
  /** comma-separated on the command line, split here */
  features?: string[];
  gateway?: string;
  kit?: string;
  yes: boolean;
  install?: boolean;
  list: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
  errors: string[];
}

const TAKES_VALUE = new Set([
  '--framework',
  '--layout',
  '--widget-style',
  '--features',
  '--gateway',
  '--kit',
]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = { yes: false, list: false, json: false, help: false, version: false, errors: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let flag = arg;
    let value: string | undefined;

    if (flag.startsWith('--') && flag.includes('=')) {
      const eq = flag.indexOf('=');
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    } else if (TAKES_VALUE.has(flag)) {
      value = argv[++i];
      if (value === undefined) {
        out.errors.push(`${flag} needs a value`);
        continue;
      }
    }

    switch (flag) {
      case '--framework': out.framework = value; break;
      case '--layout': out.layout = value; break;
      case '--widget-style': out.widgetStyle = value; break;
      case '--features':
        // `--features ''` and `--features none` both mean "no features", which
        // is a real answer (the bare full-page chat), distinct from omitting it.
        out.features =
          value === undefined || value === '' || value === 'none'
            ? []
            : value.split(',').map((f) => f.trim()).filter(Boolean);
        break;
      case '--gateway': out.gateway = value; break;
      case '--kit': out.kit = value; break;
      case '-y': case '--yes': out.yes = true; break;
      case '--install': out.install = true; break;
      case '--no-install': out.install = false; break;
      case '--list': out.list = true; break;
      case '--json': out.json = true; break;
      case '-h': case '--help': out.help = true; break;
      case '-v': case '--version': out.version = true; break;
      default:
        if (flag.startsWith('-')) out.errors.push(`unknown flag ${flag}`);
        else if (out.dir === undefined) out.dir = flag;
        else out.errors.push(`unexpected argument ${flag}`);
    }
  }

  return out;
}

/**
 * The answers a bare `--yes` produces: the zero-config path, stated once.
 *
 * `none` is the prompt's label for the `mock` integration, so it is translated
 * here rather than anywhere the gateway id is consumed.
 */
export const ZERO_CONFIG = {
  name: 'kai-app',
  framework: DEFAULT_FRAMEWORK,
  layout: 'full-screen' as const,
  features: DEFAULT_FEATURES,
  gateway: 'mock',
};

/** `--gateway none` is the prompt's wording for the `mock` integration. */
export function normalizeGateway(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value === 'none' ? 'mock' : value;
}

/** npm's own name rules, reduced to what a scaffolded project can hit. */
export function validateProjectName(name: string): string | null {
  if (name.length === 0) return 'Project name cannot be empty';
  if (name.length > 214) return 'Project name must be 214 characters or fewer';
  if (name.startsWith('.') || name.startsWith('_')) return 'Project name cannot start with . or _';
  if (name !== name.toLowerCase()) return 'Project name must be lowercase';
  if (!/^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
    return 'Project name may only contain letters, digits, and - . _ ~';
  }
  return null;
}
