// The ONE statement of which element-meta.json keys the derived catalog is
// built from, shared by `gen-catalog.mjs` -- which hard-fails when a key carries
// data on no element -- and `tests/scripts/catalog-derived.test.ts`, whose shape
// guard asserts the same thing before re-deriving from the file.
//
// WHY SHARED, when the test beside it deliberately re-derives `partVariants` by
// a DIFFERENT method from the generator's: those are different situations.
// `readVariants` is a DERIVATION, and running the generator's copy of it inside
// the test would only prove the generator does not post-process its own result.
// This is a REQUIREMENT LIST. The fault it exists to catch is a key renamed or
// dropped in `gen-element-api.mjs`'s printer, and two copies of the list meant
// one could be updated while the other went on checking a key nobody reads --
// or, worse, stopped checking one everybody does.
//
// WHAT SHARING COSTS, AND WHAT PAYS FOR IT
// ----------------------------------------
// With one list, deleting a key from it switches the check off on BOTH sides at
// once -- the degrade-together shape that made the original defect invisible
// (the generator and the test both fell back to `?? []`, so renaming
// `events`->`eventz` left the suite green with that field empty on every
// element). So the list is not left unattended: catalog-derived.test.ts pins it
// against the keys of `DerivedElement`'s zod shape in
// mcp/catalog/catalog-types.ts, an independently authored
// statement of the same six. Drop one here and that test goes red naming it.
//
// The PREDICATE is deliberately NOT shared. Each side spells out "at least one
// element carries a non-empty array under this key" itself, so the two are
// redundant detectors of the same fault rather than one point of failure; a
// predicate broken on either side still leaves the other firing on a real loss.
// They are the same rule, which is the requirement, not the same code.
export const ELEMENT_META_KEYS = ['props', 'events', 'methods', 'parts', 'composedFrom', 'tokens'];
