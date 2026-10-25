/**
 * Layer stack: select, toggle visibility, reorder, duplicate, delete, add.
 * File order = draw order (first = furthest back).
 */
import { useState } from 'react';
import type { Layer, LayerType } from '../core/layers';

const TYPE_LABELS: Record<LayerType, string> = {
  noise: 'nebula',
  points: 'stars',
  billboards: 'flares',
  volumetric: 'volume',
  galaxy: 'galaxy',
  sun: 'sun',
  planet: 'planet',
  blackhole: 'b-hole',
  sprite: 'sprite',
};

interface LayerListProps {
  layers: Layer[];
  selected: number;
  onSelect: (index: number) => void;
  onToggleVisible: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: (type: LayerType) => void;
  onAddCloud: () => void;
  onToggleLock: (index: number) => void;
}

/** layers with spherical placement — the ones the viewport can drag */
const isPositional = (layer: Layer): boolean => 'dirLonDeg' in layer;

export function LayerList({
  layers, selected,
  onSelect, onToggleVisible, onMove, onReorder, onDuplicate, onDelete, onAdd, onAddCloud, onToggleLock,
}: LayerListProps) {
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  return (
    <div className="layer-panel">
      <div className="layer-panel-head">
        <h2>Layers</h2>
      </div>
      <div className="add-layer-grid">
        <button type="button" title="Add movable nebula cloud" onClick={onAddCloud}>+cloud</button>
        <button type="button" title="Add nebula layer" onClick={() => onAdd('noise')}>+nebula</button>
        <button type="button" title="Add star layer" onClick={() => onAdd('points')}>+stars</button>
        <button type="button" title="Add flare layer" onClick={() => onAdd('billboards')}>+flares</button>
        <button type="button" title="Add volumetric nebula layer" onClick={() => onAdd('volumetric')}>+volume</button>
        <button type="button" title="Add hero galaxy layer" onClick={() => onAdd('galaxy')}>+galaxy</button>
        <button type="button" title="Add positional sun layer (add two for a binary)" onClick={() => onAdd('sun')}>+sun</button>
        <button type="button" title="Add positional planet layer" onClick={() => onAdd('planet')}>+planet</button>
        <button type="button" title="Add black hole (lenses the layers below it)" onClick={() => onAdd('blackhole')}>+b.hole</button>
        <button type="button" title="Add sprite quad (PCG bakes / uploads) — drag it in the viewport to place" onClick={() => onAdd('sprite')}>+sprite</button>
      </div>

      <ol className="layer-list">
        {layers.map((layer, i) => (
          <li
            draggable
            onDragStart={e => { e.dataTransfer.setData('application/x-skybox-layer', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={e => { if (e.dataTransfer.types.includes('application/x-skybox-layer')) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDropTarget(i); } }}
            onDragLeave={() => setDropTarget(null)}
            onDragEnd={() => setDropTarget(null)}
            onDrop={e => {
              const raw = e.dataTransfer.getData('application/x-skybox-layer');
              if (raw === '') return;
              e.preventDefault(); e.stopPropagation(); setDropTarget(null);
              const from = Number(raw);
              if (Number.isInteger(from) && from >= 0 && from < layers.length) onReorder(from, i);
            }}
            style={dropTarget === i ? { outline: '2px solid #94baff', outlineOffset: 2 } : undefined}
            key={i}
            className={[
              i === selected ? 'selected' : '',
              layer.visible === false ? 'hidden-layer' : '',
            ].join(' ')}
            onClick={() => onSelect(i)}
          >

            <span className={`badge badge-${layer.type}`}>{TYPE_LABELS[layer.type]}</span>
            <span className="layer-name" title={layer.name}>{layer.name}</span>
            <span className="row-actions">
            <button
              type="button"
              className="eye"
              title={layer.visible === false ? 'Show layer' : 'Hide layer'}
              aria-label={`${layer.visible === false ? 'Show' : 'Hide'} ${layer.name}`}
              aria-pressed={layer.visible === false}
              onClick={(e) => { e.stopPropagation(); onToggleVisible(i); }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M2 12c4-8 16-8 20 0-4 8-16 8-20 0Z" /><circle cx="12" cy="12" r="3" />
                {layer.visible === false && <path d="m3 3 18 18" />}
              </svg>
            </button>
              {isPositional(layer) && (
                <button
                  type="button"
                  className={layer.locked ? 'lock-on' : ''}
                  title={layer.locked ? 'Unlock position (allow viewport drag)' : 'Lock position (prevent viewport drag)'}
                  onClick={(e) => { e.stopPropagation(); onToggleLock(i); }}
                >
                  {layer.locked ? '🔒' : '🔓'}
                </button>
              )}
              <button type="button" title="Move back" disabled={i === 0}
                onClick={(e) => { e.stopPropagation(); onMove(i, -1); }}>↑</button>
              <button type="button" title="Move forward" disabled={i === layers.length - 1}
                onClick={(e) => { e.stopPropagation(); onMove(i, 1); }}>↓</button>
              <button type="button" title="Duplicate"
                onClick={(e) => { e.stopPropagation(); onDuplicate(i); }}>⧉</button>
              <button type="button" title="Delete"
                onClick={(e) => { e.stopPropagation(); onDelete(i); }}>✕</button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
