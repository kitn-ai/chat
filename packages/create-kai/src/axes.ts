/**
 * The CLI's SELECT axes — "which framework", "where does the chat live", "wire a
 * gateway" — and the one rule they all obey: **an axis with one possible answer
 * is stated, not asked.**
 *
 * WHY THIS IS A MODULE AND NOT THREE INLINE TERNARIES. It was three inline
 * ternaries, and they disagreed. The layout axis rendered a one-option select
 * (a question with no choice in it); the gateway axis did the opposite and took
 * its single answer SILENTLY, which is worse — six of the eight ready frameworks
 * can host no gateway but the mock, so most runs never saw the question and were
 * never told what had been decided for them. Both are the same defect wearing
 * different clothes, and neither was visible from the other's site.
 *
 * So the rule lives in one function over a declared axis, and `cliAxes()` is the
 * list of axes it governs. `test/menu-honesty.test.ts` drives exactly these
 * objects: an axis that would be taken silently fails there instead of quietly
 * shipping.
 *
 * `framework` is deliberately NOT one of them. It is chosen before anything that
 * depends on it, its option list is the same for every run, and if it ever has
 * one entry the CLI has bigger problems than a prompt — the axes here are the
 * ones whose option list NARROWS with what the release, or the chosen framework,
 * can actually do.
 */
import { wirableGateways } from './catalog';
import type { FrameworkDef } from './frameworks';
import { readyLayouts } from './layouts';

export interface AxisOption {
  id: string;
  /** what the select renders, and what the stated line names */
  label: string;
  hint: string;
}

export interface Axis {
  /** names the axis in a failure message; not shown to the user */
  id: string;
  /** the stated line's prefix — "Layout", "Backend" */
  label: string;
  /** the question, asked only when there is more than one answer */
  question: string;
  /** the answers available today, in prompt order */
  options: readonly AxisOption[];
  /**
   * WHY the single answer is the only one, in the words a user should see.
   *
   * Required, and an axis with an empty one cannot be stated — which makes it
   * fail the guard rather than pass silently. "There is only one option" is not
   * a reason a reader can act on; "the only gateway wirable for Vue in this
   * release" tells them what would have to change.
   */
  because: string;
}

export interface AxisDecision {
  /** true when the user has a real choice and the select should be rendered */
  ask: boolean;
  /** the sole answer, when there is one */
  only: AxisOption | null;
  /** the line to print in place of the question, or null when there is nothing to state */
  statement: string | null;
}

/**
 * Ask, or state, or neither.
 *
 * A `statement` is produced for exactly the case that used to go wrong: one
 * option, so no question, so the user learns nothing unless we tell them. An
 * axis with no options at all states nothing and asks nothing — the caller has
 * to refuse, because there is no answer to give.
 */
export function decideAxis(axis: Axis): AxisDecision {
  if (axis.options.length === 0) return { ask: false, only: null, statement: null };
  if (axis.options.length > 1) return { ask: true, only: null, statement: null };
  const only = axis.options[0];
  // THE HINT IS KEPT, not replaced by the reason. They answer different
  // questions — "what is this answer" and "why is it the only one" — and the
  // first version of this dropped the hint, so the layout line stopped saying
  // what a full-screen app IS. The select shows both; so does the statement.
  //
  // No reason, no statement. See the docblock on `because`.
  const statement =
    axis.because.length > 0 ? `${only.label} — ${only.hint}; ${axis.because}` : null;
  return { ask: false, only, statement };
}

/** Where the chat lives. Narrowed by which layouts this release can scaffold. */
export function layoutAxis(): Axis {
  const options = readyLayouts().map((l) => ({ id: l.id, label: l.label, hint: l.hint }));
  return {
    id: 'layout',
    label: 'Layout',
    question: 'Where does the chat live?',
    options,
    because: 'the only layout this release can scaffold, and `--list` shows the rest',
  };
}

/**
 * Which model gateway to wire.
 *
 * Narrowed TWICE — by what the release wires and by what the chosen framework
 * can host — which is why this is the axis that most often has one answer:
 * a keyed gateway needs a server route, and most frameworks in the table declare
 * no destination for one. `wirableGateways` is that intersection, read from the
 * catalog rather than recomputed here.
 */
export function gatewayAxis(framework: FrameworkDef): Axis {
  const options = wirableGateways(framework).map((g) => ({
    id: g.integration.id,
    label: g.integration.id === 'mock' ? 'None' : g.integration.title,
    hint:
      g.integration.id === 'mock'
        ? 'local mock, no key, no backend'
        : `${g.integration.envVars.join(', ')} — a server route is scaffolded for you`,
  }));
  return {
    id: 'gateway',
    label: 'Backend',
    question: 'Wire a model gateway?',
    options,
    because:
      `the only gateway wirable for ${framework.label} in this release. A keyed gateway needs a ` +
      'server route and this framework declares no destination for one, so `--list --json` is ' +
      'where to see which do',
  };
}

/**
 * Every axis the rule governs, for one framework.
 *
 * THE TEST'S SUBJECT IS THIS LIST, so an axis missing from it is an axis nobody
 * checks — which is how the gateway axis went unnoticed. `menu-honesty.test.ts`
 * records the ids it expects, so deleting one fails there rather than silently
 * shrinking the guard.
 */
export function cliAxes(framework: FrameworkDef): Axis[] {
  return [layoutAxis(), gatewayAxis(framework)];
}
