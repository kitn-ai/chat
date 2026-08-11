import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesAtLeast } from './dom';

/** S14 — `file` parts. The only part type that GROUPS: a run of consecutive
 *  file parts collapses into one `<Attachments>` row, so this exercises
 *  `groupMessageParts` as well as the attachment chrome. */
export const s14Attachments: Scenario = {
  id: 'S14-attachments',
  title: 'Attachments / file parts',
  proves: 'a file part renders as a real attachment chip: the filename in its label, with its media icon',
  prompt: 'Generate the Q3 summary as a PDF called q3-summary.pdf and attach it.',
  tools: pickTools('attach_file'),
  mode: 'live',
  async assert(page) {
    // SCOPED, and deliberately so. The first version of this assertion was a
    // bare `getByText('q3-summary.pdf')`, which passed against a stream with no
    // attachment at all — because the filename is in the USER's own prompt,
    // three lines up the thread. The negative-control pass caught it. The chip's
    // label is a `span.truncate` inside AttachmentInfo; the user bubble renders
    // its text in a `div[part~="content"]`, so this cannot match the prompt.
    const chip = page.locator('span.truncate').filter({ hasText: 'q3-summary.pdf' });
    await seesAtLeast(page, chip, 1, 'attachment chips labelled q3-summary.pdf');

    // …and it is a real Attachment, not just a truncating span: the same row
    // holds the preview icon AttachmentPreview resolved from `application/pdf`.
    //
    // Deliberately CSS, not XPath. An `ancestor::` step does not resolve when the
    // context node is inside a shadow root, so the first version of this check
    // hung on a locator that could never match — and would have been read as "no
    // icon rendered" when the icon was there all along.
    const row = page
      .locator('div')
      .filter({ has: page.locator('svg.lucide-file-text') })
      .filter({ hasText: 'q3-summary.pdf' })
      .last(); // ancestors sort first, so `last` is the innermost such div
    if ((await row.count()) === 0) {
      fail('the attachment chip rendered a label but no media icon — AttachmentPreview did not resolve');
    }
  },
};
