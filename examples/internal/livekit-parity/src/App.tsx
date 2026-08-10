import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useMultibandTrackVolume,
  useTrackVolume,
  type AgentState,
} from '@livekit/components-react';
import { AgentAudioVisualizerBar } from '@/components/agents-ui/agent-audio-visualizer-bar';
import { AgentAudioVisualizerGrid } from '@/components/agents-ui/agent-audio-visualizer-grid';
import { AgentAudioVisualizerRadial } from '@/components/agents-ui/agent-audio-visualizer-radial';
import { AgentAudioVisualizerWave } from '@/components/agents-ui/agent-audio-visualizer-wave';
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura';
import { KaiVisualizer } from './kai/KaiVisualizer';
import { syntheticDrive, useVoiceFixture } from './audio/fixture';
import { openMic, openRecording, type LiveSource, type MicPreset } from './audio/sources';
import { useKitProbe } from './probes';

type Mode = 'fixture' | 'recording' | 'mic';

// 'disconnected' included deliberately: it is upstream's EXPLICIT resting
// state (their wave's flat-line arm), while 'idle' has no case in their wave
// hook and falls through to the speaking-shaped default arm. Our element
// aliases disconnected -> idle.
const STATES = [
  'speaking',
  'listening',
  'thinking',
  'connecting',
  'initializing',
  'idle',
  'disconnected',
] as const;

const fmt = (values: number[]) => values.map((v) => v.toFixed(2)).join(' ');
const fmt1 = (v: number) => v.toFixed(2);

function Readout({ label, text, probe }: { label: string; text: string; probe?: string }) {
  return (
    <div className="readout" data-probe={probe}>
      {label} {text}
    </div>
  );
}

function Tile({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={`tile-${id}`}
      className="flex min-h-[128px] items-center justify-center overflow-hidden"
    >
      {children}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('fixture');
  const [agentState, setAgentState] = useState<(typeof STATES)[number]>('speaking');
  const [micPreset, setMicPreset] = useState<MicPreset>('livekit');
  const [fixturePlaying, setFixturePlaying] = useState(true);
  const [live, setLive] = useState<LiveSource | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const stopLive = useCallback(() => {
    setLive((prev) => {
      prev?.stop();
      return undefined;
    });
  }, []);

  const switchMode = (m: Mode) => {
    stopLive();
    setError(undefined);
    setMode(m);
  };

  const enableMic = async (preset: MicPreset) => {
    stopLive();
    setBusy(true);
    setError(undefined);
    try {
      setLive(await openMic(preset));
    } catch (e) {
      setError(`mic: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const playRecording = async () => {
    stopLive();
    setBusy(true);
    setError(undefined);
    try {
      setLive(await openRecording());
    } catch (e) {
      setError(`recording: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => stopLive(), [stopLive]);

  const isFixture = mode === 'fixture';
  const { frame: voiceFrame, setFrame: setFixtureFrame } = useVoiceFixture(
    isFixture && fixturePlaying,
  );
  // Synthetic override: an explicit level set (constant sweeps, ramps) fed to
  // BOTH sides in place of the voice frames. Script-only (__parityControl).
  const [synthetic, setSynthetic] = useState<number[] | null>(null);
  const fix = useMemo(
    () => (synthetic ? syntheticDrive(synthetic) : voiceFrame),
    [synthetic, voiceFrame],
  );
  const track = !isFixture ? live?.track : undefined;
  const stream = !isFixture ? live?.stream : undefined;

  // THEIR readouts: parallel instances of the exact hooks + options their
  // components use internally (bar/grid/radial: bands over bins 100-200;
  // wave/aura: byte-scale volume at fftSize 512 / smoothing 0.55, with the
  // analyser's min/max decibels left at createAudioAnalyser's -100/-80).
  const theirBands = useMultibandTrackVolume(track, { bands: 5, loPass: 100, hiPass: 200 });
  const theirVolume = useTrackVolume(track, { fftSize: 512, smoothingTimeConstant: 0.55 });

  // OUR readouts: parallel instance of the kit pipeline, wired entirely from
  // the kit's exported analysis-settings contract (see probes.ts).
  const kit = useKitProbe(stream);

  const theirBandsShown = isFixture ? fix.bar5 : theirBands;
  const theirVolumeShown = isFixture ? fix.volume : theirVolume;
  const kitHalfShown = isFixture ? fix.half : kit.half;
  const kitVolumeShown = isFixture ? fix.volume : kit.volume;

  // Full-precision probe hook for scripts: the same values the readouts show,
  // but as unquantized floats (the .toFixed(2) below is display-only).
  // Refreshed every render, i.e. at the probes' own update cadence.
  useEffect(() => {
    window.__parityProbes = {
      t: performance.now(),
      mode,
      state: agentState,
      their: { bands: theirBandsShown, volume: theirVolumeShown },
      kit: { half: kitHalfShown, volume: kitVolumeShown },
      fixture: isFixture
        ? {
            frame: fix.frame,
            synthetic: !!synthetic,
            half: fix.half,
            bar5: fix.bar5,
            ring24: fix.ring24,
            volume: fix.volume,
          }
        : undefined,
    };
  });

  // Deterministic drive for scripts (the wave/state/grid audits): pause the
  // fixture and pin it to a voice frame, or feed explicit synthetic levels.
  useEffect(() => {
    window.__parityControl = {
      setFixtureFrame: (n: number) => {
        setSynthetic(null);
        setFixturePlaying(false);
        setFixtureFrame(n);
      },
      setFixturePlaying,
      setSyntheticBands: (levels: number[] | null) => {
        setSynthetic(levels ? [...levels] : null);
        if (levels) setFixturePlaying(false);
      },
    };
    return () => {
      delete window.__parityControl;
    };
  }, [setFixtureFrame]);

  const state = agentState as AgentState;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="mb-1 text-lg font-semibold">LiveKit parity harness</h1>
      <p className="mb-4 text-sm text-zinc-400">
        Top row: upstream agents-ui components, their defaults untouched. Bottom row:{' '}
        <code>&lt;kai-audio-visualizer&gt;</code> from this worktree&apos;s built dist. Both rows
        are fed the same audio.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="mr-1 text-zinc-400">input</span>
          {(['fixture', 'recording', 'mic'] as const).map((m) => (
            <button
              key={m}
              data-testid={`btn-mode-${m}`}
              onClick={() => switchMode(m)}
              className={`rounded px-2 py-1 ${mode === m ? 'bg-cyan-700 text-white' : 'bg-zinc-800 text-zinc-300'}`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-zinc-400">state</span>
          {STATES.map((s) => (
            <button
              key={s}
              data-testid={`btn-state-${s}`}
              onClick={() => setAgentState(s)}
              className={`rounded px-2 py-1 ${agentState === s ? 'bg-cyan-700 text-white' : 'bg-zinc-800 text-zinc-300'}`}
            >
              {s}
            </button>
          ))}
        </div>

        {mode === 'fixture' && (
          <button
            data-testid="btn-fixture-toggle"
            onClick={() => setFixturePlaying((p) => !p)}
            className="rounded bg-zinc-800 px-2 py-1"
          >
            {fixturePlaying ? 'pause fixture' : 'play fixture'}
          </button>
        )}

        {mode === 'recording' && (
          <div className="flex items-center gap-1">
            <button
              data-testid="btn-rec-play"
              onClick={playRecording}
              disabled={busy || !!live}
              className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40"
            >
              play voice.wav (loop)
            </button>
            <button
              data-testid="btn-rec-stop"
              onClick={stopLive}
              disabled={!live}
              className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40"
            >
              stop
            </button>
          </div>
        )}

        {mode === 'mic' && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">constraints</span>
            {(
              [
                ['livekit', 'LiveKit defaults (AGC+NS+EC+voiceIsolation)'],
                ['browser', 'bare audio:true (browser defaults)'],
                ['off', 'all processing off'],
              ] as const
            ).map(([p, title]) => (
              <label key={p} className="flex items-center gap-1" title={title}>
                <input
                  type="radio"
                  name="mic-preset"
                  data-testid={`preset-${p}`}
                  checked={micPreset === p}
                  onChange={() => {
                    setMicPreset(p);
                    if (live) void enableMic(p);
                  }}
                />
                {p}
              </label>
            ))}
            <button
              data-testid="btn-mic-enable"
              onClick={() => void enableMic(micPreset)}
              disabled={busy || !!live}
              className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40"
            >
              enable mic
            </button>
            <button
              data-testid="btn-mic-stop"
              onClick={stopLive}
              disabled={!live}
              className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40"
            >
              stop
            </button>
          </div>
        )}

        <span data-testid="status" className="text-xs text-zinc-500">
          {busy ? 'working...' : error ? error : live ? `${mode} live` : isFixture ? (fixturePlaying ? 'fixture running' : 'fixture paused') : 'no source'}
        </span>
      </div>

      <div
        className="grid items-start gap-x-4 gap-y-2"
        style={{ gridTemplateColumns: '90px repeat(5, minmax(0, 1fr))' }}
      >
        <div />
        {['bar', 'grid', 'radial', 'wave', 'aura / aurora'].map((v) => (
          <div key={v} className="text-center text-sm font-medium text-zinc-300">
            {v}
          </div>
        ))}

        {/* ------------------------------ THEIR ROW ------------------------------ */}
        <div className="pt-12 text-sm font-semibold text-zinc-400">LiveKit</div>
        <div>
          <Tile id="their-bar">
            <AgentAudioVisualizerBar
              size="md"
              state={state}
              audioTrack={track}
              volumeBands={isFixture ? fix.bar5 : undefined}
              className="text-zinc-100"
            />
          </Tile>
          <Readout label="bands" probe="their-bands" text={fmt(theirBandsShown)} />
        </div>
        <div>
          <Tile id="their-grid">
            <AgentAudioVisualizerGrid
              size="md"
              state={state}
              audioTrack={track}
              volumeBands={isFixture ? fix.bar5 : undefined}
              className="text-zinc-100"
            />
          </Tile>
          <Readout label="bands" text={fmt(theirBandsShown)} />
        </div>
        <div>
          <Tile id="their-radial">
            <AgentAudioVisualizerRadial
              size="md"
              state={state}
              audioTrack={track}
              volumeBands={isFixture ? fix.ring24 : undefined}
              className="text-zinc-100"
            />
          </Tile>
          <Readout
            label={isFixture ? 'ring24 max' : 'bands@5'}
            text={isFixture ? fmt1(Math.max(...fix.ring24)) : fmt(theirBandsShown)}
          />
        </div>
        <div>
          <Tile id="their-wave">
            <AgentAudioVisualizerWave
              size="md"
              state={state}
              audioTrack={track}
              volume={isFixture ? fix.volume : undefined}
            />
          </Tile>
          <Readout label="volume" probe="their-volume" text={fmt1(theirVolumeShown)} />
        </div>
        <div>
          <Tile id="their-aura">
            <AgentAudioVisualizerAura
              size="md"
              state={state}
              audioTrack={track}
              volume={isFixture ? fix.volume : undefined}
            />
          </Tile>
          <Readout label="volume" text={fmt1(theirVolumeShown)} />
        </div>

        {/* ------------------------------- OUR ROW ------------------------------- */}
        <div className="pt-12 text-sm font-semibold text-zinc-400">kai</div>
        <div>
          <Tile id="kai-bar">
            <KaiVisualizer
              variant="bar"
              state={agentState}
              stream={stream}
              bands={isFixture ? fix.bar5 : undefined}
              color="#f4f4f5"
            />
          </Tile>
          <Readout label="half " probe="kit-half" text={fmt(kitHalfShown)} />
        </div>
        <div>
          <Tile id="kai-grid">
            <KaiVisualizer
              variant="grid"
              state={agentState}
              stream={stream}
              bands={isFixture ? fix.bar5 : undefined}
              color="#f4f4f5"
            />
          </Tile>
          <Readout label="half " text={fmt(kitHalfShown)} />
        </div>
        <div>
          <Tile id="kai-radial">
            <KaiVisualizer
              variant="radial"
              state={agentState}
              stream={stream}
              bands={isFixture ? fix.ring24 : undefined}
              color="#f4f4f5"
            />
          </Tile>
          <Readout
            label={isFixture ? 'ring24 max' : 'half '}
            text={isFixture ? fmt1(Math.max(...fix.ring24)) : fmt(kitHalfShown)}
          />
        </div>
        <div>
          <Tile id="kai-wave">
            <KaiVisualizer
              variant="wave"
              state={agentState}
              stream={stream}
              bands={isFixture ? fix.bar5 : undefined}
            />
          </Tile>
          <Readout label="volume" probe="kit-volume" text={fmt1(kitVolumeShown)} />
        </div>
        <div>
          <Tile id="kai-aura">
            <KaiVisualizer
              variant="aura"
              state={agentState}
              stream={stream}
              bands={isFixture ? fix.bar5 : undefined}
            />
          </Tile>
          <Readout label="volume" text={fmt1(kitVolumeShown)} />
        </div>
      </div>

      <div className="mt-6 space-y-1 text-xs text-zinc-500">
        <p>
          Readouts are parallel probe instances of each side&apos;s own analysis (their hooks with
          their component options; our pipeline&apos;s settings + reduceToBands/reduceToVolume), not
          taps into component internals. In fixture mode they show the fed values.
        </p>
        <p>
          Our <code>initializing</code> aliases to <code>connecting</code> by design (divergence
          row 13); their default state is <code>connecting</code> (<code>speaking</code> for wave),
          ours is <code>idle</code>.
        </p>
      </div>
    </div>
  );
}
