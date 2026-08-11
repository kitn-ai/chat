import { type JSX, Show, createContext, createMemo, useContext } from 'solid-js';
import { HoverCardRoot, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';

const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;
const PERCENT_MAX = 100;

/** Default fraction (0–1) at which the meter transitions to the warning colour. */
export const DEFAULT_WARN_THRESHOLD = 0.7;
/** Default fraction (0–1) at which the meter transitions to the danger colour. */
export const DEFAULT_DANGER_THRESHOLD = 0.9;

/**
 * Compute the severity level for a given usage fraction and thresholds.
 * `pct` is a 0–1 fraction (e.g. `usedTokens / maxTokens`).
 */
export function computeSeverity(
  pct: number,
  warnThreshold = DEFAULT_WARN_THRESHOLD,
  dangerThreshold = DEFAULT_DANGER_THRESHOLD,
): ContextSeverity {
  if (pct > dangerThreshold) return 'danger';
  if (pct > warnThreshold) return 'warn';
  return 'ok';
}

export type ContextSeverity = 'ok' | 'warn' | 'danger';

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheTokens?: number;
  estimatedCost?: number;
  /** Fraction (0–1) above which the meter turns yellow. Default 0.7. */
  warnThreshold: number;
  /** Fraction (0–1) above which the meter turns red. Default 0.9. */
  dangerThreshold: number;
}

const ContextCtx = createContext<ContextSchema>();

function useContextValue(): ContextSchema {
  const ctx = useContext(ContextCtx);
  if (!ctx) {
    throw new Error('Context components must be used within Context');
  }
  return ctx;
}

const fmtCompact = new Intl.NumberFormat('en-US', { notation: 'compact' });
const fmtPercent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, style: 'percent' });
const fmtCurrency = new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' });

// --- Root provider ---

export interface ContextProps {
  usedTokens: number;
  maxTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheTokens?: number;
  estimatedCost?: number;
  /**
   * Fraction (0–1) above which the progress bar turns yellow.
   * Defaults to `0.7` (70%).
   */
  warnThreshold?: number;
  /**
   * Fraction (0–1) above which the progress bar turns red.
   * Defaults to `0.9` (90%).
   */
  dangerThreshold?: number;
  children?: JSX.Element;
}

export function Context(props: ContextProps) {
  const value = createMemo<ContextSchema>(() => ({
    usedTokens: props.usedTokens,
    maxTokens: props.maxTokens,
    inputTokens: props.inputTokens,
    outputTokens: props.outputTokens,
    reasoningTokens: props.reasoningTokens,
    cacheTokens: props.cacheTokens,
    estimatedCost: props.estimatedCost,
    warnThreshold: props.warnThreshold ?? DEFAULT_WARN_THRESHOLD,
    dangerThreshold: props.dangerThreshold ?? DEFAULT_DANGER_THRESHOLD,
  }));

  return (
    <ContextCtx.Provider value={value()}>
      <HoverCardRoot openDelay={0}>
        {props.children}
      </HoverCardRoot>
    </ContextCtx.Provider>
  );
}

// --- Icon (internal) ---

function ContextIcon() {
  const ctx = useContextValue();
  const circumference = 2 * Math.PI * ICON_RADIUS;
  const usedPercent = createMemo(() => ctx.usedTokens / ctx.maxTokens);
  const dashOffset = createMemo(() => circumference * (1 - usedPercent()));

  return (
    <svg
      aria-label="Model context usage"
      height="20"
      role="img"
      style={{ color: 'currentcolor' }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="20"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        stroke-width={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={ICON_RADIUS}
        stroke="currentColor"
        stroke-dasharray={`${circumference} ${circumference}`}
        stroke-dashoffset={dashOffset()}
        stroke-linecap="round"
        stroke-width={ICON_STROKE_WIDTH}
        style={{ transform: 'rotate(-90deg)', 'transform-origin': 'center' }}
      />
    </svg>
  );
}

// --- Trigger ---

export interface ContextTriggerProps {
  children?: JSX.Element;
  class?: string;
}

export function ContextTrigger(props: ContextTriggerProps) {
  const ctx = useContextValue();
  const usedPercent = createMemo(() => ctx.usedTokens / ctx.maxTokens);
  const renderedPercent = createMemo(() => fmtPercent.format(usedPercent()));

  return (
    <HoverCardTrigger>
      <Show
        when={!props.children}
        fallback={props.children}
      >
        <Button type="button" variant="ghost" class={props.class}>
          <span class="font-medium text-muted-foreground">{renderedPercent()}</span>
          <ContextIcon />
        </Button>
      </Show>
    </HoverCardTrigger>
  );
}

// --- Content ---

export interface ContextContentProps {
  class?: string;
  children?: JSX.Element;
}

export function ContextContent(props: ContextContentProps) {
  return (
    <HoverCardContent
      class={cn(
        'min-w-60 divide-y divide-border overflow-hidden',
        props.class
      )}
    >
      {props.children}
    </HoverCardContent>
  );
}

// --- Content Header ---

export interface ContextContentHeaderProps {
  class?: string;
  children?: JSX.Element;
}

export function ContextContentHeader(props: ContextContentHeaderProps) {
  const ctx = useContextValue();
  const usedPercent = createMemo(() => ctx.usedTokens / ctx.maxTokens);
  const displayPct = createMemo(() => fmtPercent.format(usedPercent()));
  const used = createMemo(() => fmtCompact.format(ctx.usedTokens));
  const total = createMemo(() => fmtCompact.format(ctx.maxTokens));
  const barWidth = createMemo(() => `${Math.min(usedPercent() * PERCENT_MAX, PERCENT_MAX)}%`);

  const severity = createMemo<ContextSeverity>(() => {
    const pct = usedPercent();
    if (pct > ctx.dangerThreshold) return 'danger';
    if (pct > ctx.warnThreshold) return 'warn';
    return 'ok';
  });

  const colorClass = createMemo(() => {
    const s = severity();
    if (s === 'danger') return 'bg-red-400';
    if (s === 'warn') return 'bg-yellow-400';
    return 'bg-primary';
  });

  return (
    <div class={cn('w-full space-y-2 p-3', props.class)}>
      <Show when={!props.children} fallback={props.children}>
        <div class="flex items-center justify-between gap-3 text-xs">
          <p>{displayPct()}</p>
          <p class="font-mono text-muted-foreground">
            {used()} / {total()}
          </p>
        </div>
        <div class="space-y-2">
          <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              class={cn('h-full rounded-full transition-all', colorClass())}
              style={{ width: barWidth() }}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}

// --- Content Body ---

export interface ContextContentBodyProps {
  class?: string;
  children?: JSX.Element;
}

export function ContextContentBody(props: ContextContentBodyProps) {
  return (
    <div class={cn('w-full p-3', props.class)}>
      {props.children}
    </div>
  );
}

// --- Content Footer ---

export interface ContextContentFooterProps {
  class?: string;
  children?: JSX.Element;
}

export function ContextContentFooter(props: ContextContentFooterProps) {
  const ctx = useContextValue();
  const totalCost = createMemo(() =>
    fmtCurrency.format(ctx.estimatedCost ?? 0)
  );

  return (
    <div
      class={cn(
        'flex w-full items-center justify-between gap-3 bg-muted p-3 text-xs',
        props.class
      )}
    >
      <Show when={!props.children} fallback={props.children}>
        <span class="text-muted-foreground">Total cost</span>
        <span>{totalCost()}</span>
      </Show>
    </div>
  );
}

// --- Token row helper ---

function TokensDisplay(props: { tokens?: number }) {
  return (
    <span>
      {props.tokens === undefined
        ? '\u2014'
        : fmtCompact.format(props.tokens)}
    </span>
  );
}

// --- Specialized usage rows ---

export interface ContextUsageRowProps {
  class?: string;
  children?: JSX.Element;
}

// The four rows share one shape, but each still ships a `<Name>Props` alias: a
// consumer typing a wrapper around one of them should not have to discover that
// the shared name exists.
export type ContextInputUsageProps = ContextUsageRowProps;
export type ContextOutputUsageProps = ContextUsageRowProps;
export type ContextReasoningUsageProps = ContextUsageRowProps;
export type ContextCacheUsageProps = ContextUsageRowProps;

export function ContextInputUsage(props: ContextInputUsageProps) {
  const ctx = useContextValue();
  return (
    <Show when={props.children || ctx.inputTokens}>
      <Show when={!props.children} fallback={props.children}>
        <div class={cn('flex items-center justify-between text-xs', props.class)}>
          <span class="text-muted-foreground">Input</span>
          <TokensDisplay tokens={ctx.inputTokens} />
        </div>
      </Show>
    </Show>
  );
}

export function ContextOutputUsage(props: ContextOutputUsageProps) {
  const ctx = useContextValue();
  return (
    <Show when={props.children || ctx.outputTokens}>
      <Show when={!props.children} fallback={props.children}>
        <div class={cn('flex items-center justify-between text-xs', props.class)}>
          <span class="text-muted-foreground">Output</span>
          <TokensDisplay tokens={ctx.outputTokens} />
        </div>
      </Show>
    </Show>
  );
}

export function ContextReasoningUsage(props: ContextReasoningUsageProps) {
  const ctx = useContextValue();
  return (
    <Show when={props.children || ctx.reasoningTokens}>
      <Show when={!props.children} fallback={props.children}>
        <div class={cn('flex items-center justify-between text-xs', props.class)}>
          <span class="text-muted-foreground">Reasoning</span>
          <TokensDisplay tokens={ctx.reasoningTokens} />
        </div>
      </Show>
    </Show>
  );
}

export function ContextCacheUsage(props: ContextCacheUsageProps) {
  const ctx = useContextValue();
  return (
    <Show when={props.children || ctx.cacheTokens}>
      <Show when={!props.children} fallback={props.children}>
        <div class={cn('flex items-center justify-between text-xs', props.class)}>
          <span class="text-muted-foreground">Cache</span>
          <TokensDisplay tokens={ctx.cacheTokens} />
        </div>
      </Show>
    </Show>
  );
}
