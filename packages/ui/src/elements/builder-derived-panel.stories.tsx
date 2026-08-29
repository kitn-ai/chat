import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { DerivedBuilderPanel } from '../components/builder-panel-derived';
import { buildableTemplates, type BuildableTemplate } from '../agent-tooling/construct/templates';
import { validateConstruct, type Construct, type ConstructProblem } from '../agent-tooling/construct/schema';

/**
 * Labs/Builder/Derived panel — the B-19 panel, one story per buildable
 * template, driven by the REAL registry manifest + REAL ConstructSchema
 * walk. The right column shows the live construct JSON plus live
 * validateConstruct problems, so a rejected edit is visible immediately —
 * the same loud path the kai dev --builder write endpoint uses.
 */
function Demo(props: { template: BuildableTemplate }) {
  const [value, setValue] = createSignal<Construct>(props.template.starter);
  const problems = (): ConstructProblem[] => {
    const out = validateConstruct(value());
    return out.ok ? [] : out.problems;
  };
  return (
    <div class="grid h-dvh grid-cols-[380px_1fr] bg-background text-foreground">
      <div class="overflow-y-auto border-r border-border">
        <DerivedBuilderPanel value={value()} onChange={setValue} template={props.template} problems={problems()} />
      </div>
      <pre class="overflow-auto p-4 text-xs">{JSON.stringify(value(), null, 2)}</pre>
    </div>
  );
}

const meta = { title: 'Labs/Builder/Derived panel', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;

export const SupportWidget: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'widget')!} /> };
export const InAppAssistant: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'inAppAssistant')!} /> };
export const Assistant: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'assistant')!} /> };
export const Research: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'research')!} /> };
export const Workspace: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'workspace')!} /> };
