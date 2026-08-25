import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export interface SeparatorProps extends JSX.HTMLAttributes<HTMLDivElement> { orientation?: 'horizontal' | 'vertical'; }

export function Separator(props: SeparatorProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'orientation', 'class');
  const isVertical = () => local.orientation === 'vertical';
  return <div role="separator" class={cn('shrink-0 bg-border', isVertical() ? 'h-full w-px' : 'h-px w-full', local.class)} {...rest} />;
}
