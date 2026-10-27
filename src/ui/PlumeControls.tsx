import { SmokeControls } from './SmokeControls';
import { NATIVE_PLUME_DEFAULTS, type NebulaPlumeParams } from '../core/layers';
import { RampEditor } from './RampEditor';
import { CheckField, ColorField, Group, SelectField, SliderField } from './controls';

export function PlumeControls({ value, onChange, units = 'sprite' }: {
  value: NebulaPlumeParams;
  onChange: (patch: Partial<NebulaPlumeParams>) => void;
  units?: 'sprite' | 'horizon';
}) {
  const native = units === 'horizon';
  const params: NebulaPlumeParams = {
    ...(native ? NATIVE_PLUME_DEFAULTS : {}),
    ...value,
  };
  return <>
            <SmokeControls value={params} onChange={onChange} />
            <Group title="Plume geometry">
              <SliderField label="Jet length" value={params.jetLength ?? 0.42} min={0.01} max={20} step={0.01} onChange={(jetLength) => onChange({ jetLength })} />
              <SliderField label="Plume launch gap" value={params.jetGap ?? 0} min={0} max={20} step={0.01} onChange={(jetGap) => onChange({ jetGap })} />
              <SliderField label="Plume launch softness" value={params.jetLaunchFade ?? 0.03} min={0.005} max={2} step={0.005} onChange={(jetLaunchFade) => onChange({ jetLaunchFade })} />
              <SliderField label="Curve start distance" value={params.jetCurveStart ?? 0} min={0} max={20} step={0.01} onChange={(jetCurveStart) => onChange({ jetCurveStart })} />
              <SliderField label="Plume curvature" value={params.jetCurve ?? 0} min={-10} max={10} step={0.05} onChange={(jetCurve) => onChange({ jetCurve })} />
              <SliderField label="Jet cone (deg)" value={params.jetConeDeg ?? 3.43} min={0} max={89.5} step={0.5} onChange={(jetConeDeg) => onChange({ jetConeDeg })} />
              <SliderField label="Jet angle (deg)" value={params.jetAngleDeg ?? 20} min={-180} max={180} step={1} onChange={(jetAngleDeg) => onChange({ jetAngleDeg })} />
              <SliderField label="Jet width" value={params.jetWidth ?? 5} min={native ? 0.05 : 0.5} max={native ? 20 : 384} step={native ? 0.05 : 0.5} onChange={(jetWidth) => onChange({ jetWidth })} />
              <SliderField label="Knots" value={params.knots ?? 4} min={0} max={32} step={1} onChange={(knots) => onChange({ knots })} />
              <SliderField label="Asymmetry" value={params.jetAsymmetry ?? 0.65} min={0} max={1} step={0.01} onChange={(jetAsymmetry) => onChange({ jetAsymmetry })} />
              <SliderField label="Tip strength" value={params.tipGlow ?? 1} min={0} max={20} step={0.05} onChange={(tipGlow) => onChange({ tipGlow })} />
              <SliderField label="Tip extent" value={params.tipSize ?? 0.22} min={0.01} max={5} step={0.01} onChange={(tipSize) => onChange({ tipSize })} />
              <p className="hint">Length, gap and curve-start distance share the same units. The curve begins after the launch gap plus the curve-start distance. {native ? "Distances and widths are in horizon radii. Plume size scales the jets independently; the black-hole horizon stays fixed. Type larger values for long jets." : "Geometry automatically fits into the sprite; type larger length or gap values for extreme proportions, then resize the sprite on the sky."} Cone angles approach 90 degrees.</p>
            </Group>
            <Group title="Plume nebula">
              <SelectField label="Plume noise type" value={params.jetNoiseType ?? 'fbm'} options={[{ value: 'fbm', label: 'fbm (smooth)' }, { value: 'ridged', label: 'ridged' }]} onChange={(v) => onChange({ jetNoiseType: v as 'fbm' | 'ridged' })} />
              <SliderField label="Plume noise scale" value={params.jetNoiseScale ?? 5} min={0.1} max={100} step={0.1} onChange={(jetNoiseScale) => onChange({ jetNoiseScale })} />
              <SliderField label="Plume octaves" value={params.jetOctaves ?? 4} min={1} max={16} step={1} onChange={(jetOctaves) => onChange({ jetOctaves })} />
              <SliderField label="Plume gain" value={params.jetGain ?? 0.5} min={0} max={2} step={0.01} onChange={(jetGain) => onChange({ jetGain })} />
              <SliderField label="Plume lacunarity" value={params.jetLacunarity ?? 2} min={1} max={8} step={0.05} onChange={(jetLacunarity) => onChange({ jetLacunarity })} />
              <SliderField label="Plume ridge offset" value={params.jetOffset ?? 1} min={0} max={2} step={0.01} onChange={(jetOffset) => onChange({ jetOffset })} />
              <SliderField label="Plume shelf" value={params.jetShelf ?? 0} min={0} max={0.99} step={0.01} onChange={(jetShelf) => onChange({ jetShelf })} />
              <SliderField label="Plume power" value={params.jetPower ?? 1} min={0.05} max={10} step={0.05} onChange={(jetPower) => onChange({ jetPower })} />
              <SliderField label="Plume warp" value={params.jetWarp ?? 0} min={0} max={10} step={0.05} onChange={(jetWarp) => onChange({ jetWarp })} />
              <SliderField label="Plume warp scale" value={params.jetWarpScale ?? 1} min={0.05} max={10} step={0.05} onChange={(jetWarpScale) => onChange({ jetWarpScale })} />
              <SliderField label="Plume density" value={params.jetDensity ?? 1} min={0} max={20} step={0.05} onChange={(jetDensity) => onChange({ jetDensity })} />
              <SliderField label="Plume contrast" value={params.jetContrast ?? 1} min={0.05} max={10} step={0.05} onChange={(jetContrast) => onChange({ jetContrast })} />
              <SliderField label="Plume dust" value={params.jetDust ?? 0} min={0} max={1} step={0.01} onChange={(jetDust) => onChange({ jetDust })} />
              <SliderField label="Plume absorption" value={params.jetAbsorption ?? 0} min={0} max={10} step={0.05} onChange={(jetAbsorption) => onChange({ jetAbsorption })} />
              <ColorField label="Plume color" value={params.jetColor ?? { r: 0.6, g: 0.75, b: 1, a: 1 }} onChange={(jetColor) => onChange({ jetColor })} />
              <ColorField label="Plume outer color" value={params.jetOuterColor ?? { r: 0.18, g: 0.15, b: 0.45, a: 1 }} onChange={(jetOuterColor) => onChange({ jetOuterColor })} />
              <CheckField label="Plume color bands" value={!!params.jetColorRamp} onChange={(on) => onChange({ jetColorRamp: on ? [{ t: 0, color: params.jetOuterColor ?? { r: 0.18, g: 0.15, b: 0.45, a: 1 } }, { t: 1, color: params.jetColor ?? { r: 0.6, g: 0.75, b: 1, a: 1 } }] : undefined })} />
              {params.jetColorRamp && <>
                <CheckField label="Color bands along length" value={params.jetRampAlongLength ?? false} onChange={(jetRampAlongLength) => onChange({ jetRampAlongLength })} />
                <RampEditor stops={params.jetColorRamp} onChange={(jetColorRamp) => onChange({ jetColorRamp })} />
              </>}
            </Group>
            <Group title="Plume HDR emission">
              <SliderField label="Plume brightness" value={params.jetBrightness ?? 1} min={0} max={20} step={0.05} onChange={(jetBrightness) => onChange({ jetBrightness: Math.max(0, jetBrightness) })} />
              <details className="emission-contrast">
                <summary>Advanced density contrast</summary>
                <SliderField label="Plume density power" value={params.jetHdrPower ?? 1} min={0.1} max={5} step={0.05} onChange={(jetHdrPower) => onChange({ jetHdrPower: Math.max(0.1, jetHdrPower) })} />
                <p className="hint">Changes plume density and visible structure. Use brightness to balance HDR without reshaping the jets.</p>
              </details>
            </Group>
  </>;
}
