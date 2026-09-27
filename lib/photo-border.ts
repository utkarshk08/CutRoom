export type PhotoBorderEdges = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

export type PhotoBorder = {
  color: string;
  thicknessCm: number;
  edges: PhotoBorderEdges;
};

export type PhotoBorderPreset = 'all' | 'top' | 'right' | 'bottom' | 'left' | 'horizontal';

export const DEFAULT_PHOTO_BORDER: PhotoBorder = {
  color: '#ffffff',
  thicknessCm: 0.35,
  edges: { top: true, right: true, bottom: true, left: true },
};

const PRESET_EDGES: Record<PhotoBorderPreset, PhotoBorderEdges> = {
  all: { top: true, right: true, bottom: true, left: true },
  top: { top: true, right: false, bottom: false, left: false },
  right: { top: false, right: true, bottom: false, left: false },
  bottom: { top: false, right: false, bottom: true, left: false },
  left: { top: false, right: false, bottom: false, left: true },
  horizontal: { top: true, right: false, bottom: true, left: false },
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function borderEdgesForPreset(preset: PhotoBorderPreset): PhotoBorderEdges {
  return { ...PRESET_EDGES[preset] };
}

export function borderPresetForEdges(edges: PhotoBorderEdges): PhotoBorderPreset | 'custom' {
  const match = (Object.entries(PRESET_EDGES) as Array<[PhotoBorderPreset, PhotoBorderEdges]>).find(([, preset]) => (
    preset.top === edges.top
    && preset.right === edges.right
    && preset.bottom === edges.bottom
    && preset.left === edges.left
  ));
  return match?.[0] ?? 'custom';
}

export function normalizePhotoBorder(value: unknown): PhotoBorder | undefined {
  if (!isRecord(value) || !Number.isFinite(value.thicknessCm) || (value.thicknessCm as number) <= 0) return undefined;
  const rawEdges = isRecord(value.edges) ? value.edges : {};
  const edges = {
    top: rawEdges.top === true,
    right: rawEdges.right === true,
    bottom: rawEdges.bottom === true,
    left: rawEdges.left === true,
  };
  if (!Object.values(edges).some(Boolean)) return undefined;
  return {
    color: isHex(value.color) ? value.color : DEFAULT_PHOTO_BORDER.color,
    thicknessCm: Math.min(10, Math.max(0.01, value.thicknessCm as number)),
    edges,
  };
}

export type PhotoBorderRect = { edge: keyof PhotoBorderEdges; x: number; y: number; width: number; height: number };

export function photoBorderRects(frameWidth: number, frameHeight: number, value: PhotoBorder | undefined): PhotoBorderRect[] {
  const border = normalizePhotoBorder(value);
  if (!border || frameWidth <= 0 || frameHeight <= 0) return [];
  const thickness = Math.min(border.thicknessCm, frameWidth / 2, frameHeight / 2);
  const rects: PhotoBorderRect[] = [];
  if (border.edges.top) rects.push({ edge: 'top', x: 0, y: 0, width: frameWidth, height: thickness });
  if (border.edges.right) rects.push({ edge: 'right', x: frameWidth - thickness, y: 0, width: thickness, height: frameHeight });
  if (border.edges.bottom) rects.push({ edge: 'bottom', x: 0, y: frameHeight - thickness, width: frameWidth, height: thickness });
  if (border.edges.left) rects.push({ edge: 'left', x: 0, y: 0, width: thickness, height: frameHeight });
  return rects;
}

export function drawCanvasPhotoBorder(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pixelsPerCm: number,
  value: PhotoBorder | undefined,
) {
  const border = normalizePhotoBorder(value);
  if (!border || pixelsPerCm <= 0) return;
  context.save();
  context.fillStyle = border.color;
  photoBorderRects(width / pixelsPerCm, height / pixelsPerCm, border).forEach((rect) => {
    context.fillRect(x + rect.x * pixelsPerCm, y + rect.y * pixelsPerCm, rect.width * pixelsPerCm, rect.height * pixelsPerCm);
  });
  context.restore();
}
