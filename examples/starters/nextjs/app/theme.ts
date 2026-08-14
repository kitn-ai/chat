/**
 * The shell's color mode.
 *
 * Its own module rather than an export from `workspace.tsx`. That file carries
 * `'use client'`, and a Server Component importing a type back out of it would
 * point the dependency the wrong way round — types erase, so it would compile,
 * but the import graph would say the server depends on a client module. Anything
 * shared between the two sides lives in a file that declares neither.
 */
export type Theme = 'light' | 'dark';
