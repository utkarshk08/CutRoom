import type { PhotoCrop } from '@/lib/studio';

export const DEFAULT_PHOTO_CROP: PhotoCrop = {
  mode: 'fill',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  quarterTurns: 0,
  flipX: false,
  flipY: false,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizePhotoCrop(crop?: Partial<PhotoCrop>): PhotoCrop {
  const quarterTurns = Math.round(Number(crop?.quarterTurns ?? 0));
  return {
    mode: crop?.mode === 'fit' ? 'fit' : 'fill',
    zoom: clamp(Number.isFinite(crop?.zoom) ? Number(crop?.zoom) : 1, 1, 4),
    offsetX: clamp(Number.isFinite(crop?.offsetX) ? Number(crop?.offsetX) : 0, -1, 1),
    offsetY: clamp(Number.isFinite(crop?.offsetY) ? Number(crop?.offsetY) : 0, -1, 1),
    quarterTurns: (((quarterTurns % 4) + 4) % 4) as PhotoCrop['quarterTurns'],
    flipX: Boolean(crop?.flipX),
    flipY: Boolean(crop?.flipY),
  };
}

export type ImageFrameGeometry = {
  drawWidth: number;
  drawHeight: number;
  orientedWidth: number;
  orientedHeight: number;
  centerX: number;
  centerY: number;
  maxOffsetX: number;
  maxOffsetY: number;
  rotationDegrees: number;
  flipX: boolean;
  flipY: boolean;
};

export function imageFrameGeometry(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
  input?: Partial<PhotoCrop>,
): ImageFrameGeometry {
  const crop = normalizePhotoCrop(input);
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const safeFrameWidth = Math.max(0.0001, frameWidth);
  const safeFrameHeight = Math.max(0.0001, frameHeight);
  const swapsAxes = crop.quarterTurns % 2 === 1;
  const orientedSourceWidth = swapsAxes ? safeSourceHeight : safeSourceWidth;
  const orientedSourceHeight = swapsAxes ? safeSourceWidth : safeSourceHeight;
  const scaleX = safeFrameWidth / orientedSourceWidth;
  const scaleY = safeFrameHeight / orientedSourceHeight;
  const baseScale = crop.mode === 'fill' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const scale = baseScale * crop.zoom;
  const drawWidth = safeSourceWidth * scale;
  const drawHeight = safeSourceHeight * scale;
  const orientedWidth = swapsAxes ? drawHeight : drawWidth;
  const orientedHeight = swapsAxes ? drawWidth : drawHeight;
  const maxOffsetX = Math.max(0, (orientedWidth - safeFrameWidth) / 2);
  const maxOffsetY = Math.max(0, (orientedHeight - safeFrameHeight) / 2);

  return {
    drawWidth,
    drawHeight,
    orientedWidth,
    orientedHeight,
    centerX: safeFrameWidth / 2 + crop.offsetX * maxOffsetX,
    centerY: safeFrameHeight / 2 + crop.offsetY * maxOffsetY,
    maxOffsetX,
    maxOffsetY,
    rotationDegrees: crop.quarterTurns * 90,
    flipX: crop.flipX,
    flipY: crop.flipY,
  };
}

export function drawImageFrame(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  frameWidth: number,
  frameHeight: number,
  crop?: Partial<PhotoCrop>,
) {
  const geometry = imageFrameGeometry(sourceWidth, sourceHeight, frameWidth, frameHeight, crop);
  context.save();
  context.beginPath();
  context.rect(x, y, frameWidth, frameHeight);
  context.clip();
  context.fillStyle = '#ffffff';
  context.fillRect(x, y, frameWidth, frameHeight);
  context.translate(x + geometry.centerX, y + geometry.centerY);
  context.rotate(geometry.rotationDegrees * Math.PI / 180);
  context.scale(geometry.flipX ? -1 : 1, geometry.flipY ? -1 : 1);
  context.drawImage(image, -geometry.drawWidth / 2, -geometry.drawHeight / 2, geometry.drawWidth, geometry.drawHeight);
  context.restore();
}
