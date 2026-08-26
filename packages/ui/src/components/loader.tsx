import { Switch, Match, For, Show } from 'solid-js';
import { cn } from '../utils/cn';

export type LoaderVariant =
  | 'circular'
  | 'classic'
  | 'pulse'
  | 'pulse-dot'
  | 'dots'
  | 'typing'
  | 'wave'
  | 'bars'
  | 'terminal'
  | 'text-blink'
  | 'text-shimmer'
  | 'loading-dots';

export type LoaderSize = 'sm' | 'md' | 'lg';

export interface LoaderProps {
  variant?: LoaderVariant;
  size?: LoaderSize;
  text?: string;
  class?: string;
}

/** Props of the shape-only loader variants (no label). */
export interface LoaderShapeProps {
  class?: string;
  size?: LoaderSize;
}

/** Props of the text-based loader variants, which also take the label. */
export interface LoaderTextProps extends LoaderShapeProps {
  text?: string;
}

// Every variant shortcut ships its own `<Name>Props` alias: a consumer typing a
// wrapper around `<DotsLoader>` must be able to name its props without knowing
// that nine components happen to share one shape.
export type CircularLoaderProps = LoaderShapeProps;
export type ClassicLoaderProps = LoaderShapeProps;
export type PulseLoaderProps = LoaderShapeProps;
export type PulseDotLoaderProps = LoaderShapeProps;
export type DotsLoaderProps = LoaderShapeProps;
export type TypingLoaderProps = LoaderShapeProps;
export type WaveLoaderProps = LoaderShapeProps;
export type BarsLoaderProps = LoaderShapeProps;
export type TerminalLoaderProps = LoaderShapeProps;
export type TextBlinkLoaderProps = LoaderTextProps;
export type TextShimmerLoaderProps = LoaderTextProps;
export type TextDotsLoaderProps = LoaderTextProps;

// --- CircularLoader ---

export function CircularLoader(props: CircularLoaderProps) {
  const size = () => props.size ?? 'md';
  const sizeClasses = { sm: 'size-4', md: 'size-5', lg: 'size-6' };
  return (
    <div
      class={cn(
        'border-primary animate-spin rounded-full border-2 border-t-transparent',
        sizeClasses[size()],
        props.class
      )}
    >
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- ClassicLoader ---

export function ClassicLoader(props: ClassicLoaderProps) {
  const size = () => props.size ?? 'md';
  const sizeClasses = { sm: 'size-4', md: 'size-5', lg: 'size-6' };
  const barSizes = {
    sm: { height: '6px', width: '1.5px' },
    md: { height: '8px', width: '2px' },
    lg: { height: '10px', width: '2.5px' },
  };
  return (
    <div class={cn('relative', sizeClasses[size()], props.class)}>
      <div class="absolute h-full w-full">
        <For each={Array.from({ length: 12 }, (_, i) => i)}>
          {(i) => (
            <div
              class="bg-primary absolute animate-[spinner-fade_1.2s_linear_infinite] rounded-full"
              style={{
                top: '0',
                left: '50%',
                'margin-left': size() === 'sm' ? '-0.75px' : size() === 'lg' ? '-1.25px' : '-1px',
                'transform-origin': `${size() === 'sm' ? '0.75px' : size() === 'lg' ? '1.25px' : '1px'} ${size() === 'sm' ? '10px' : size() === 'lg' ? '14px' : '12px'}`,
                transform: `rotate(${i * 30}deg)`,
                opacity: 0,
                'animation-delay': `${i * 0.1}s`,
                height: barSizes[size()].height,
                width: barSizes[size()].width,
              }}
            />
          )}
        </For>
      </div>
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- PulseLoader ---

export function PulseLoader(props: PulseLoaderProps) {
  const size = () => props.size ?? 'md';
  const sizeClasses = { sm: 'size-4', md: 'size-5', lg: 'size-6' };
  return (
    <div class={cn('relative', sizeClasses[size()], props.class)}>
      <div class="border-primary absolute inset-0 animate-[thin-pulse_1.5s_ease-in-out_infinite] rounded-full border-2" />
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- PulseDotLoader ---

export function PulseDotLoader(props: PulseDotLoaderProps) {
  const size = () => props.size ?? 'md';
  const sizeClasses = { sm: 'size-1', md: 'size-2', lg: 'size-3' };
  return (
    <div
      class={cn(
        'bg-primary animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full',
        sizeClasses[size()],
        props.class
      )}
    >
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- DotsLoader ---

export function DotsLoader(props: DotsLoaderProps) {
  const size = () => props.size ?? 'md';
  const dotSizes = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2', lg: 'h-2.5 w-2.5' };
  const containerSizes = { sm: 'h-4', md: 'h-5', lg: 'h-6' };
  return (
    <div class={cn('flex items-center space-x-1', containerSizes[size()], props.class)}>
      <For each={[0, 1, 2]}>
        {(i) => (
          <div
            class={cn(
              'bg-primary animate-[bounce-dots_1.4s_ease-in-out_infinite] rounded-full',
              dotSizes[size()]
            )}
            style={{ 'animation-delay': `${i * 160}ms` }}
          />
        )}
      </For>
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- TypingLoader ---

export function TypingLoader(props: TypingLoaderProps) {
  const size = () => props.size ?? 'md';
  const dotSizes = { sm: 'h-1 w-1', md: 'h-1.5 w-1.5', lg: 'h-2 w-2' };
  const containerSizes = { sm: 'h-4', md: 'h-5', lg: 'h-6' };
  return (
    <div class={cn('flex items-center space-x-1', containerSizes[size()], props.class)}>
      <For each={[0, 1, 2]}>
        {(i) => (
          <div
            class={cn(
              'bg-primary animate-[typing_1s_infinite] rounded-full',
              dotSizes[size()]
            )}
            style={{ 'animation-delay': `${i * 250}ms` }}
          />
        )}
      </For>
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- WaveLoader ---

export function WaveLoader(props: WaveLoaderProps) {
  const size = () => props.size ?? 'md';
  const barWidths = { sm: 'w-0.5', md: 'w-0.5', lg: 'w-1' };
  const containerSizes = { sm: 'h-4', md: 'h-5', lg: 'h-6' };
  const heights: Record<LoaderSize, string[]> = {
    sm: ['6px', '9px', '12px', '9px', '6px'],
    md: ['8px', '12px', '16px', '12px', '8px'],
    lg: ['10px', '15px', '20px', '15px', '10px'],
  };
  return (
    <div class={cn('flex items-center gap-0.5', containerSizes[size()], props.class)}>
      <For each={[0, 1, 2, 3, 4]}>
        {(i) => (
          <div
            class={cn(
              'bg-primary animate-[wave_1s_ease-in-out_infinite] rounded-full',
              barWidths[size()]
            )}
            style={{
              'animation-delay': `${i * 100}ms`,
              height: heights[size()][i],
            }}
          />
        )}
      </For>
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- BarsLoader ---

export function BarsLoader(props: BarsLoaderProps) {
  const size = () => props.size ?? 'md';
  const barWidths = { sm: 'w-1', md: 'w-1.5', lg: 'w-2' };
  const containerSizes = { sm: 'h-4 gap-1', md: 'h-5 gap-1.5', lg: 'h-6 gap-2' };
  return (
    <div class={cn('flex', containerSizes[size()], props.class)}>
      <For each={[0, 1, 2]}>
        {(i) => (
          <div
            class={cn(
              'bg-primary h-full animate-[wave-bars_1.2s_ease-in-out_infinite]',
              barWidths[size()]
            )}
            style={{ 'animation-delay': `${i * 0.2}s` }}
          />
        )}
      </For>
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- TerminalLoader ---

export function TerminalLoader(props: TerminalLoaderProps) {
  const size = () => props.size ?? 'md';
  const cursorSizes = { sm: 'h-3 w-1.5', md: 'h-4 w-2', lg: 'h-5 w-2.5' };
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
  const containerSizes = { sm: 'h-4', md: 'h-5', lg: 'h-6' };
  return (
    <div class={cn('flex items-center space-x-1', containerSizes[size()], props.class)}>
      {/* Decorative status chrome, not a control — was the BRAND token
          (text-primary). The sibling TextShimmerLoader below already renders
          its "Thinking" text purely in --color-foreground/--color-muted-foreground,
          with no brand color at all; matches that precedent. */}
      <span class={cn('text-foreground font-mono', textSizes[size()])}>{'>'}</span>
      <div class={cn('bg-primary animate-[blink_1s_step-end_infinite]', cursorSizes[size()])} />
      <span class="sr-only">Loading</span>
    </div>
  );
}

// --- TextBlinkLoader ---

export function TextBlinkLoader(props: TextBlinkLoaderProps) {
  const size = () => props.size ?? 'md';
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
  return (
    <div
      class={cn(
        'animate-[text-blink_2s_ease-in-out_infinite] font-medium',
        textSizes[size()],
        props.class
      )}
    >
      {props.text ?? 'Thinking'}
    </div>
  );
}

// --- TextShimmerLoader ---

export function TextShimmerLoader(props: TextShimmerLoaderProps) {
  const size = () => props.size ?? 'md';
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
  return (
    <div
      class={cn(
        'bg-[linear-gradient(to_right,var(--color-muted-foreground)_40%,var(--color-foreground)_60%,var(--color-muted-foreground)_80%)]',
        'bg-size-[200%_auto] bg-clip-text font-medium text-transparent',
        'animate-[shimmer_4s_infinite_linear]',
        textSizes[size()],
        props.class
      )}
    >
      {props.text ?? 'Thinking'}
    </div>
  );
}

// --- TextDotsLoader ---

export function TextDotsLoader(props: TextDotsLoaderProps) {
  const size = () => props.size ?? 'md';
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
  return (
    <div class={cn('inline-flex items-center', props.class)}>
      {/* Content/chrome, not a control — was `text-primary` on the label AND
          the dots (both must match: one phrase, "Thinking..."). Matches
          TextShimmerLoader's neutral precedent above. */}
      <span class={cn('text-foreground font-medium', textSizes[size()])}>
        {props.text ?? 'Thinking'}
      </span>
      <span class="inline-flex">
        <span class="text-foreground animate-[loading-dots_1.4s_infinite_0.2s]">.</span>
        <span class="text-foreground animate-[loading-dots_1.4s_infinite_0.4s]">.</span>
        <span class="text-foreground animate-[loading-dots_1.4s_infinite_0.6s]">.</span>
      </span>
    </div>
  );
}

// --- Loader (variant dispatcher) ---

export function Loader(props: LoaderProps) {
  return (
    <Switch fallback={<CircularLoader size={props.size} class={props.class} />}>
      <Match when={props.variant === 'circular'}>
        <CircularLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'classic'}>
        <ClassicLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'pulse'}>
        <PulseLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'pulse-dot'}>
        <PulseDotLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'dots'}>
        <DotsLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'typing'}>
        <TypingLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'wave'}>
        <WaveLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'bars'}>
        <BarsLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'terminal'}>
        <TerminalLoader size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'text-blink'}>
        <TextBlinkLoader text={props.text} size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'text-shimmer'}>
        <TextShimmerLoader text={props.text} size={props.size} class={props.class} />
      </Match>
      <Match when={props.variant === 'loading-dots'}>
        <TextDotsLoader text={props.text} size={props.size} class={props.class} />
      </Match>
    </Switch>
  );
}
