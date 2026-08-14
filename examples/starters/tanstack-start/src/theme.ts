/**
 * The shell's color mode.
 *
 * Its own module rather than an export from the route: `src/routes/*` is compiled
 * by the TanStack Router plugin, which rewrites those files to build the route
 * tree, so components in `src/components/` importing a type back out of a route
 * would point the dependency the wrong way round. Everything shared between the
 * route and its components lives outside `routes/`.
 */
export type Theme = 'light' | 'dark';
