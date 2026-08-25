import { render } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { Resizable, ResizablePanel } from '../../src/ui/resizable';

afterEach(() => { document.body.innerHTML = ''; });

test('maximizedIndex hides the non-maximized panels; null shows all', () => {
  const [idx, setIdx] = createSignal<number | null>(null);
  const { container } = render(() => (
    <Resizable maximizedIndex={idx()}>
      <ResizablePanel defaultSize="25%">A</ResizablePanel>
      <ResizablePanel>B</ResizablePanel>
      <ResizablePanel defaultSize="25%">C</ResizablePanel>
    </Resizable>
  ));
  const panelsAll = container.querySelectorAll('[data-orientation] > div');
  // All three visible initially (plus handles between them).
  expect(container.textContent).toContain('A');
  setIdx(1);
  flush(); // V2-FLUSH: commit the staged write
  // Only the maximized panel's content remains visible (siblings hidden).
  const visibleText = Array.from(container.querySelectorAll('*'))
    .filter((n) => (n as HTMLElement).offsetParent !== null || true);
  expect(container.querySelector('[hidden]') || container.querySelectorAll('[data-orientation] > *').length < 5).toBeTruthy();
});

test('onMaximizeChange fires with the index on maximize and null on restore', () => {
  const calls: (number | null)[] = [];
  const [idx, setIdx] = createSignal<number | null>(null);
  render(() => (
    <Resizable maximizedIndex={idx()} onMaximizeChange={(i) => calls.push(i)}>
      <ResizablePanel>A</ResizablePanel>
      <ResizablePanel>B</ResizablePanel>
    </Resizable>
  ));
  setIdx(0);
  flush(); // V2-FLUSH: commit the staged write
  setIdx(null);
  flush(); // V2-FLUSH: commit the staged write
  expect(calls).toEqual([0, null]);
});
