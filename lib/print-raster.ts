import { printPlacementFootprint, type Piece, type PrintPackPage } from '@/lib/studio';
import { drawImageFrame } from '@/lib/image-frame';
import { drawCanvasPhotoBorder, type PhotoBorder } from '@/lib/photo-border';
import { drawTextFrame, type TextPieceData } from '@/lib/text-elements';
import type { PrintContent } from '@/lib/print-content';

export type RasterPrintFormat = 'png' | 'jpg';
export type RasterPrintDpi = 150 | 300;

export type RasterPrintSnapshot = {
  pages: PrintPackPage[];
  contents: PrintContent[];
  pieces: Array<Pick<Piece, 'id' | 'code' | 'src' | 'crop' | 'kind'> & {
    text?: TextPieceData;
    border?: PhotoBorder;
  }>;
  sheetWidthCm: number;
  sheetHeightCm: number;
  paperName: string;
  cropMarks: boolean;
  cutSpacingCm: number;
};

export type RasterPageSpec = {
  widthPx: number;
  heightPx: number;
  pixels: number;
  supported: boolean;
  reason?: string;
};

const CM_PER_INCH = 2.54;
const MAX_CANVAS_EDGE = 16_384;
const MAX_CANVAS_PIXELS = 40_000_000;

export function rasterPageSpec(sheetWidthCm: number, sheetHeightCm: number, dpi: RasterPrintDpi): RasterPageSpec {
  const widthPx = Math.max(1, Math.round(sheetWidthCm / CM_PER_INCH * dpi));
  const heightPx = Math.max(1, Math.round(sheetHeightCm / CM_PER_INCH * dpi));
  const pixels = widthPx * heightPx;
  if (Math.max(widthPx, heightPx) > MAX_CANVAS_EDGE) {
    return { widthPx, heightPx, pixels, supported: false, reason: `This paper would exceed the browser’s ${MAX_CANVAS_EDGE.toLocaleString()} px canvas limit. Choose 150 DPI or PDF.` };
  }
  if (pixels > MAX_CANVAS_PIXELS) {
    return { widthPx, heightPx, pixels, supported: false, reason: `This paper needs ${Math.round(pixels / 1_000_000)} megapixels per sheet. Choose 150 DPI or PDF to avoid a browser memory crash.` };
  }
  return { widthPx, heightPx, pixels, supported: true };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this print sheet.')), type, quality);
  });
}

function readUint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => { crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const check = new Uint8Array(typeBytes.length + data.length);
  check.set(typeBytes);
  check.set(data, typeBytes.length);
  writeUint32(chunk, 8 + data.length, crc32(check));
  return chunk;
}

function setPngDensity(source: Uint8Array, dpi: RasterPrintDpi) {
  const signature = source.slice(0, 8);
  const parts: Uint8Array[] = [signature];
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  const density = new Uint8Array(9);
  writeUint32(density, 0, pixelsPerMetre);
  writeUint32(density, 4, pixelsPerMetre);
  density[8] = 1;
  let inserted = false;
  let offset = 8;
  while (offset + 12 <= source.length) {
    const length = readUint32(source, offset);
    const end = offset + 12 + length;
    if (end > source.length) break;
    const type = new TextDecoder().decode(source.slice(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(source.slice(offset, end));
    if (type === 'IHDR' && !inserted) {
      parts.push(pngChunk('pHYs', density));
      inserted = true;
    }
    offset = end;
  }
  if (offset < source.length) parts.push(source.slice(offset));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  parts.forEach((part) => { result.set(part, cursor); cursor += part.length; });
  return result;
}

function setJpegDensity(source: Uint8Array, dpi: RasterPrintDpi) {
  if (source[0] !== 0xff || source[1] !== 0xd8) return source;
  const result = source.slice();
  let offset = 2;
  while (offset + 16 < result.length && result[offset] === 0xff) {
    const marker = result[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (result[offset + 2] << 8) | result[offset + 3];
    if (marker === 0xe0
      && result[offset + 4] === 0x4a && result[offset + 5] === 0x46
      && result[offset + 6] === 0x49 && result[offset + 7] === 0x46 && result[offset + 8] === 0) {
      result[offset + 11] = 1;
      result[offset + 12] = dpi >>> 8;
      result[offset + 13] = dpi;
      result[offset + 14] = dpi >>> 8;
      result[offset + 15] = dpi;
      return result;
    }
    if (length < 2) break;
    offset += length + 2;
  }
  const jfif = Uint8Array.of(
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x01, dpi >>> 8, dpi & 0xff, dpi >>> 8, dpi & 0xff, 0x00, 0x00,
  );
  const withHeader = new Uint8Array(source.length + jfif.length);
  withHeader.set(source.slice(0, 2));
  withHeader.set(jfif, 2);
  withHeader.set(source.slice(2), 2 + jfif.length);
  return withHeader;
}

async function bitmapFromSource(src: string) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`An image source returned ${response.status}.`);
  return createImageBitmap(await response.blob());
}

function drawCropMarks(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, pixelsPerCm: number) {
  const offset = 0.04 * pixelsPerCm;
  const mark = 0.22 * pixelsPerCm;
  context.save();
  context.strokeStyle = '#262624';
  context.lineWidth = Math.max(1, 0.4 / 72 * pixelsPerCm * CM_PER_INCH);
  context.beginPath();
  context.moveTo(x - offset - mark, y); context.lineTo(x - offset, y);
  context.moveTo(x, y - offset - mark); context.lineTo(x, y - offset);
  context.moveTo(x + width + offset, y); context.lineTo(x + width + offset + mark, y);
  context.moveTo(x + width, y - offset - mark); context.lineTo(x + width, y - offset);
  context.moveTo(x - offset - mark, y + height); context.lineTo(x - offset, y + height);
  context.moveTo(x, y + height + offset); context.lineTo(x, y + height + offset + mark);
  context.moveTo(x + width + offset, y + height); context.lineTo(x + width + offset + mark, y + height);
  context.moveTo(x + width, y + height + offset); context.lineTo(x + width, y + height + offset + mark);
  context.stroke();
  context.restore();
}

function pageFileName(snapshot: RasterPrintSnapshot, format: RasterPrintFormat, dpi: RasterPrintDpi, pageIndex: number) {
  const paper = snapshot.paperName.replace(/[^a-z0-9-]+/gi, '-');
  return `cutroom-${paper}-${dpi}dpi-page-${String(pageIndex + 1).padStart(2, '0')}.${format}`;
}

export async function createRasterPrintExport(
  snapshot: RasterPrintSnapshot,
  format: RasterPrintFormat,
  dpi: RasterPrintDpi,
  onProgress?: (page: number, total: number) => void,
) {
  const spec = rasterPageSpec(snapshot.sheetWidthCm, snapshot.sheetHeightCm, dpi);
  if (!spec.supported) throw new Error(spec.reason);
  const pixelsPerCm = dpi / CM_PER_INCH;
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const pieceById = new Map(snapshot.pieces.map((piece) => [piece.id, piece]));
  const contentById = new Map(snapshot.contents.map((content) => [content.id, content]));
  const bitmapCache = new Map<string, Promise<ImageBitmap>>();
  const files: Record<string, Uint8Array> = {};

  try {
    for (let pageIndex = 0; pageIndex < snapshot.pages.length; pageIndex += 1) {
      onProgress?.(pageIndex + 1, snapshot.pages.length);
      const canvas = document.createElement('canvas');
      canvas.width = spec.widthPx;
      canvas.height = spec.heightPx;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      for (const placement of snapshot.pages[pageIndex].placements) {
        const content = contentById.get(placement.pieceId);
        if (!content) continue;
        const footprint = printPlacementFootprint(placement);
        const x = placement.xCm * pixelsPerCm;
        const y = placement.yCm * pixelsPerCm;
        const width = placement.widthCm * pixelsPerCm;
        const height = placement.heightCm * pixelsPerCm;
        const footprintWidth = footprint.widthCm * pixelsPerCm;
        const footprintHeight = footprint.heightCm * pixelsPerCm;
        context.save();
        context.beginPath();
        context.rect(x, y, footprintWidth, footprintHeight);
        context.clip();
        context.translate(x + footprintWidth / 2, y + footprintHeight / 2);
        context.rotate(placement.sheetRotation * Math.PI / 180);
        const scaleX = placement.widthCm / Math.max(0.01, content.widthCm);
        const scaleY = placement.heightCm / Math.max(0.01, content.heightCm);
        const groupScale = Math.min(scaleX, scaleY);
        for (const member of content.members) {
          const piece = pieceById.get(member.pieceId);
          if (!piece) continue;
          const memberWidth = member.widthCm * scaleX * pixelsPerCm;
          const memberHeight = member.heightCm * scaleY * pixelsPerCm;
          const memberCenterX = -width / 2 + (member.leftCm + member.widthCm / 2) * scaleX * pixelsPerCm;
          const memberCenterY = -height / 2 + (member.topCm + member.heightCm / 2) * scaleY * pixelsPerCm;
          const memberPixelsPerCm = content.kind === 'group' ? pixelsPerCm * groupScale : pixelsPerCm;
          context.save();
          context.translate(memberCenterX, memberCenterY);
          context.rotate(member.rotation * Math.PI / 180);
          if (piece.kind === 'text' && piece.text) {
            drawTextFrame(context, piece.text, -memberWidth / 2, -memberHeight / 2, memberWidth, memberHeight, memberPixelsPerCm);
          } else {
            let bitmapPromise = bitmapCache.get(piece.src);
            if (!bitmapPromise) {
              bitmapPromise = bitmapFromSource(piece.src);
              bitmapCache.set(piece.src, bitmapPromise);
            }
            let bitmap: ImageBitmap;
            try {
              bitmap = await bitmapPromise;
            } catch {
              throw new Error(`${content.code} could not be decoded for raster export.`);
            }
            drawImageFrame(context, bitmap, bitmap.width, bitmap.height, -memberWidth / 2, -memberHeight / 2, memberWidth, memberHeight, piece.crop);
            drawCanvasPhotoBorder(context, -memberWidth / 2, -memberHeight / 2, memberWidth, memberHeight, memberPixelsPerCm, piece.border);
          }
          context.restore();
        }
        context.restore();
        if (snapshot.cropMarks) drawCropMarks(context, x, y, footprintWidth, footprintHeight, pixelsPerCm);

        const labelY = y + footprintHeight + 0.18 * pixelsPerCm;
        const labelSize = Math.max(7, 4.2 / 72 * dpi);
        if (snapshot.cutSpacingCm >= 0.3 && labelY + labelSize <= canvas.height) {
          context.fillStyle = '#595957';
          context.font = `700 ${labelSize}px Arial, sans-serif`;
          context.textBaseline = 'top';
          context.fillText(content.code, x + 0.02 * pixelsPerCm, labelY);
        }
      }

      const encoded = await canvasToBlob(canvas, mimeType, format === 'jpg' ? 0.95 : undefined);
      const sourceBytes = new Uint8Array(await encoded.arrayBuffer());
      const bytes = format === 'png' ? setPngDensity(sourceBytes, dpi) : setJpegDensity(sourceBytes, dpi);
      files[pageFileName(snapshot, format, dpi, pageIndex)] = bytes;
      canvas.width = 1;
      canvas.height = 1;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  } finally {
    const bitmaps = await Promise.allSettled(bitmapCache.values());
    bitmaps.forEach((result) => { if (result.status === 'fulfilled') result.value.close(); });
  }

  const names = Object.keys(files);
  if (names.length === 1) return { data: files[names[0]], type: mimeType, fileName: names[0], zipped: false };
  const { zip } = await import('fflate');
  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 0 }, (error, data) => error ? reject(error) : resolve(data));
  });
  const paper = snapshot.paperName.replace(/[^a-z0-9-]+/gi, '-');
  return {
    data: archive,
    type: 'application/zip',
    fileName: `cutroom-${paper}-${dpi}dpi-${format}.zip`,
    zipped: true,
  };
}
