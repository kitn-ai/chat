import type { SVGProps } from 'react';

/**
 * Moon glyph — shown in light mode (tap the toggle → dark). moon/sun aren't in the
 * kit's `<Icon>` set, so the example owns them. Props spread straight onto the
 * `<svg>`, so `slot="icon"`, `className`, and `aria-hidden` pass through and it
 * drops into `<Button>`'s icon slot.
 */
export function MoonIcon({ size = 20, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
