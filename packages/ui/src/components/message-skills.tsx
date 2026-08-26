import { Show, For, type JSX, splitProps } from "solid-js";
import { cn } from "../utils/cn";

// --- MessageSkills ---

/** One skill badge. Also the shape of `<kai-skills>`' `skills` property and of a
 *  `<kai-skill>` light-DOM child. */
export interface Skill {
  /** Stable identifier for the skill. */
  id: string;
  /** Human-readable skill name shown on the badge. */
  name: string;
}

export interface MessageSkillsProps {
  skills: Skill[];
  class?: string;
}

/**
 * Displays skill badges above a message to indicate which skills
 * were active when the message was generated.
 */
function MessageSkills(props: MessageSkillsProps) {
  return (
    <Show when={props.skills.length > 0}>
      <div class={cn("flex items-center gap-1 flex-wrap", props.class)}>
        <For each={props.skills}>
          {(skill) => (
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-medium bg-violet-400/10 text-violet-600 dark:text-violet-400">
              {skill.name}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}

export { MessageSkills };
