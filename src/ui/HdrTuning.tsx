import type { Layer } from '../core/layers';
import { CheckField, SelectField, SliderField } from './controls';

export function HdrTuning({ layers, selected, onSelect, onChange, exposure, onExposure, mapping, onMapping, onClose }: {
  layers: Layer[]; selected: number; onSelect: (index: number) => void;
  onChange: (index: number, layer: Layer) => void;
  exposure: number; onExposure: (value: number) => void;
  mapping: 'reinhard' | 'linear'; onMapping: (value: 'reinhard' | 'linear') => void;
  onClose: () => void;
}) {
  const layer = layers[selected];
  return <section className="asset-tab hdr-tuning" aria-label="HDR tuning">
    <div className="hdr-preview-heading"><h2>HDR tuning</h2><button type="button" onClick={onClose}>Done tuning</button></div>
    <p className="hint">All visible items share the live sky view. Drag to look around, or use the panorama view. Item settings are saved and exported.</p>
    <SelectField label="HDR item" value={String(selected)} options={layers.map((l, index) => ({ value: String(index), label: `${index + 1}. ${l.name}${l.visible === false ? ' (hidden)' : ''}` }))} onChange={v => onSelect(Number(v))} />
    {layer && <>
      <CheckField label="Item visible" value={layer.visible !== false} onChange={visible => onChange(selected, { ...layer, visible })} />
      <SliderField label="Item HDR power" value={layer.hdrPower ?? 1} min={0.1} max={5} onChange={hdrPower => onChange(selected, { ...layer, hdrPower })} />
      <SliderField label="Item HDR multiplier" value={layer.hdrMultiplier ?? 1} min={0} max={10} step={0.05} onChange={hdrMultiplier => onChange(selected, { ...layer, hdrMultiplier })} />
      {layer.type === 'blackhole' && <>
        <p className="hint">Power shapes disc and ring emission. Multiplier scales disc, ring and jets. Background layers keep their own HDR settings.</p>
        {layer.jetEnabled && [
          { component: layer, index: -1, name: 'Base jet' },
          ...(layer.jetLayers ?? []).map((component, index) => ({ component, index, name: component.name })),
        ].map(({ component, index, name }) => <fieldset key={index}>
          <legend>{name}</legend>
          <SliderField label="Jet HDR power" value={component.jetHdrPower ?? 1} min={0.1} max={5} onChange={jetHdrPower => onChange(selected, index === -1 ? { ...layer, jetHdrPower } : { ...layer, jetLayers: layer.jetLayers!.map((jet, i) => i === index ? { ...jet, jetHdrPower } : jet) })} />
          <SliderField label="Jet brightness" value={component.jetBrightness ?? 1} min={0} max={10} onChange={jetBrightness => onChange(selected, index === -1 ? { ...layer, jetBrightness } : { ...layer, jetLayers: layer.jetLayers!.map((jet, i) => i === index ? { ...jet, jetBrightness } : jet) })} />
        </fieldset>)}
      </>}
    </>}
    <hr />
    <SliderField label="Display exposure (EV)" value={exposure} min={-12} max={12} step={0.25} onChange={onExposure} />
    <SelectField label="Display mapping" value={mapping} options={[{ value: 'reinhard', label: 'Reinhard (retain highlights)' }, { value: 'linear', label: 'Linear (show clipping)' }]} onChange={v => onMapping(v as 'reinhard' | 'linear')} />
    <p className="hint">Exposure and mapping affect only the display. Preview quality controls responsiveness. Use export’s HDR smoothness preview to check native pixels before exporting.</p>
  </section>;
}
