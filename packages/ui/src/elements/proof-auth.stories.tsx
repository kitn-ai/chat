import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, Show } from 'solid-js';
import { Mail, Lock, Eye, EyeOff, Github, ArrowRight, Sparkles } from 'lucide-solid';
import './input';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-input': JSX.HTMLAttributes<HTMLElement> & {
        type?: string;
        value?: string;
        placeholder?: string;
        label?: string;
        hint?: string;
        error?: string;
        size?: string;
        disabled?: boolean;
        readonly?: boolean;
        required?: boolean;
        invalid?: boolean;
        name?: string;
        theme?: string;
      };
    }
  }
}

// Labs/Proofs/Auth: a TOKEN-DRIVEN proof screen. The card, buttons, and divider
// are built from design tokens + raw markup (the Tailwind utilities that
// theme.css emits over the --color-* tokens: bg-card, bg-surface-sunken,
// border-input, text-muted-foreground, ring-ring, ...). The email + password
// fields now dogfood <kai-input> (the kit's field primitive: token-themed
// border/ring + leading/trailing slots), so the screen mixes the one purpose-built
// field we ship with otherwise token-only markup and lucide-solid glyphs.
//
// It themes light/dark for free: every color is a token utility, no hardcoded
// hex. The page sits on bg-surface-sunken so the bg-card card lifts off it with
// its border + the token-driven .kai-elevation shadow in both modes.

const meta = {
  // Title is the GROUP path; the `Auth` story leaf yields the id `labs-proofs--auth`.
  title: 'Labs/Proofs',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj;

// Inline, monochrome Google "G" (fill=currentColor so it themes with the button
// text - no brand hex, keeping the screen 100% token/currentColor driven).
function GoogleGlyph(props: { class?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class={props.class}>
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

// The email + password fields are now <kai-input>, so the hand-rolled input class
// string is gone (kai-input owns the token-driven border/ring + affix layout). The
// OAuth buttons stay raw markup (no kit button used here) and share this class —
// in a real app this too would be a kit primitive, not a string.
const oauthButtonClass =
  'inline-flex w-full items-center justify-center gap-2.5 rounded-md border border-input bg-background ' +
  'px-4 py-2.5 text-sm font-medium text-foreground transition-colors ' +
  'hover:bg-accent hover:text-accent-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const Auth: Story = {
  name: 'Auth',
  render: () => {
    const [show, setShow] = createSignal(false);

    return (
      // OUTER = the bounded scroll container: full-height, scrolls when the
      // viewport is short. NO items-center (that would clip the top on overflow);
      // min-h-0 lets it shrink below content height and actually scroll.
      <div class="flex h-screen flex-col overflow-y-auto min-h-0 bg-surface-sunken text-foreground">
        {/* INNER = the centering wrapper. m-auto v-centers the card when there's
            spare room and collapses to top-aligned (scrollable) when content is
            taller than the viewport. py-10 is the comfortable overflow padding. */}
        <div class="m-auto w-full max-w-md px-4 py-10">
          <div class="rounded-2xl border border-border bg-card p-7 text-card-foreground kai-elevation sm:p-8">
            {/* Brand mark + heading. The mark is a token-tinted rounded square. */}
            <div class="mb-7 flex flex-col items-center text-center">
              <div class="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Sparkles class="size-5" />
              </div>
              <h1 class="text-xl font-semibold tracking-tight text-foreground">Sign in</h1>
              <p class="mt-1 text-sm text-muted-foreground">Welcome back. Sign in to your account to continue.</p>
            </div>

            {/* FORM */}
            <form class="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
              {/* Email field — the kit's <kai-input> with a leading Mail glyph. */}
              <kai-input type="email" label="Email" placeholder="you@example.com">
                <Mail slot="leading" class="size-4" />
              </kai-input>

              {/* Password field — <kai-input> with a leading Lock glyph and a
                  trailing show/hide toggle; the Forgot link sits right-aligned below. */}
              <div class="flex flex-col gap-1.5">
                <kai-input
                  type={show() ? 'text' : 'password'}
                  label="Password"
                  placeholder="Enter your password"
                >
                  <Lock slot="leading" class="size-4" />
                  <button
                    slot="trailing"
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show() ? 'Hide password' : 'Show password'}
                    class="-mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Show when={show()} fallback={<Eye class="size-4" />}>
                      <EyeOff class="size-4" />
                    </Show>
                  </button>
                </kai-input>
                <a
                  href="#"
                  class="self-end text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Forgot password?
                </a>
              </div>

              {/* Primary submit, full width */}
              <button
                type="submit"
                class="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Sign in
                <ArrowRight class="size-4" />
              </button>
            </form>

            {/* Divider with "or" (kai-separator exists, but this proof stays raw markup) */}
            <div class="my-6 flex items-center gap-3">
              <div class="h-px flex-1 bg-border" />
              <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">or</span>
              <div class="h-px flex-1 bg-border" />
            </div>

            {/* OAuth / social buttons */}
            <div class="flex flex-col gap-2.5">
              <button type="button" class={oauthButtonClass}>
                <GoogleGlyph class="size-4" />
                Continue with Google
              </button>
              <button type="button" class={oauthButtonClass}>
                <Github class="size-4" />
                Continue with GitHub
              </button>
            </div>
          </div>

          {/* Footer link, outside the card */}
          <p class="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <a
              href="#"
              class="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
            >
              Create account
            </a>
          </p>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'html',
        // Representative skeleton: a centered auth card built from token utilities
        // only (no kit components, lucide glyphs for icons). Themes light/dark for
        // free because every color is a --color-* token utility.
        code: `<!-- Double-container centering: outer scrolls (no items-center), inner m-auto -->
<div class="flex h-screen overflow-y-auto min-h-0 bg-surface-sunken text-foreground">
  <div class="m-auto w-full max-w-md px-4 py-10">
    <div class="rounded-2xl border border-border bg-card p-8 kai-elevation">
      <!-- brand mark + heading -->
      <div class="rounded-xl bg-primary text-primary-foreground"><!-- glyph --></div>
      <h1 class="text-xl font-semibold tracking-tight">Sign in</h1>
      <p class="text-sm text-muted-foreground">Welcome back...</p>

      <form>
        <!-- The fields are the kit's <kai-input> (token-themed field + affix slots). -->
        <kai-input type="email" label="Email" placeholder="you@example.com">
          <svg slot="leading"><!-- mail icon --></svg>
        </kai-input>

        <kai-input type="password" label="Password" placeholder="Enter your password">
          <svg slot="leading"><!-- lock icon --></svg>
          <button slot="trailing" type="button" aria-label="Show password"><!-- eye --></button>
        </kai-input>

        <button type="submit"
          class="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground
                 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">Sign in</button>
      </form>

      <!-- divider with "or" -->
      <div class="flex items-center gap-3">
        <div class="h-px flex-1 bg-border"></div>
        <span class="text-xs uppercase text-muted-foreground">or</span>
        <div class="h-px flex-1 bg-border"></div>
      </div>

      <!-- OAuth buttons -->
      <button class="w-full rounded-md border border-input bg-background py-2.5 text-sm
                     hover:bg-accent hover:text-accent-foreground">Continue with Google</button>
      <button class="...">Continue with GitHub</button>
    </div>
    <p class="text-center text-sm text-muted-foreground">Don't have an account?
      <a class="font-medium text-foreground hover:underline">Create account</a></p>
  </div>
</div>`,
      },
    },
  },
};
