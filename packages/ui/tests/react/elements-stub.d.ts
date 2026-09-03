// Typecheck stub for the SIDE-EFFECT-ONLY per-element import subpaths
// (`@kitn.ai/ui/elements/<module>`), which the generated wrappers lazy-import
// and which carry no types a consumer names. tsconfig.react.json and
// tsconfig.react.test.json map the WILDCARD key here.
//
// The BARE `@kitn.ai/ui/elements` used to map here too, on the grounds that the
// real types entry "re-exports the kit's SolidJS source, which a React-JSX
// typecheck can't process". Measured false: src/elements/element-types.d.ts is
// a declaration file and both React passes compile it clean. It is now mapped
// to the real thing, because the generated wrappers name the Kai*Element
// interfaces for their ref types (blocks contract spike, F-9).
export {};
