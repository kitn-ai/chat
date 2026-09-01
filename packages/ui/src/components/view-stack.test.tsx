/**
 * Behavioral tests for the P-3 view navigator (ViewStack + View +
 * createViewStack). These pin the drilled/tab-root semantics the plan names,
 * because this is the model the spike drifted on twice:
 *
 *   - a DRILLED view exposes a back affordance and hides the tab bar;
 *   - a TAB ROOT shows the tab bar and no back affordance;
 *   - tab-root switching resets nothing by default (views stay mounted);
 *   - push / back / replace / selectTab / navigate semantics;
 *   - the deep-link `view` prop, roots and drills alike.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { createRoot, createSignal } from 'solid-js';
import {
  ViewStack,
  View,
  createViewStack,
  useViewStack,
  type ViewEntry,
  type ViewStackController,
  type ViewStackState,
} from './view-stack';

afterEach(cleanup);

const WIDGET_ENTRIES: ViewEntry[] = [
  { name: 'home', tabRoot: true },
  { name: 'messages', tabRoot: true },
  { name: 'chat', tabRoot: false },
];

/** Run a headless-controller scenario inside a disposed reactive root. */
function withController(
  fn: (c: ViewStackController, onViewChange: ReturnType<typeof vi.fn>) => void,
  options: { initialView?: string; entries?: ViewEntry[] } = {},
) {
  createRoot((dispose) => {
    const onViewChange = vi.fn();
    const c = createViewStack({
      entries: () => options.entries ?? WIDGET_ENTRIES,
      initialView: options.initialView,
      onViewChange,
    });
    fn(c, onViewChange);
    dispose();
  });
}

describe('createViewStack — the headless model', () => {
  it('boots on the first tab root, un-drilled', () => {
    withController((c) => {
      expect(c.view()).toBe('home');
      expect(c.root()).toBe('home');
      expect(c.drilled()).toBe(false);
      expect(c.stack()).toEqual([]);
    });
  });

  it('push drills: the pushed view shows and drilled becomes true', () => {
    withController((c) => {
      c.push('chat');
      expect(c.view()).toBe('chat');
      expect(c.drilled()).toBe(true);
      // The root is still what the tab bar should mark active while drilled.
      expect(c.root()).toBe('home');
    });
  });

  it('back pops to wherever the drill was entered from', () => {
    withController((c) => {
      c.selectTab('messages');
      c.push('chat');
      c.back();
      expect(c.view()).toBe('messages');
      // The root the drill was entered from, NOT the default root — the leg
      // the first block build found broken at the element seam (the facade
      // was re-creating the controller; see the untrack note in
      // elements/view-stack.tsx and tests/elements/view-stack-element.test.tsx).
      expect(c.root()).toBe('messages');
      expect(c.drilled()).toBe(false);
    });
  });

  it('back at a tab root is a no-op (nothing to go back to)', () => {
    withController((c, onViewChange) => {
      c.back();
      expect(c.view()).toBe('home');
      expect(c.drilled()).toBe(false);
      expect(onViewChange).not.toHaveBeenCalled();
    });
  });

  it('replace while drilled swaps the top without growing history', () => {
    const entries = [...WIDGET_ENTRIES, { name: 'details', tabRoot: false }];
    withController(
      (c) => {
        c.push('chat');
        c.replace('details');
        expect(c.view()).toBe('details');
        expect(c.stack()).toEqual(['details']);
        // back skips the replaced view entirely.
        c.back();
        expect(c.view()).toBe('home');
        expect(c.drilled()).toBe(false);
      },
      { entries },
    );
  });

  it('replace at a root swaps the root view: no drill, no back affordance', () => {
    withController((c) => {
      c.replace('chat');
      expect(c.view()).toBe('chat');
      expect(c.drilled()).toBe(false);
      expect(c.stack()).toEqual([]);
    });
  });

  it('selectTab switches the root and clears any drill', () => {
    withController((c) => {
      c.push('chat');
      c.selectTab('messages');
      expect(c.view()).toBe('messages');
      expect(c.root()).toBe('messages');
      expect(c.drilled()).toBe(false);
    });
  });

  it('selectTab ignores names not registered as tab roots', () => {
    withController((c, onViewChange) => {
      c.selectTab('chat');
      expect(c.view()).toBe('home');
      expect(onViewChange).not.toHaveBeenCalled();
    });
  });

  it('pushing a TAB ROOT can never drill: it routes to selectTab', () => {
    withController((c) => {
      c.push('messages');
      expect(c.view()).toBe('messages');
      expect(c.root()).toBe('messages');
      expect(c.drilled()).toBe(false);
    });
  });

  it('push/replace ignore unknown names', () => {
    withController((c, onViewChange) => {
      c.push('nope');
      c.replace('nope');
      expect(c.view()).toBe('home');
      expect(onViewChange).not.toHaveBeenCalled();
    });
  });

  it('deep link to a tab root boots on that root, un-drilled', () => {
    withController(
      (c) => {
        expect(c.view()).toBe('messages');
        expect(c.root()).toBe('messages');
        expect(c.drilled()).toBe(false);
      },
      { initialView: 'messages' },
    );
  });

  it('deep link to a drill view boots DRILLED over the default root, so back works from the first frame', () => {
    withController(
      (c) => {
        expect(c.view()).toBe('chat');
        expect(c.drilled()).toBe(true);
        c.back();
        expect(c.view()).toBe('home');
        expect(c.drilled()).toBe(false);
      },
      { initialView: 'chat' },
    );
  });

  it('resolves a deep link lazily against late-registering entries (attribute set before children upgrade)', () => {
    createRoot((dispose) => {
      const [entries, setEntries] = createSignal<ViewEntry[]>([]);
      const c = createViewStack({ entries, initialView: 'chat' });
      expect(c.view()).toBeUndefined();
      setEntries(WIDGET_ENTRIES);
      expect(c.view()).toBe('chat');
      expect(c.drilled()).toBe(true);
      dispose();
    });
  });

  it('navigate: tab root selects the tab; a drill view pushes at a root and replaces while drilled', () => {
    const entries = [...WIDGET_ENTRIES, { name: 'details', tabRoot: false }];
    withController(
      (c) => {
        c.navigate('chat');
        expect(c.view()).toBe('chat');
        expect(c.drilled()).toBe(true);
        c.navigate('details');
        expect(c.stack()).toEqual(['details']);
        c.navigate('home');
        expect(c.view()).toBe('home');
        expect(c.drilled()).toBe(false);
      },
      { entries },
    );
  });

  it('onViewChange reports { view, root, drilled, stack } per navigation and skips no-ops', () => {
    withController((c, onViewChange) => {
      c.push('chat');
      expect(onViewChange).toHaveBeenCalledTimes(1);
      expect(onViewChange).toHaveBeenLastCalledWith({
        view: 'chat',
        root: 'home',
        drilled: true,
        stack: ['chat'],
      } satisfies ViewStackState);
      c.selectTab('messages');
      expect(onViewChange).toHaveBeenLastCalledWith({
        view: 'messages',
        root: 'messages',
        drilled: false,
        stack: [],
      } satisfies ViewStackState);
      // Re-selecting the current tab changes nothing visible: no event.
      c.selectTab('messages');
      expect(onViewChange).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// The rendered components
// ---------------------------------------------------------------------------

function Harness(props: { view?: string; onController: (c: ViewStackController) => void }) {
  const [state, setState] = createSignal<ViewStackState>();
  const drilled = () => state()?.drilled ?? props.view === 'chat';
  return (
    <>
      <ViewStack view={props.view} controller={props.onController} onViewChange={setState}>
        <View name="home" tabRoot>
          <input data-testid="home-input" />
        </View>
        <View name="messages" tabRoot>
          <p>messages list</p>
        </View>
        <View name="chat">
          <BackButton />
        </View>
      </ViewStack>
      {/* The stub tab bar: consumes the reported drilled state to hide itself. */}
      {!drilled() && <nav data-testid="tab-bar" />}
    </>
  );
}

function BackButton() {
  const { back, drilled } = useViewStack();
  return (
    <button data-testid="back" hidden={!drilled()} onClick={() => back()}>
      Back
    </button>
  );
}

describe('<ViewStack> / <View> — rendered behavior', () => {
  it('shows only the current view; the others stay mounted and hidden', () => {
    let controller!: ViewStackController;
    const { container } = render(() => <Harness onController={(c) => (controller = c)} />);
    const viewEl = (name: string) => container.querySelector(`[data-view-name="${name}"]`)!;
    expect(viewEl('home')).not.toHaveAttribute('hidden');
    expect(viewEl('messages')).toHaveAttribute('hidden');
    expect(viewEl('chat')).toHaveAttribute('hidden');
    controller.push('chat');
    expect(viewEl('home')).toHaveAttribute('hidden');
    expect(viewEl('chat')).not.toHaveAttribute('hidden');
    // Mounted while hidden: the DOM is still there, only hidden.
    expect(viewEl('home').querySelector('input')).not.toBeNull();
  });

  it('tab-root switching resets NOTHING by default: per-view DOM state survives', async () => {
    let controller!: ViewStackController;
    const { getByTestId } = render(() => <Harness onController={(c) => (controller = c)} />);
    const input = getByTestId('home-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'half-typed reply' } });
    controller.selectTab('messages');
    controller.push('chat');
    controller.back();
    controller.selectTab('home');
    // Same node, same value: nothing was unmounted or recreated.
    expect(getByTestId('home-input')).toBe(input);
    expect(input.value).toBe('half-typed reply');
  });

  it('exposes drilled state a sibling tab bar consumes to hide itself, and a back affordance inside the drill', () => {
    let controller!: ViewStackController;
    const { queryByTestId, getByTestId } = render(() => <Harness onController={(c) => (controller = c)} />);
    // Tab root: tab bar present, back hidden.
    expect(queryByTestId('tab-bar')).not.toBeNull();
    expect(getByTestId('back')).toHaveAttribute('hidden');
    controller.push('chat');
    // Drilled: THE rule — tab bar gone, back affordance visible.
    expect(queryByTestId('tab-bar')).toBeNull();
    expect(getByTestId('back')).not.toHaveAttribute('hidden');
    fireEvent.click(getByTestId('back'));
    expect(queryByTestId('tab-bar')).not.toBeNull();
  });

  it('carries data-view / data-drilled hooks on the container', () => {
    let controller!: ViewStackController;
    const { container } = render(() => <Harness onController={(c) => (controller = c)} />);
    const wrapper = container.querySelector('[data-view]')!;
    expect(wrapper).toHaveAttribute('data-view', 'home');
    expect(wrapper).toHaveAttribute('data-drilled', 'false');
    controller.push('chat');
    expect(wrapper).toHaveAttribute('data-view', 'chat');
    expect(wrapper).toHaveAttribute('data-drilled', 'true');
  });

  it('deep-links via the view prop, drill views included', () => {
    let controller!: ViewStackController;
    const { container, getByTestId } = render(() => (
      <Harness view="chat" onController={(c) => (controller = c)} />
    ));
    expect(container.querySelector('[data-view-name="chat"]')).not.toHaveAttribute('hidden');
    expect(getByTestId('back')).not.toHaveAttribute('hidden');
    controller.back();
    expect(container.querySelector('[data-view-name="home"]')).not.toHaveAttribute('hidden');
  });

  it('navigates when the view prop changes after mount', () => {
    const [view, setView] = createSignal<string | undefined>(undefined);
    let controller!: ViewStackController;
    const { container } = render(() => <Harness view={view()} onController={(c) => (controller = c)} />);
    expect(container.querySelector('[data-view]')).toHaveAttribute('data-view', 'home');
    setView('messages');
    expect(container.querySelector('[data-view]')).toHaveAttribute('data-view', 'messages');
    expect(controller.drilled()).toBe(false);
  });
});
