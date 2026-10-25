import type { SmokeParams } from '../core/layers';
import { SMOKE_MASKS } from '../core/nebulaCloud';
import { CheckField, ColorField, Group, SelectField, SliderField } from './controls';

export function SmokeControls({ value: p, onChange: set, always = false }: { value: SmokeParams; onChange: (patch: Partial<SmokeParams>) => void; always?: boolean }) {
  const scalar = (label: string, key: keyof SmokeParams, fallback: number, min: number, max: number, step = 0.05) =>
    <SliderField key={key} label={label} value={typeof p[key] === 'number' ? p[key] as number : fallback} min={min} max={max} step={step} onChange={v => set({ [key]: v })} />;
  return <Group title="Smoke masks and lighting">
    {!always && <CheckField label="Smoke shaping and lighting" value={p.smokeEnabled ?? false} onChange={smokeEnabled => set({ smokeEnabled })} />}
    {(always || p.smokeEnabled) && <>
      <SelectField label="Smoke mask" value={p.cloudMask ?? 'procedural'} options={SMOKE_MASKS.map(value => ({ value, label: value === 'procedural' ? 'Procedural only' : `Kenney CC0 - ${value}` }))} onChange={cloudMask => set({ cloudMask })} />
      <p className="hint">Image masks shape the cloud outline; internal noise renders at output pixels. Choose Procedural only for shapes without an image-mask resolution limit.</p>
      <SelectField label="Smoke pattern" value={String(p.cloudStyle ?? 0)} options={['Billowing smoke', 'Folded filaments', 'Ridge walls', 'Dust cavities'].map((label, i) => ({ value: String(i), label }))} onChange={v => set({ cloudStyle: Number(v) })} />
      {scalar('Mask scale', 'cloudMaskScale', 1, 0.1, 4)}
      {scalar('Smoke erosion', 'cloudErosion', 0.5, 0, 1)}
      {scalar('Edge softness', 'cloudFeather', 0.16, 0.01, 0.8)}
      <CheckField label="Radial smoke footprint" value={p.cloudRadial ?? false} onChange={cloudRadial => set({ cloudRadial })} />
      {p.cloudRadial && <>
        {scalar('Radial cloud radius', 'cloudRadius', 1, 0.05, 2)}
        {scalar('Radial inner cavity', 'cloudInnerRadius', 0, 0, 0.95)}
        {scalar('Radial falloff', 'cloudRadialFalloff', 0.4, 0.05, 4)}
      </>}
      {scalar('Smoke density', 'cloudDensity', 2.5, 0, 10)}
      {scalar('Cloud depth', 'cloudDepth', 0.6, 0.01, 3)}
      {scalar('Background extinction', 'cloudAbsorption', 1.8, 0, 10)}
      {scalar('Self shadow', 'cloudShadow', 2, 0, 10)}
      {scalar('Light shafts', 'cloudShafts', 0.8, 0, 5)}
      {scalar('Ambient emission', 'cloudAmbient', 0.5, 0, 3)}
      {scalar('Radiant saturation', 'cloudSaturation', 1.2, 0, 3)}
      <CheckField label="Show embedded light sources" value={p.cloudLightVisible ?? false} onChange={cloudLightVisible => set({ cloudLightVisible })} />
      {p.cloudLightVisible && <>
        {scalar('Light source size', 'cloudLightRadius', 0.012, 0.001, 0.2, 0.001)}
        {scalar('Light source glow', 'cloudLightGlow', 0.7, 0, 5)}
      </>}
      <p className="hint">Two lights inside this cloud illuminate smoke and cast density-based shadows. Positions are relative to its center; depth lets light escape the cloud. Set a light's power to zero to disable it. Background extinction needs one / one_minus_src_alpha blending. This is a layered depth approximation.</p>
      {scalar('Light 1 horizontal', 'cloudLightX', -0.15, -1, 1)}
      {scalar('Light 1 vertical', 'cloudLightY', 0.05, -1, 1)}
      {scalar('Light 1 depth', 'cloudLightZ', 0.6, -2, 2)}
      {scalar('Light 1 power', 'cloudLightPower', 2.5, 0, 15)}
      <button type="button" onClick={() => set({ cloudLightX: 0, cloudLightY: 0 })}>Center main light</button>
      <ColorField label="Light 1 color" value={p.cloudLightColor ?? { r: 0.5, g: 0.8, b: 1, a: 1 }} onChange={cloudLightColor => set({ cloudLightColor })} />
      {scalar('Light 2 horizontal', 'cloudLight2X', 0.35, -1, 1)}
      {scalar('Light 2 vertical', 'cloudLight2Y', -0.2, -1, 1)}
      {scalar('Light 2 depth', 'cloudLight2Z', 0.3, -2, 2)}
      {scalar('Light 2 power', 'cloudLight2Power', 1, 0, 15)}
      <ColorField label="Light 2 color" value={p.cloudLight2Color ?? { r: 1, g: 0.35, b: 0.12, a: 1 }} onChange={cloudLight2Color => set({ cloudLight2Color })} />
    </>}
  </Group>;
}
