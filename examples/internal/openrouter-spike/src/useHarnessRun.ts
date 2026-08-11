// The browser half of the conformance harness.
//
// The runner navigates to `?scenario=<id>&mode=live|replay`, and this hook does
// the rest: fire the scenario's prompt with the scenario's tools, and publish a
// phase the runner can wait on. Deliberately the SAME code path the sidebar
// uses, so "it works when I click it" and "the suite is green" cannot diverge.
import { useCallback, useEffect, useRef } from 'react';
import { findScenario, replayDirFor, type Scenario, type ScenarioMode } from './scenarios';
import { publishHarnessState, type HarnessState } from './harness-state';
import type { SpikeChat } from './hooks';
import type { SpikeConfig, WireKind } from './transport';

export interface HarnessRequest {
  scenario: Scenario;
  /** How the runner asked for it to be driven. A `replay`-mode scenario is
   *  always replayed regardless of what the URL asks for. */
  mode: ScenarioMode;
  /** Fixture directory override, used by the negative-control pass to point a
   *  scenario's assertion at a stream that cannot satisfy it. */
  fixtureDir?: string;
}

/** Parse `?scenario=&mode=&fixture=`. Returns null for a normal, human visit. */
export function readHarnessRequest(search: string): HarnessRequest | null {
  const params = new URLSearchParams(search);
  const id = params.get('scenario');
  if (!id) return null;
  const scenario = findScenario(id);
  if (!scenario) throw new Error(`Unknown scenario "${id}"`);
  const fixture = params.get('fixture');
  // An explicit fixture is always a replay: there is nothing to override on a
  // live call.
  const asked = fixture || params.get('mode') === 'replay' ? 'replay' : 'live';
  return {
    scenario,
    mode: scenario.mode === 'replay' ? 'replay' : asked,
    ...(fixture ? { fixtureDir: fixture } : {}),
  };
}

/** How a scenario should be sent, in either mode. Shared by the rail and the
 *  harness so a click and a test issue the identical request. */
export function sendOptionsFor(
  scenario: Scenario,
  mode: ScenarioMode,
  modelSlug: string,
  fixtureDir?: string,
  wire: WireKind = 'openai',
): Parameters<SpikeChat['send']>[1] {
  return {
    tools: scenario.tools,
    maxRounds: scenario.maxRounds,
    ...(mode === 'replay'
      ? {
          replay: {
            // The wire picks the DIALECT of the canned stream. Get this wrong
            // and the replay parses to an empty turn rather than erroring.
            dir: fixtureDir ?? replayDirFor(scenario, modelSlug, wire),
            delayMs: scenario.replayDelayMs,
          },
        }
      : { harness: { scenario: scenario.id, round: 1 } }),
  };
}

interface UseHarnessRunArgs {
  request: HarnessRequest | null;
  config: SpikeConfig | null;
  configError: string | null;
  spike: SpikeChat;
  loading: boolean;
  run: (scenario: Scenario, mode: ScenarioMode, fixtureDir?: string) => void;
}

/**
 * Drives the requested scenario once, then keeps `data-kai-phase` in step with
 * the turn. The phase attribute is what the runner waits on; it goes `running`
 * the moment the turn starts and `done` only after `loading` has gone false,
 * which is when the stream has actually settled.
 */
export function useHarnessRun({
  request,
  config,
  configError,
  spike,
  loading,
  run,
}: UseHarnessRunArgs): void {
  const startedRef = useRef(false);
  /** `loading` is false both BEFORE a turn and AFTER it. Without this latch the
   *  phase would flash `done` on mount and a runner that polled at the wrong
   *  moment would assert against an empty thread. */
  const sawLoadingRef = useRef(false);

  const publish = useCallback(
    (patch: Partial<HarnessState>) => {
      publishHarnessState({
        phase: 'idle',
        scenario: request?.scenario.id ?? null,
        source: request ? (request.mode === 'replay' ? 'replay' : 'live') : null,
        model: config?.model ?? null,
        stats: spike.stats,
        error: spike.error,
        ...patch,
      });
    },
    [request, config, spike.stats, spike.error],
  );

  // Start once, as soon as the proxy config has resolved (the model slug is
  // needed to locate a recorded fixture).
  useEffect(() => {
    if (!request || startedRef.current) return;
    if (configError) {
      publish({ phase: 'error', error: configError });
      startedRef.current = true;
      return;
    }
    if (!config) return;
    startedRef.current = true;
    publish({ phase: 'running' });
    run(request.scenario, request.mode, request.fixtureDir);
  }, [request, config, configError, publish, run]);

  // Track the turn to completion. `loading` is owned by useKaiChat and flips
  // false on done() OR abort(), which is exactly the settle point we want.
  useEffect(() => {
    if (!request || !startedRef.current) return;
    if (loading) {
      sawLoadingRef.current = true;
      publish({ phase: 'running' });
      return;
    }
    publish({ phase: sawLoadingRef.current ? 'done' : 'running' });
  }, [request, loading, publish]);
}
