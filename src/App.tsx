import { SliderField } from './ui/controls';
import { SceneHistory } from './core/history';
import { defaultNebulaCloud } from './core/nebulaCloud';
import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { addSpriteAsset, clearSpriteAssets, listSpriteAssets, type SpriteAsset } from './assets/spriteStore';
import { resolveTextureReference } from './assets/textureReferences';
import { importLegacyXml, fromJsonString } from './core/io';
import { NATIVE_PLUME_DEFAULTS, defaultLayer, type Layer, type LayerType } from './core/layers';
import { downloadBlob, floatToPngBlob } from './export/exporter';
import { buildProjectBundle, mimeForFileName, openProjectBundle } from './export/projectBundle';
import { PreviewScene } from './render/PreviewScene';
import { PREVIEW_QUALITY, type PreviewQuality } from './render/previewQuality';
import { chooseExportDirectory } from './export/diskExport';
import { HdrPreview } from './ui/HdrPreview';
import { Inspector } from './ui/Inspector';
import { LayerList } from './ui/LayerList';
import { ScriptTab } from './ui/ScriptTab';
import { SpritesTab } from './ui/SpritesTab';
import { StarsTab } from './ui/StarsTab';

// bundled presets: legacy .xml plus native v2 .json (new layer types)
const presetFiles = import.meta.glob('../presets/*.{xml,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const presets: Record<string, string> = Object.fromEntries(
  Object.entries(presetFiles).map(([path, text]) => [
    path.split('/').pop()!.replace(/\.(xml|json)$/, ''),
    text,
  ]),
);

const parsePreset = (text: string) =>
  text.trimStart().startsWith('{') ? fromJsonString(text) : importLegacyXml(text);

const DEFAULT_PRESET = 'purple-nebula-complex';

/** ?preset=name — used by tests/screenshots and shareable links. */
function initialPreset(): string {
  const q = new URLSearchParams(window.location.search).get('preset');
  return q && presets[q] ? q : DEFAULT_PRESET;
}

type Tab = 'layers' | 'stars' | 'sprites' | 'script';

/** Below this width the sidebar overlays the viewport as a drawer. */
const NARROW_QUERY = '(max-width: 760px)';

export default function App() {
  const [tab, setTab] = useState<Tab>('layers');
  // start collapsed on narrow/vertical screens so the scene is visible first
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia(NARROW_QUERY).matches,
  );
  const [presetName, setPresetName] = useState(initialPreset);
  const [sceneLocked, setSceneLocked] = useState(false);
  const [layers, setLayersState] = useState<Layer[]>([]);
  const historyRef = useRef<SceneHistory<{ layers: Layer[]; assetVersion: number }> | null>(null);
  const assetVersionRef = useRef(0), nextAssetVersionRef = useRef(1);
  const assetSnapshotsRef = useRef(new Map<number, SpriteAsset[]>([[0, []]]));
  const [selected, setSelected] = useState(0);
  const [flatView, setFlatView] = useState(false);
  const [viewFov, setViewFov] = useState(80);
  const [previewQuality, setPreviewQuality] = useState<PreviewQuality>(() => {
    try {
      const saved = localStorage.getItem('skybox.previewQuality');
      if (saved && Object.hasOwn(PREVIEW_QUALITY, saved)) return saved as PreviewQuality;
    } catch { /* Storage may be unavailable; use the balanced default. */ }
    return 'medium';
  });
  const [grid, setGrid] = useState(false);
  const [spriteVersion, setSpriteVersion] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSize, setExportSize] = useState(1024);
  const [lensResolution, setLensResolution] = useState<number | 'native' | undefined>();
  const [exportFaces, setExportFaces] = useState(true);
  const [exportEquirect, setExportEquirect] = useState(true);
  const [exportExr, setExportExr] = useState(false);
  const [exportHdr, setExportHdr] = useState(false);
  const [hdrSoftness, setHdrSoftness] = useState(1);
  const [hdrPreviewOpen, setHdrPreviewOpen] = useState(false);
  const [hdrPicking, setHdrPicking] = useState(false);
  const [hdrPreviewCenter, setHdrPreviewCenter] = useState({ lonDeg: 0, latDeg: 0 });
  const [exportBatch, setExportBatch] = useState(1);
  const [exportPerLayer, setExportPerLayer] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportToFolder, setExportToFolder] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const exportAbort = useRef<AbortController | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PreviewScene | null>(null);
  const dirtyRef = useRef<Map<number, Layer>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const exportBackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (exportOpen) exportBackRef.current?.focus();
  }, [exportOpen]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && exportOpen && !exporting && !hdrPreviewOpen && !event.defaultPrevented) {
        setExportOpen(false); exportButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [exportOpen, exporting, hdrPreviewOpen]);

  // mirror for callbacks that outlive a render (viewport drag commits)
  const layersRef = useRef<Layer[]>([]);
  layersRef.current = layers;
  const setLayers = (update: Layer[] | ((prev: Layer[]) => Layer[]), key = '') => {
    const next = typeof update === 'function' ? update(layersRef.current) : update;
    const assets = listSpriteAssets(), previousAssets = assetSnapshotsRef.current.get(assetVersionRef.current) ?? [];
    if (assets.length !== previousAssets.length || assets.some((a, i) => a !== previousAssets[i])) {
      assetVersionRef.current = nextAssetVersionRef.current++;
      assetSnapshotsRef.current.set(assetVersionRef.current, assets);
    }
    const snapshot = { layers: next, assetVersion: assetVersionRef.current };
    if (historyRef.current) historyRef.current.push(snapshot, key);
    else historyRef.current = new SceneHistory(snapshot);
    const retained = new Set(historyRef.current.retainedValues.map(v => v.assetVersion));
    for (const version of assetSnapshotsRef.current.keys()) if (!retained.has(version)) assetSnapshotsRef.current.delete(version);
    layersRef.current = next; setLayersState(next);
  };
  const restoreHistory = (redo = false) => {
    const snapshot = redo ? historyRef.current?.redo() : historyRef.current?.undo();
    if (!snapshot) return;
    const next = snapshot.layers;
    if (snapshot.assetVersion !== assetVersionRef.current) {
      const assets = assetSnapshotsRef.current.get(snapshot.assetVersion) ?? [];
      clearSpriteAssets();
      for (const a of assets) addSpriteAsset(a.fileName, a.data, a.mime, a.occludes);
      assetVersionRef.current = snapshot.assetVersion;
      assetSnapshotsRef.current.set(snapshot.assetVersion, listSpriteAssets());
      setSpriteVersion(v => v + 1);
    }
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    dirtyRef.current.clear(); layersRef.current = next; setLayersState(next);
    setSelected(s => Math.min(s, Math.max(0, next.length - 1)));
    sceneRef.current?.setLayers(next);
  };
  const historyActionRef = useRef(restoreHistory); historyActionRef.current = restoreHistory;
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (exporting || hdrPreviewOpen || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], [contenteditable="true"]')) return;
      if (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y') {
        e.preventDefault(); historyActionRef.current(e.shiftKey || e.key.toLowerCase() === 'y');
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [exporting, hdrPreviewOpen]);


  // init scene once
  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const scene = new PreviewScene(canvas);
    sceneRef.current = scene;
    scene.onFovChanged = setViewFov;

    // viewport drag-to-place: commit the final lon/lat into layer state
    scene.onLayerPlaced = (index, dirLonDeg, dirLatDeg) => {
      const layer = layersRef.current[index];
      if (!layer || !('dirLonDeg' in layer)) return;
      const next = { ...layer, dirLonDeg, dirLatDeg } as Layer;
      // a pending slider debounce for this layer would rebuild it with
      // pre-drag coordinates — the drag result supersedes it
      dirtyRef.current.delete(index);
      setLayers((prev) => prev.map((l, i) => (i === index ? next : l)));
      setSelected(index);
      scene.updateLayer(index, next);
    };

    // cancelled drag (pinch/lock/pointer loss): snap the quad back to the
    // committed coordinates instead of leaving it at the aborted position
    scene.onLayerDragCancelled = (index) => {
      const layer = layersRef.current[index];
      if (layer) scene.updateLayer(index, layer);
    };

    const observer = new ResizeObserver(() => {
      scene.resize(viewport.clientWidth, viewport.clientHeight);
    });
    observer.observe(viewport);

    return () => {
      exportAbort.current?.abort();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = null;
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setPreviewQuality(previewQuality);
    try { localStorage.setItem('skybox.previewQuality', previewQuality); } catch { /* Display preference only. */ }
  }, [previewQuality]);

  /** Replace the whole stack (preset load, file open, structural edits). */
  const loadLayers = (next: Layer[], keepSelection = false) => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    dirtyRef.current.clear();
    setLayers(next);
    if (!keepSelection) setSelected(0);
    else setSelected((s) => Math.min(s, Math.max(0, next.length - 1)));
    sceneRef.current?.setLayers(next);
  };

  // load preset on mount + preset switch
  useEffect(() => {
    loadLayers(parsePreset(presets[presetName]).layers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetName]);

  // leaving the PCG tab clears the viewport preview + restores the backdrop
  useEffect(() => {
    if (tab !== 'stars') {
      sceneRef.current?.setPcgPreview(null);
    }
  }, [tab]);

  /** Add a sprite layer for a texture at a given (or view-center) position. */
  const addSpriteLayerAt = (
    textureId: string,
    baseName: string,
    at?: { lonDeg: number; latDeg: number },
    occludes = false,
  ) => {
    const scene = sceneRef.current;
    const sprite = defaultLayer('sprite', baseName) as Extract<Layer, { type: 'sprite' }>;
    sprite.texture = textureId;
    // solid bodies (planet/sun bakes carry disc alpha) occlude the sky
    if (occludes) {
      sprite.sourceBlendFactor = 'one';
      sprite.destBlendFactor = 'one_minus_src_alpha';
    }
    const pos = at ?? scene?.viewCenter();
    if (pos) {
      sprite.dirLonDeg = Math.round(pos.lonDeg * 100) / 100;
      sprite.dirLatDeg = Math.round(pos.latDeg * 100) / 100;
    }
    const next = [...layersRef.current, sprite];
    loadLayers(next, true);
    setSelected(next.length - 1);
    setTab('layers');
  };

  /** PCG bake → skybox: add a sprite layer with the baked texture at view center. */
  const addBakeToSky = (textureId: string, baseName: string, occludes = false) =>
    addSpriteLayerAt(textureId, baseName, undefined, occludes);

  /** Sprites-tab drag → viewport drop: place the sprite where it was dropped. */
  const onViewportDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData('application/x-spacescape-sprite');
    if (!id) return;
    e.preventDefault();
    const scene = sceneRef.current;
    if (!scene) return;
    const at = scene.lonLatAtClient(e.clientX, e.clientY);
    // baked solid bodies (planet/sun/PCG star or planet) carry an occlude hint
    const occludes = e.dataTransfer.getData('application/x-spacescape-occludes') === 'true';
    addSpriteLayerAt(id, id.replace(/^user:/, '').replace(/\.(png|jpe?g|webp)$/i, ''), at, occludes);
  };

  /** Update controls immediately; apply the latest preview values in batches. */
  const updateLayer = (index: number, layer: Layer) => {
    const previous = layersRef.current[index];
    const fields = Object.keys(layer).filter(k => JSON.stringify((layer as unknown as Record<string, unknown>)[k]) !== JSON.stringify((previous as unknown as Record<string, unknown>)?.[k])).sort().join(',');
    setLayers((prev) => prev.map((l, i) => (i === index ? layer : l)), `layer-${index}-${fields}`);
    dirtyRef.current.set(index, layer);
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      const pending = [...dirtyRef.current];
      dirtyRef.current.clear();
      for (const [i, l] of pending) {
        sceneRef.current?.updateLayer(i, l);
      }
    }, 80);
  };

  const toggleLayer = (index: number) => {
    const layer = layersRef.current[index];
    if (!layer) return;
    const show = layer.visible === false;
    const next = { ...layer, visible: show ? undefined : false } as Layer;
    setLayers((prev) => prev.map((l, i) => (i === index ? next : l)));
    // a pending debounced edit must not resurrect the pre-toggle flag
    if (dirtyRef.current.has(index)) dirtyRef.current.set(index, next);
    sceneRef.current?.setLayerVisible(index, show);
  };

  const moveLayer = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= layers.length) return;
    const next = [...layers];
    [next[index], next[target]] = [next[target], next[index]];
    loadLayers(next, true);
    setSelected(target);
  };

  const duplicateLayer = (index: number) => {
    const copy = structuredClone(layers[index]);
    copy.name = `${copy.name} copy`;
    const next = [...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)];
    loadLayers(next, true);
    setSelected(index + 1);
  };

  const deleteLayer = (index: number) => {
    loadLayers(layers.filter((_, i) => i !== index), true);
  };

  const addLayer = (type: LayerType) => {
    const names: Record<LayerType, string> = {
      noise: 'New Nebula',
      points: 'New Stars',
      billboards: 'New Flares',
      volumetric: 'New Volumetric Nebula',
      galaxy: 'New Galaxy',
      sun: 'New Sun',
      planet: 'New Planet',
      blackhole: 'New Black Hole',
      sprite: 'New Sprite',
    };
    const layer = defaultLayer(type, names[type]);
    if (layer.type === 'blackhole') {
      Object.assign(layer, NATIVE_PLUME_DEFAULTS, { jetEnabled: true });
      const at = sceneRef.current?.viewCenter();
      if (at) { layer.dirLonDeg = at.lonDeg; layer.dirLatDeg = at.latDeg; }
    }
    const next = [...layers, layer];
    loadLayers(next, true);
    setSelected(next.length - 1);
  };

  const openFile = async (file: File) => {
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.sspj') || lower.endsWith('.zip')) {
        const bundle = openProjectBundle(new Uint8Array(await file.arrayBuffer()));
        clearSpriteAssets(); // don't leak the previous project's assets in
        for (const a of bundle.assets) {
          addSpriteAsset(a.fileName, a.data, mimeForFileName(a.fileName), a.occludes);
        }
        setSpriteVersion((v) => v + 1);
        loadLayers(bundle.layers);
        return;
      }
      const text = await file.text();
      const result = lower.endsWith('.json') ? fromJsonString(text) : importLegacyXml(text);
      loadLayers(result.layers);
    } catch (err) {
      alert(`Could not open ${file.name}: ${err instanceof Error ? err.message : err}`);
    }
  };

  /** Save the native project bundle: project.json + assets + preview.png. */
  const saveProject = async () => {
    const scene = sceneRef.current;
    if (!scene || saving) return;
    setSaving(true);
    try {
      let preview: Uint8Array | null = null;
      const bake = await scene.bakeExport(layers.filter((l) => l.visible !== false), 128, true);
      if (bake.equirect) {
        const blob = await floatToPngBlob(bake.equirect.data, bake.equirect.width, bake.equirect.height);
        preview = new Uint8Array(await blob.arrayBuffer());
      }
      downloadBlob(
        `${presetName}.zip`,
        buildProjectBundle(layers, listSpriteAssets(), preview),
      );
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  };

  const runExport = async () => {
    const scene = sceneRef.current;
    if (!scene || exporting || hdrPreviewOpen) return;
    setExporting(true);
    setExportNotice('');
    const abort = new AbortController();
    exportAbort.current = abort;
    try {
      const directory = exportToFolder ? await chooseExportDirectory() : undefined;
      abort.signal.throwIfAborted();
      const visibleLayers = layers.filter((l) => l.visible !== false);
      const { runLowMemoryExport } = await import('./export/lowMemory');
      const outputFolder = await runLowMemoryExport(scene, visibleLayers, {
        size: exportSize, preset: presetName, faces: exportFaces, png: exportEquirect,
        hdr: exportHdr, exr: exportExr, hdrSoftness, directory, perLayer: exportPerLayer, variations: exportBatch,
        signal: abort.signal, progress: setBatchProgress, lensResolution,
      });
      if (outputFolder) setExportNotice(`Saved in ${outputFolder} inside your chosen folder.`);
      setExportOpen(false);
    } catch (err) {
      if (!abort.signal.aborted && !(err instanceof DOMException && err.name === 'AbortError')) {
        const formats = [exportFaces && 'faces', exportEquirect && 'PNG', exportHdr && 'HDR', exportExr && 'EXR'].filter(Boolean).join(', ');
        setExportNotice(`Export failed (${exportSize}px/face; ${formats}): ${err instanceof Error ? err.message : err}`);
      }
    } finally {
      exportAbort.current = null;
      setExporting(false);
      setBatchProgress('');
    }
  };

  /**
   * Sprite assets changed (upload, bake, delete): rebuild any layer whose
   * texture points at a user sprite so the viewport can't show stale content.
   */
  const refreshUserTextureLayers = () => {
    setLayers(layersRef.current); // Record asset additions/removal/replacement by version, without cloning image bytes.
    setSpriteVersion((v) => v + 1);
    layersRef.current.forEach((l, i) => {
      // Imported templates may use filenames/paths rather than user: IDs.
      // Rebuild mixed sets too, so newly supplied PNGs relink immediately.
      if (l.type === 'sprite' || l.type === 'billboards') {
        sceneRef.current?.updateLayer(i, l);
      }
    });
  };

  const selectedLayer = layers[selected] as Layer | undefined;
  const presetNames = useMemo(() => Object.keys(presets).sort(), []);
  const userSpriteIds = useMemo(
    () => listSpriteAssets().map((a) => a.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spriteVersion],
  );
  const missingImages = [...new Set(layers.flatMap((layer) =>
    layer.type === 'sprite' ? [layer.texture]
      : layer.type === 'billboards' ? [layer.texture, ...(layer.textureMix ?? [])] : [],
  ))].filter((reference) => reference && !resolveTextureReference(reference, userSpriteIds));

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
        aria-label={sidebarOpen ? 'Hide controls' : 'Show controls'}
        title={sidebarOpen ? 'Hide controls' : 'Show controls'}
        onClick={() => setSidebarOpen((o) => !o)}
      >
        {sidebarOpen ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3.5M12.5 8H20" />
            <path d="M4 16h8.5M17.5 16H20" />
            <circle cx="10" cy="8" r="2.5" />
            <circle cx="15" cy="16" r="2.5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className={`scene-lock ${sceneLocked ? 'locked' : ''}`}
        aria-pressed={sceneLocked}
        aria-label={sceneLocked ? 'Unlock scene (allow dragging layers)' : 'Lock scene (pan only)'}
        title={sceneLocked ? 'Scene locked: drags pan the view. Click to allow dragging layers.' : 'Lock scene: drags pan the view instead of moving layers'}
        onClick={() => {
          const next = !sceneLocked;
          setSceneLocked(next);
          sceneRef.current?.setSceneLocked(next);
        }}
      >
        {sceneLocked ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
          </svg>
        )}
      </button>
      {sidebarOpen && (
        <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`sidebar${exportOpen ? ' export-open' : ''}`} id="sidebar">
        <div className="titlebar">
          <h1>BinaryConstruct Skybox <span className="edition">+ Extra Features</span><span className="tagline">Independent modification · original by BinaryConstruct</span></h1>
          <span className="icon-links">
            <a href={`${import.meta.env.BASE_URL}help.html`} target="_blank" rel="noreferrer" title="Usage guide" aria-label="Help and usage guide">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.7 9a2.4 2.4 0 1 1 3.9 1.9c-.9.7-1.6 1.2-1.6 2.6" />
                <path d="M12 17h.01" />
              </svg>
            </a>
            <a href={`${import.meta.env.BASE_URL}help.html#credits`} target="_blank" rel="noreferrer" title="Credits and license" aria-label="Credits">Credits</a>
          </span>
        </div>

        <div className="file-row">
          <span className="file-buttons">
          <button type="button" disabled={exporting || hdrPreviewOpen || !historyRef.current?.canUndo} onClick={() => restoreHistory()} title="Undo scene edit (Ctrl+Z)">Undo</button>
          <button type="button" disabled={exporting || hdrPreviewOpen || !historyRef.current?.canRedo} onClick={() => restoreHistory(true)} title="Redo scene edit (Ctrl+Shift+Z)">Redo</button>

            <button type="button" disabled={saving || exporting || hdrPreviewOpen} onClick={() => fileInputRef.current?.click()}>Open</button>
            <button type="button" disabled={saving || exporting} onClick={() => void saveProject()}>
              {saving ? '…' : 'Save'}
            </button>
            <button
              type="button"
              className={grid ? 'active' : ''}
              disabled={exporting}
              title="Toggle lat/lon reference grid (editor only, not exported)"
              onClick={() => {
                const next = !grid;
                setGrid(next);
                sceneRef.current?.setGridVisible(next);
              }}
            >
              Grid
            </button>
            <button
              type="button"
              className={exportOpen ? 'active' : ''}
              ref={exportButtonRef}
              aria-expanded={exportOpen}
              aria-controls="export-settings"
              title="Bake and export the skybox"
              disabled={saving || exporting || hdrPreviewOpen}
              onClick={() => setExportOpen(!exportOpen)}
            >
              Export
            </button>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.json,.sspj,.zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openFile(f);
              e.target.value = '';
            }}
          />
        </div>

        {missingImages.length > 0 && (
          <p className="hint" role="status">
            Assigned images unavailable: {missingImages.join(', ')}. Their assignments
            are preserved. Upload the original PNGs in Sprites to relink them;
            JSON/XML templates contain names, while project ZIPs include uploaded images.
          </p>
        )}
        <div className="view-controls">
          <div className="preview-quality-control">
            <label htmlFor="preview-quality">Preview quality</label>
            <select id="preview-quality" disabled={exporting || hdrPreviewOpen} value={previewQuality} onChange={e => setPreviewQuality(e.target.value as PreviewQuality)}>
              <option value="low">Low (50%)</option>
              <option value="medium">Medium (75%)</option>
              <option value="high">High (100%)</option>
            </select>
          </div>
          <p className="hint preview-quality-hint">Preview only. Exports and HDR crops keep their selected quality.</p>
          <select aria-label="Viewport projection" value={flatView ? '2d' : '3d'} onChange={e => { const flat = e.target.value === '2d'; setFlatView(flat); sceneRef.current?.setViewMode(flat); }}>
            <option value="3d">3D sky view</option><option value="2d">2D panorama view</option>
          </select>
          <button type="button" disabled={exporting} onClick={() => { setHdrPreviewCenter(sceneRef.current?.viewCenter() ?? { lonDeg: 0, latDeg: 0 }); setHdrPicking(false); setHdrPreviewOpen(true); }}>HDR preview</button>
          {!flatView && <SliderField label="Field of view" value={viewFov} min={15} max={120} step={1} onChange={fov => sceneRef.current?.setFov(fov)} />}
          {flatView && <p className="hint">Full 360 x 180 panorama. Drag clouds here; switch to 3D to adjust FOV.</p>}
        </div>
        <nav className="tabs">
          {(['layers', 'stars', 'sprites', 'script'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'active' : ''}
              onClick={() => setTab(t)}
            >
              {t === 'stars' ? 'PCG' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        {exportNotice && <p role={exportNotice.startsWith('Export failed') ? 'alert' : 'status'} className="hint">{exportNotice}</p>}
        {exportOpen && (
          <section className="export-panel" id="export-settings" aria-labelledby="export-heading">
            <div className="export-heading">
              <h2 id="export-heading">Export skybox</h2>
              <button type="button" ref={exportBackRef} disabled={exporting} onClick={() => { setExportOpen(false); exportButtonRef.current?.focus(); }}>Back to editor</button>
            </div>
            <div className="export-options">
            <div className="field-row">
              <label htmlFor="export-resolution">Resolution</label>
              <select id="export-resolution" disabled={exporting} value={exportSize} onChange={(e) => setExportSize(Number(e.target.value))}>
                {[512, 1024, 2048, 4096, 8192, 16384].map((s) => (
                  <option key={s} value={s}>{s} × {s} / face</option>
                ))}
              </select>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Panorama: {exportSize * 2} × {exportSize} pixels.
            </p>
            {layers.some(l => l.type === 'blackhole' && l.visible !== false && l.coreVisible !== false) && <>
              <div className="field-row">
                <label htmlFor="export-lens-detail">Lens background detail</label>
                <select id="export-lens-detail" disabled={exporting} value={lensResolution ?? 'auto'} onChange={e => setLensResolution(e.target.value === 'auto' ? undefined : e.target.value === 'native' ? 'native' : Number(e.target.value))}>
                  <option value="auto">Memory budget (up to 1K)</option>
                  {[512,1024,2048,4096,8192].map(s => <option key={s} value={s}>{s}px / capture face</option>)}
                  <option value="native">Match export resolution</option>
                </select>
              </div>
              <p className="hint">Controls only the background bent by black holes. Discs and jets are procedural. {lensResolution === undefined ? 'Memory budget keeps lens textures within approximately 64 MiB total.' : `Selected captures require approximately ${Math.round(6*8*Math.min(exportSize,lensResolution === 'native' ? exportSize : lensResolution)**2/1048576)} MiB per black hole, plus driver overhead. Large captures can exhaust GPU memory; HDR crops use the same setting.`}</p>
            </>}
            <p className="hint">Nebulae, clouds, jets, suns and planets render procedural detail at output pixels. Imported images, smoke silhouettes and saved PCG sprites retain their source detail.</p>
            {(exportHdr || exportExr) && <div className="field-row">
              <label htmlFor="export-hdr-softness">HDR softness</label>
              <input id="export-hdr-softness" type="number" min="0" max="4" step="0.25" disabled={exporting}
                value={hdrSoftness} onChange={(e) => setHdrSoftness(Math.max(0, Math.min(4, Number(e.target.value))))} />
            </div>}
            {(exportHdr || exportExr) && <p className="hint">Linear-light smoothing for HDR/EXR panoramas. 1 gives a gentle angular blur that scales with resolution; 0 preserves native sharpness. PNGs remain crisp.</p>}

            <button type="button" disabled={exporting} onClick={() => {
              setHdrPreviewCenter(sceneRef.current?.viewCenter() ?? { lonDeg: 0, latDeg: 0 });
              setHdrPicking(false); setHdrPreviewOpen(true);
            }}>Preview HDR smoothness</button>
            <div className="field-row">
              <label htmlFor="export-memory-saving">Memory-saving export</label>
              <input id="export-memory-saving" type="checkbox" checked disabled title="All exports use the bounded-memory pipeline" />
            </div>
            <div className="field-row">
              <label htmlFor="export-to-folder">Save directly to folder</label>
              <input id="export-to-folder" type="checkbox" checked={exportToFolder} disabled={exporting || !('showDirectoryPicker' in window)} onChange={e => setExportToFolder(e.target.checked)} />
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Renders small tiles at the selected resolution and uses temporary disk
              space, or writes directly into a new subfolder you choose. Folder output
              avoids temporary browser quota. Archives use ZIP64 for files over 4 GiB.
              EXR is uncompressed. Chrome or Edge on localhost recommended.
            </p>
            <div className="field-row">
              <label htmlFor="export-faces">Cube faces (.zip)</label>
              <input id="export-faces" type="checkbox" disabled={exporting} checked={exportFaces} onChange={(e) => setExportFaces(e.target.checked)} />
            </div>
            <div className="fmt-engines">Unity 6-sided skybox · Unreal cubemap · source-style engines</div>
            <div className="field-row">
              <label htmlFor="export-png">Equirect (.png)</label>
              <input id="export-png" type="checkbox" disabled={exporting} checked={exportEquirect} onChange={(e) => setExportEquirect(e.target.checked)} />
            </div>
            <div className="fmt-engines">Unity panoramic · Godot PanoramaSky · three.js · Blender world</div>
            <div className="field-row">
              <label htmlFor="export-hdr" title="Radiance RGBE">Equirect (.hdr)</label>
              <input id="export-hdr" type="checkbox" disabled={exporting} checked={exportHdr} onChange={(e) => setExportHdr(e.target.checked)} />
            </div>
            <div className="fmt-engines">Unreal TextureCube import · HDR environments (Blender, three.js)</div>
            <div className="field-row">
              <label htmlFor="export-exr" title="OpenEXR">Equirect (.exr)</label>
              <input id="export-exr" type="checkbox" disabled={exporting} checked={exportExr} onChange={(e) => setExportExr(e.target.checked)} />
            </div>
            <div className="fmt-engines">Godot PanoramaSkyMaterial · Unity HDR panoramic · DCC tools</div>
            <div className="field-row">
              <label htmlFor="export-per-layer" title="Each visible layer baked solo + composite.json blend recipe + star/billboard/galaxy layers as JSON/CSV particle data">Per-layer + data (.zip)</label>
              <input
                type="checkbox"
                id="export-per-layer"
                disabled={exporting}
                checked={exportPerLayer}
                onChange={(e) => setExportPerLayer(e.target.checked)}
              />
            </div>
            <div className="fmt-engines">star data for Unreal Niagara · Godot GPUParticles/MultiMesh · Unity VFX Graph</div>
            <div className="field-row">
              <label htmlFor="export-variations" title="Bake N deterministic seed variations of this preset into one zip (v01/, v02/, … + manifest.json)">Variations</label>
              <input
                id="export-variations"
                className="num"
                disabled={exporting}
                type="number"
                min={1}
                max={32}
                step={1}
                value={exportBatch}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  if (Number.isFinite(n)) setExportBatch(Math.min(32, Math.max(1, n)));
                }}
              />
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Exports visible layers. The grid is never included. Save a project ZIP separately to keep editable settings and uploaded images.
            </p>
            </div>
            <div className="export-actions">
            <p className="hint">{layers.filter(l => l.visible !== false).length} visible layers · {exportSize * 2} × {exportSize} panorama</p>
            {exporting && <p className="export-progress" role="status">{batchProgress || 'Preparing export…'}</p>}
            <button
              type="button"
              className="export-go"
              disabled={exporting || (!exportFaces && !exportEquirect && !exportHdr && !exportExr)}
              onClick={() => void runExport()}
            >
              {exporting
                ? 'Exporting…'
                : exportBatch > 1 ? `Bake ${exportBatch} variations`
                : exportPerLayer ? 'Bake layers & data'
                : 'Bake & download'}
            </button>
            {exporting && (
              <button type="button" onClick={() => exportAbort.current?.abort()}>Cancel export</button>
            )}
            </div>
          </section>
        )}

        {tab === 'layers' && (
          <div className="asset-tab layers-tab">
            <label className="field">
              Preset
              <select value={presetName} onChange={(e) => setPresetName(e.target.value)}>
                {presetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <LayerList
              layers={layers}
              selected={selected}
              onSelect={setSelected}
              onToggleVisible={toggleLayer}
              onMove={moveLayer}
              onReorder={(from, to) => {
                if (from === to) return;
                const next = [...layers]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
                loadLayers(next, true); setSelected(to);
              }}
              onDuplicate={duplicateLayer}
              onDelete={deleteLayer}
              onAdd={addLayer}
              onAddCloud={() => {
                const at = sceneRef.current?.viewCenter();
                const cloud = defaultNebulaCloud(at?.lonDeg, at?.latDeg);
                cloud.seed = (cloud.seed + layers.filter(l => l.type === 'noise' && l.cloudEnabled).length * 0x31c47) >>> 0;
                const next = [...layers, cloud]; loadLayers(next, true); setSelected(next.length - 1);
              }}
              onToggleLock={(i) => {
                const l = layers[i];
                if (l) updateLayer(i, { ...l, locked: l.locked ? undefined : true });
              }}
            />

            {selectedLayer && (
              <Inspector
                key={`${presetName}-${selected}-${selectedLayer.type}`}
                layer={selectedLayer}
                onAddCoreNebula={selectedLayer.type === 'noise' && selectedLayer.bandEnabled ? () => {
                  let seed = (selectedLayer.seed + 0x31c47) >>> 0;
                  while (layers.some(l => l.type === 'noise' && l.seed === seed)) seed = (seed + 0x31c47) >>> 0;
                  const core = { ...selectedLayer, name: `Galactic Core Nebula ${layers.filter(l => l.type === 'noise' && l.bandCoreOnly).length + 1}`,
                    seed, bandCoreOnly: true, bandCenterGlow: 0, bandIntensity: 1,
                    innerColor: { r: 0.65, g: 0.25, b: 0.12, a: 1 }, outerColor: { r: 0, g: 0, b: 0, a: 1 },
                    colorRamp: undefined };
                  const next = [...layers, core]; loadLayers(next, true); setSelected(next.length - 1);
                } : undefined}
                onStackBand={selectedLayer.type === 'noise' && selectedLayer.bandEnabled ? () => {
                  let seed = (selectedLayer.seed + 0x6a09e667) >>> 0;
                  while (layers.some(l => l.type === 'noise' && l.seed === seed)) seed = (seed + 0x6a09e667) >>> 0;
                  const band = { ...selectedLayer, name: `${selectedLayer.name} - cloud ${layers.filter(l => l.type === 'noise' && l.bandEnabled).length + 1}`,
                    seed, bandCenterGlow: 0 };
                  const next = [...layers, band]; loadLayers(next, true); setSelected(next.length - 1);
                } : undefined}
                onAddBand={selectedLayer.type === 'points' ? () => {
                  const band = { ...defaultLayer('noise'), name: 'Galactic Band Nebula', bandEnabled: true,
                    bandAngleDeg: selectedLayer.bandAngleDeg, bandWidthDeg: 10,
                    scale: 3, octaves: 6, warpStrength: 0.5, shelfAmount: 0.3,
                    innerColor: { r: 0.45, g: 0.25, b: 0.65, a: 1 }, outerColor: { r: 0, g: 0, b: 0, a: 1 } } as Layer;
                  const next = [...layers.map((l, i) => i === selected ? { ...l, bandStrength: selectedLayer.bandStrength || 1, maskEnabled: false } as Layer : l), band];
                  loadLayers(next, true); setSelected(next.length - 1);
                } : undefined}
                userSprites={userSpriteIds}
                nebulaStack={layers.flatMap((l, index) => l.type === 'noise' ? [{ index, name: l.name }] : [])}
                selectedIndex={selected}
                onSelectNebula={setSelected}
                onStackRadial={() => {
                  if (selectedLayer.type !== 'noise') return;
                  const clone = structuredClone(selectedLayer);
                  clone.name = `${clone.name} - radial ${layers.filter(l => l.type === 'noise' && l.cloudEnabled).length + 1}`;
                  clone.seed = (clone.seed + 0x31c47) >>> 0;
                  while (layers.some(l => l.seed === clone.seed)) clone.seed = (clone.seed + 0x31c47) >>> 0;
                  clone.cloudRadial = true; clone.apparentSize = (clone.apparentSize ?? 0.5) * 0.75;
                  const next = [...layers, clone]; loadLayers(next, true); setSelected(next.length - 1);
                }}
                onStackNebula={() => {
                  const clone = structuredClone(selectedLayer);
                  clone.name = `${clone.name} - cloud ${layers.filter(l => l.type === 'noise').length + 1}`;
                  clone.seed = (clone.seed + 0x6a09e667) >>> 0;
                  while (layers.some(l => l.seed === clone.seed)) clone.seed = (clone.seed + 0x6a09e667) >>> 0;
                  const next = [...layers, clone]; loadLayers(next, true); setSelected(next.length - 1);
                }}
                onChange={(l) => updateLayer(selected, l)}
              />
            )}

            <p className="hint">
              Drag to look around · wheel to zoom. Edits re-bake only the
              changed layer.
            </p>
          </div>
        )}

        {tab === 'stars' && (
          <StarsTab
            onSpritesChanged={refreshUserTextureLayers}
            onViewportPreview={(canvas, occludes) => sceneRef.current?.setPcgPreview(canvas, occludes)}
            onBackdrop={(showSky) => sceneRef.current?.setPcgBackdrop(showSky)}
            onAddToSky={addBakeToSky}
          />
        )}
        {tab === 'sprites' && (
          <SpritesTab version={spriteVersion} onChanged={refreshUserTextureLayers} />
        )}
        {tab === 'script' && (
          <ScriptTab layers={layers} onApply={(next) => loadLayers(next, true)} />
        )}
      </aside>

      <div
        className="viewport"
        ref={viewportRef}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-spacescape-sprite')) e.preventDefault();
        }}
        onDrop={onViewportDrop}
      >
        <canvas ref={canvasRef} />
        {hdrPicking && <button className="hdr-preview-picker" type="button" aria-label="Pick HDR preview area" onClick={event => {
          const point = sceneRef.current?.lonLatAtClient(event.clientX, event.clientY);
          if (point) setHdrPreviewCenter({ lonDeg: point.lonDeg, latDeg: point.latDeg });
          setHdrPicking(false);
        }}><span>Click a star, jet or nebula to preview HDR smoothness. Escape cancels.</span></button>}
      </div>
      {hdrPreviewOpen && sceneRef.current && <HdrPreview scene={sceneRef.current} layers={layers} size={exportSize} lensResolution={lensResolution}
        softness={hdrSoftness} onSoftness={setHdrSoftness} center={hdrPreviewCenter} picking={hdrPicking}
        onPick={() => setHdrPicking(true)} onClose={() => { setHdrPicking(false); setHdrPreviewOpen(false); }} />}
    </div>
  );
}
