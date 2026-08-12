// src/primitives/card-component-types.ts
// `CardEnvelope.type` -> the Solid component that renders it, as a TYPE.
//
// TYPES ONLY, AND THAT IS THE WHOLE FILE. `BUILTIN_CARD_COMPONENTS` and
// `mergeCardComponents` stay in card-registry.tsx and cannot follow them here: they
// ARE JSX. So this is not the same split card-tags.ts made — that one moved data and
// its type; this one moves only the type, because the value half has nowhere else to
// go. Do not try to "finish" the symmetry by dragging the component map over.
//
// WHY THE TYPES ARE ALONE IN A `.ts`
// ----------------------------------
// The same reason, one layer along, that card-tags.ts exists — read that file's header
// first; this is the second instance of its problem, not a new one.
//
// `@kitn.ai/ui/schemas` is the server-safe entry, and src/schemas/registry.ts declares
// `CustomCardSpec.component` and `CardRegistry.components` in terms of
// `CardComponentMap`. That is a TYPE import and erases at runtime, but a type import
// still has to RESOLVE, and while these two types lived in card-registry.tsx it
// resolved to a `.tsx`. tsconfig.mcp.json has no `jsx` on purpose, so the `kai` MCP's
// typecheck pass reported, on any tree that had not been built:
//
//   src/schemas/registry.ts(61,51): error TS6142: Module '../primitives/card-registry'
//   was resolved to '.../card-registry.tsx', but '--jsx' is not set.
//
// Exactly one error, and the last one standing on an unbuilt tree. Moving the two type
// aliases into this file takes that pass to 0. Measured on this tree, both directions.
//
// Relaxing tsconfig.mcp.json instead is not an option, and that is measured too, not
// recalled: giving that project `jsx: "preserve"` + `jsxImportSource: "solid-js"` —
// the settings the main tsconfig.json actually uses — takes it from 1 error to 130,
// almost all `TS2304: Cannot find name 'HTMLDivElement' / 'window'`, because a `jsx`
// setting drags the whole Solid component tree into a Node-only, `lib: ["ESNext"]`
// pass. (`jsx: "preserve"` with no import source is worse still: 838.) card-tags.ts
// records 1364 for the broader case. The figures differ because the reachable set
// differs; the conclusion does not. The Node/no-DOM boundary is load-bearing.
//
// `import type { Component } from 'solid-js'` below does NOT reintroduce the problem
// it just solved. Type-importing from solid-js resolves to a `.d.ts`, and a
// declaration file needs no `jsx` to be read; `skipLibCheck` covers what is inside it.
// It is resolving a `.tsx` SOURCE file that TS6142 objects to, and this file resolves
// none.
//
// WHAT THIS SPLIT DOES NOT DO
// ---------------------------
// It changes nothing at runtime, and must not be sold as if it did. This module is
// types only, so it compiles to nothing and there is no emitted module to compare:
// `verify:ssr` and `verify:schemas` read the BUILT entry and cannot tell the two
// arrangements apart even in principle. card-tags.ts records the same finding for its
// own case from the harder direction, where there WAS a bundle to diff and it came out
// byte-identical. The boundary this file defends is a compile-time one. The
// discriminating check is `tsc --noEmit -p tsconfig.mcp.json` on an UNBUILT tree, and
// nothing else is evidence for it.

import type { Component } from 'solid-js';
import type { CardEnvelope, CardHost } from './card-contract';

/** Solid renderer for one envelope. `host` is the resolved CardHost so each wrapper
 *  can bridge its card's emit convention (form/confirm/tasks take `host`;
 *  link/embed take `onEmit`). */
export type CardComponent = Component<{ envelope: CardEnvelope; host?: CardHost }>;

/** Solid layer: envelope type → the component that draws it. */
export type CardComponentMap = Record<string, CardComponent>;
