/** Build entry for dist/construct-cli.es.js (the `construct-cli` target in
 *  config/vite/node.ts).
 *  bin/mcp.js imports this with the subcommand argv; process handling stays in
 *  the bin (this file stays free of exit calls, same split as mcp/stdio.ts). */
import { runCli } from './cli';

runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
