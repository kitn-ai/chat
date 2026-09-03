/**
 * Solid JSX declarations for the kai-* elements this section binds.
 *
 * The kit ships React typings (`dist/elements.d.ts` augments React's
 * namespace) and generated React wrappers, but nothing augments Solid's
 * JSX.IntrinsicElements, so a Solid island using the elements directly has no
 * types for them. Scoped to the elements the card uses rather than generated:
 * a generated Solid typing surface is a kit feature, and it belongs in
 * packages/ui with the generator that would own it, not in the docs site.
 *
 * `on:kai-*` needs JSX.CustomEvents, which is Solid's own escape hatch for a
 * non-delegated listener on a custom event. Delegated `onKaiClick` would not
 * work anyway: kai-* events do not bubble.
 *
 * KaiBase EXTENDS JSX.HTMLAttributes<HTMLElement> so that `ref` and the `on:`
 * handlers type at all: `ref` lives on JSX.CustomAttributes and the `on:`
 * keys are a mapped type over CustomEvents in JSX.DOMAttributes, so a bare
 * interface fails TS2322 on every `ref=` and leaves every handler parameter
 * implicitly any. `children` arrives the same way; only kai-button and
 * kai-tooltip actually have slots (element-meta.json), and the JSX types
 * cannot express that without giving up ref and on: with it.
 *
 * The prop lists below are the SCALAR props of each element as
 * packages/ui/src/elements/element-meta.json states them. Array and object
 * props (`options`, `files`) are deliberately absent: they are set as JS
 * properties in effects, never as attributes, which is the kai- contract, and
 * leaving them out of the JSX types is what stops someone writing
 * `options={[...]}` and shipping `[object Object]`.
 */
import type { JSX } from 'solid-js';

interface KaiBase extends JSX.HTMLAttributes<HTMLElement> {
  theme?: 'light' | 'dark' | 'auto';
  'data-testid'?: string;
  'data-category'?: string;
}

declare module 'solid-js' {
  namespace JSX {
    /**
     * `attr:theme` forces the ATTRIBUTE form. Solid binds a dynamic value on a
     * custom element as a PROPERTY (a static string literal in the template
     * becomes an attribute, a reactive binding does not), and the site's other
     * islands all put `theme` on their host as an attribute. Matching them
     * keeps one mechanism, and an attribute is the form a human reading the
     * DOM in a dark-mode screenshot can actually see.
     */
    interface ExplicitAttributes {
      theme: 'light' | 'dark' | 'auto';
    }
    interface CustomEvents {
      /** kai-button. */
      'kai-click': CustomEvent<void>;
      /** kai-segmented emits { value }, kai-select emits { value, values }. */
      'kai-change': CustomEvent<{ value: string; values?: string[] }>;
      /** kai-file-tree. */
      'kai-select': CustomEvent<{ path: string }>;
    }
    interface IntrinsicElements {
      'kai-button': KaiBase & {
        variant?: 'default' | 'subtle' | 'ghost' | 'outline' | 'destructive';
        size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
        icon?: string;
        iconTrailing?: string;
        /** The ACCESSIBLE name only. Visible text is the default slot. */
        label?: string;
        disabled?: boolean;
      };
      'kai-segmented': KaiBase & { size?: 'sm' | 'md' };
      'kai-select': KaiBase & {
        label?: string;
        placeholder?: string;
        disabled?: boolean;
      };
      'kai-file-tree': KaiBase & { summary?: boolean };
      'kai-code-block': KaiBase & {
        proseSize?: 'xs' | 'sm' | 'base' | 'lg';
        codeTheme?: string;
        codeHighlight?: boolean;
      };
      'kai-tooltip': KaiBase & {
        content?: string;
        placement?: string;
        openDelay?: number;
      };
    }
  }
}
