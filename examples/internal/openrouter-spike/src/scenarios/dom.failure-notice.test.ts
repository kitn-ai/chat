// `seesAssistantProse` refuses the app's own failure notice, so a turn that
// FAILED can never satisfy a claim about what the model rendered.
//
// That guard is a string match, and a string match against another file's
// wording is exactly the kind of check that stops covering anything the moment
// someone rephrases the other file. It has already been earned once: the first
// live run of the vercel-ai-sdk route through the AI Gateway threw
// InvalidPromptError on every request, rendered
// `_The request failed: System messages are not allowed…_`, and S01 went GREEN
// on 96 characters of error message.
//
// So the wording is pinned HERE, by reading `useSpikeChat.ts` back — the same
// technique `transport.test.ts` uses to prove the client never names a provider.
// No key, no network, no DOM.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FAILURE_NOTICE } from './dom';

const source = readFileSync(new URL('../hooks/useSpikeChat.ts', import.meta.url), 'utf8');

describe('the failure notice the DOM helper refuses', () => {
  it('is still the text the app actually writes into the bubble', () => {
    expect(
      source,
      `useSpikeChat no longer writes ${JSON.stringify(FAILURE_NOTICE)} into the assistant bubble, so ` +
        'seesAssistantProse would stop recognising a failed turn and start passing on the error ' +
        'message again. Update FAILURE_NOTICE in scenarios/dom.ts to match.',
    ).toContain(FAILURE_NOTICE);
  });

  it('is written on the FAILURE path, not somewhere incidental', () => {
    // Anti-vacuity in the other direction: the substring appearing in a comment
    // would satisfy the check above while the bubble said something else.
    expect(source).toMatch(
      new RegExp(`stream\\.appendText\\(\`_${FAILURE_NOTICE.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}`),
    );
  });
});
