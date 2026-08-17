// @kitn.ai/devtools — the entry a script tag loads.
//
// Importing this module registers `<kai-devtools>` and then does ONE of three
// things, decided by whether the kit says it was asked to record:
//
//   no hook          -> registration only. The kit is absent or too old; the
//                       panel says nothing, because there is nothing to say and
//                       a stranger's page is not the place to complain.
//   hook, no signal  -> registration, NO visible UI, and exactly one console
//                       line naming both ways in. A live storefront must not
//                       grow a floating widget because somebody pasted a tag,
//                       and that is what makes the tag safe to leave in.
//   hook + signal    -> self-mount one panel and attach.
//
// The signal is the KIT's, read at kit init, long before this file runs -- the
// tag is delivery, never the signal, because CMS platforms inject custom code
// into the footer and the panel may execute long after the answer was decided.
import { defineKaiDevtools, KaiDevtoolsElement } from './panel';
import { attachToHook, findHook } from './hook-client';

/** Verbatim from the spec. It is the entire discovery surface of a first run,
 *  and it names the exact next step rather than reporting a state. */
const NOT_ACTIVATED =
  '[kai-devtools] loaded, not activated. Add ?kai-devtools=1 to the URL, or run __KAI_DEVTOOLS_HOOK__.activate(), to record from the next page load.';

function start(): void {
  defineKaiDevtools();
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const hook = findHook();
  if (!hook) return; // registration only

  if (!hook.recording) {
    console.info(NOT_ACTIVATED);
    return;
  }

  if (document.querySelector('kai-devtools')) return; // someone mounted one already

  const el = document.createElement('kai-devtools') as KaiDevtoolsElement;
  const attachment = attachToHook((e) => el.push(e), hook);
  if (!attachment) return;

  el.setAttribute('hook-version', String(attachment.hookVersion));
  if (attachment.legacy) el.setAttribute('legacy', '');
  document.body.appendChild(el);
}

start();

export { KaiDevtoolsElement, defineKaiDevtools } from './panel';
export { foldStreams } from './streams';
export type { StreamSummary, FoldResult } from './streams';
