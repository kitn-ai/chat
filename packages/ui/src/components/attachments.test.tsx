/**
 * Unit tests for the Attachments SolidJS primitives.
 *
 * Covers two bugs found while dogfooding `kai-attachments` in the docs site:
 *   1. The per-item layout was not reactive to a post-render variant change —
 *      `Attachment` destructured `variant` from context, capturing it once.
 *   2. `AttachmentHoverCardTrigger` could not carry layout, so the hover trigger
 *      collapsed inline/list rows (it forwards a class now).
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentHoverCard,
  AttachmentHoverCardTrigger,
  type AttachmentData,
  type AttachmentVariant,
} from './attachments';

afterEach(cleanup);

const fileData: AttachmentData = {
  id: '1',
  type: 'file',
  filename: 'spec.pdf',
  mediaType: 'application/pdf',
};

describe('Attachment item layout', () => {
  it('re-lays out items when the container variant changes after first render', () => {
    const [variant, setVariant] = createSignal<AttachmentVariant>('grid');
    const { container } = render(() => (
      <Attachments variant={variant()}>
        <Attachment data={fileData} />
      </Attachments>
    ));

    const item = () => container.querySelector('.group') as HTMLElement;
    expect(item().className).toMatch(/size-24/); // grid tile

    setVariant('inline');
    expect(item().className).not.toMatch(/size-24/); // no longer a grid tile
    expect(item().className).toMatch(/\bh-8\b/); // inline chip height
  });
});

/**
 * ★ THESE `part` NAMES ARE A CROSS-PACKAGE CONTRACT, pinned here because the
 * thing that depends on them cannot defend itself from this side.
 *
 * `examples/internal/openrouter-spike` asserts S14 ("a user can see which file
 * was attached") by locating `[part~="attachment"]` and the
 * `[part~="attachment-name"]` inside it. That harness is a separate package and
 * a separate CI job, so a rename here goes green in the kit's own suite and
 * red in conformance — which is exactly what happened when the thread moved
 * from the inline chip to the grid tile and S14 was still pinned to
 * `span.truncate`. Publishing a part was the fix; this test is what stops the
 * part from quietly becoming the next `span.truncate`.
 *
 * Both variants are checked. A part that exists in only one rendering is not a
 * handle, it is a coincidence.
 */
describe('published attachment parts', () => {
  const pdf: AttachmentData = { id: 'p', type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf' };

  it.each(['grid', 'inline', 'list'] as const)(
    'exposes part="attachment" and part="attachment-name" in the %s variant',
    (variant) => {
      const { container } = render(() => (
        <Attachments variant={variant}>
          <Attachment data={pdf}>
            <AttachmentPreview />
            <AttachmentInfo />
          </Attachment>
        </Attachments>
      ));

      expect(container.querySelector('[part~="attachment"]'), variant).toBeTruthy();
      const name = container.querySelector('[part~="attachment-name"]');
      expect(name, variant).toBeTruthy();
      // The handle is only worth anything if the filename is actually in it.
      expect(name!.textContent, variant).toContain('spec.pdf');
    },
  );
});

describe('AttachmentHoverCardTrigger', () => {
  it('forwards a class to the underlying hover trigger so it can carry the row layout', () => {
    const { container } = render(() => (
      <AttachmentHoverCard>
        <AttachmentHoverCardTrigger class="flex items-center gap-1.5">
          <span>preview</span>
        </AttachmentHoverCardTrigger>
      </AttachmentHoverCard>
    ));

    const trigger = container.querySelector('span');
    expect(trigger).toBeTruthy();
    expect(trigger!.className).toContain('flex');
  });
});
