import { For, Show } from 'solid-js';
import { defineWebComponent } from './define';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
  AttachmentHoverCard,
  AttachmentHoverCardTrigger,
  AttachmentHoverCardContent,
  AttachmentEmpty,
  getAttachmentLabel,
  getMediaCategory,
  type AttachmentData,
  type AttachmentVariant,
} from '../components/attachments';

interface Props extends Record<string, unknown> {
  /** The attachments to render. Omit (or pass an empty array) for the empty
   *  state, which shows `emptyText` if set and nothing otherwise. Set as a JS
   *  property (array). Each item's `url` must be a `data:` URI or an https
   *  URL, never `URL.createObjectURL`: a `blob:` URL previews here but the
   *  wire encoders (`toOpenAIMessages`/`toAnthropicMessages`) refuse it. */
  items?: AttachmentData[];
  /** Layout: `grid` = visual tiles, `inline` = icon + label chips, `list` = rows. */
  variant?: AttachmentVariant;
  /** Wrap each item in a hover card that previews its details. */
  hoverCard?: boolean;
  /** Show a remove button per item; clicking it fires a `kai-remove` event. */
  removable?: boolean;
  /** Also show the media type beneath the filename (non-grid variants). */
  showMediaType?: boolean;
  /** Text shown when `items` is empty. */
  emptyText?: string;
}

/** Events fired by `<kai-attachments>`. */
interface Events {
  /** A remove button was clicked. */
  'kai-remove': { id: string };
}

/**
 * `<kai-attachments>` — the exemplar for the "collapse a compound primitive to
 * ONE configurable element" pattern (Route 1). The presentation knobs that the
 * SolidJS layer expresses by composing sub-parts (`<AttachmentPreview>`,
 * `<AttachmentInfo>`, `<AttachmentHoverCard>`, `<AttachmentRemove>`) become
 * attributes/flags here:
 *
 *   - icon + label .......... `variant="inline"`
 *   - visual + hover card .... `variant="grid" hover-card`
 *   - removable chips ........ add `removable` (emits `kai-remove` → { id })
 *
 * Data in via the `items` property; the only interaction (`remove`) comes back
 * as an event. For fully-custom hover content, the SolidJS primitives remain the
 * escape hatch (a templated slot — "Route 2" — is a deliberate future add).
 */
defineWebComponent<Props, Events>('kai-attachments', {
  items: [],
  variant: 'grid',
  hoverCard: false,
  removable: false,
  showMediaType: false,
  emptyText: undefined,
}, (props, { dispatch, flag }) => {
  const variant = () => props.variant ?? 'grid';
  const hoverCard = () => flag('hoverCard');
  const removable = () => flag('removable');
  const showMediaType = () => flag('showMediaType');

  return (
    <Show
      when={props.items?.length}
      fallback={<Show when={props.emptyText}><AttachmentEmpty>{props.emptyText}</AttachmentEmpty></Show>}
    >
      <Attachments variant={variant()}>
        <For each={props.items ?? []}>
          {(item) => (
            <Attachment
              data={item}
              onRemove={removable() ? () => dispatch('kai-remove', { id: item.id }) : undefined}
            >
              <Show
                when={hoverCard()}
                fallback={
                  <>
                    <AttachmentPreview />
                    {/* Rendered for EVERY variant now. `AttachmentInfo` decides
                        what a grid tile gets — a visible caption for a non-image
                        tile, nothing for an image, which is the only tile that
                        really is a self-contained visual. */}
                    <AttachmentInfo showMediaType={showMediaType()} />
                  </>
                }
              >
                {/* The trigger carries the layout itself — a bare inline <span>
                    collapses inline/list rows. Grid wraps just the tile (the
                    label/details surface in the hover card instead). */}
                <AttachmentHoverCard>
                  <AttachmentHoverCardTrigger
                    class={variant() === 'grid'
                      ? 'block size-full'
                      : `flex items-center gap-1.5${variant() === 'list' ? ' w-full' : ''}`}
                  >
                    <AttachmentPreview />
                    <AttachmentInfo showMediaType={showMediaType()} />
                  </AttachmentHoverCardTrigger>
                  <AttachmentHoverCardContent>
                    {/* For image attachments, preview the actual thumbnail;
                        otherwise fall back to the label + media-type details. */}
                    <Show
                      when={getMediaCategory(item) === 'image' && item.type === 'file' && item.url}
                      fallback={
                        <>
                          <div class="text-body font-medium">{getAttachmentLabel(item)}</div>
                          <Show when={item.mediaType}>
                            <div class="text-muted-foreground text-caption">{item.mediaType}</div>
                          </Show>
                        </>
                      }
                    >
                      <img
                        part="preview"
                        src={item.url}
                        alt={getAttachmentLabel(item)}
                        class="block max-h-64 max-w-xs rounded object-contain"
                      />
                    </Show>
                  </AttachmentHoverCardContent>
                </AttachmentHoverCard>
              </Show>
              <AttachmentRemove />
            </Attachment>
          )}
        </For>
      </Attachments>
    </Show>
  );
});
