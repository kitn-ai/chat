import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { DerivedBuilderPanel } from '../components/builder-panel-derived';
import { buildableTemplates, type BuildableTemplate } from '../../mcp/construct/templates';
import { validateConstruct, type Construct, type ConstructProblem } from '../../mcp/construct/schema';

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

// DerivedBuilderPanel is internal to the builder app (src/components/builder-panel-derived.tsx,
// consumed by apps/builder/App.tsx) -- it ships in no public @kitn.ai/ui entry point, so the
// snippet below shows real call-site usage rather than a package import.
const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

export const SupportWidget: StoryObj = {
  render: () => <Demo template={buildableTemplates().find((t) => t.id === 'widget')!} />,
  ...src(`<DerivedBuilderPanel
  value={construct}
  onChange={setConstruct}
  template={widgetTemplate}
  problems={validateConstruct(construct).ok ? [] : validateConstruct(construct).problems}
/>`),
};
export const InAppAssistant: StoryObj = {
  render: () => <Demo template={buildableTemplates().find((t) => t.id === 'inAppAssistant')!} />,
  ...src(`<DerivedBuilderPanel value={construct} onChange={setConstruct} template={inAppAssistantTemplate} problems={problems} />`),
};
export const Assistant: StoryObj = {
  render: () => <Demo template={buildableTemplates().find((t) => t.id === 'assistant')!} />,
  ...src(`<DerivedBuilderPanel value={construct} onChange={setConstruct} template={assistantTemplate} problems={problems} />`),
};
export const Research: StoryObj = {
  render: () => <Demo template={buildableTemplates().find((t) => t.id === 'research')!} />,
  ...src(`<DerivedBuilderPanel value={construct} onChange={setConstruct} template={researchTemplate} problems={problems} />`),
};
export const Workspace: StoryObj = {
  render: () => <Demo template={buildableTemplates().find((t) => t.id === 'workspace')!} />,
  ...src(`<DerivedBuilderPanel value={construct} onChange={setConstruct} template={workspaceTemplate} problems={problems} />`),
};
