import { defineConfig } from 'vite';
import { runBoardApiPlugin } from './plugins/run-board-api.js';

/**
 * The run board provider. Origin #2.
 *
 * A SEPARATE Vite server on a different port, which is the whole point: the
 * board is framed by the console through `<kai-remote>`, and `mountRemoteCard`
 * refuses to mount a src that is same-origin with its host. Same repo, same
 * `npm run dev`, genuinely different origin.
 */
export default defineConfig({
  root: 'board',
  plugins: [runBoardApiPlugin()],
  // `fs.allow` because the board page imports the shared run model from ../shared.
  server: { port: 5175, strictPort: true, fs: { allow: ['..'] } },
  build: { outDir: '../dist/board', emptyOutDir: true },
});
