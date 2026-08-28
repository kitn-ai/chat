import { type JSX, splitProps, createSignal, Show, For } from 'solid-js';
import { cn } from '../utils/cn';
import { Collapsible, CollapsibleTrigger, CollapsibleContent, type CollapsibleController } from '../ui/collapsible';
import { Button } from '../ui/button';
import { CheckCircle, ChevronDown, Loader2, Settings, XCircle } from 'lucide-solid';
import type { ToolPart } from './tool-types';
export type { ToolPart } from './tool-types';

export interface ToolProps {
  toolPart: ToolPart;
  defaultOpen?: boolean;
  /** Gate the disclosure trigger (programmatic control still works). */
  disabled?: boolean;
  /** Receive the open controller once mounted (forwarded from the Collapsible),
   *  so a parent (the kai-tool facade) can drive/observe open state. */
  controllerRef?: (api: CollapsibleController) => void;
  class?: string;
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function ToolStateIcon(props: { state: ToolPart['state'] }) {
  return (
    <>
      <Show when={props.state === 'input-streaming'}>
        <Loader2 class="size-4 animate-spin text-blue-500" />
      </Show>
      <Show when={props.state === 'input-available'}>
        <Settings class="size-4 text-orange-500" />
      </Show>
      <Show when={props.state === 'output-available'}>
        <CheckCircle class="size-4 text-green-500" />
      </Show>
      <Show when={props.state === 'output-error'}>
        <XCircle class="size-4 text-red-500" />
      </Show>
    </>
  );
}

// Status chips: a hue as text over a 15% translucent fill of the same hue
// (mirroring the inline-code chip). The TEXT color comes from a theme token
// (--color-tool-*) whose light value is darkened so it reaches WCAG AA (4.5:1)
// on the faint fill, while dark mode keeps a brighter hue for AA on the dark
// surface — both modes resolve via the token's `.dark` override. The FILL keeps
// a fixed bright hue so the chip's colored tint looks the same in both modes.
const STATE_TOKEN: Record<ToolPart['state'], string> = {
  'input-streaming': 'var(--color-tool-blue)',
  'input-available': 'var(--color-tool-amber)',
  'output-available': 'var(--color-tool-green)',
  'output-error': 'var(--color-tool-red)',
};
const STATE_FILL: Record<ToolPart['state'], string> = {
  'input-streaming': 'hsl(217 91% 60%)', // blue
  'input-available': 'hsl(38 92% 50%)', // amber
  'output-available': 'hsl(142 71% 45%)', // green
  'output-error': 'hsl(0 84% 60%)', // red
};

function stateChip(state: ToolPart['state']): JSX.CSSProperties {
  return {
    color: STATE_TOKEN[state],
    background: `color-mix(in oklab, ${STATE_FILL[state]} 15%, transparent)`,
  };
}

function ToolStateBadge(props: { state: ToolPart['state'] }) {
  const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
  return (
    <>
      <Show when={props.state === 'input-streaming'}>
        <span class={baseClasses} style={stateChip('input-streaming')}>
          Processing
        </span>
      </Show>
      <Show when={props.state === 'input-available'}>
        <span class={baseClasses} style={stateChip('input-available')}>
          Ready
        </span>
      </Show>
      <Show when={props.state === 'output-available'}>
        <span class={baseClasses} style={stateChip('output-available')}>
          Completed
        </span>
      </Show>
      <Show when={props.state === 'output-error'}>
        <span class={baseClasses} style={stateChip('output-error')}>
          Error
        </span>
      </Show>
    </>
  );
}

function Tool(props: ToolProps) {
  const [local, rest] = splitProps(props, ['toolPart', 'defaultOpen', 'disabled', 'controllerRef', 'class']);
  // Drive the Collapsible UNCONTROLLED (seed from defaultOpen) and read its open
  // state via the controller it hands up — that same controller is forwarded to
  // the facade so wireDisclosure can drive show/hide/toggle.
  const [api, setApi] = createSignal<CollapsibleController>();
  const isOpen = () => api()?.open() ?? (local.defaultOpen ?? false);

  const state = () => local.toolPart.state;
  const input = () => local.toolPart.input;
  const output = () => local.toolPart.output;

  return (
    <div class={cn('mt-3 overflow-hidden rounded-lg bg-surface', local.class)}>
      <Collapsible
        defaultOpen={local.defaultOpen}
        disabled={local.disabled}
        controllerRef={(a) => { setApi(a); local.controllerRef?.(a); }}
      >
        <CollapsibleTrigger
          as={(triggerProps: JSX.HTMLAttributes<HTMLButtonElement>) => (
            <Button
              variant="ghost"
              class="h-auto w-full justify-between rounded-b-none px-3 py-2 font-normal"
              {...triggerProps}
            >
              <div class="flex items-center gap-2">
                <ToolStateIcon state={state()} />
                <span class="font-mono text-sm font-medium">{local.toolPart.type}</span>
                <ToolStateBadge state={state()} />
              </div>
              <ChevronDown class={cn('size-4 transition-transform', isOpen() && 'rotate-180')} />
            </Button>
          )}
        />
        <CollapsibleContent
          class="overflow-hidden"
        >
          <div class="space-y-3 p-3">
            <Show when={input() && Object.keys(input()!).length > 0}>
              <div>
                <h4 class="text-muted-foreground mb-2 text-sm font-medium">Input</h4>
                <div class="rounded bg-surface-strong p-2 font-mono text-sm">
                  <For each={Object.entries(input()!)}>
                    {([key, value]) => (
                      <div class="mb-1">
                        <span class="text-muted-foreground">{key}:</span>{' '}
                        <span>{formatValue(value)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={output()}>
              <div>
                <h4 class="text-muted-foreground mb-2 text-sm font-medium">Output</h4>
                <div tabindex={0} class="max-h-60 overflow-auto rounded bg-surface-strong p-2 font-mono text-sm">
                  <pre class="whitespace-pre-wrap">{formatValue(output())}</pre>
                </div>
              </div>
            </Show>

            <Show when={state() === 'output-error' && local.toolPart.errorText}>
              <div>
                <h4 class="mb-2 text-sm font-medium text-red-600 dark:text-red-400">Error</h4>
                <div class="rounded bg-red-500/10 p-2 text-sm">
                  {local.toolPart.errorText}
                </div>
              </div>
            </Show>

            <Show when={state() === 'input-streaming'}>
              <div class="text-muted-foreground text-sm">Processing tool call...</div>
            </Show>

            <Show when={local.toolPart.toolCallId}>
              <div class="text-muted-foreground pt-2 text-xs">
                <span class="font-mono">Call ID: {local.toolPart.toolCallId}</span>
              </div>
            </Show>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export { Tool };
