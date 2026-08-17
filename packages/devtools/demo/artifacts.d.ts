// The demo loads the BUILT panel (`../dist/kai-devtools.es.js`) rather than its
// source, so that the page runs exactly what a CDN would serve. That artifact
// ships no declarations -- it is a script-tag bundle, not a typed entry point --
// and it is imported purely for its side effect of registering the element.
//
// Declared as a wildcard so the path stays a real relative import (Vite resolves
// it) without tsc demanding types for a file that deliberately has none.
declare module '*/kai-devtools.es.js';
