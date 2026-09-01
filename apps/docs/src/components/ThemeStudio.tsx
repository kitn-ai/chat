/** The theme editor moved into the kit as a standalone app —
 *  packages/ui/apps/theme-studio/ — so the local builder can iframe it
 *  (served by the construct dev server at /theme-studio/). The docs page keeps
 *  rendering the SAME component through this shim; the docs' Tailwind build
 *  scans the new location via the @source line in src/styles/app.css. */
export { default } from '../../../../packages/ui/apps/theme-studio/ThemeStudio';
