import { Group, SelectField, SliderField } from './controls';
import type { DisplayPreferences } from './displayPreferences';

export function HdrDisplayControls({ value, onChange }: {
  value: DisplayPreferences; onChange: (patch: Partial<DisplayPreferences>) => void;
}) {
  return <Group title="Display settings" defaultOpen={false}>
    <SliderField label="View exposure (EV)" value={value.exposure} min={-12} max={12} step={0.25} onChange={exposure => onChange({ exposure })} />
    <SelectField label="HDR mapping" value={value.mapping} options={[{ value: 'reinhard', label: 'Reinhard · preserve highlights' }, { value: 'linear', label: 'Linear · inspect clipping' }]} onChange={mapping => onChange({ mapping: mapping as DisplayPreferences['mapping'] })} />
    <button type="button" onClick={() => onChange({ exposure: 0, mapping: 'reinhard' })}>Reset display</button>
    <p className="hint">Display only. Item brightness is in the inspector’s HDR emission box. HDR/EXR exports keep linear radiance.</p>
  </Group>;
}
