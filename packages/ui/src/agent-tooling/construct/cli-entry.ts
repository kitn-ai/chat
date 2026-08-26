/** Build entry for dist/construct-cli.es.js (vite.config.construct-cli.ts).
 *  bin/mcp.js imports this with the subcommand argv; process handling stays in
 *  the bin (this file stays free of exit calls, same split as mcp/stdio.ts). */
import { runCli } from './cli';

runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
