import { omit, createSignal, createContext, useContext, createEffect, onCleanup, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Portal } from '@solidjs/web';
import { cn } from '../utils/cn';

interface FileUploadContextValue {
  isDragging: () => boolean;
  inputRef: HTMLInputElement | undefined;
  setInputRef: (el: HTMLInputElement) => void;
  multiple?: boolean;
  disabled?: boolean;
}

const FileUploadContext = createContext<FileUploadContextValue>();

// --- FileUpload (Root) ---

export interface FileUploadProps {
  onFilesAdded: (files: File[]) => void;
  children: JSX.Element;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
}

function FileUpload(props: FileUploadProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;
  let inputRef: HTMLInputElement | undefined;
  const [isDragging, setIsDragging] = createSignal(false);
  let dragCounter = 0;

  const multiple = () => local.multiple ?? true;

  const handleFiles = (files: FileList) => {
    const newFiles = Array.from(files);
    if (multiple()) {
      local.onFilesAdded(newFiles);
    } else {
      local.onFilesAdded(newFiles.slice(0, 1));
    }
  };

  // V2-PORT: a depless mount effect — empty compute; the listener wiring is the
  // apply, and the in-effect onCleanup became the returned cleanup.
  createEffect(() => undefined, () => {
    const handleDrag = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragIn = (e: DragEvent) => {
      handleDrag(e);
      dragCounter++;
      if (e.dataTransfer?.items.length) setIsDragging(true);
    };

    const handleDragOut = (e: DragEvent) => {
      handleDrag(e);
      dragCounter--;
      if (dragCounter === 0) setIsDragging(false);
    };

    const handleDrop = (e: DragEvent) => {
      handleDrag(e);
      setIsDragging(false);
      dragCounter = 0;
      if (e.dataTransfer?.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    };

    // Captured at SETUP and closed over, never re-resolved as a global inside
    // `onCleanup`: cleanup can run after the host removed the DOM globals (a
    // `kai-*` release is deferred one microtask past detachment, so an
    // environment teardown gets in between), and a bare `window` there throws.
    // See tests/components/teardown-without-dom-globals.test.tsx.
    const win = window;
    win.addEventListener('dragenter', handleDragIn);
    win.addEventListener('dragleave', handleDragOut);
    win.addEventListener('dragover', handleDrag);
    win.addEventListener('drop', handleDrop);

    return () => {
      win.removeEventListener('dragenter', handleDragIn);
      win.removeEventListener('dragleave', handleDragOut);
      win.removeEventListener('dragover', handleDrag);
      win.removeEventListener('drop', handleDrop);
    };
  });

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files?.length) {
      handleFiles(target.files);
      target.value = '';
    }
  };

  const contextValue: FileUploadContextValue = {
    isDragging,
    get inputRef() { return inputRef; },
    setInputRef: (el: HTMLInputElement) => { inputRef = el; },
    multiple: local.multiple,
    disabled: local.disabled,
  };

  return (
    <FileUploadContext value={contextValue}>
      <input
        type="file"
        ref={(el) => { inputRef = el; }}
        onInput={handleFileSelect}
        class="hidden"
        multiple={multiple()}
        accept={local.accept}
        aria-hidden="true"
        disabled={local.disabled}
      />
      {local.children}
    </FileUploadContext>
  );
}

// --- FileUploadTrigger ---

export interface FileUploadTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function FileUploadTrigger(props: FileUploadTriggerProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'children');
  const context = useContext(FileUploadContext);

  const handleClick = () => context?.inputRef?.click();

  return (
    <button
      type="button"
      class={local.class}
      onClick={handleClick}
      {...rest}
    >
      {local.children}
    </button>
  );
}

// --- FileUploadContent ---

export interface FileUploadContentProps extends JSX.HTMLAttributes<HTMLDivElement> {}

function FileUploadContent(props: FileUploadContentProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class');
  const context = useContext(FileUploadContext);

  return (
    <Show when={context && context.isDragging() && !context.disabled}>
      <Portal>
        <div
          class={cn(
            'bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm',
            'animate-in fade-in-0 slide-in-from-bottom-10 zoom-in-90 duration-150',
            local.class
          )}
          {...rest}
        />
      </Portal>
    </Show>
  );
}

export { FileUpload, FileUploadTrigger, FileUploadContent };
