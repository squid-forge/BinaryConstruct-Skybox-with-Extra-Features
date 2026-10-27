import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layer } from '../core/layers';
import type { PreviewScene } from '../render/PreviewScene';
import { captureHdrPreview, compareHdrPreview, hdrPreviewBytes, type HdrPreviewData } from '../export/hdrPreview';
import { SelectField, SliderField } from './controls';
import { softnessRadius } from '../export/softness';

export function HdrPreview({ scene, layers, size, softness, onSoftness, center, picking, onPick, onClose, lensResolution }: {
  scene: PreviewScene; layers: Layer[]; size: number; softness: number;
  onSoftness: (amount: number) => void;
  center: { lonDeg: number; latDeg: number }; picking: boolean;
  onPick: () => void; onClose: () => void;
  lensResolution?: number | 'native';
}) {
  const [rawData, setData] = useState<HdrPreviewData | null>(null);
  const [renderedKey, setRenderedKey] = useState('');
  const [dataLayers, setDataLayers] = useState<Layer[] | null>(null);
  const requestKey = `${size}:${center.lonDeg}:${center.latDeg}:${lensResolution ?? 'auto'}`;
  const data = renderedKey === requestKey && dataLayers === layers ? rawData : null;
  const [status, setStatus] = useState('Preparing native-resolution HDR crop');
  const [error, setError] = useState('');
  const [exposure, setExposure] = useState(0);
  const [mapping, setMapping] = useState<'reinhard' | 'linear'>('reinhard');
  const [zoom, setZoom] = useState('1');
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (picking) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [picking]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  useEffect(() => {
    if (picking) return;
    const controller = new AbortController();
    setData(null); setError(''); setStatus('Preparing native-resolution HDR crop');
    void captureHdrPreview(scene, layers, size, center, controller.signal,
      fraction => { if (!controller.signal.aborted) setStatus(`Rendering selected area ${Math.round(fraction * 100)}%`); },
      { lensResolution },
    ).then(result => { if (!controller.signal.aborted) { setData(result); setRenderedKey(requestKey); setDataLayers(layers); setStatus(''); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus(''); } });
    return () => controller.abort();
  }, [scene, layers, size, center, picking, requestKey, lensResolution]);
  const comparison = useMemo(() => data ? compareHdrPreview(data, softness) : null, [data, softness]);
  const images = useMemo(() => {
    if (!data || !comparison) return null;
    const encode = (pixels: Float32Array) => {
      const canvas = document.createElement('canvas'); canvas.width = data.width; canvas.height = data.height;
      canvas.getContext('2d')!.putImageData(new ImageData(hdrPreviewBytes(pixels, exposure, mapping), data.width, data.height), 0, 0);
      let peak = 0;
      for (let i = 0; i < pixels.length; i++) if (i % 4 !== 3) peak = Math.max(peak, pixels[i]);
      return { url: canvas.toDataURL(), peak };
    };
    return { native: encode(comparison.native), softened: encode(comparison.softened) };
  }, [data, comparison, exposure, mapping]);
  const activeStatus = !data && !error ? (status || 'Preparing native-resolution HDR crop') : status;
  if (picking) return null;
  return <div className="hdr-preview-backdrop">
    <section className="hdr-preview-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="hdr-preview-title" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')).filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="hdr-preview-heading">
        <h2 id="hdr-preview-title">Native export detail</h2>
        <button type="button" onClick={onClose}>{activeStatus ? 'Cancel preview' : 'Close preview'}</button>
      </div>
      <p className="hint">Native pixels from the selected {size * 2} x {size} panorama, at longitude {center.lonDeg.toFixed(1)}, latitude {center.latDeg.toFixed(1)}.</p>
      <div className="hdr-preview-controls">
        <SliderField label="Preview softness" value={softness} min={0} max={4} step={0.25} onChange={onSoftness} />
        <SliderField label="Exposure (EV)" value={exposure} min={-12} max={12} step={0.25} onChange={setExposure} />
        <SelectField label="Display mapping" value={mapping} options={[{ value: 'reinhard', label: 'Reinhard (retain highlights)' }, { value: 'linear', label: 'Linear (show clipping)' }]} onChange={v => setMapping(v as 'reinhard' | 'linear')} />
        <SelectField label="Pixel zoom" value={zoom} options={['1', '2', '4'].map(value => ({ value, label: `${value}x` }))} onChange={setZoom} />
      </div>
      <button type="button" onClick={onPick}>Pick another preview area</button>
      <p className="hint">Pick a bright star, jet or nebula to inspect. Softness applies to the export. Exposure, mapping and pixel zoom affect only this preview.</p>
      <p className="hint">{softnessRadius(size, softness) === 0 ? 'No added export blur. Judge native detail at 1x pixel zoom.' : `Export smoothing spans ${softnessRadius(size, softness) * 2 + 1} × ${softnessRadius(size, softness) * 2 + 1} pixels at this resolution. Set softness to 0 for native detail.`}</p>
      {activeStatus && <p role="status">{activeStatus}</p>}
      {error && <p role="alert">{error}</p>}
      {images && data && <div className="hdr-preview-comparison">
        <figure><figcaption>Native HDR <span>Peak {images.native.peak.toFixed(3)}</span></figcaption>
          <div className="hdr-preview-pixels"><img className="hdr-preview-native" alt="Native HDR crop" src={images.native.url} style={{ width: data.width * Number(zoom), height: data.height * Number(zoom) }} /></div>
        </figure>
        <figure><figcaption>Softness {softness} <span>Peak {images.softened.peak.toFixed(3)}</span></figcaption>
          <div className="hdr-preview-pixels"><img className="hdr-preview-softened" alt="HDR crop with export softness" src={images.softened.url} style={{ width: data.width * Number(zoom), height: data.height * Number(zoom) }} /></div>
        </figure>
      </div>}
    </section>
  </div>;
}
