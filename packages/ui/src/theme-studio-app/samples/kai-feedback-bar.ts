// Sample data for <kai-feedback-bar> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// kai-feedback-bar has ONE non-scalar prop: `categories` (string[]).
// The default sample omits it (no categories), so the basic playground renders
// the plain thumbs-up / thumbs-down ask. The `withCategories` named set adds
// chips to the detail form for the WithDetail example.

export default {
  sample: {},
  named: {
    withCategories: {
      categories: ['Inaccurate', 'Not helpful', 'Unsafe', 'Other'],
    },
  },
};
