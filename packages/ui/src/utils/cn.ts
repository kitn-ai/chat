import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The kit defines custom font-size utilities via @theme tokens in theme.css:
// text-micro / text-caption / text-meta / text-compact / text-body / text-title.
// tailwind-merge has no way to know these are font sizes, so by default it
// buckets `text-body` with text COLORS and drops a real color
// (`text-transparent`, `text-foreground`, …)
// whenever both appear in the same cn() call — which silently broke TextShimmer
// inside the web components (the element adds `text-body`, dropping
// `text-transparent`, so the gradient stayed hidden behind opaque text).
//
// Register them in the `font-size` group so they conflict only with other font
// sizes (text-xs/sm/base/lg/…) and never with text colors. Since theme.css now
// re-points Tailwind's own scale at the same tokens (text-xs ≡ text-meta,
// text-sm ≡ text-body, text-base ≡ text-title), the semantic name and its
// Tailwind alias are literally the same size — so they MUST land in one group
// or `cn('text-sm', 'text-body')` would emit two classes for one declaration.
// `text-lg` needs no entry: it is already a stock Tailwind font size.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'caption', 'meta', 'compact', 'body', 'title'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
