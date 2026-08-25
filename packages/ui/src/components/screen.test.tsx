import { flush } from 'solid-js';
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Screen } from './screen';

afterEach(cleanup);

describe('Screen', () => {
  it('renders the header with the title and a back button when open', () => {
    const { getByText, getByRole } = render(() => (
      <Screen defaultOpen title="Design">
        <p>Body</p>
      </Screen>
    ));
    expect(getByText('Design')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('renders the body children', () => {
    const { getByText } = render(() => (
      <Screen defaultOpen title="Design">
        <p>Hello body</p>
      </Screen>
    ));
    expect(getByText('Hello body')).toBeInTheDocument();
  });

  it('takes dialog semantics labelled by its title', () => {
    const { getByRole } = render(() => (
      <Screen defaultOpen title="Design">
        <p>Body</p>
      </Screen>
    ));
    const dialog = getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Design');
  });

  it('invokes onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    const { getByRole } = render(() => (
      <Screen defaultOpen title="Design" onBack={onBack}>
        <p>Body</p>
      </Screen>
    ));
    fireEvent.click(getByRole('button', { name: 'Back' }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('invokes onBack when Escape is pressed on the surface', () => {
    const onBack = vi.fn();
    const { getByRole } = render(() => (
      <Screen defaultOpen title="Design" onBack={onBack}>
        <p>Body</p>
      </Screen>
    ));
    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the back button when back is false', () => {
    const { queryByRole } = render(() => (
      <Screen defaultOpen title="Design" back={false}>
        <p>Body</p>
      </Screen>
    ));
    expect(queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders nothing when not open', () => {
    const { queryByRole } = render(() => (
      <Screen title="Design">
        <p>Body</p>
      </Screen>
    ));
    expect(queryByRole('dialog')).toBeNull();
  });

  it('prefers a projected title slot over the title prop', () => {
    const { getByText, queryByText } = render(() => (
      <Screen defaultOpen title="Prop title" titleSlot={<span>Slot title</span>}>
        <p>Body</p>
      </Screen>
    ));
    expect(getByText('Slot title')).toBeInTheDocument();
    expect(queryByText('Prop title')).toBeNull();
  });

  it('marks sibling elements inert + aria-hidden while open and restores on close', () => {
    const host = document.createElement('div');
    const sibling = document.createElement('section');
    document.body.append(sibling, host);

    const [open, setOpen] = (() => {
      let api: { setOpen: (v: boolean) => void } | undefined;
      render(
        () => (
          <Screen defaultOpen host={() => host} controllerRef={(a) => (api = a)}>
            <p>Body</p>
          </Screen>
        ),
        { container: host },
      );
      return [() => api!, (v: boolean) => api!.setOpen(v)] as const;
    })();
    void open;

    expect(sibling).toHaveAttribute('inert');
    expect(sibling).toHaveAttribute('aria-hidden', 'true');

    setOpen(false);
    flush(); // V2-FLUSH: commit the staged write
    expect(sibling).not.toHaveAttribute('inert');
    expect(sibling).not.toHaveAttribute('aria-hidden');

    sibling.remove();
    host.remove();
  });

  it('skips inert-ing siblings when noInert is set', () => {
    const host = document.createElement('div');
    const sibling = document.createElement('section');
    document.body.append(sibling, host);

    render(
      () => (
        <Screen defaultOpen noInert host={() => host}>
          <p>Body</p>
        </Screen>
      ),
      { container: host },
    );

    expect(sibling).not.toHaveAttribute('inert');

    sibling.remove();
    host.remove();
  });
});
