/**
 * The right-hand panel: the running page, its source, its version history and
 * the device-width frame.
 *
 * The Preview|Code toggle is <kai-artifact>'s own — it is the element's job, so
 * the panel drives it with the controlled `tab` prop and follows the user's
 * clicks through `kai-tab-change` rather than building a second toggle beside it.
 */
import { Artifact, Button, Checkpoint, Segmented } from '@kitn.ai/ui/react';

import type { PageVersion } from '../versions';
import { formatBytes, pageUrl } from '../versions';

export type Device = 'desktop' | 'tablet' | 'mobile';

/** Widths the preview is CONSTRAINED to; the page itself is untouched. */
export const DEVICE_WIDTHS: Record<Device, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 390,
};

// Labels only: the kit ships 48 icon names and has no tablet/phone glyph among
// them, and an unknown `icon` renders as plain text rather than failing loudly.
const DEVICE_OPTIONS = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'mobile', label: 'Mobile' },
];

type Props = {
  versions: PageVersion[];
  selected: PageVersion | null;
  tab: 'preview' | 'code';
  device: Device;
  maximized: boolean;
  streaming: boolean;
  onSelect: (id: string) => void;
  onRestore: (id: string) => void;
  onTab: (tab: 'preview' | 'code') => void;
  onDevice: (device: Device) => void;
  onToggleMaximize: () => void;
};

export function PreviewPanel(props: Props) {
  const { versions, selected, tab, device, maximized, streaming } = props;
  const head = versions.length > 0 ? versions[versions.length - 1] : null;
  const isHead = selected != null && head != null && selected.id === head.id;
  const width = DEVICE_WIDTHS[device];

  return (
    <section className="panel" aria-label="Page preview">
      <div className="panel-bar">
        <div className="panel-title">
          <span className="panel-file">{selected ? selected.fileName : 'No page yet'}</span>
          {selected && (
            <span className="panel-meta">
              {selected.label}
              {selected.restoredFrom ? ` · restored from ${selected.restoredFrom}` : ''} ·{' '}
              {formatBytes(new Blob([selected.html]).size)}
            </span>
          )}
        </div>
        <div className="panel-tools">
          <Segmented
            size="sm"
            options={DEVICE_OPTIONS}
            value={device}
            onChange={(e) => props.onDevice(e.detail.value as Device)}
          />
          <Button
            size="icon-sm"
            variant="subtle"
            icon="panel-left"
            label={maximized ? 'Restore the split layout' : 'Maximize the preview panel'}
            onClick={props.onToggleMaximize}
          />
        </div>
      </div>

      {versions.length > 0 && (
        <div className="rail" role="group" aria-label="Version checkpoints">
          <span className="rail-label">Checkpoints</span>
          <div className="rail-items">
            {versions.map((v) => (
              <Checkpoint
                key={v.id}
                size="sm"
                label={v.label}
                variant={selected?.id === v.id ? 'default' : 'ghost'}
                tooltip={`${v.label} — ${v.prompt}`}
                onSelect={() => props.onSelect(v.id)}
              />
            ))}
          </div>
          {selected && !isHead && (
            <Button size="sm" variant="outline" icon="rotate-cw" onClick={() => props.onRestore(selected.id)}>
              Restore {selected.label}
            </Button>
          )}
        </div>
      )}

      <div className={`stage device-${device}`}>
        {selected ? (
          <div className="frame" style={width ? { width: `${width}px`, maxWidth: '100%' } : undefined}>
            <Artifact
              key={selected.id}
              src={pageUrl(selected.html)}
              files={[
                {
                  path: selected.fileName,
                  url: pageUrl(selected.html),
                  code: selected.html,
                  language: 'html',
                  type: 'html',
                },
              ]}
              activeFile={selected.fileName}
              displayUrl={selected.fileName}
              tab={tab}
              noNav
              iframeTitle={`Preview of ${selected.label}`}
              onTabChange={(e) => props.onTab(e.detail.tab)}
              style={{ display: 'block', width: '100%', height: '100%' }}
            />
          </div>
        ) : (
          <div className="empty">
            <h2>{streaming ? 'Building your page…' : 'No page yet'}</h2>
            <p>
              Ask for one on the left — <em>“make me a landing page for a coffee shop”</em>. Every reply that builds a
              page lands here, and every version stays as a checkpoint.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
