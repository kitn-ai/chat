import { defineWebComponent } from './define';
import { ResponseStream, type Mode } from '../components/response-stream';

type TextSource = string | AsyncIterable<string>;
/** The boxed form `text` travels in through the prop signal — see below. */
interface TextBox { v: TextSource }

interface Props extends Record<string, unknown> {
  /** Text to stream. A string, or an `AsyncIterable<string>` (set as a JS
   *  property, since async iterables can't be HTML attributes). */
  text?: TextSource;
  /** Reveal animation. */
  mode?: Mode;
  /** Characters/segments per tick. */
  speed?: number;
  /** Element tag to render as. */
  as?: string;
}

/** Events fired by `<kai-response-stream>`. */
interface Events {
  /** Streaming finished. */
  'kai-complete': void;
}

const isBox = (v: unknown): v is TextBox =>
  typeof v === 'object' && v !== null && 'v' in (v as Record<string, unknown>) &&
  !(Symbol.asyncIterator in (v as Record<PropertyKey, unknown>));

/** Unwrap whatever shape the prop signal currently holds back to the raw source. */
function unboxText(v: unknown): TextSource {
  if (isBox(v)) return v.v;
  return (v as TextSource) ?? '';
}

// V2-PORT: Solid 2 signals natively CONSUME an AsyncIterable written into them
// (the async signal model). Left alone, `el.text = someAsyncIterable` made the
// PROP SIGNAL subscribe to the stream and hand the facade each CHUNK as a
// string — startStreaming ran once per chunk, reset the typewriter each time,
// and kai-complete fired while the stream was still open. `wrapTextAccessor`
// re-wraps component-register's instance accessor so every write is BOXED
// (`{ v }`, a plain object with no Symbol.asyncIterator, stored as-is) before
// it reaches the signal; the facade unboxes on read. Installed from a subclass
// constructor so it is in place before any consumer property write — `text`
// stays a DECLARED prop, so the generated types/metadata/attribute plumbing
// are unchanged.
function wrapTextAccessor(el: HTMLElement): void {
  const desc =
    Object.getOwnPropertyDescriptor(el, 'text') ??
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'text');
  if (!desc?.get || !desc.set) return;
  const { get, set } = desc;
  Object.defineProperty(el, 'text', {
    get(this: HTMLElement) {
      return unboxText(get.call(this));
    },
    set(this: HTMLElement, value: TextSource) {
      set.call(this, { v: value ?? '' });
    },
    enumerable: desc.enumerable ?? true,
    configurable: true,
  });
}

/**
 * `<kai-response-stream>` — reveals text with a typewriter or fade animation.
 * Text via the `text` property; `mode`/`speed` attributes; emits `kai-complete`.
 */
function register(): void {
  defineWebComponent<Props, Events>('kai-response-stream', {
    text: '',
    mode: 'typewriter',
    speed: 20,
    as: undefined,
  }, (props, { dispatch }) => (
    <ResponseStream
      textStream={unboxText(props.text)}
      mode={props.mode}
      speed={props.speed}
      as={props.as}
      class="text-body"
      onComplete={() => dispatch('kai-complete')}
    />
  ));
}

if (typeof customElements === 'undefined') {
  register();
} else {
  // Transient registry wrap (the defineWithNonReflectingProps trick, scoped to
  // this one element): subclass the constructor the library is about to define
  // so the boxing accessor is installed at CONSTRUCTION time.
  const registry = customElements;
  const inner = registry.define;
  try {
    registry.define = function (
      this: CustomElementRegistry,
      name: string,
      ctor: CustomElementConstructor,
      options?: ElementDefinitionOptions,
    ) {
      if (name === 'kai-response-stream') {
        ctor = class extends ctor {
          connectedCallback() {
            // A `text` set before connect is a plain OWN data property (the
            // accessor pair only exists after component-register initializes
            // props on connect). Box it IN PLACE so the harvest feeds the
            // signal the box, never the raw AsyncIterable.
            const own = Object.getOwnPropertyDescriptor(this, 'text');
            if (
              own && 'value' in own && typeof own.value === 'object' && own.value !== null &&
              (Symbol.asyncIterator in (own.value as Record<PropertyKey, unknown>))
            ) {
              (this as unknown as Record<string, unknown>).text = { v: own.value as TextSource };
            }
            const proto = Object.getPrototypeOf(Object.getPrototypeOf(this)) as { connectedCallback?: () => void };
            proto.connectedCallback?.call(this);
            // Post-connect the property is component-register's accessor; wrap
            // it so every later write is boxed and every read unboxes.
            wrapTextAccessor(this);
          }
        } as CustomElementConstructor;
      }
      return inner.call(this, name, ctor, options);
    };
    register();
  } finally {
    registry.define = inner;
  }
}
