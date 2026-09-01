import { type JSX, splitProps, createSignal, createContext, useContext, createEffect, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
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
  const [local] = splitProps(props, ['onFilesAdded', 'children', 'multiple', 'accept', 'disabled']);
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

  createEffect(() => {
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

    // Captured at SETUP and closed over, never re-resolved inside `onCleanup`:
    // cleanup can run after the host removed the DOM globals (a `kai-*` release
    // is deferred one microtask past detachment, so an environment teardown
    // gets in between). The FUNCTION, not the view: `window === globalThis`, so
    // `const win = window` captures the global object itself — which survives —
    // while teardown deletes the `removeEventListener` key off that very
    // object, leaving `win.removeEventListener` undefined at cleanup (a
    // TypeError instead of the ReferenceError the view capture fixes; watched
    // failing in CI as an unhandled rejection from the emitted project). Same
    // rule the raf primitives follow for `cancelAnimationFrame`.
    // See tests/components/teardown-without-dom-globals.test.tsx.
    const win = window;
    const unlisten = win.removeEventListener.bind(win);
    win.addEventListener('dragenter', handleDragIn);
    win.addEventListener('dragleave', handleDragOut);
    win.addEventListener('dragover', handleDrag);
    win.addEventListener('drop', handleDrop);

    onCleanup(() => {
      unlisten('dragenter', handleDragIn);
      unlisten('dragleave', handleDragOut);
      unlisten('dragover', handleDrag);
      unlisten('drop', handleDrop);
    });
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
    <FileUploadContext.Provider value={contextValue}>
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
    </FileUploadContext.Provider>
  );
}

// --- FileUploadTrigger ---

export interface FileUploadTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function FileUploadTrigger(props: FileUploadTriggerProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
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
  const [local, rest] = splitProps(props, ['class']);
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
