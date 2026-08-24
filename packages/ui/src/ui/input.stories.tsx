import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Search } from 'lucide-solid';
import { Input } from './input';
import { Button } from './button';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: {
        exclude: [
          'leading', 'trailing', 'onValueInput', 'onValueChange', 'onMaskReject', 'class', 'children',
        ],
      },
      description: componentDescription([
        'The token-themed single-line text field. A `label`, `hint`, and `error` stack around a field row that holds an optional `leading` affix, the `<input>`, and an optional `trailing` affix. Pick density with `size`. Set `invalid` (or a non-empty `error`) for the destructive state.',
      ]),
    },
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Control density.',
      table: { defaultValue: { summary: 'md' } },
    },
    label: { control: 'text', description: 'Field label, linked to the input.' },
    hint: { control: 'text', description: 'Helper text below the control.' },
    error: { control: 'text', description: 'Error text; flips the field invalid.' },
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    invalid: { control: 'boolean', description: 'Force the invalid state without an error string.' },
    format: {
      control: 'text',
      description:
        'Mask pattern: `#` a digit, `@` a letter or digit, `*` an obscurable letter or digit, everything else a positional literal. `default` resolves the default format of `semantic`.',
    },
    guide: {
      control: 'text',
      description: 'Placeholder guide at unfilled positions, aligned position for position with `format`.',
    },
    semantic: {
      control: 'select',
      // A deliberate SUBSET of FIELD_SEMANTIC_TYPES, not a copy of it: `ssn` is a real
      // member of the enum and stays supported, but no story, demo or fixture in this
      // repo puts a social security number on screen.
      options: ['tel', 'credit-card', 'custom'],
      description:
        'Semantic type. Sets `inputmode` / `autocomplete` / `spellcheck` / `autocorrect` / `autocapitalize` and decides the canonical value. Never starts masking on its own.',
    },
    caseMode: {
      control: 'inline-radio',
      options: ['preserve', 'upper', 'lower'],
      description: 'Case folding applied to typed and pasted text.',
      table: { defaultValue: { summary: 'preserve' } },
    },
    copyPolicy: {
      control: 'inline-radio',
      options: ['canonical', 'formatted', 'obscured', 'blocked'],
      description: 'What a copy or cut of a masked field puts on the clipboard.',
      table: { defaultValue: { summary: 'canonical' } },
    },
  },
  args: {
    size: 'md',
    placeholder: 'Acme Inc.',
    disabled: false,
    invalid: false,
  },
  render: (args) => (
    <div class="max-w-sm">
      <Input {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Input } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: toggle the controls to explore the field. */
export const Default: Story = {
  ...src(`<Input placeholder="Acme Inc." onValueInput={setName} />`),
};

/** A labelled field with helper text below it. */
export const WithLabelHint: Story = {
  args: { label: 'Workspace name', hint: 'Shown to everyone you invite.' },
  ...src(`<Input
  label="Workspace name"
  hint="Shown to everyone you invite."
  placeholder="Acme Inc."
/>`),
};

/** The invalid state: a destructive border with the error text linked for a11y. */
export const Error: Story = {
  args: { label: 'Workspace name', value: 'a', error: 'Use at least 3 characters.' },
  ...src(`<Input
  label="Workspace name"
  value="a"
  error="Use at least 3 characters."
/>`),
};

/** Both densities, side by side. */
export const Sizes: Story = {
  render: () => (
    <div class="flex max-w-sm flex-col gap-3">
      <Input size="sm" placeholder="Small" />
      <Input size="md" placeholder="Medium (default)" />
    </div>
  ),
  ...src(`<Input size="sm" placeholder="Small" />
<Input size="md" placeholder="Medium (default)" />`),
};

/**
 * Four masked fields, four different shapes. Type into them: the literals appear as you
 * reach them, and a character that does not fit the position is refused rather than
 * swallowed silently.
 *
 * The ticket field is the lenient one — typing or pasting `chg4821` lands as `CHG-4821`,
 * because the normalizer consumes a literal run that is already there instead of feeding
 * it back into the first fill position.
 *
 * The date field is a MASK, not a validator. It shapes `##/##/####` and nothing more:
 * `99/99/9999` types perfectly happily. Whether a date is real is the consumer's call,
 * and the kit does not make it.
 */
export const MaskedFormats: Story = {
  render: () => (
    <div class="flex max-w-sm flex-col gap-4">
      <Input
        label="Ticket"
        format="@@@-####"
        caseMode="upper"
        hint="Three letters, a dash, four digits. chg4821 works too."
      />
      <Input
        label="Renewal date"
        format="##/##/####"
        guide="mm/dd/yyyy"
        hint="A mask, not a date check: it shapes the digits and validates nothing."
      />
      <Input
        label="Phone"
        semantic="tel"
        format="default"
        guide="   -   -    "
        hint="Ten digits. Submitted as digits only."
      />
      <Input
        label="Asset serial"
        format="SN-@@##-####"
        caseMode="upper"
        hint="Two letters then two digits, then four digits."
      />
    </div>
  ),
  ...src(`<Input label="Ticket" format="@@@-####" caseMode="upper"
  hint="Three letters, a dash, four digits." />

<Input label="Renewal date" format="##/##/####" guide="mm/dd/yyyy"
  hint="A mask, not a date check." />

<Input label="Phone" semantic="tel" format="default" guide="   -   -    " />

<Input label="Asset serial" format="SN-@@##-####" caseMode="upper" />`),
};

/**
 * `semantic` on its own is tier 1: it sets `inputmode`, `autocomplete`, `spellcheck`,
 * `autocorrect` and `autocapitalize` for the field and decides what the canonical value
 * looks like. It never starts masking by itself — `format="default"` is the opt-in that
 * does that.
 */
export const SemanticOnly: Story = {
  args: {
    label: 'Phone',
    semantic: 'tel',
    hint: 'A numeric keypad and an autofill hint. No mask: type it however you like.',
  },
  ...src(`<Input label="Phone" semantic="tel" />`),
};

/**
 * A refusal is reported, never swallowed. `onMaskReject` fires with `full`,
 * `wrong-class` or `over-capacity`; wire it to a polite live region so a screen-reader
 * user learns why a keystroke did nothing. It is NOT an error state — the field stays
 * valid, and `invalid` remains the consumer's to set.
 */
export const AnnouncedRejections: Story = {
  render: () => {
    let region: HTMLParagraphElement | undefined;
    const announce = (detail: { reason: string; data: string }) => {
      const text =
        detail.reason === 'wrong-class'
          ? `${detail.data} does not belong in this position.`
          : detail.reason === 'over-capacity'
            ? 'That is longer than this field holds; the rest was dropped.'
            : 'This field is full.';
      if (region) region.textContent = text;
    };
    return (
      <div class="flex max-w-sm flex-col gap-2">
        <Input
          label="Employee id"
          format="EMP-#####"
          caseMode="upper"
          hint="Five digits after the prefix."
          onMaskReject={announce}
        />
        <p ref={region} aria-live="polite" class="text-xs text-muted-foreground" />
      </div>
    );
  },
  ...src(`<Input
  label="Employee id"
  format="EMP-#####"
  caseMode="upper"
  onMaskReject={(d) => announce(d.reason, d.data)}
/>`),
};

/** Affixes: a leading search icon and a trailing inline button, wrapped by the field border. */
export const WithLeadingIconAndTrailingButton: Story = {
  render: () => (
    <div class="max-w-sm">
      <Input
        placeholder="Search projects"
        leading={<Search class="size-4" aria-hidden="true" />}
        trailing={<Button size="sm">Go</Button>}
      />
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `import { Input, Button } from '@kitn.ai/ui/solid';
import { Search } from 'lucide-solid';

<Input
  placeholder="Search projects"
  leading={<Search class="size-4" aria-hidden="true" />}
  trailing={<Button size="sm">Go</Button>}
/>`,
      },
    },
  },
};
