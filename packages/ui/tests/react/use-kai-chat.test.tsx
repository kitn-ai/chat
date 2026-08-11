// tests/react/use-kai-chat.test.tsx
// Run with `npm run test:react` (needs a prior `npm run build` — setup.ts imports
// the prebuilt @kitn.ai/ui/elements bundle and the test renders the real <Chat>).
import { render, renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { Chat, useKaiChat } from '@kitn.ai/ui/react';

afterEach(cleanup);
const flush = () => new Promise((r) => setTimeout(r, 0));

test('append/update/remove drive controller state', () => {
  const { result } = renderHook(() => useKaiChat());
  act(() => result.current.append({ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }));
  expect(result.current.messages.map((m) => m.id)).toEqual(['1']);
  act(() => result.current.update('1', { parts: [{ type: 'text', text: 'edited' }] }));
  expect(result.current.messages[0].parts).toEqual([{ type: 'text', text: 'edited' }]);
  act(() => result.current.remove('1'));
  expect(result.current.messages).toEqual([]);
});

test('streamAssistant accretes text parts and toggles loading', () => {
  const { result } = renderHook(() => useKaiChat());
  let stream!: ReturnType<typeof result.current.streamAssistant>;
  act(() => { stream = result.current.streamAssistant({ id: 'a1' }); });
  expect(result.current.loading).toBe(true);
  act(() => { stream.appendText('hel').appendText('lo'); });
  expect(result.current.messages[0].parts).toEqual([{ type: 'text', text: 'hello' }]);
  act(() => stream.done());
  expect(result.current.loading).toBe(false);
});

test('bind drives a real <Chat>: messages reach the element as a live property', async () => {
  let api: ReturnType<typeof useKaiChat> | undefined;
  function Harness() {
    api = useKaiChat({ initialMessages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] });
    return createElement(Chat, { ...api.bind } as unknown as ComponentProps<typeof Chat>);
  }
  const { container } = render(createElement(Harness));
  await flush();
  const el = container.querySelector('kai-chat') as (HTMLElement & { messages: unknown[] }) | null;
  expect(el).not.toBeNull();
  expect(Array.isArray(el!.messages)).toBe(true);
  expect((el!.messages[0] as { parts: { type: string; text: string }[] }).parts).toEqual([
    { type: 'text', text: 'hi' },
  ]);

  act(() => api!.append({ id: '2', role: 'assistant', parts: [{ type: 'text', text: 'yo' }] }));
  await flush();
  expect((el!.messages as unknown[]).length).toBe(2);
});
