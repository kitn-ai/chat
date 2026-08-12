/** Which package manager invoked us, from npm's own env var. */
export interface PackageManager {
  name: 'npm' | 'pnpm' | 'yarn' | 'bun';
  /** the install command, ready to spawn */
  install: string[];
  /** how the next-steps block spells "run the dev script" */
  run: string;
}

const KNOWN: Record<PackageManager['name'], PackageManager> = {
  npm: { name: 'npm', install: ['npm', 'install'], run: 'npm run dev' },
  pnpm: { name: 'pnpm', install: ['pnpm', 'install'], run: 'pnpm dev' },
  yarn: { name: 'yarn', install: ['yarn'], run: 'yarn dev' },
  bun: { name: 'bun', install: ['bun', 'install'], run: 'bun run dev' },
};

/**
 * `npm_config_user_agent` looks like `pnpm/10.24.0 npm/? node/v22.14.0 darwin x64`.
 * Anything unrecognised falls back to npm, which every Node install has.
 */
export function detectPackageManager(userAgent = process.env.npm_config_user_agent): PackageManager {
  const name = userAgent?.split(' ')[0]?.split('/')[0];
  if (name && name in KNOWN) return KNOWN[name as PackageManager['name']];
  return KNOWN.npm;
}
