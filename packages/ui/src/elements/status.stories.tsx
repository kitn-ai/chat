import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import './status';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-status': JSX.HTMLAttributes<HTMLElement> & { status?: string; pulse?: boolean; label?: string; size?: string; theme?: string };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Status',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

export const States: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: '1.5rem', 'align-items': 'center', padding: '1rem' }}>
      <kai-status status="new" pulse label="New"></kai-status>
      <kai-status status="online" label="Online"></kai-status>
      <kai-status status="busy" label="Busy"></kai-status>
      <kai-status status="away" label="Away"></kai-status>
      <kai-status status="offline" label="Offline"></kai-status>
      <kai-status status="online" size="md" label="Online (md)"></kai-status>
    </div>
  ),
  parameters: src(`<!-- All scalar props: set as plain attributes. -->
<kai-status status="new" pulse label="New"></kai-status>
<kai-status status="online" label="Online"></kai-status>
<kai-status status="busy" label="Busy"></kai-status>
<kai-status status="away" label="Away"></kai-status>
<kai-status status="offline" label="Offline"></kai-status>
<kai-status status="online" size="md" label="Online (md)"></kai-status>`),
};
