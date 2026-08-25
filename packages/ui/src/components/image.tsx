import { omit, createSignal, createEffect, onCleanup, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Skeleton } from '../ui/skeleton';

export interface GeneratedImageLike {
  base64?: string;
  uint8Array?: Uint8Array;
  mediaType?: string;
}

export interface ImageProps extends GeneratedImageLike {
  alt: string;
  class?: string;
}

function getImageSrc(base64?: string, mediaType?: string): string | undefined {
  if (base64 && mediaType) {
    return `data:${mediaType};base64,${base64}`;
  }
  return undefined;
}

function Image(props: ImageProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'base64', 'uint8Array', 'mediaType', 'class', 'alt');
  const [objectUrl, setObjectUrl] = createSignal<string | undefined>(undefined);

  const mediaType = () => local.mediaType ?? 'image/png';

  // V2-PORT: tracked reads in the compute; the object-URL lifecycle in the apply
  // (in-effect onCleanup -> returned cleanup).
  createEffect(
    () => ({ arr: local.uint8Array, mt: mediaType() }),
    ({ arr, mt }) => {
      if (arr && mt) {
        const blob = new Blob([arr as BlobPart], { type: mt });
        const url = URL.createObjectURL(blob);
        setObjectUrl(url);
        return () => URL.revokeObjectURL(url);
      }
      setObjectUrl(undefined);
    },
  );

  const src = () => getImageSrc(local.base64, mediaType()) ?? objectUrl();

  return (
    <Show
      when={src()}
      fallback={
        <Skeleton
          aria-label={local.alt}
          role="img"
          class={cn('h-auto max-w-full overflow-hidden', local.class)}
        />
      }
    >
      <img
        src={src()}
        alt={local.alt}
        class={cn('h-auto max-w-full overflow-hidden rounded-md', local.class)}
        role="img"
      />
    </Show>
  );
}

export { Image };
