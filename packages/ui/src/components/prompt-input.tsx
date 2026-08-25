import { omit, createSignal, createContext, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { useChatConfig, textClass } from '../primitives/chat-config';
import { Composer, type TriggerDef, type ComposerChange } from './composer';
import type { ComposerDoc } from '../primitives/composer-model';

// --- Context ---

interface PromptInputContextType {
  isLoading: boolean;
  // A string (controlled text) or a ComposerDoc (a seed that pre-populates pills).
  value: () => string | ComposerDoc;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
  textareaRef: HTMLElement | undefined;
  setTextareaRef: (el: HTMLElement) => void;
}

const PromptInputContext = createContext<PromptInputContextType>();

function usePromptInput() {
  const ctx = useContext(PromptInputContext);
  if (!ctx) throw new Error('PromptInput subcomponents must be used within PromptInput');
  return ctx;
}

// --- PromptInput (Root) ---

export interface PromptInputProps extends JSX.HTMLAttributes<HTMLDivElement> {
  isLoading?: boolean;
  /** String = controlled text; ComposerDoc = a seed that pre-populates pills. */
  value?: string | ComposerDoc;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: JSX.Element;
  disabled?: boolean;
}

function PromptInput(props: PromptInputProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 
    'isLoading', 'value', 'onValueChange', 'maxHeight', 'onSubmit',
    'children', 'disabled', 'class', 'onClick');

  const [internalValue, setInternalValue] = createSignal<string | ComposerDoc>(local.value ?? '');
  let textareaRef: HTMLElement | undefined;

  const handleChange = (newValue: string) => {
    setInternalValue(newValue);
    local.onValueChange?.(newValue);
  };

  const handleClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (e) => {
    if (!local.disabled) textareaRef?.focus();
    if (typeof local.onClick === 'function') {
      (local.onClick as (e: MouseEvent & { currentTarget: HTMLDivElement }) => void)(e);
    }
  };

  return (
    <PromptInputContext
      value={{
        isLoading: local.isLoading ?? false,
        value: () => local.value ?? internalValue(),
        setValue: local.onValueChange ?? handleChange,
        maxHeight: local.maxHeight ?? 240,
        onSubmit: local.onSubmit,
        get disabled() { return local.disabled; },
        get textareaRef() { return textareaRef; },
        setTextareaRef: (el) => { textareaRef = el; },
      }}
    >
      <div
        data-prompt-input
        onClick={handleClick}
        class={cn(
          // The inner textarea neutralizes its own ring (focus-visible:ring-0),
          // so the FRAME owns the focus affordance: a blue ring whenever a
          // control inside it is focused. Without this the composer had no
          // visible keyboard-focus state.
          'bg-surface cursor-text rounded-xl p-2 shadow-xs',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0',
          local.disabled && 'cursor-not-allowed opacity-60',
          local.class
        )}
        {...rest}
      >
        {local.children}
      </div>
    </PromptInputContext>
  );
}

// --- PromptInputTextarea ---

export interface PromptInputTextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  disableAutosize?: boolean;
  /** Rich entity triggers (`/`, `@`) forwarded to the composer. */
  triggers?: TriggerDef[];
  /** Default icon per entity kind (kind → image src), forwarded to the composer. */
  kindIcons?: Record<string, string>;
  /** Structured change (doc + entities) from the composer, on every edit. */
  onComposerChange?: (change: ComposerChange) => void;
}

function PromptInputTextarea(props: PromptInputTextareaProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;
  const ctx = usePromptInput();
  const config = useChatConfig();

  // The editable mirrors the original <textarea>'s classes EXACTLY so swapping in
  // the contenteditable composer is visually identical. The frame (PromptInput
  // root) still owns radius/bg/padding/focus-ring; auto-grow is native to a
  // contenteditable block (capped via max-height on the editable).
  const editableClass = () =>
    cn(
      'text-foreground min-h-[44px] w-full bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-y-auto whitespace-pre-wrap break-words',
      textClass(config.proseSize()),
      local.class,
    );

  return (
    <Composer
      bare
      value={ctx.value()}
      placeholder={local.placeholder as string | undefined}
      ariaLabel={local['aria-label'] as string | undefined}
      disabled={ctx.disabled}
      maxHeight={ctx.maxHeight}
      editableClass={editableClass()}
      editableRef={(el) => ctx.setTextareaRef(el)}
      triggers={local.triggers}
      kindIcons={local.kindIcons}
      // Surface the structured change (doc/entities) BEFORE the string value, so a
      // consumer that enriches its events has the latest doc when value-change fires.
      // A prompt can't start with whitespace — strip leading whitespace from the
      // string value (parity with the old textarea); the controlled round-trip
      // re-renders the editable so the stripped value shows too.
      onChange={(c) => { local.onComposerChange?.(c); ctx.setValue(c.text.replace(/^\s+/, '')); }}
      onSubmit={() => { if (!ctx.disabled) ctx.onSubmit?.(); }}
    />
  );
}

// --- PromptInputActions ---

export interface PromptInputActionsProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function PromptInputActions(props: PromptInputActionsProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class');
  return (
    <div class={cn('flex items-center gap-2', local.class)} {...rest}>
      {local.children}
    </div>
  );
}

// --- PromptInputAction ---

export interface PromptInputActionProps {
  tooltip?: string;
  children: JSX.Element;
  side?: 'top' | 'bottom' | 'left' | 'right';
  class?: string;
}

function PromptInputAction(props: PromptInputActionProps) {
  return <>{props.children}</>;
}

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
  usePromptInput,
};
