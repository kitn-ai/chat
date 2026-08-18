import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesElement, seesExactly } from './dom';

/** The filename the fixture attaches. Named once — every check below is about
 *  whether a user can read THIS string off the thread. */
const FILENAME = 'q3-summary.pdf';

/** S14 — `file` parts. The only part type that GROUPS: a run of consecutive
 *  file parts collapses into one `<Attachments>` row, so this exercises
 *  `groupMessageParts` as well as the attachment chrome. */
export const s14Attachments: Scenario = {
  id: 'S14-attachments',
  title: 'Attachments / file parts',
  proves: 'a file part renders as a real attachment: the filename VISIBLE next to its media icon',
  prompt: 'Generate the Q3 summary as a PDF called q3-summary.pdf and attach it.',
  tools: pickTools('attach_file'),
  mode: 'live',
  async assert(page) {
    // ── WHAT THIS SCENARIO IS ACTUALLY ABOUT ────────────────────────────────
    //
    // The property is: A USER CAN SEE WHICH FILE WAS ATTACHED. Not "a
    // `span.truncate` exists", which is what this used to assert — and that
    // wording cost a CI failure the day the thread moved from the inline chip to
    // the 96px grid tile. The filename was still on screen, in larger type than
    // before; the assertion was pinned to markup that had no business being a
    // contract.
    //
    // ★ THE REPAIR THAT LOOKED RIGHT AND WAS WORSE. The obvious fix is "the
    // innermost div holding both the media icon and the filename". It passes on
    // both renderings — and it was MEASURED to pass with the filename deleted
    // entirely, because `.last()` then slides up to the assistant's message row,
    // which contains the `<kai-tool>` panel echoing `q3-summary.pdf` in its JSON
    // output. That is a locator that still resolves, to the wrong node, which is
    // the failure mode that stays green. `dom.ts` has the same lesson written up
    // for `bubbles().last()`.
    //
    // So the anchor is an IDENTITY the kit publishes: `part="attachment"`, in
    // the same family as `part="row"` and `part="bubble content"`. A prose
    // bubble does not have one. Neither does a tool panel. It cannot slide.

    const attachment = page.locator('[part~="attachment"]');
    await seesElement(attachment, 'a rendered attachment', {
      because:
        'a `file` part must render through the Attachment chrome — `part="attachment"` is the ' +
        'published handle on it, so this cannot be satisfied by prose that merely mentions a file',
    });
    // One file part in this fixture, so one attachment. A second would mean the
    // run grouped or duplicated the part, which is this scenario's other half.
    await seesExactly(attachment, 1, 'rendered attachments for a single `file` part');

    // ── the NAME, visible, inside that attachment ────────────────────────────
    //
    // `exact` is what separates the attachment's own label from the prompt
    // sentence that also contains these characters — the original bare
    // `getByText(FILENAME)` passed against a stream with no attachment at all,
    // because the user's prompt names the file three lines up. The negative
    // control caught it then; `part` scoping plus `exact` makes it unreachable
    // now.
    const label = attachment.locator('[part~="attachment-name"]').getByText(FILENAME, { exact: true });
    await seesElement(label, `a visible "${FILENAME}" label on the attachment`, {
      because:
        "the filename is the attachment's identity — without it the tile is an anonymous grey box, " +
        'which is exactly the regression that shipped once already',
    });

    // ── VISIBLE means legible, not merely present ────────────────────────────
    //
    // Playwright counts a 1px `sr-only` element as visible, so without this a
    // "fix" that moved the filename into a screen-reader-only span would pass
    // while a sighted user saw nothing. Not hypothetical: an earlier revision of
    // the kit's grid tile did precisely that and was rejected in review for
    // serving assistive tech and no one else.
    const box = await label.first().boundingBox();
    if (!box || box.width < 8 || box.height < 4) {
      fail(
        `the "${FILENAME}" label renders at ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no'} ` +
          'box — present in the DOM but not legible. A screen-reader-only filename is not a visible one.',
      );
    }

    // ── …and it is a real attachment, not just a labelled box ────────────────
    //
    // The media icon AttachmentPreview resolved from `application/pdf`. Scoped
    // inside the attachment, so the tool panel's own icons cannot stand in for
    // it. Deliberately CSS, not XPath: an `ancestor::` step does not resolve
    // when the context node is inside a shadow root, so an early version of this
    // check hung on a locator that could never match — and would have been read
    // as "no icon rendered" when the icon was there all along.
    const icon = attachment.locator('svg.lucide-file-text');
    if ((await icon.count()) === 0) {
      fail(
        'the attachment rendered its filename but no media icon — AttachmentPreview did not resolve ' +
          '`application/pdf` to the document glyph',
      );
    }
  },
};
