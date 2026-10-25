import type { RampStop } from '../core/layers';
import { PALETTES } from '../core/palettes';

function rampGradientCss(stops: RampStop[]): string {
  const parts = [...stops]
    .sort((a, b) => a.t - b.t)
    .map((s) => {
      const c = s.color;
      return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}) ${Math.round(s.t * 100)}%`;
    });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function RampEditor({ stops, onChange }: { stops: RampStop[]; onChange: (stops: RampStop[]) => void }) {
  const update = (i: number, patch: Partial<RampStop>) =>
    onChange(stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="ramp-editor">
      <div className="field-row">
        <label>Palette</label>
        <select
          value=""
          onChange={(e) => {
            const p = PALETTES[e.target.value];
            if (p) onChange(p.map((s) => ({ t: s.t, color: { ...s.color } })));
          }}
        >
          <option value="">apply preset…</option>
          {Object.keys(PALETTES).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className="ramp-preview" style={{ background: rampGradientCss(stops) }} />
      {stops.map((s, i) => (
        <div className="field-row" key={i}>
          <input
            className="num"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={s.t}
            title="Position (noise value)"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) update(i, { t: Math.min(1, Math.max(0, n)) });
            }}
          />
          <input
            type="color"
            value={`#${[s.color.r, s.color.g, s.color.b]
              .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
              .join('')}`}
            onChange={(e) => {
              const hex = e.target.value;
              update(i, {
                color: {
                  ...s.color,
                  r: parseInt(hex.slice(1, 3), 16) / 255,
                  g: parseInt(hex.slice(3, 5), 16) / 255,
                  b: parseInt(hex.slice(5, 7), 16) / 255,
                },
              });
            }}
          />
          <button
            type="button"
            className="dice"
            title="Remove stop"
            disabled={stops.length <= 2}
            onClick={() => onChange(stops.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="dice"
        title="Add stop"
        onClick={() => {
          const sorted = [...stops].sort((a, b) => a.t - b.t);
          const mid = sorted[Math.floor(sorted.length / 2)];
          onChange([...stops, { t: Math.min(1, mid.t + 0.1), color: { ...mid.color } }]);
        }}
      >
        + add stop
      </button>
    </div>
  );
}
