import { createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
// The badge shape is the Solid component's own `Skill` — one declaration, so the
// element and `<MessageSkills>` cannot drift, and the ROOT entry re-exports it.
import { MessageSkills, type Skill } from '../components/message-skills';


interface Props extends Record<string, unknown> {
  /** The active skills to badge. Set as a JS property. */
  skills: Skill[];
}

/**
 * Parse a single light-DOM `<kai-skill>` element into a `Skill` descriptor.
 *
 * Attribute / content mapping:
 * - `id`          → Skill.id   (falls back to `name` when absent)
 * - `textContent` → Skill.name (the human-readable badge label)
 *
 * Example: `<kai-skill id="web-search">Web Search</kai-skill>`
 */
export function parseKaiSkillElement(n: Element): Skill {
  const name = n.textContent?.trim() ?? '';
  const id = n.getAttribute('id') ?? name;
  return { id, name };
}

/**
 * `<kai-skills>` — badges showing which skills were active for a
 * message. Data via the `skills` property **or** declarative `<kai-skill>`
 * children.
 *
 * **Property API** — set a JS array on the element:
 * ```html
 * <kai-skills id="skills"></kai-skills>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   document.getElementById('skills').skills = [
 *     { id: 'web-search', name: 'Web Search' },
 *     { id: 'code',       name: 'Code' },
 *   ];
 * </script>
 * ```
 *
 * **Declarative API** — compose `<kai-skill>` children (light-DOM data
 * carriers hidden by Shadow DOM — no visible output of their own):
 * ```html
 * <kai-skills>
 *   <kai-skill id="web-search">Web Search</kai-skill>
 *   <kai-skill id="code">Code</kai-skill>
 * </kai-skills>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 * </script>
 * ```
 *
 * When both are provided, `skills` prop items render first and declarative
 * children are appended after.
 */
defineWebComponent<Props>('kai-skills', {
  skills: [],
}, (props, { element }) => {
  // Read declarative <kai-skill> children from light DOM.
  // The shadow root has no <slot>, so they are invisible — pure data carriers.
  const [slottedSkills, setSlottedSkills] = createSignal<Skill[]>([]);
  onMount(() => {
    const read = () => {
      const nodes = [...element.querySelectorAll('kai-skill')];
      setSlottedSkills(nodes.map(parseKaiSkillElement));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  // Prop skills (first) merged with declarative children (after).
  const allSkills = () => [...(props.skills ?? []), ...slottedSkills()];

  return <MessageSkills skills={allSkills()} />;
});
