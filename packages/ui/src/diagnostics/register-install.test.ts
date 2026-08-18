// @vitest-environment jsdom
//
// Statically import the registration implementation, the same way
// tests/elements/register.test.ts does. Two reasons it cannot be a dynamic
// import inside a test body: it pulls in ~90 element modules, so the transform
// cost blows the unit project's strict 5000ms per-test budget (it is paid during
// COLLECTION here, which that budget does not govern); and the install has to
// happen as an import side effect for this test to be testing the real thing.
//
// It lives in its own file for the same reason: hook.test.ts asserts that
// importing the hook module installs NOTHING, and a side-effecting import at the
// top of that file would make the assertion meaningless.
import '../elements/register-impl';
import { describe, expect, it } from 'vitest';

describe('register-impl installs the devtools hook', () => {
  it('is installed, dormant, after the elements register', () => {
    // The path every consumer of @kitn.ai/ui/elements, the React wrappers, or
    // the CDN bundle takes. register-impl is already browser-only, which is why
    // the install call belongs there rather than in an entry SSR imports.
    const hook = window.__KAI_DEVTOOLS_HOOK__;
    expect(hook).toBeDefined();
    expect(hook!.version).toBe(1);
    // No signal was set in this environment, so it took the dormant branch.
    expect(hook!.recording).toBe(false);
    expect(hook!.drain()).toEqual([]);
  });
});
