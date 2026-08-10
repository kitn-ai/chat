/** Script-facing instrumentation hooks. See README "Readouts" + scripts/. */
interface ParityProbeSnapshot {
  /** performance.now() at snapshot time. */
  t: number;
  mode: 'fixture' | 'recording' | 'mic';
  state: string;
  /** Upstream side: their hooks' outputs (or the fed fixture values). Full precision. */
  their: { bands: number[]; volume: number };
  /** Kit side: the contract-derived probe (or the fed fixture values). Full precision. */
  kit: { half: number[]; volume: number };
  /** Present in fixture mode only: everything derived from the current frame.
   *  `synthetic: true` (and frame -1) means an explicit script-fed level set. */
  fixture?: {
    frame: number;
    synthetic: boolean;
    half: number[];
    bar5: number[];
    ring24: number[];
    volume: number;
  };
}

interface ParityControl {
  /** Pause the fixture and pin it to frame n (wraps into range). Clears synthetic. */
  setFixtureFrame(n: number): void;
  setFixturePlaying(playing: boolean): void;
  /** Feed explicit levels (full-width, one per bar/column) to BOTH sides; null restores voice frames. */
  setSyntheticBands(levels: number[] | null): void;
  /** Square grid density for BOTH grid tiles (rowCount = columnCount = n); null restores defaults. */
  setGridCount(n: number | null): void;
}

interface Window {
  __parityProbes?: ParityProbeSnapshot;
  __parityControl?: ParityControl;
}
