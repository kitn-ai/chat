import { Show, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { renderIcon } from '../ui/icon';

export interface PromptSuggestionProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children: JSX.Element | string;
  variant?: 'outline' | 'ghost' | 'default';
  /** Row height for the `list` layout: `'md'` (default) or `'lg'` for taller
   *  rows (more vertical padding). Chips/block/highlight are unaffected. */
  size?: 'md' | 'lg';
  /** Optional leading icon (named icon, image URL/data-URI, or text). */
  icon?: string;
  highlight?: string;
  /** Render as a full-width, left-aligned list row (the "suggested questions"
   *  idiom) instead of a rounded pill. Wraps long text. Ignored in highlight
   *  mode, which is always a list row. */
  block?: boolean;
  /** Render as a full-width "Ideas for you" list row: a leading icon, a
   *  left-aligned label, and a hover background. Like `block`, but keeps the
   *  leading icon. Ignored in highlight mode. */
  list?: boolean;
}

function PromptSuggestion(props: PromptSuggestionProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'variant', 'size', 'class', 'icon', 'highlight', 'block', 'list');
  const Icon = () => <Show when={local.icon}>{renderIcon(local.icon, { class: 'size-3.5 shrink-0' })}</Show>;

  const isHighlightMode = () => local.highlight !== undefined && local.highlight.trim() !== '';
  const content = () => typeof local.children === 'string' ? local.children : '';

  return (
    <Show
      when={isHighlightMode()}
      fallback={
        <Show
          when={local.list}
          fallback={
            <Show
              when={local.block}
              fallback={
                <Button
                  variant={local.variant ?? 'outline'}
                  size="lg"
                  class={cn('rounded-full', local.class)}
                  {...rest}
                >
                  <Icon />
                  {local.children}
                </Button>
              }
            >
              <Button
                variant={local.variant ?? 'outline'}
                size="md"
                class={cn(
                  'h-auto w-full cursor-pointer justify-start rounded-xl px-4 py-2.5',
                  'text-left text-sm leading-snug whitespace-normal text-pretty',
                  local.class,
                )}
                {...rest}
              >
                {local.children}
              </Button>
            </Show>
          }
        >
          <Button
            variant={local.variant ?? 'ghost'}
            size="md"
            class={cn(
              'group h-auto w-full cursor-pointer items-center justify-start gap-2.5 rounded-xl px-3',
              local.size === 'lg' ? 'py-3.5' : 'py-2.5',
              'text-left text-sm leading-snug whitespace-normal text-pretty',
              'hover:bg-accent',
              local.class,
            )}
            {...rest}
          >
            <Icon />
            <span class="min-w-0 flex-1">{local.children}</span>
          </Button>
        </Show>
      }
    >
      <Show
        when={content()}
        fallback={
          <Button
            variant={local.variant ?? 'ghost'}
            size="sm"
            class={cn(
              'w-full cursor-pointer justify-start rounded-xl py-2',
              'hover:bg-accent',
              local.class
            )}
            {...rest}
          >
            {local.children}
          </Button>
        }
      >
        <Button
          variant={local.variant ?? 'ghost'}
          size="sm"
          class={cn(
            'w-full cursor-pointer justify-start gap-0 rounded-xl py-2',
            'hover:bg-accent',
            local.class
          )}
          {...rest}
        >
          {renderHighlighted(content(), local.highlight!)}
        </Button>
      </Show>
    </Show>
  );
}

function renderHighlighted(text: string, highlight: string) {
  const trimmed = highlight.trim();
  const textLower = text.toLowerCase();
  const highlightLower = trimmed.toLowerCase();
  const index = textLower.indexOf(highlightLower);

  if (index === -1) {
    return <span class="text-foreground/70 whitespace-pre-wrap">{text}</span>;
  }

  const before = text.substring(0, index);
  const matched = text.substring(index, index + highlightLower.length);
  const after = text.substring(index + matched.length);

  return (
    <>
      <Show when={before}>
        <span class="text-foreground/70 whitespace-pre-wrap">{before}</span>
      </Show>
      <span class="text-primary font-medium whitespace-pre-wrap">{matched}</span>
      <Show when={after}>
        <span class="text-foreground/70 whitespace-pre-wrap">{after}</span>
      </Show>
    </>
  );
}

export { PromptSuggestion };
