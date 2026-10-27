import type { Layer } from '../core/layers';
import type { PreviewScene } from '../render/PreviewScene';
import { manifestEntry, variantLayers } from './batch';
import { DiskExportJob, DiskZip } from './diskExport';
import { FACE_NAMES } from './exporter';
import { compositeEntry, compositeJson, layerFileStem, starDataCsv, starDataJson, type ImageRefs } from './perLayer';
import { streamExr, streamHdr, streamPng, type ByteSink, type EncodeOptions, type RowReader } from './streamEncoders';
import { DEFAULT_HDR_SOFTNESS, softenPanorama } from './softness';
import { TileSampler, panoramaRows } from './tiles';

export interface LowMemoryOptions {
  size: number; preset: string; faces: boolean; png: boolean; hdr: boolean; exr: boolean;
  hdrSoftness?: number;
  lensResolution?: number | 'native';
  directory?: FileSystemDirectoryHandle;
  perLayer: boolean; variations: number; signal: AbortSignal; progress: (message: string) => void;
}
type Emit = (name: string, encode: (sink: ByteSink) => Promise<void>) => Promise<void>;

export async function runLowMemoryExport(scene: PreviewScene, layers: Layer[], options: LowMemoryOptions) {
  const { size, preset, signal, progress } = options;
  signal.throwIfAborted();
  const job = await DiskExportJob.create(options.directory);
  const archives: DiskZip[] = [];
  const encodeOptions = (label: string): EncodeOptions => ({ signal, progress: (row, total) => progress(`${label} ${Math.floor(row / total * 100)}%`) });
  const plain: Emit = async (name, encode) => {
    signal.throwIfAborted();
    const file = await job.open(name); await encode(file.write);
    signal.throwIfAborted();
    job.download(name, await file.finish());
  };
  const openZip = async (name: string) => { const zip = new DiskZip(await job.open(name)); archives.push(zip); return zip; };
  const downloadZip = async (name: string, zip: DiskZip) => {
    const file = await zip.finish(); signal.throwIfAborted(); job.download(name, file);
  };
  const addText = (emit: Emit, name: string, contents: string) => emit(name, (sink) => sink(new TextEncoder().encode(contents)));

  const images = async (stack: Layer[], prefix: string, emit: Emit): Promise<ImageRefs> => {
    signal.throwIfAborted(); progress(`${prefix || 'Scene'}: preparing tiles`);
    const source = await scene.createTileSource(stack, size, { lensResolution: options.lensResolution });
    const sampler = new TileSampler(source);
    try {
      const refs: ImageRefs = {};
      const stem = prefix ? `${prefix}/` : '';
      if (options.faces) {
        refs.faces = [];
        for (let face = 0; face < 6; face++) {
          const name = `${stem}${FACE_NAMES[face]}.png`;
          refs.faces.push(name);
          await emit(name, (sink) => streamPng(size, size, (y, row) => sampler.faceRow(face, y, row), sink, encodeOptions(name)));
        }
      }
      const read: RowReader = panoramaRows(sampler, size * 2, size);
      if (options.png) {
        refs.image = `${stem}equirect.png`;
        await emit(refs.image, (sink) => streamPng(size * 2, size, read, sink, encodeOptions(refs.image!)));
      }
      const softRead = () => softenPanorama(read, size * 2, size, options.hdrSoftness ?? DEFAULT_HDR_SOFTNESS);
      if (options.hdr) {
        refs.imageHdr = `${stem}equirect.hdr`;
        await emit(refs.imageHdr, (sink) => streamHdr(size * 2, size, softRead(), sink, encodeOptions(refs.imageHdr!)));
      }
      if (options.exr) {
        refs.imageExr = `${stem}equirect.exr`;
        await emit(refs.imageExr, (sink) => streamExr(size * 2, size, softRead(), sink, encodeOptions(refs.imageExr!)));
      }
      return refs;
    } finally { sampler.clear(); source.dispose(); }
  };

  try {
    if (options.variations > 1) {
      const zip = await openZip(`${preset}-batch${options.variations}-${size}.zip`);
      const emit: Emit = (name, encode) => zip.entry(name, encode);
      const variations = [];
      for (let k = 0; k < options.variations; k++) {
        const stack = variantLayers(layers, k);
        await images(stack, `v${String(k + 1).padStart(2, '0')}`, emit);
        variations.push(manifestEntry(stack, k));
      }
      await addText(emit, 'manifest.json', JSON.stringify({ preset, faceSize: size, variations }, null, 2));
      await downloadZip(`${preset}-batch${options.variations}-${size}.zip`, zip);
    } else if (options.perLayer) {
      const zip = await openZip(`${preset}-layers-${size}.zip`);
      const emit: Emit = (name, encode) => zip.entry(name, encode);
      const composite = layers.map(compositeEntry);
      for (const [i, layer] of layers.entries()) {
        signal.throwIfAborted();
        const stem = layerFileStem(layer, i);
        if (layer.type !== 'blackhole') Object.assign(composite[i], await images([layer], `layers/${stem}`, emit));
        const data = await scene.layerStarData(layer);
        if (data) {
          const json = `data/${stem}.json`, csv = `data/${stem}.csv`;
          composite[i].data = { json, csv, sizeUnit: data.sizeUnit };
          await addText(emit, json, starDataJson(layer.name, data));
          await addText(emit, csv, starDataCsv(data));
        }
      }
      const refs = await images(layers, 'composite', emit);
      await addText(emit, 'composite.json', compositeJson({ preset, faceSize: size, composite: refs }, composite));
      await downloadZip(`${preset}-layers-${size}.zip`, zip);
    } else {
      const cubeZip = options.faces ? await openZip(`${preset}-${size}-faces.zip`) : undefined;
      const emit: Emit = (name, encode) => name.startsWith('equirect.')
        ? plain(`${preset}-${size}-${name}`, encode)
        : cubeZip!.entry(`${preset}_${name}`, encode);
      await images(layers, '', emit);
      if (cubeZip) await downloadZip(`${preset}-${size}-faces.zip`, cubeZip);
    }
    return job.outputFolder;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Temporary browser disk storage is full. Choose Save directly to folder to avoid temporary-storage quota, or export fewer formats/variations.');
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/out of memory|allocation failed|context lost|array buffer allocation/i.test(message)) {
      throw new Error(`${message}. Try a lower resolution, hide unused volume/lens layers, or reduce very large imported textures before retrying. Direct-folder saving avoids temporary disk quota; GPU and browser memory are separate limits.`);
    }
    throw error;
  } finally {
    for (const archive of archives) archive.abort();
    await job.dispose();
  }
}
