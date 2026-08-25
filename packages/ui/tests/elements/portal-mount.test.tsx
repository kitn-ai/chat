import { flush } from 'solid-js';
import { render, fireEvent, screen } from '@solidjs/testing-library';
import { ChatConfig } from '../../src/primitives/chat-config';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from '../../src/ui/dropdown';

test('dropdown content portals into the configured mount node when open', () => {
  const mount = document.createElement('div');
  mount.id = 'kitn-portal';
  document.body.appendChild(mount);

  render(() => (
    <ChatConfig portalMount={mount}>
      <Dropdown>
        <DropdownTrigger as={(p: any) => <button {...p} data-testid="trg">open</button>} />
        <DropdownContent>
          <DropdownItem>Item A</DropdownItem>
        </DropdownContent>
      </Dropdown>
    </ChatConfig>
  ));

  fireEvent.click(screen.getByTestId('trg'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(mount.textContent).toContain('Item A');
  mount.remove();
});
