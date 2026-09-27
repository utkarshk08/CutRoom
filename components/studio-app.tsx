'use client';

/* eslint-disable next/no-img-element, jsx-a11y/label-has-associated-control, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */

import * as React from 'react';
import {
  ArrowLeft,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BoxSelect,
  Check,
  ChevronDown,
  Copy,
  Crop,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FlipHorizontal2,
  FlipVertical2,
  Grid3X3,
  ImageIcon,
  ImagePlus,
  Italic,
  Layers3,
  Link2,
  Lock,
  Maximize2,
  MessageCircleMore,
  MousePointer2,
  Move,
  PaintBucket,
  PanelRight,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Scissors,
  Send,
  Sparkles,
  TriangleAlert,
  Type,
  Underline,
  Trash2,
  Undo2,
  Upload,
  Unlink2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PDFDocument as PdfDocument, PDFImage } from 'pdf-lib';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CutoutCanvas } from '@/components/cutout-canvas';
import { CutoutResultPreview } from '@/components/cutout-result-preview';
import {
  createRasterPrintExport,
  rasterPageSpec,
  type RasterPrintDpi,
  type RasterPrintFormat,
} from '@/lib/print-raster';
import {
  allocateCopyIdentity,
  allocatePhotoIdentities,
  allocatePrintGroupIdentity,
  allocateSheetIdentities,
  allocateTextIdentity,
  approximateProjectBytes,
  createIdentityRegistry,
  MAX_BACKUP_BYTES,
  MAX_PROJECT_PIECES,
  PROJECT_SCHEMA_VERSION,
  projectImageSources,
  validateProjectDocument,
  type IdentityRegistryV1,
  type MeasurementUnit,
  type PhotoSizePreset,
  type PrintExportFormat,
  type PrintOverride,
  type PrintRotationOverride,
  type ProjectDocument,
  type ProjectValidationResult,
} from '@/lib/project-document';
import {
  borderEdgesForPreset,
  borderPresetForEdges,
  DEFAULT_PHOTO_BORDER,
  drawCanvasPhotoBorder,
  normalizePhotoBorder,
  photoBorderRects,
  type PhotoBorder,
  type PhotoBorderPreset,
} from '@/lib/photo-border';
import {
  cloneTextData,
  createTextData,
  drawTextFrame,
  FONT_STACKS,
  measureTextBoxSize,
  renderTextDataUrl,
  styleForPreset,
  textBoxInsetsCm,
  TEXT_PRESETS,
  TRANSPARENT_PIXEL,
  type TextFontId,
  type TextPieceData,
  type TextStyle,
} from '@/lib/text-elements';
import {
  classifyStorageError,
  formatStorageBytes,
  getStorageHealth,
  loadStoredProject,
  ProjectStorageError,
  requestPersistentStorage,
  saveStoredProject,
  storageNeedsAttention,
  type StorageHealth,
} from '@/lib/project-storage';
import {
  CUT_SHAPES,
  cutPixelBounds,
  traceCutRegionPath,
  type CutRegion,
  type CutShape,
} from '@/lib/sheet-cuts';
import {
  AI_CUTOUT_SHAPE_PREFERENCES,
  mapAiCutoutRegionToCutRegion,
  parseAiCutoutDecision,
  type AiCutoutShapePreference,
} from '@/lib/ai-cutouts';
import { beginMobileCrop, endMobileCrop, type MobileTool } from '@/lib/crop-navigation';
import {
  AI_COORDINATE_SCALE,
  localLayoutDecision,
  MAX_AI_BRIEF_LENGTH,
  MAX_AI_UNITS,
  parseAiLayoutDecision,
  type AiLayoutRequest,
} from '@/lib/ai-layout';
import {
  cloneEditorSnapshot,
  pushHistorySnapshot,
  type EditorSnapshot,
} from '@/lib/editor-history';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_PHOTO_CROP,
  drawImageFrame,
  imageFrameGeometry,
  normalizePhotoCrop,
} from '@/lib/image-frame';
import {
  buildPrintContents,
  groupIdsForMembers,
  removeMembersFromPrintGroups,
  scaleAllPrintContents,
  uniformPrintScalePercent,
  type PrintContent,
} from '@/lib/print-content';
import {
  applyCustomLayout,
  applyLayout,
  buildLayoutUnits,
  DEMO_PIECES,
  LayoutName,
  packPrintItems,
  PAPER_SIZES,
  Piece,
  PhotoCrop,
  PrintGroup,
  piecesOverlap,
  pieceVisualBounds,
  PrintPackItem,
  printPlacementFootprint,
  recommendPrintFit,
  Wall,
} from '@/lib/studio';

type ViewMode = 'arrange' | 'print';
type PanelMode = 'assistant' | 'text' | 'inspect';
type MobilePrintTool = 'settings' | 'preview';
type PositionPanelTab = 'arrange' | 'layers';
type LayerFilter = 'all' | 'overlapping';
type BatchSizeMode = 'fit' | 'width' | 'height' | 'exact';
type WallPreset = 'desk' | 'dorm' | 'sofa' | 'tall' | 'custom';
type PendingAsset = { src: string; name: string; pixelW: number; pixelH: number; mimeType: string };
type CroppedAsset = { src: string; pixelW: number; pixelH: number };
type CutoutMeta = Record<string, { label: string; confidence: number }>;
type SmartGuide = { axis: 'x' | 'y'; position: number; label: string };
type PrintRotationChoice = 'auto' | PrintRotationOverride;
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type CropSession = {
  pieceId: string;
  draft: PhotoCrop;
  naturalWidth: number;
  naturalHeight: number;
  returnMobileTool: MobileTool;
  loadToken: number;
};
type CropPanState = {
  pointerId: number;
  startX: number;
  startY: number;
  startCrop: PhotoCrop;
  frameWidth: number;
  frameHeight: number;
  rotation: number;
  naturalWidth: number;
  naturalHeight: number;
};
type DragState = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  original: Piece;
  before: Piece[];
  rect: DOMRect;
  mode: 'move' | `resize-${ResizeHandle}`;
  latest: Piece;
  groupOriginals: Piece[];
  latestGroup: Piece[];
  changed: boolean;
};
type TrayDragState = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  gripX: number;
  gripY: number;
  before: Piece[];
  original: Piece;
  active: boolean;
  latestX: number;
  latestY: number;
  insideWall: boolean;
};

type PendingRestore = ProjectValidationResult & { fileName: string; fileSize: number };
type StorageNotice = { error: ProjectStorageError; rawRecovery?: string };

function buildPrintItems(
  contents: PrintContent[],
  sizeOverrides: Record<string, PrintOverride>,
  rotationOverrides: Record<string, PrintRotationOverride>,
): PrintPackItem[] {
  return contents.map((content, order) => ({
    instanceId: content.id,
    pieceId: content.id,
    widthCm: sizeOverrides[content.id]?.widthCm ?? content.widthCm,
    heightCm: sizeOverrides[content.id]?.heightCm ?? content.heightCm,
    order,
    rotationPreference: rotationOverrides[content.id],
  }));
}

const TONES: Piece['tone'][] = ['warm', 'cool', 'pastel', 'dark', 'neutral'];
const COLORS = ['#ff5a36', '#1747c9', '#b494f3', '#1f2a2d', '#d9b96e'];
const layouts: { id: LayoutName; name: string; note: string }[] = [
  { id: 'compass', name: 'Compass', note: 'Contrast quadrants' },
  { id: 'salon', name: 'Salon', note: 'Balanced rows' },
  { id: 'organic', name: 'Organic', note: 'Loose masonry' },
  { id: 'strip', name: 'Film strip', note: 'Three bands' },
  { id: 'diamond', name: 'Diamond', note: 'Statement shape' },
  { id: 'flow', name: 'Color flow', note: 'Warm → cool' },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const CUT_SHAPE_LABELS: Record<CutShape, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Oval',
  heart: 'Heart',
  diamond: 'Diamond',
  polygon: 'Point by point',
};

const AI_CUTOUT_SHAPE_LABELS: Record<AiCutoutShapePreference, string> = {
  auto: 'AI chooses the best shape',
  rectangle: 'Rectangle',
  ellipse: 'Oval',
  heart: 'Heart',
  diamond: 'Diamond',
  polygon: 'Custom outline',
};
const copyPieces = (items: Piece[]) => items.map((piece) => ({
  ...piece,
  crop: piece.crop ? { ...piece.crop } : undefined,
  border: piece.border ? { ...piece.border, edges: { ...piece.border.edges } } : undefined,
  text: piece.text ? cloneTextData(piece.text) : undefined,
}));
const copyPrintOverrides = (items: Record<string, PrintOverride>) => Object.fromEntries(Object.entries(items).map(([id, size]) => [id, { ...size }]));
const copyPrintRotationOverrides = (items: Record<string, PrintRotationOverride> = {}) => ({ ...items });
const sliderValue = (value: number | readonly number[]) => typeof value === 'number' ? value : value[0];
const pieceZ = (piece: Piece, fallback: number) => piece.zIndex ?? fallback;
const CM_PER_INCH = 2.54;
const DEFAULT_WALL: Wall = { widthCm: 240, heightCm: 160, color: '#eee8dc', photoOpacity: 0.8, furnitureClearanceCm: 24 };
const toDisplayUnit = (centimetres: number, unit: MeasurementUnit) => unit === 'in' ? centimetres / CM_PER_INCH : centimetres;
const fromDisplayUnit = (value: number, unit: MeasurementUnit) => unit === 'in' ? value * CM_PER_INCH : value;
const formatMeasurement = (centimetres: number, unit: MeasurementUnit) => {
  const value = toDisplayUnit(centimetres, unit);
  return Number(value.toFixed(unit === 'in' ? 2 : 1));
};
const measurementText = (centimetres: number, unit: MeasurementUnit) => `${formatMeasurement(centimetres, unit)} ${unit}`;
const measurementPairText = (widthCm: number, heightCm: number, unit: MeasurementUnit) => `${formatMeasurement(widthCm, unit)} × ${formatMeasurement(heightCm, unit)} ${unit}`;
const printRotationText = (rotation: PrintRotationOverride) => rotation === -90 ? '−90°' : `${rotation}°`;
const printRotationDescription = (rotation: PrintRotationOverride) => {
  if (rotation === -90) return 'rotated 90 degrees counter-clockwise';
  if (rotation === 90) return 'rotated 90 degrees clockwise';
  if (rotation === 180) return 'rotated 180 degrees';
  return 'not rotated';
};
const rgbChannels = (color: string) => {
  const value = Number.parseInt(color.replace('#', ''), 16);
  return { red: (value >> 16 & 255) / 255, green: (value >> 8 & 255) / 255, blue: (value & 255) / 255 };
};
const edgeResizeCursor = (handle: 'n' | 'e' | 's' | 'w', rotation: number) => {
  const axisAngle = rotation + (handle === 'n' || handle === 's' ? 90 : 0);
  const angle = ((axisAngle % 180) + 180) % 180;
  if (angle < 22.5 || angle >= 157.5) return 'ew-resize';
  if (angle < 67.5) return 'nwse-resize';
  if (angle < 112.5) return 'ns-resize';
  return 'nesw-resize';
};

const syncCanvasFromPhysical = (piece: Piece, wall: Wall, constrainToWall = true): Piece => {
  const w = piece.widthCm / Math.max(1, wall.widthCm) * 100;
  const h = piece.heightCm / Math.max(1, wall.heightCm) * 100;
  return {
    ...piece,
    w,
    h,
    x: constrainToWall ? clamp(piece.x, 0, Math.max(0, 100 - w)) : piece.x,
    y: constrainToWall ? clamp(piece.y, 0, Math.max(0, 100 - h)) : piece.y,
  };
};

const syncPhysicalFromCanvas = (piece: Piece, wall: Wall): Piece => ({
  ...piece,
  widthCm: piece.w / 100 * wall.widthCm,
  heightCm: piece.h / 100 * wall.heightCm,
});

const fitTextPieceToContent = (piece: Piece, wall: Wall, text = piece.text): Piece => {
  if (piece.kind !== 'text' || !text) return piece;
  const measured = measureTextBoxSize(text, wall.widthCm * .86);
  const widthCm = Math.min(wall.widthCm, measured.widthCm);
  const heightCm = Math.min(wall.heightCm, measured.heightCm);
  const w = widthCm / Math.max(1, wall.widthCm) * 100;
  const h = heightCm / Math.max(1, wall.heightCm) * 100;
  const anchoredX = text.style.align === 'left'
    ? piece.x
    : text.style.align === 'right'
      ? piece.x + piece.w - w
      : piece.x + (piece.w - w) / 2;
  const anchoredY = piece.y + (piece.h - h) / 2;
  return {
    ...piece,
    text,
    widthCm,
    heightCm,
    w,
    h,
    x: clamp(anchoredX, 0, Math.max(0, 100 - w)),
    y: clamp(anchoredY, 0, Math.max(0, 100 - h)),
    sizeMode: 'custom',
  };
};

const normalizeLegacyPieces = (items: Piece[], wall: Wall, schemaVersion?: number): Piece[] => (schemaVersion && schemaVersion >= 2
  ? items.map((piece) => syncCanvasFromPhysical(piece, wall, false))
  : items.map((piece) => syncPhysicalFromCanvas(piece, wall)))
  .map((piece): Piece => ({
    ...piece,
    kind: piece.kind === 'text' && piece.text ? 'text' : 'photo',
    crop: normalizePhotoCrop(piece.crop),
    border: piece.kind === 'text' ? undefined : normalizePhotoBorder(piece.border),
    text: piece.kind === 'text' && piece.text ? cloneTextData(piece.text) : undefined,
  }))
  .map((piece) => fitTextPieceToContent(piece, wall));

function UnitToggle({ value, onChange, label = 'Measurement unit' }: { value: MeasurementUnit; onChange: (unit: MeasurementUnit) => void; label?: string }) {
  return (
    <fieldset className="unit-toggle" aria-label={label}>
      <button type="button" className={value === 'cm' ? 'active' : ''} aria-pressed={value === 'cm'} onClick={() => onChange('cm')}>cm</button>
      <button type="button" className={value === 'in' ? 'active' : ''} aria-pressed={value === 'in'} onClick={() => onChange('in')}>inch</button>
    </fieldset>
  );
}

function PhotoBorderOverlay({ border, frameWidth, frameHeight }: { border?: PhotoBorder; frameWidth: number; frameHeight: number }) {
  if (!border) return null;
  return <span className="photo-border-overlay" aria-hidden="true">{photoBorderRects(frameWidth, frameHeight, border).map((rect) => (
    <i
      className={`photo-border-edge ${rect.edge}`}
      key={rect.edge}
      style={{
        left: `${rect.x / frameWidth * 100}%`,
        top: `${rect.y / frameHeight * 100}%`,
        width: `${rect.width / frameWidth * 100}%`,
        height: `${rect.height / frameHeight * 100}%`,
        backgroundColor: border.color,
      }}
    />
  ))}</span>;
}

function TextPieceVisual({ data, frameWidth, frameHeight }: { data: TextPieceData; frameWidth: number; frameHeight: number }) {
  const { style } = data;
  const insets = textBoxInsetsCm(style);
  const fontCqh = clamp(style.fontSizePt * 2.54 / 72 / Math.max(.01, frameHeight) * 100, 2, 160);
  const textShadow = style.shadowColor && (style.shadowBlurPt || style.shadowXPt || style.shadowYPt)
    ? `${style.shadowXPt * 2.54 / 72 / Math.max(.01, frameHeight) * 100}cqh ${style.shadowYPt * 2.54 / 72 / Math.max(.01, frameHeight) * 100}cqh ${style.shadowBlurPt * 2.54 / 72 / Math.max(.01, frameHeight) * 100}cqh ${style.shadowColor}`
    : undefined;
  const background = style.gradientFrom && style.gradientTo
    ? `linear-gradient(135deg, ${style.gradientFrom}, ${style.gradientTo})`
    : undefined;
  return (
    <span
      className="text-piece-visual"
      style={{
        padding: 0,
        borderRadius: `${clamp(style.radiusCm / Math.max(.01, Math.min(frameWidth, frameHeight)) * 100, 0, 50)}%`,
        backgroundColor: style.backgroundColor ? `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, '0')}` : undefined,
        opacity: style.opacity,
      }}
    >
      <span
        style={{
          fontFamily: FONT_STACKS[style.fontId],
          fontSize: `${fontCqh}cqh`,
          fontWeight: style.fontWeight,
          fontStyle: style.italic ? 'italic' : 'normal',
          textDecoration: style.underline ? 'underline' : 'none',
          textAlign: style.align,
          lineHeight: style.lineHeight,
          letterSpacing: `${style.letterSpacingEm}em`,
          textTransform: style.uppercase ? 'uppercase' : 'none',
          color: background ? 'transparent' : style.color,
          backgroundImage: background,
          backgroundClip: background ? 'text' : undefined,
          WebkitBackgroundClip: background ? 'text' : undefined,
          WebkitTextStroke: style.strokeColor && style.strokeWidthPt > 0
            ? `${style.strokeWidthPt * 2.54 / 72 / Math.max(.01, frameHeight) * 100}cqh ${style.strokeColor}`
            : undefined,
          textShadow,
          boxSizing: 'border-box',
          paddingTop: `${insets.top / Math.max(.01, frameHeight) * 100}cqh`,
          paddingRight: `${insets.right / Math.max(.01, frameWidth) * 100}cqw`,
          paddingBottom: `${insets.bottom / Math.max(.01, frameHeight) * 100}cqh`,
          paddingLeft: `${insets.left / Math.max(.01, frameWidth) * 100}cqw`,
        }}
      >{data.value}</span>
    </span>
  );
}

function FramedPhoto({
  piece,
  frameWidth = piece.widthCm,
  frameHeight = piece.heightCm,
  cropOverride,
  alt = '',
}: {
  piece: Piece;
  frameWidth?: number;
  frameHeight?: number;
  cropOverride?: PhotoCrop;
  alt?: string;
}) {
  const fallbackWidth = piece.pixelW ?? 1000;
  const fallbackHeight = piece.pixelH ?? Math.max(1, fallbackWidth * piece.heightCm / Math.max(0.01, piece.widthCm));
  const [naturalSize, setNaturalSize] = React.useState({ width: fallbackWidth, height: fallbackHeight });
  const crop = cropOverride ?? normalizePhotoCrop(piece.crop);
  const geometry = imageFrameGeometry(naturalSize.width, naturalSize.height, frameWidth, frameHeight, crop);

  return (
    <span className="framed-photo" aria-hidden={alt ? undefined : true}>
      {piece.kind === 'text' && piece.text ? <TextPieceVisual data={piece.text} frameWidth={frameWidth} frameHeight={frameHeight} /> : <span
        className="framed-photo-transform"
        style={{
          left: `${geometry.centerX / frameWidth * 100}%`,
          top: `${geometry.centerY / frameHeight * 100}%`,
          width: `${geometry.drawWidth / frameWidth * 100}%`,
          height: `${geometry.drawHeight / frameHeight * 100}%`,
          transform: `translate(-50%, -50%) rotate(${geometry.rotationDegrees}deg) scale(${geometry.flipX ? -1 : 1}, ${geometry.flipY ? -1 : 1})`,
        }}
      >
        <img
          src={piece.src}
          alt={alt}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth && image.naturalHeight) setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
          }}
        />
      </span>}
      {piece.kind !== 'text' && <PhotoBorderOverlay border={piece.border} frameWidth={frameWidth} frameHeight={frameHeight} />}
    </span>
  );
}

function PrintContentVisual({
  content,
  pieces,
  frameWidth,
  frameHeight,
}: {
  content: PrintContent;
  pieces: Piece[];
  frameWidth: number;
  frameHeight: number;
}) {
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  if (content.kind === 'piece') {
    const piece = pieceById.get(content.memberIds[0]);
    return piece ? <FramedPhoto piece={piece} frameWidth={frameWidth} frameHeight={frameHeight} alt={piece.name} /> : null;
  }
  return (
    <span className="print-group-visual" aria-label={`${content.code}, ${content.memberIds.length} grouped wall items`}>
      {content.members.map((member, index) => {
        const piece = pieceById.get(member.pieceId);
        if (!piece) return null;
        return (
          <span
            className="print-group-member"
            key={member.pieceId}
            style={{
              left: `${member.leftCm / content.widthCm * 100}%`,
              top: `${member.topCm / content.heightCm * 100}%`,
              width: `${member.widthCm / content.widthCm * 100}%`,
              height: `${member.heightCm / content.heightCm * 100}%`,
              rotate: `${member.rotation}deg`,
              zIndex: index + 1,
            }}
          >
            <FramedPhoto piece={piece} frameWidth={member.widthCm} frameHeight={member.heightCm} alt={piece.name} />
          </span>
        );
      })}
    </span>
  );
}

function PhotoBorderEditor({
  pieces,
  unit,
  onChange,
  onBeginContinuous,
  onEndContinuous,
}: {
  pieces: Piece[];
  unit: MeasurementUnit;
  onChange: (next: (border: PhotoBorder | undefined) => PhotoBorder | undefined, record?: boolean) => void;
  onBeginContinuous: () => void;
  onEndContinuous: () => void;
}) {
  const borders = pieces.map((piece) => normalizePhotoBorder(piece.border));
  const enabled = borders.filter(Boolean) as PhotoBorder[];
  const reference = enabled[0] ?? DEFAULT_PHOTO_BORDER;
  const enabledMixed = enabled.length > 0 && enabled.length < pieces.length;
  const colorMixed = enabled.some((border) => border.color !== reference.color);
  const thicknessMixed = enabled.some((border) => Math.abs(border.thicknessCm - reference.thicknessCm) > .001);
  const edgeMixed = enabled.some((border) => borderPresetForEdges(border.edges) !== borderPresetForEdges(reference.edges));
  const activePreset = edgeMixed ? 'custom' : borderPresetForEdges(reference.edges);
  const presets: Array<{ id: PhotoBorderPreset; label: string; mark: string }> = [
    { id: 'all', label: 'All four sides', mark: '□' },
    { id: 'horizontal', label: 'Top and bottom', mark: '═' },
    { id: 'top', label: 'Top only', mark: '▔' },
    { id: 'right', label: 'Right only', mark: '▕' },
    { id: 'bottom', label: 'Bottom only', mark: '▁' },
    { id: 'left', label: 'Left only', mark: '▏' },
  ];
  const applyToEnabled = (change: (border: PhotoBorder) => PhotoBorder, record = true) => onChange(
    (border) => change(border ?? { ...DEFAULT_PHOTO_BORDER, edges: { ...DEFAULT_PHOTO_BORDER.edges } }),
    record,
  );

  return (
    <div className="inspect-section border-editor">
      <div className="border-heading">
        <div><label>PHOTO BORDER</label><p>Drawn inward, so every print size stays exact.</p></div>
        <span>{enabledMixed ? 'Mixed' : enabled.length ? 'On' : 'Off'}</span>
        <Switch
          checked={enabled.length > 0}
          onCheckedChange={(checked) => onChange(() => checked ? { ...DEFAULT_PHOTO_BORDER, edges: { ...DEFAULT_PHOTO_BORDER.edges } } : undefined)}
          aria-label="Show border on selected photos"
        />
      </div>
      {enabled.length > 0 && <>
        <div className="border-color-row">
          <label>COLOR {colorMixed && <b>Mixed</b>}</label>
          <div><button aria-label="White border" style={{ background: '#ffffff' }} onClick={() => applyToEnabled((border) => ({ ...border, color: '#ffffff' }))} /><button aria-label="Black border" style={{ background: '#171923' }} onClick={() => applyToEnabled((border) => ({ ...border, color: '#171923' }))} /><button aria-label="Purple border" style={{ background: '#635bff' }} onClick={() => applyToEnabled((border) => ({ ...border, color: '#635bff' }))} /><input aria-label="Custom border color" type="color" value={reference.color} onChange={(event) => applyToEnabled((border) => ({ ...border, color: event.target.value }))} /></div>
        </div>
        <div className="border-thickness-row">
          <label>THICKNESS <b>{thicknessMixed ? 'Mixed' : measurementText(reference.thicknessCm, unit)}</b></label>
          <Slider
            value={[toDisplayUnit(reference.thicknessCm, unit)]}
            min={0.05}
            max={unit === 'in' ? 1 : 2.5}
            step={unit === 'in' ? .01 : .05}
            onValueChange={(values) => {
              onBeginContinuous();
              applyToEnabled((border) => ({ ...border, thicknessCm: fromDisplayUnit(sliderValue(values), unit) }), false);
            }}
            onValueCommitted={onEndContinuous}
          />
        </div>
        <fieldset className="border-side-grid"><legend>SIDES {edgeMixed && <b>Mixed</b>}</legend>{presets.map((preset) => <button type="button" key={preset.id} className={activePreset === preset.id ? 'active' : ''} aria-label={preset.label} aria-pressed={activePreset === preset.id} onClick={() => applyToEnabled((border) => ({ ...border, edges: borderEdgesForPreset(preset.id) }))}><i>{preset.mark}</i><span>{preset.id === 'horizontal' ? 'Top + bottom' : preset.id === 'all' ? 'All' : preset.id[0].toUpperCase() + preset.id.slice(1)}</span></button>)}</fieldset>
      </>}
    </div>
  );
}

const overlaps = (a: Piece, b: Piece, wall: Wall) => {
  if (!a.placed || !b.placed || a.kind === 'text' || b.kind === 'text') return false;
  return piecesOverlap(a, b, wall);
};
const isOutsideWall = (piece: Piece, wall: Wall) => {
  if (!piece.placed) return false;
  const bounds = pieceVisualBounds(piece, wall);
  return bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.w > 100.01 || bounds.y + bounds.h > 100.01;
};

function originalPhotoDimensions(asset: PendingAsset) {
  const ratio = asset.pixelW / Math.max(1, asset.pixelH);
  const longestEdgeCm = 29.7;
  return ratio >= 1
    ? { widthCm: longestEdgeCm, heightCm: longestEdgeCm / ratio }
    : { widthCm: longestEdgeCm * ratio, heightCm: longestEdgeCm };
}

function photoDimensions(asset: PendingAsset, preset: PhotoSizePreset) {
  if (preset === 'Original') return originalPhotoDimensions(asset);
  const paper = PAPER_SIZES[preset];
  const portrait = asset.pixelH >= asset.pixelW;
  return {
    widthCm: portrait ? paper[0] : paper[1],
    heightCm: portrait ? paper[1] : paper[0],
  };
}

function readFile(file: File): Promise<PendingAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read this file.'));
        return;
      }
      const src = reader.result;
      const image = new Image();
      image.onerror = () => reject(new Error('That image could not be decoded.'));
      image.onload = () => resolve({ src, name: file.name, pixelW: image.naturalWidth, pixelH: image.naturalHeight, mimeType: file.type });
      image.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function readImageNaturalSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('This photo could not be opened for cropping.'));
    image.src = src;
  });
}

async function verifyProjectImages(project: ProjectDocument) {
  const sources = projectImageSources(project);
  for (let index = 0; index < sources.length; index += 1) {
    const size = await readImageNaturalSize(sources[index]);
    if (!size.width || !size.height || size.width * size.height > 120_000_000) {
      throw new Error(`Image ${index + 1} is too large or could not be safely decoded.`);
    }
  }
}

async function createAiCutoutPreview(asset: PendingAsset) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not prepare this sheet for AI detection.'));
    element.src = asset.src;
  });
  const maxEdge = 1_600;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

async function cropAsset(asset: PendingAsset, regions: CutRegion[]): Promise<CroppedAsset[]> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not crop this image.'));
    element.src = asset.src;
  });
  return regions.map((region) => {
    const bounds = cutPixelBounds(region.bounds, image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');
    if (region.shape !== 'rectangle') {
      context.beginPath();
      traceCutRegionPath(context, region, canvas.width, canvas.height);
      context.clip();
    }
    context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);
    const outputType = region.shape !== 'rectangle'
      ? 'image/png'
      : asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
        ? asset.mimeType
        : 'image/jpeg';
    return {
      src: canvas.toDataURL(outputType, 0.98),
      pixelW: bounds.width,
      pixelH: bounds.height,
    };
  });
}

function downloadBlob(data: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')), type, quality);
  });
}

async function waitForDocumentFonts() {
  if ('fonts' in document) await document.fonts.ready;
}

async function embedSource(pdf: PdfDocument, src: string) {
  const response = await fetch(src);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const bytes = await response.arrayBuffer();
  const lower = src.toLowerCase();
  const looksPng = contentType.includes('png') || src.startsWith('data:image/png') || /\.png($|\?)/.test(lower);
  if (looksPng) return pdf.embedPng(bytes);

  // Rasterize JPEG/WebP sources through the browser so EXIF orientation is
  // applied exactly as it is in the wall and crop previews.
  const bitmap = await createImageBitmap(new Blob([bytes], { type: contentType || 'image/jpeg' }), { imageOrientation: 'from-image' });
  const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The image could not be prepared for PDF export.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = await canvasToBlob(canvas, 'image/png');
  return pdf.embedPng(await png.arrayBuffer());
}

export function StudioApp() {
  const [pieces, setPieces] = React.useState<Piece[]>(() => normalizeLegacyPieces(copyPieces(DEMO_PIECES), DEFAULT_WALL, PROJECT_SCHEMA_VERSION));
  const [printGroups, setPrintGroups] = React.useState<PrintGroup[]>([]);
  const [projectName, setProjectName] = React.useState('My cinematic wall');
  const [identityRegistry, setIdentityRegistry] = React.useState<IdentityRegistryV1>(() => createIdentityRegistry(DEMO_PIECES));
  const [wall, setWall] = React.useState<Wall>(DEFAULT_WALL);
  const [wallDraftCm, setWallDraftCm] = React.useState({ widthCm: DEFAULT_WALL.widthCm, heightCm: DEFAULT_WALL.heightCm });
  const [wallPreset, setWallPreset] = React.useState<WallPreset>('dorm');
  const [measurementUnit, setMeasurementUnit] = React.useState<MeasurementUnit>('cm');
  const [showWallLabels, setShowWallLabels] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<string[]>(() => {
    const initialId = DEMO_PIECES.find((piece) => piece.locked)?.id ?? DEMO_PIECES[0]?.id;
    return initialId ? [initialId] : [];
  });
  const [multiSelectMode, setMultiSelectMode] = React.useState(false);
  const [aspectLocked, setAspectLocked] = React.useState(true);
  const [batchMode, setBatchMode] = React.useState<BatchSizeMode>('fit');
  const [batchWidthCm, setBatchWidthCm] = React.useState(10.5);
  const [batchHeightCm, setBatchHeightCm] = React.useState(14.8);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [cropSession, setCropSession] = React.useState<CropSession | null>(null);
  const [view, setView] = React.useState<ViewMode>('arrange');
  const [panelMode, setPanelMode] = React.useState<PanelMode>('assistant');
  const [mobileTool, setMobileTool] = React.useState<MobileTool>('wall');
  const [mobilePrintTool, setMobilePrintTool] = React.useState<MobilePrintTool>('preview');
  const [canvasMode, setCanvasMode] = React.useState<'blueprint' | 'room'>('blueprint');
  const [filter, setFilter] = React.useState<'all' | 'placed' | 'loose'>('all');
  const [positionOpen, setPositionOpen] = React.useState(false);
  const [positionTab, setPositionTab] = React.useState<PositionPanelTab>('layers');
  const [layerFilter, setLayerFilter] = React.useState<LayerFilter>('all');
  const [guides, setGuides] = React.useState<SmartGuide[]>([]);
  const [stageDropActive, setStageDropActive] = React.useState(false);
  const [trayDragGhost, setTrayDragGhost] = React.useState<{ id: string; src: string; x: number; y: number; w: number; h: number } | null>(null);
  const [trayDropPreview, setTrayDropPreview] = React.useState<Piece | null>(null);
  const [draggingId, setDraggingId] = React.useState('');
  const [zoom, setZoom] = React.useState(72);
  const [layout, setLayout] = React.useState<LayoutName | 'custom'>('compass');
  const [density, setDensity] = React.useState(62);
  const [groupStrength, setGroupStrength] = React.useState(65);
  const [prompt, setPrompt] = React.useState('Keep Friends together, blend warm into cool, and make the tall portrait the hero.');
  const [aiResponse, setAiResponse] = React.useState('Your locked hero stays fixed. The composition can move the other photos, but every chosen physical size remains exact.');
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiMode, setAiMode] = React.useState<'secure' | 'openai' | 'local'>('secure');
  const [notice, setNotice] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [cutOpen, setCutOpen] = React.useState(false);
  const [wallOpen, setWallOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [pendingRestore, setPendingRestore] = React.useState<PendingRestore | null>(null);
  const [freshStartOpen, setFreshStartOpen] = React.useState(false);
  const [printDownloadOpen, setPrintDownloadOpen] = React.useState(false);
  const [candidateOpen, setCandidateOpen] = React.useState(false);
  const [pendingAsset, setPendingAsset] = React.useState<PendingAsset | null>(null);
  const [cutMode, setCutMode] = React.useState<'grid' | 'ai' | 'manual'>('grid');
  const [cutPreviewMode, setCutPreviewMode] = React.useState<'edit' | 'result'>('edit');
  const [rows, setRows] = React.useState(3);
  const [columns, setColumns] = React.useState(3);
  const [cutRegions, setCutRegions] = React.useState<CutRegion[]>([]);
  const [activeCutShape, setActiveCutShape] = React.useState<CutShape>('rectangle');
  const [selectedCutId, setSelectedCutId] = React.useState<string | null>(null);
  const [aiCutBrief, setAiCutBrief] = React.useState('Find every separate photo or panel. Keep each region tight so neighbouring images never bleed into one another.');
  const [aiCutShapePreference, setAiCutShapePreference] = React.useState<AiCutoutShapePreference>('auto');
  const [aiCutBusy, setAiCutBusy] = React.useState(false);
  const [aiCutError, setAiCutError] = React.useState('');
  const [aiCutMeta, setAiCutMeta] = React.useState<CutoutMeta>({});
  const [sheetPaper, setSheetPaper] = React.useState<keyof typeof PAPER_SIZES>('A3');
  const [posterPreset, setPosterPreset] = React.useState<PhotoSizePreset>('A4');
  const [busy, setBusy] = React.useState('');
  const [printPaper, setPrintPaper] = React.useState<keyof typeof PAPER_SIZES | 'Custom'>('A3');
  const [customSheetW, setCustomSheetW] = React.useState(32);
  const [customSheetH, setCustomSheetH] = React.useState(45);
  const [printLandscape, setPrintLandscape] = React.useState(false);
  const [printOverrides, setPrintOverrides] = React.useState<Record<string, PrintOverride>>({});
  const [printRotationOverrides, setPrintRotationOverrides] = React.useState<Record<string, PrintRotationOverride>>({});
  const [printSelectedId, setPrintSelectedId] = React.useState(() => DEMO_PIECES.find((piece) => piece.locked && piece.placed)?.id ?? DEMO_PIECES.find((piece) => piece.placed)?.id ?? '');
  const [printAspectLocked, setPrintAspectLocked] = React.useState(true);
  const [printGap, setPrintGap] = React.useState(0.6);
  const [printMargin, setPrintMargin] = React.useState(1);
  const [autoRotatePrint, setAutoRotatePrint] = React.useState(true);
  const [cropMarks, setCropMarks] = React.useState(true);
  const [printExportFormat, setPrintExportFormat] = React.useState<PrintExportFormat>('pdf');
  const [printDpi, setPrintDpi] = React.useState<RasterPrintDpi>(300);
  const [printPage, setPrintPage] = React.useState(0);
  const [history, setHistory] = React.useState<EditorSnapshot[]>([]);
  const [future, setFuture] = React.useState<EditorSnapshot[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'loading' | 'saved' | 'saving' | 'dirty' | 'error'>('loading');
  const [storageNotice, setStorageNotice] = React.useState<StorageNotice | null>(null);
  const [storageHealth, setStorageHealth] = React.useState<StorageHealth>({ supported: false });
  const [storageWarningDismissed, setStorageWarningDismissed] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const wallUploadRef = React.useRef<HTMLInputElement>(null);
  const backupUploadRef = React.useRef<HTMLInputElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const cropPanRef = React.useRef<CropPanState | null>(null);
  const cropLoadTokenRef = React.useRef(0);
  const trayDragRef = React.useRef<TrayDragState | null>(null);
  const layerDragRef = React.useRef<string | null>(null);
  const suppressTrayClickRef = React.useRef(false);
  const suppressWallClickRef = React.useRef(false);
  const sizeEditRef = React.useRef<{ before: Piece[]; changed: boolean } | null>(null);
  const historyTransactionRef = React.useRef<{ before: EditorSnapshot; changed: boolean } | null>(null);
  const cutRegionCounterRef = React.useRef(0);
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const identityRef = React.useRef(identityRegistry);
  const latestPiecesRef = React.useRef(pieces);
  const latestPrintGroupsRef = React.useRef(printGroups);
  const latestWallRef = React.useRef(wall);
  const latestAiControlsRef = React.useRef({ prompt, density, groupStrength });
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const latestSaveRevisionRef = React.useRef(0);
  const storageSaveBlockedRef = React.useRef(false);
  const storageNoticeRef = React.useRef<StorageNotice | null>(null);
  const autosaveGenerationRef = React.useRef(0);
  const autosaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    latestPiecesRef.current = pieces;
  }, [pieces]);

  React.useEffect(() => {
    latestPrintGroupsRef.current = printGroups;
  }, [printGroups]);

  React.useEffect(() => {
    latestWallRef.current = wall;
  }, [wall]);

  React.useEffect(() => {
    latestAiControlsRef.current = { prompt, density, groupStrength };
  }, [prompt, density, groupStrength]);

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPieces = selectedIds.map((id) => pieces.find((piece) => piece.id === id)).filter((piece): piece is Piece => Boolean(piece));
  const selectedPhotoPieces = selectedPieces.filter((piece) => piece.kind !== 'text');
  const selectedPlacedPieces = selectedPieces.filter((piece) => piece.placed);
  const allSelectedPiecesLocked = selectedPlacedPieces.length > 0 && selectedPlacedPieces.every((piece) => piece.locked);
  const selectedId = selectedIds[selectedIds.length - 1] ?? '';
  const selected = pieces.find((piece) => piece.id === selectedId);
  const activeCropPiece = cropSession ? pieces.find((piece) => piece.id === cropSession.pieceId) : undefined;
  const cropIsOriginal = Boolean(cropSession
    && cropSession.draft.mode === 'fit'
    && cropSession.draft.zoom === 1
    && cropSession.draft.offsetX === 0
    && cropSession.draft.offsetY === 0
    && cropSession.draft.quarterTurns === 0
    && !cropSession.draft.flipX
    && !cropSession.draft.flipY);
  const removableSelected = selectedPieces.filter((piece) => !piece.locked);
  const removeLockedCount = selectedPieces.length - removableSelected.length;
  const wallRemovalTargets = selectedPieces.filter((piece) => piece.placed && !piece.locked);
  const wallRemovalLockedCount = selectedPieces.filter((piece) => piece.placed && piece.locked).length;
  const visiblePieces = pieces.filter((piece) => filter === 'all' || (filter === 'placed' ? piece.placed : !piece.placed));
  const orderedPlacedPieces = React.useMemo(() => pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => piece.placed)
    .sort((a, b) => (a.piece.zIndex ?? a.index) - (b.piece.zIndex ?? b.index))
    .map(({ piece }) => piece), [pieces]);
  const selectedPrintGroupIds = React.useMemo(
    () => groupIdsForMembers(printGroups, selectedIds),
    [printGroups, selectedIds],
  );
  const printContents = React.useMemo(
    () => buildPrintContents(orderedPlacedPieces, printGroups, wall),
    [orderedPlacedPieces, printGroups, wall],
  );
  const printablePieceIds = React.useMemo(
    () => new Set(printContents.flatMap((content) => content.memberIds)),
    [printContents],
  );
  const printablePlacedPieces = React.useMemo(
    () => orderedPlacedPieces.filter((piece) => printablePieceIds.has(piece.id)),
    [orderedPlacedPieces, printablePieceIds],
  );
  const overlappingIds = React.useMemo(() => {
    const ids = new Set<string>();
    const photos = orderedPlacedPieces.filter((piece) => piece.kind !== 'text');
    photos.forEach((piece, index) => {
      photos.slice(index + 1).forEach((other) => {
        if (!overlaps(piece, other, wall)) return;
        ids.add(piece.id);
        ids.add(other.id);
      });
    });
    return ids;
  }, [orderedPlacedPieces, wall]);
  const outsideWallIds = React.useMemo(() => new Set(orderedPlacedPieces.filter((piece) => isOutsideWall(piece, wall)).map((piece) => piece.id)), [orderedPlacedPieces, wall]);
  const layerPieces = (layerFilter === 'overlapping'
    ? orderedPlacedPieces.filter((piece) => overlappingIds.has(piece.id))
    : orderedPlacedPieces).slice().reverse();
  const placedCount = pieces.filter((piece) => piece.placed).length;
  const coverage = Math.round(pieces.filter((piece) => piece.placed).reduce((sum, piece) => sum + piece.w * piece.h, 0) / 100);
  const codeForId = (id: string) => pieces.find((piece) => piece.id === id)?.code ?? id;
  const codeForPrintId = (id: string) => printContents.find((content) => content.id === id)?.code ?? codeForId(id);

  const basePaper = printPaper === 'Custom' ? [customSheetW, customSheetH] as const : PAPER_SIZES[printPaper];
  const sheetW = printLandscape ? basePaper[1] : basePaper[0];
  const sheetH = printLandscape ? basePaper[0] : basePaper[1];
  const printItems = React.useMemo<PrintPackItem[]>(
    () => buildPrintItems(printContents, printOverrides, printRotationOverrides),
    [printContents, printOverrides, printRotationOverrides],
  );
  const globalPrintScalePercent = React.useMemo(
    () => uniformPrintScalePercent(printContents, printOverrides),
    [printContents, printOverrides],
  );
  const printPlan = React.useMemo(
    () => packPrintItems(printItems, sheetW, sheetH, printGap, printMargin, { allow90Rotation: autoRotatePrint }),
    [autoRotatePrint, printGap, printItems, printMargin, sheetH, sheetW],
  );
  const oversizedPrintDetails = React.useMemo(() => printPlan.unplaced.flatMap((item) => {
    const content = printContents.find(({ id }) => id === item.pieceId);
    if (!content) return [];
    return [{
      item,
      content,
      recommendation: recommendPrintFit(item, sheetW, sheetH, printMargin, autoRotatePrint),
    }];
  }), [autoRotatePrint, printContents, printMargin, printPlan.unplaced, sheetH, sheetW]);
  const rotatedPrintCount = React.useMemo(() => printPlan.pages.reduce(
    (count, page) => count + page.placements.filter((placement) => placement.sheetRotation !== 0).length,
    0,
  ), [printPlan.pages]);
  const zeroCutSpacing = printGap <= 0.001;
  const lowPageMargin = printMargin < 0.3;
  const rasterSpec = rasterPageSpec(sheetW, sheetH, printDpi);
  const raster300Spec = rasterPageSpec(sheetW, sheetH, 300);
  const totalPrintPages = printPlan.pages.length;
  const activePrintPage = totalPrintPages ? clamp(printPage, 0, totalPrintPages - 1) : 0;
  const pagePlan = printPlan.pages[activePrintPage];
  const printSelectedContent = printContents.find((content) => content.id === printSelectedId) ?? printContents[0];
  const printSelectedSize = printSelectedContent
    ? printOverrides[printSelectedContent.id] ?? { widthCm: printSelectedContent.widthCm, heightCm: printSelectedContent.heightCm }
    : undefined;
  const printSelectedHasOverride = Boolean(printSelectedContent && printOverrides[printSelectedContent.id]);
  const printSelectedRotationChoice: PrintRotationChoice = printSelectedContent
    ? printRotationOverrides[printSelectedContent.id] ?? 'auto'
    : 'auto';
  const printSelectedPlacement = printSelectedContent
    ? printPlan.pages.flatMap((page) => page.placements).find((placement) => placement.pieceId === printSelectedContent.id)
    : undefined;

  const toast = React.useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2800);
  }, []);

  const publishStorageNotice = React.useCallback((next: StorageNotice | null) => {
    storageNoticeRef.current = next;
    setStorageNotice(next);
  }, []);

  const adoptIdentity = React.useCallback((registry: IdentityRegistryV1) => {
    identityRef.current = registry;
    setIdentityRegistry(registry);
  }, []);

  const buildProjectDocument = React.useCallback((updatedAt = new Date().toISOString()): ProjectDocument => ({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: projectName,
    pieces: copyPieces(pieces),
    printGroups: printGroups.map((group) => ({ ...group, memberIds: [...group.memberIds] })),
    wall: { ...wall },
    measurementUnit,
    showWallLabels,
    autoRotatePrint,
    printOverrides: copyPrintOverrides(printOverrides),
    printRotationOverrides: copyPrintRotationOverrides(printRotationOverrides),
    printPaper,
    customSheetW,
    customSheetH,
    printLandscape,
    printGap,
    printMargin,
    cropMarks,
    printExportFormat,
    printDpi,
    posterPreset,
    sheetPaper,
    identity: identityRegistry,
    updatedAt,
  }), [autoRotatePrint, cropMarks, customSheetH, customSheetW, identityRegistry, measurementUnit, pieces, posterPreset, printDpi, printExportFormat, printGap, printGroups, printLandscape, printMargin, printOverrides, printPaper, printRotationOverrides, projectName, sheetPaper, showWallLabels, wall]);

  const applyProjectDocument = React.useCallback((project: ProjectDocument) => {
    const restoredPieces = normalizeLegacyPieces(project.pieces, project.wall, PROJECT_SCHEMA_VERSION);
    setProjectName(project.name);
    setPieces(restoredPieces);
    setPrintGroups(project.printGroups);
    setWall(project.wall);
    setWallDraftCm({ widthCm: project.wall.widthCm, heightCm: project.wall.heightCm });
    setMeasurementUnit(project.measurementUnit);
    setShowWallLabels(project.showWallLabels);
    setAutoRotatePrint(project.autoRotatePrint);
    setPrintOverrides(project.printOverrides);
    setPrintRotationOverrides(project.printRotationOverrides);
    setPrintPaper(project.printPaper);
    setCustomSheetW(project.customSheetW);
    setCustomSheetH(project.customSheetH);
    setPrintLandscape(project.printLandscape);
    setPrintGap(project.printGap);
    setPrintMargin(project.printMargin);
    setCropMarks(project.cropMarks);
    setPrintExportFormat(project.printExportFormat);
    setPrintDpi(project.printDpi);
    setPosterPreset(project.posterPreset);
    setSheetPaper(project.sheetPaper);
    adoptIdentity(project.identity);
    const initialId = restoredPieces.find((piece) => piece.locked)?.id ?? restoredPieces[0]?.id ?? '';
    setSelectedIds(initialId ? [initialId] : []);
    const restoredContents = buildPrintContents(restoredPieces.filter((piece) => piece.placed), project.printGroups, project.wall);
    setPrintSelectedId(restoredContents[0]?.id ?? '');
    setHistory([]);
    setFuture([]);
    historyTransactionRef.current = null;
    sizeEditRef.current = null;
    setPrintPage(0);
    setCropSession(null);
    setPositionOpen(false);
  }, [adoptIdentity]);

  const refreshStorageHealth = React.useCallback(() => {
    void getStorageHealth().then(setStorageHealth).catch(() => setStorageHealth({ supported: false }));
  }, []);

  const invalidatePendingAutosaves = React.useCallback(() => {
    autosaveGenerationRef.current += 1;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const queueProjectSave = React.useCallback(async (project: ProjectDocument, manual = false, generation = autosaveGenerationRef.current) => {
    const revision = latestSaveRevisionRef.current + 1;
    latestSaveRevisionRef.current = revision;
    setSaveState('saving');
    let performed = false;
    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      if (manual) storageSaveBlockedRef.current = false;
      else if (generation !== autosaveGenerationRef.current || storageSaveBlockedRef.current) return;
      performed = true;
      await saveStoredProject(project);
    });
    saveQueueRef.current = operation.catch(() => undefined);
    try {
      await operation;
      if (!performed) {
        if (revision === latestSaveRevisionRef.current) setSaveState(storageSaveBlockedRef.current ? 'error' : 'saved');
        return false;
      }
      if (revision === latestSaveRevisionRef.current) setSaveState('saved');
      storageSaveBlockedRef.current = false;
      if (storageNoticeRef.current?.error.kind !== 'corrupt') publishStorageNotice(null);
      refreshStorageHealth();
      return true;
    } catch (error) {
      const classified = classifyStorageError(error);
      storageSaveBlockedRef.current = true;
      setSaveState('error');
      publishStorageNotice({ error: classified, rawRecovery: storageNoticeRef.current?.rawRecovery });
      return false;
    }
  }, [publishStorageNotice, refreshStorageHealth]);

  const checkStorageHeadroom = React.useCallback(async (additionalBytes: number) => {
    try {
      const health = await getStorageHealth();
      setStorageHealth(health);
      if (storageNeedsAttention(health, additionalBytes)) {
        setStorageWarningDismissed(false);
        toast('Local storage is getting full. You can continue, but download a project backup before reloading.');
        return false;
      }
    } catch {
      // The actual IndexedDB write remains authoritative when estimates are unavailable.
    }
    return true;
  }, [toast]);

  const projectWithinLimits = React.useCallback((nextPieces: Piece[], nextWall: Wall = wall) => {
    if (nextPieces.length > MAX_PROJECT_PIECES) {
      toast(`A project can contain up to ${MAX_PROJECT_PIECES.toLocaleString()} photos. Remove some pieces before adding more.`);
      return false;
    }
    const candidate: ProjectDocument = {
      ...buildProjectDocument(),
      pieces: copyPieces(nextPieces),
      wall: { ...nextWall },
    };
    if (approximateProjectBytes(candidate) > MAX_BACKUP_BYTES) {
      toast(`That would make the project backup larger than ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB. Use fewer or smaller source images so the project remains safely restorable.`);
      return false;
    }
    return true;
  }, [buildProjectDocument, toast, wall]);

  React.useEffect(() => {
    let cancelled = false;
    const hydrateProject = async () => {
      let stored: unknown;
      try {
        stored = await loadStoredProject();
      } catch (error) {
        if (cancelled) return;
        storageSaveBlockedRef.current = true;
        publishStorageNotice({ error: classifyStorageError(error) });
        setSaveState('error');
        return;
      }
      if (cancelled) return;

      if (stored === undefined) {
        storageSaveBlockedRef.current = false;
        setHydrated(true);
        setSaveState('saved');
        return;
      }

      try {
        const validated = validateProjectDocument(stored);
        applyProjectDocument(validated.project);
        if (validated.needsPersistence) {
          const saved = await queueProjectSave(validated.project, true);
          if (cancelled) return;
          setHydrated(true);
          if (!saved) return;
        } else {
          setHydrated(true);
          setSaveState('saved');
        }
      } catch (error) {
        if (cancelled) return;
        let rawRecovery = '';
        try { rawRecovery = JSON.stringify(stored, null, 2); } catch { rawRecovery = ''; }
        const message = error instanceof Error ? error.message : 'The saved project could not be validated.';
        storageSaveBlockedRef.current = true;
        publishStorageNotice({ error: new ProjectStorageError('corrupt', `${message} Cutroom will not overwrite it.`, error), rawRecovery });
        setSaveState('error');
      }
    };
    void hydrateProject().finally(() => { if (!cancelled) refreshStorageHealth(); });
    return () => { cancelled = true; };
  }, [applyProjectDocument, publishStorageNotice, queueProjectSave, refreshStorageHealth]);

  React.useEffect(() => {
    if (!hydrated) return;
    if (storageSaveBlockedRef.current) {
      setSaveState('error');
      return;
    }
    setSaveState('dirty');
    const generation = autosaveGenerationRef.current;
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void queueProjectSave(buildProjectDocument(), false, generation);
    }, 450);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [buildProjectDocument, hydrated, queueProjectSave]);

  React.useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState !== 'dirty' && saveState !== 'saving' && saveState !== 'error') return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [saveState]);

  const captureEditorSnapshot = React.useCallback((overrides: Partial<EditorSnapshot> = {}) => cloneEditorSnapshot({
    pieces,
    printGroups,
    wall,
    showWallLabels,
    autoRotatePrint,
    printOverrides,
    printRotationOverrides,
    printPaper,
    customSheetW,
    customSheetH,
    printLandscape,
    printGap,
    printMargin,
    cropMarks,
    ...overrides,
  }), [autoRotatePrint, cropMarks, customSheetH, customSheetW, pieces, printGap, printGroups, printLandscape, printMargin, printOverrides, printPaper, printRotationOverrides, showWallLabels, wall]);

  const commitSnapshot = React.useCallback((before: EditorSnapshot) => {
    setHistory((items) => pushHistorySnapshot(items, before));
    setFuture([]);
  }, []);

  const commit = React.useCallback((before: Piece[], beforePrintOverrides = printOverrides, beforePrintRotations = printRotationOverrides) => {
    commitSnapshot(captureEditorSnapshot({
      pieces: before,
      printOverrides: beforePrintOverrides,
      printRotationOverrides: beforePrintRotations,
    }));
  }, [captureEditorSnapshot, commitSnapshot, printOverrides, printRotationOverrides]);

  const beginHistoryTransaction = React.useCallback(() => {
    if (!historyTransactionRef.current) {
      historyTransactionRef.current = { before: captureEditorSnapshot(), changed: false };
    }
  }, [captureEditorSnapshot]);

  const markHistoryTransactionChanged = React.useCallback(() => {
    if (historyTransactionRef.current) historyTransactionRef.current.changed = true;
  }, []);

  const endHistoryTransaction = React.useCallback(() => {
    const transaction = historyTransactionRef.current;
    historyTransactionRef.current = null;
    if (transaction?.changed) commitSnapshot(transaction.before);
  }, [commitSnapshot]);

  const restoreEditorSnapshot = React.useCallback((snapshot: EditorSnapshot) => {
    // During local hot reload, an older in-memory entry can predate new snapshot
    // fields. Current values are safe fallbacks until that old history is gone.
    const restored = cloneEditorSnapshot({ ...captureEditorSnapshot(), ...snapshot });
    setPieces(restored.pieces);
    setPrintGroups(restored.printGroups);
    setWall(restored.wall);
    setWallDraftCm({ widthCm: restored.wall.widthCm, heightCm: restored.wall.heightCm });
    setWallPreset('custom');
    setShowWallLabels(restored.showWallLabels);
    setAutoRotatePrint(restored.autoRotatePrint);
    setPrintOverrides(restored.printOverrides);
    setPrintRotationOverrides(restored.printRotationOverrides);
    setPrintPaper(restored.printPaper);
    setCustomSheetW(restored.customSheetW);
    setCustomSheetH(restored.customSheetH);
    setPrintLandscape(restored.printLandscape);
    setPrintGap(restored.printGap);
    setPrintMargin(restored.printMargin);
    setCropMarks(restored.cropMarks);
    setPrintPage(0);
    setSelectedIds((ids) => ids.filter((id) => restored.pieces.some((piece) => piece.id === id)));
    const restoredContents = buildPrintContents(restored.pieces.filter((piece) => piece.placed), restored.printGroups, restored.wall);
    setPrintSelectedId((id) => restoredContents.some((content) => content.id === id) ? id : restoredContents[0]?.id ?? '');
  }, [captureEditorSnapshot]);

  const undo = React.useCallback(() => {
    if (!history.length || cropSession) return;
    const previous = history[history.length - 1];
    historyTransactionRef.current = null;
    sizeEditRef.current = null;
    setFuture((items) => [captureEditorSnapshot(), ...items].slice(0, 40));
    setHistory((items) => items.slice(0, -1));
    restoreEditorSnapshot(previous);
    toast('Undid the last change.');
  }, [captureEditorSnapshot, cropSession, history, restoreEditorSnapshot, toast]);

  const redo = React.useCallback(() => {
    if (!future.length || cropSession) return;
    const next = future[0];
    historyTransactionRef.current = null;
    sizeEditRef.current = null;
    setHistory((items) => pushHistorySnapshot(items, captureEditorSnapshot()));
    setFuture((items) => items.slice(1));
    restoreEditorSnapshot(next);
    toast('Restored the change.');
  }, [captureEditorSnapshot, cropSession, future, restoreEditorSnapshot, toast]);

  React.useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!hydrated || cropSession) return;
      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable));
      if (editingText || (!event.metaKey && !event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [cropSession, hydrated, redo, undo]);

  const updatePiece = (id: string, patch: Partial<Piece>, record = true) => {
    if (record) commit(pieces);
    setPieces((items) => items.map((piece) => {
      if (piece.id !== id) return piece;
      const next = { ...piece, ...patch };
      if (patch.widthCm !== undefined || patch.heightCm !== undefined) return syncCanvasFromPhysical(next, wall);
      if (patch.w !== undefined || patch.h !== undefined) return syncPhysicalFromCanvas(next, wall);
      return next;
    }));
  };

  const beginSizeEdit = () => {
    if (!sizeEditRef.current) sizeEditRef.current = { before: copyPieces(pieces), changed: false };
  };

  const endSizeEdit = () => {
    const edit = sizeEditRef.current;
    if (edit?.changed) commit(edit.before);
    sizeEditRef.current = null;
  };

  const selectOnly = (id: string) => {
    endSizeEdit();
    setSelectedIds(id ? [id] : []);
  };

  const togglePieceSelection = (piece: Piece) => {
    endSizeEdit();
    const clearingLast = selectedIds.length === 1 && selectedIds[0] === piece.id;
    setSelectedIds((ids) => ids.includes(piece.id) ? ids.filter((id) => id !== piece.id) : [...ids, piece.id]);
    setPanelMode(clearingLast ? 'assistant' : 'inspect');
  };

  const choosePiece = (piece: Piece) => {
    selectOnly(piece.id);
    setPanelMode('inspect');
  };

  const selectAllPlaced = () => {
    endSizeEdit();
    const ids = orderedPlacedPieces.map((piece) => piece.id);
    setSelectedIds(ids);
    setPanelMode('inspect');
    toast(`${ids.length} wall items selected.`);
  };

  const clearSelection = () => {
    endSizeEdit();
    setSelectedIds([]);
    setPanelMode('assistant');
  };

  const setProjectUnit = (unit: MeasurementUnit) => {
    setMeasurementUnit(unit);
    toast(`Measurements now display in ${unit === 'cm' ? 'centimetres' : 'inches'}. Physical sizes stayed unchanged.`);
  };

  const startCrop = (piece: Piece) => {
    if (cropSession) return;
    if (piece.kind === 'text') {
      toast('Text stays editable in the Text inspector and does not use photo cropping.');
      return;
    }
    if (!piece.placed) {
      toast('Place this photo on the wall before adjusting its crop.');
      return;
    }
    const fallbackWidth = piece.pixelW ?? 1000;
    const fallbackHeight = piece.pixelH ?? Math.max(1, fallbackWidth * piece.heightCm / Math.max(0.01, piece.widthCm));
    const cropNavigation = beginMobileCrop(mobileTool);
    const loadToken = cropLoadTokenRef.current + 1;
    cropLoadTokenRef.current = loadToken;
    dragRef.current = null;
    cropPanRef.current = null;
    setDraggingId('');
    setGuides([]);
    setPositionOpen(false);
    setMultiSelectMode(false);
    setSelectedIds([piece.id]);
    setPanelMode('inspect');
    setMobileTool(cropNavigation.activeTool);
    setCropSession({
      pieceId: piece.id,
      draft: normalizePhotoCrop(piece.crop),
      naturalWidth: fallbackWidth,
      naturalHeight: fallbackHeight,
      returnMobileTool: cropNavigation.returnTool,
      loadToken,
    });
    window.requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
    void readImageNaturalSize(piece.src).then((size) => {
      if (cropLoadTokenRef.current !== loadToken) return;
      cropPanRef.current = null;
      setCropSession((session) => session?.pieceId === piece.id && session.loadToken === loadToken
        ? { ...session, naturalWidth: size.width, naturalHeight: size.height }
        : session);
    }).catch(() => {
      if (cropLoadTokenRef.current === loadToken) toast('Using the saved photo proportions for this crop.');
    });
  };

  const addTextPiece = (presetId = TEXT_PRESETS[0].id, value?: string) => {
    const allocation = allocateTextIdentity(identityRef.current);
    const text = createTextData(presetId, value);
    const measured = measureTextBoxSize(text, wall.widthCm * .86);
    const widthCm = Math.min(wall.widthCm, measured.widthCm);
    const heightCm = Math.min(wall.heightCm, measured.heightCm);
    const piece = fitTextPieceToContent({
      ...allocation.identity,
      kind: 'text',
      text,
      name: text.value.slice(0, 48) || 'Text box',
      src: TRANSPARENT_PIXEL,
      widthCm,
      heightCm,
      x: 50 - widthCm / wall.widthCm * 50,
      y: 50 - heightCm / wall.heightCm * 50,
      w: widthCm / wall.widthCm * 100,
      h: heightCm / wall.heightCm * 100,
      rotation: 0,
      placed: true,
      locked: false,
      category: 'Text',
      tone: 'neutral',
      color: text.style.color,
      sizeMode: 'custom',
      zIndex: pieces.reduce((highest, item, index) => Math.max(highest, pieceZ(item, index)), -1) + 1,
      crop: { ...DEFAULT_PHOTO_CROP },
    }, wall, text);
    if (!projectWithinLimits([...pieces, piece])) return;
    commit(pieces);
    adoptIdentity(allocation.registry);
    setPieces((items) => [...items, piece]);
    selectOnly(piece.id);
    setPanelMode('inspect');
    setMobileTool('inspect');
    toast(`${piece.code} added. Type, style, move, resize, and print it like any wall element.`);
  };

  const updateSelectedText = (next: (data: TextPieceData) => TextPieceData, record = true) => {
    if (!selected || selected.kind !== 'text' || !selected.text) return;
    if (record) commit(pieces);
    setPieces((items) => items.map((piece) => {
      if (piece.id !== selected.id || !piece.text) return piece;
      const text = next(cloneTextData(piece.text));
      return fitTextPieceToContent({ ...piece, text, name: text.value.slice(0, 48) || 'Text box', color: text.style.color }, wall, text);
    }));
  };

  const updateSelectedTextStyle = (patch: Partial<TextStyle>, record = true) => {
    updateSelectedText((data) => ({ ...data, presetId: 'custom', style: { ...data.style, ...patch } }), record);
  };

  const applyTextPreset = (presetId: string) => {
    updateSelectedText((data) => ({ ...data, presetId, style: styleForPreset(presetId) }));
    toast('Text style applied. Every setting remains editable.');
  };

  const updateSelectedPhotoBorders = (
    next: (border: PhotoBorder | undefined) => PhotoBorder | undefined,
    record = true,
  ) => {
    const targetIds = new Set(selectedPhotoPieces.map((piece) => piece.id));
    if (!targetIds.size) return;
    if (record) commit(pieces);
    else markHistoryTransactionChanged();
    setPieces((items) => items.map((piece) => targetIds.has(piece.id)
      ? { ...piece, border: normalizePhotoBorder(next(normalizePhotoBorder(piece.border))) }
      : piece));
  };

  const setSelectedPiecesLocked = (locked: boolean) => {
    const targetIds = new Set(selectedPlacedPieces.map((piece) => piece.id));
    if (!targetIds.size || [...targetIds].every((id) => pieces.find((piece) => piece.id === id)?.locked === locked)) return;
    commit(pieces);
    setPieces((items) => items.map((piece) => targetIds.has(piece.id) ? { ...piece, locked } : piece));
    toast(`${targetIds.size} selected ${targetIds.size === 1 ? 'item' : 'items'} ${locked ? 'locked in position' : 'unlocked'}.`);
  };

  const groupSelectedForPrint = () => {
    const members = orderedPlacedPieces.filter((piece) => selectedSet.has(piece.id));
    if (members.length < 2 || members.length !== selectedPieces.length) {
      toast('Select at least two items already placed on the wall to print them together.');
      return;
    }
    const allocation = allocatePrintGroupIdentity(identityRef.current);
    const replacedGroupIds = new Set(groupIdsForMembers(printGroups, members.map(({ id }) => id)));
    const retainedGroups = removeMembersFromPrintGroups(printGroups, members.map(({ id }) => id));
    const group: PrintGroup = { ...allocation.identity, memberIds: members.map(({ id }) => id) };
    const clearedIds = new Set([...members.map(({ id }) => id), ...replacedGroupIds]);
    const nextOverrides = Object.fromEntries(Object.entries(printOverrides).filter(([id]) => !clearedIds.has(id)));
    const nextRotations = Object.fromEntries(Object.entries(printRotationOverrides).filter(([id]) => !clearedIds.has(id))) as Record<string, PrintRotationOverride>;
    commit(pieces);
    adoptIdentity(allocation.registry);
    setPrintGroups([...retainedGroups, group]);
    setPrintOverrides(nextOverrides);
    setPrintRotationOverrides(nextRotations);
    setPrintSelectedId(group.id);
    setPrintPage(0);
    toast(`${group.code} created. ${members.length} wall items now move as one AI unit and print as one piece.`);
  };

  const ungroupSelectedForPrint = () => {
    const groupIds = new Set(selectedPrintGroupIds);
    if (!groupIds.size) {
      toast('None of the selected items belongs to a Print Pack group.');
      return;
    }
    const nextGroups = printGroups.filter((group) => !groupIds.has(group.id));
    const nextOverrides = Object.fromEntries(Object.entries(printOverrides).filter(([id]) => !groupIds.has(id)));
    const nextRotations = Object.fromEntries(Object.entries(printRotationOverrides).filter(([id]) => !groupIds.has(id))) as Record<string, PrintRotationOverride>;
    commit(pieces);
    setPrintGroups(nextGroups);
    setPrintOverrides(nextOverrides);
    setPrintRotationOverrides(nextRotations);
    setPrintSelectedId(selectedPieces.find((piece) => piece.placed)?.id ?? '');
    setPrintPage(0);
    toast(`${groupIds.size} ${groupIds.size === 1 ? 'group' : 'groups'} separated. Wall positions did not change.`);
  };

  const setCropDraft = (update: Partial<PhotoCrop> | ((crop: PhotoCrop) => PhotoCrop)) => {
    setCropSession((session) => {
      if (!session) return session;
      const next = typeof update === 'function' ? update(session.draft) : { ...session.draft, ...update };
      return { ...session, draft: normalizePhotoCrop(next) };
    });
  };

  const finishCrop = () => {
    if (!cropSession) return;
    const piece = pieces.find((item) => item.id === cropSession.pieceId);
    if (!piece) {
      cropLoadTokenRef.current += 1;
      setMobileTool(endMobileCrop({ returnTool: cropSession.returnMobileTool }));
      setCropSession(null);
      return;
    }
    const nextCrop = normalizePhotoCrop(cropSession.draft);
    if (JSON.stringify(nextCrop) !== JSON.stringify(normalizePhotoCrop(piece.crop))) {
      commit(pieces);
      setPieces((items) => items.map((item) => item.id === piece.id ? { ...item, crop: nextCrop } : item));
      toast(`${piece.code} crop saved. One Undo restores the previous crop.`);
    } else {
      toast('Crop closed with no changes.');
    }
    cropPanRef.current = null;
    cropLoadTokenRef.current += 1;
    setMobileTool(endMobileCrop({ returnTool: cropSession.returnMobileTool }));
    setCropSession(null);
  };

  const cancelCrop = () => {
    if (!cropSession) return;
    cropPanRef.current = null;
    cropLoadTokenRef.current += 1;
    setMobileTool(endMobileCrop({ returnTool: cropSession.returnMobileTool }));
    setCropSession(null);
    toast('Crop changes cancelled.');
  };

  const chooseCropPreset = (preset: 'fill' | 'fit' | 'original') => {
    if (preset === 'original') {
      setCropDraft({ mode: 'fit', zoom: 1, offsetX: 0, offsetY: 0, quarterTurns: 0, flipX: false, flipY: false });
      return;
    }
    setCropDraft((crop) => ({ ...crop, mode: preset, zoom: 1, offsetX: 0, offsetY: 0 }));
  };

  const beginCropPan = (event: React.PointerEvent, piece: Piece) => {
    if (!cropSession || cropSession.pieceId !== piece.id || event.button !== 0) return;
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: { ...cropSession.draft },
      frameWidth: piece.w / 100 * stageRect.width,
      frameHeight: piece.h / 100 * stageRect.height,
      rotation: piece.rotation,
      naturalWidth: cropSession.naturalWidth,
      naturalHeight: cropSession.naturalHeight,
    };
  };

  const moveCropPan = (event: React.PointerEvent) => {
    const pan = cropPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const radians = pan.rotation * Math.PI / 180;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
    const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
    const geometry = imageFrameGeometry(pan.naturalWidth, pan.naturalHeight, pan.frameWidth, pan.frameHeight, pan.startCrop);
    setCropDraft({
      offsetX: geometry.maxOffsetX > 0 ? clamp(pan.startCrop.offsetX + localX / geometry.maxOffsetX, -1, 1) : 0,
      offsetY: geometry.maxOffsetY > 0 ? clamp(pan.startCrop.offsetY + localY / geometry.maxOffsetY, -1, 1) : 0,
    });
    return true;
  };

  const endCropPan = (event?: React.PointerEvent) => {
    if (!cropPanRef.current || (event && cropPanRef.current.pointerId !== event.pointerId)) return false;
    cropPanRef.current = null;
    return true;
  };

  const zoomCropWithWheel = (event: React.WheelEvent, piece: Piece) => {
    if (!cropSession || cropSession.pieceId !== piece.id) return;
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    setCropDraft((crop) => ({ ...crop, zoom: clamp(crop.zoom * factor, 1, 4) }));
  };

  const snapPosition = (piece: Piece, rawX: number, rawY: number, rect: DOMRect, bypass = false, ignoredIds = new Set([piece.id])) => {
    const unclippedX = clamp(rawX, 0, 100 - piece.w);
    const unclippedY = clamp(rawY, 0, 100 - piece.h);
    if (bypass) return { x: unclippedX, y: unclippedY, guides: [] as SmartGuide[] };

    const thresholdX = 6 / Math.max(1, rect.width) * 100;
    const thresholdY = 6 / Math.max(1, rect.height) * 100;
    type Candidate = { target: number; position: number; label: string; distance: number };
    let bestX: Candidate | null = null;
    let bestY: Candidate | null = null;
    const considerX = (target: number, position: number, label: string) => {
      const distance = Math.abs(unclippedX - target);
      if (distance <= thresholdX && (!bestX || distance < bestX.distance)) bestX = { target, position, label, distance };
    };
    const considerY = (target: number, position: number, label: string) => {
      const distance = Math.abs(unclippedY - target);
      if (distance <= thresholdY && (!bestY || distance < bestY.distance)) bestY = { target, position, label, distance };
    };

    considerX(0, 0, 'Wall edge');
    considerX(50 - piece.w / 2, 50, 'Wall centre');
    considerX(100 - piece.w, 100, 'Wall edge');
    considerY(0, 0, 'Wall edge');
    considerY(50 - piece.h / 2, 50, 'Wall middle');
    considerY(100 - piece.h, 100, 'Wall edge');

    pieces.filter((other) => other.placed && !ignoredIds.has(other.id)).forEach((other) => {
      considerX(other.x, other.x, 'Left edges');
      considerX(other.x + other.w / 2 - piece.w / 2, other.x + other.w / 2, 'Centres');
      considerX(other.x + other.w - piece.w, other.x + other.w, 'Right edges');
      considerX(other.x + other.w, other.x + other.w, 'Edges meet');
      considerX(other.x - piece.w, other.x, 'Edges meet');
      considerY(other.y, other.y, 'Top edges');
      considerY(other.y + other.h / 2 - piece.h / 2, other.y + other.h / 2, 'Middles');
      considerY(other.y + other.h - piece.h, other.y + other.h, 'Same baseline');
      considerY(other.y + other.h, other.y + other.h, 'Edges meet');
      considerY(other.y - piece.h, other.y, 'Edges meet');
    });

    const resolvedX = bestX as Candidate | null;
    const resolvedY = bestY as Candidate | null;
    const nextGuides: SmartGuide[] = [];
    if (resolvedX) nextGuides.push({ axis: 'x', position: resolvedX.position, label: resolvedX.label });
    if (resolvedY) nextGuides.push({ axis: 'y', position: resolvedY.position, label: resolvedY.label });
    return {
      x: clamp(resolvedX ? resolvedX.target : unclippedX, 0, 100 - piece.w),
      y: clamp(resolvedY ? resolvedY.target : unclippedY, 0, 100 - piece.h),
      guides: nextGuides,
    };
  };

  const beginDrag = (event: React.PointerEvent, piece: Piece, mode: DragState['mode'] = 'move') => {
    if (event.button !== 0) return;
    if (cropSession) {
      if (cropSession.pieceId === piece.id && mode === 'move') beginCropPan(event, piece);
      return;
    }
    stageRef.current?.focus({ preventScroll: true });
    const additiveSelection = mode === 'move' && (event.shiftKey || event.metaKey || event.ctrlKey);
    if (additiveSelection) {
      event.preventDefault();
      event.stopPropagation();
      togglePieceSelection(piece);
      suppressWallClickRef.current = true;
      window.setTimeout(() => { suppressWallClickRef.current = false; }, 0);
      return;
    }
    if (mode === 'move' && multiSelectMode && !selectedSet.has(piece.id)) return;
    if (piece.locked) {
      toast(`${piece.code} is locked. Unlock it in Inspect to move it.`);
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const groupOriginals = mode === 'move' && selectedSet.has(piece.id) && selectedIds.length > 1
      ? pieces.filter((item) => selectedSet.has(item.id) && item.placed && !item.locked).map((item) => ({ ...item }))
      : [{ ...piece }];
    dragRef.current = { id: piece.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, original: { ...piece }, before: copyPieces(pieces), rect, mode, latest: { ...piece }, groupOriginals, latestGroup: groupOriginals, changed: false };
    setDraggingId(piece.id);
    if (!selectedSet.has(piece.id)) choosePiece(piece);
    else setPanelMode('inspect');
  };

  const dragMove = (event: React.PointerEvent) => {
    if (moveCropPan(event)) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = ((event.clientX - drag.startX) / drag.rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / drag.rect.height) * 100;
    const active = pieces.find((piece) => piece.id === drag.id);
    if (!active) return;
    if (drag.mode !== 'move') {
      setGuides([]);
      const handle = drag.mode.replace('resize-', '') as ResizeHandle;
      const isEdgeHandle = handle.length === 1;
      const signX = handle.endsWith('e') ? 1 : -1;
      const signY = handle.startsWith('s') ? 1 : -1;
      const widthPx = drag.original.w / 100 * drag.rect.width;
      const heightPx = drag.original.h / 100 * drag.rect.height;
      const radians = drag.original.rotation * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const rotateVector = (x: number, y: number) => ({ x: x * cos - y * sin, y: x * sin + y * cos });
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      const localDeltaX = deltaX * cos + deltaY * sin;
      const localDeltaY = -deltaX * sin + deltaY * cos;
      const centreX = (drag.original.x + drag.original.w / 2) / 100 * drag.rect.width;
      const centreY = (drag.original.y + drag.original.h / 2) / 100 * drag.rect.height;

      if (isEdgeHandle) {
        const horizontal = handle === 'e' || handle === 'w';
        const edgeSign = handle === 'e' || handle === 's' ? 1 : -1;
        const minimumWidthPx = drag.rect.width * .04;
        const minimumHeightPx = drag.rect.height * .05;
        const nextWidthPx = horizontal ? clamp(widthPx + edgeSign * localDeltaX, minimumWidthPx, drag.rect.width) : widthPx;
        const nextHeightPx = horizontal ? heightPx : clamp(heightPx + edgeSign * localDeltaY, minimumHeightPx, drag.rect.height);
        const oppositeFromCentre = horizontal
          ? rotateVector(-edgeSign * widthPx / 2, 0)
          : rotateVector(0, -edgeSign * heightPx / 2);
        const fixedOpposite = { x: centreX + oppositeFromCentre.x, y: centreY + oppositeFromCentre.y };
        const centreFromOpposite = horizontal
          ? rotateVector(edgeSign * nextWidthPx / 2, 0)
          : rotateVector(0, edgeSign * nextHeightPx / 2);
        const nextCentre = { x: fixedOpposite.x + centreFromOpposite.x, y: fixedOpposite.y + centreFromOpposite.y };
        const w = nextWidthPx / drag.rect.width * 100;
        const h = nextHeightPx / drag.rect.height * 100;
        const x = (nextCentre.x - nextWidthPx / 2) / drag.rect.width * 100;
        const y = (nextCentre.y - nextHeightPx / 2) / drag.rect.height * 100;
        drag.latest = syncPhysicalFromCanvas({ ...active, x, y, w, h }, wall);
        drag.latestGroup = [drag.latest];
        drag.changed = x !== drag.original.x || y !== drag.original.y || w !== drag.original.w || h !== drag.original.h;
        setPieces((items) => items.map((piece) => piece.id === drag.id ? syncPhysicalFromCanvas({ ...piece, x, y, w, h, sizeMode: 'custom' }, wall) : piece));
        return;
      }

      const diagonal = rotateVector(signX * widthPx, signY * heightPx);
      const projection = (deltaX * diagonal.x + deltaY * diagonal.y) / Math.max(1, diagonal.x ** 2 + diagonal.y ** 2);
      const minimumScale = Math.max(4 / drag.original.w, 5 / drag.original.h);
      const maximumScale = Math.min(100 / drag.original.w, 100 / drag.original.h);
      const scale = clamp(1 + projection, Math.min(minimumScale, maximumScale), maximumScale);
      const nextWidthPx = widthPx * scale;
      const nextHeightPx = heightPx * scale;

      const oppositeFromCentre = rotateVector(-signX * widthPx / 2, -signY * heightPx / 2);
      const fixedOpposite = { x: centreX + oppositeFromCentre.x, y: centreY + oppositeFromCentre.y };
      const centreFromOpposite = rotateVector(signX * nextWidthPx / 2, signY * nextHeightPx / 2);
      const nextCentre = { x: fixedOpposite.x + centreFromOpposite.x, y: fixedOpposite.y + centreFromOpposite.y };
      const w = drag.original.w * scale;
      const h = drag.original.h * scale;
      const x = clamp((nextCentre.x - nextWidthPx / 2) / drag.rect.width * 100, 0, 100 - w);
      const y = clamp((nextCentre.y - nextHeightPx / 2) / drag.rect.height * 100, 0, 100 - h);
      drag.latest = syncPhysicalFromCanvas({ ...active, x, y, w, h }, wall);
      drag.latestGroup = [drag.latest];
      drag.changed = x !== drag.original.x || y !== drag.original.y || w !== drag.original.w || h !== drag.original.h;
      setPieces((items) => items.map((piece) => piece.id === drag.id ? syncPhysicalFromCanvas({ ...piece, x, y, w, h, sizeMode: 'custom' }, wall) : piece));
      return;
    }
    const groupIds = new Set(drag.groupOriginals.map((piece) => piece.id));
    const minX = Math.min(...drag.groupOriginals.map((piece) => piece.x));
    const minY = Math.min(...drag.groupOriginals.map((piece) => piece.y));
    const maxRight = Math.max(...drag.groupOriginals.map((piece) => piece.x + piece.w));
    const maxBottom = Math.max(...drag.groupOriginals.map((piece) => piece.y + piece.h));
    const groupProxy = { ...active, id: '__selection__', x: minX, y: minY, w: maxRight - minX, h: maxBottom - minY };
    const snapped = snapPosition(groupProxy, minX + dx, minY + dy, drag.rect, event.altKey, groupIds);
    const groupDx = clamp(snapped.x - minX, -minX, 100 - maxRight);
    const groupDy = clamp(snapped.y - minY, -minY, 100 - maxBottom);
    drag.latestGroup = drag.groupOriginals.map((piece) => ({ ...piece, x: piece.x + groupDx, y: piece.y + groupDy }));
    drag.latest = drag.latestGroup.find((piece) => piece.id === drag.id) ?? { ...active, x: drag.original.x + groupDx, y: drag.original.y + groupDy };
    drag.changed = groupDx !== 0 || groupDy !== 0;
    setGuides(snapped.guides);
    const moved = new Map(drag.latestGroup.map((piece) => [piece.id, piece]));
    setPieces((items) => items.map((piece) => moved.get(piece.id) ?? piece));
  };

  const endDrag = (event?: React.PointerEvent) => {
    if (endCropPan(event)) return;
    const drag = dragRef.current;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    if (drag.changed) commit(drag.before);
    const movedIds = new Set(drag.latestGroup.map((piece) => piece.id));
    const hit = drag.changed && drag.latestGroup.some((moved) => drag.before.some((piece) => piece.placed && !movedIds.has(piece.id) && overlaps(moved, piece, wall)));
    if (hit) {
      toast(`${drag.latestGroup.length > 1 ? 'The selected group overlaps' : `${codeForId(drag.id)} overlaps`} another photo — kept exactly where you placed it.`);
    } else if (drag.changed && drag.latestGroup.length > 1) {
      toast(`${drag.latestGroup.length} selected photos moved together.`);
    }
    if (drag.changed) {
      suppressWallClickRef.current = true;
      window.setTimeout(() => { suppressWallClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    setDraggingId('');
    setGuides([]);
  };

  const cancelDrag = (event: React.PointerEvent) => {
    if (endCropPan(event)) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.changed) setPieces(drag.before);
    dragRef.current = null;
    setDraggingId('');
    setGuides([]);
  };

  const beginTrayDrag = (event: React.PointerEvent<HTMLButtonElement>, piece: Piece) => {
    if (event.button !== 0) return;
    if (piece.locked) {
      toast(`${piece.code} is locked. Unlock it before repositioning.`);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const previewBounds = event.currentTarget.querySelector('.piece-image')?.getBoundingClientRect() ?? bounds;
    if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture(event.pointerId);
    trayDragRef.current = {
      id: piece.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      gripX: clamp((event.clientX - previewBounds.left) / previewBounds.width, 0, 1),
      gripY: clamp((event.clientY - previewBounds.top) / previewBounds.height, 0, 1),
      before: copyPieces(pieces),
      original: { ...piece },
      active: false,
      latestX: piece.x,
      latestY: piece.y,
      insideWall: false,
    };
  };

  const moveTrayDrag = (event: React.PointerEvent) => {
    const drag = trayDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.active && distance < 7) return;
    if (!drag.active) {
      drag.active = true;
      suppressTrayClickRef.current = true;
      setDraggingId(drag.id);
    }
    event.preventDefault();

    const portrait = drag.original.h >= drag.original.w;
    const ghostW = portrait ? 66 : 92;
    const ghostH = portrait ? 92 : 66;
    setTrayDragGhost({ id: drag.id, src: drag.original.src, x: event.clientX - ghostW * drag.gripX, y: event.clientY - ghostH * drag.gripY, w: ghostW, h: ghostH });

    const rect = stageRef.current?.getBoundingClientRect();
    const inside = Boolean(rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
    drag.insideWall = inside;
    setStageDropActive(inside);
    if (!rect || !inside) {
      setTrayDropPreview(null);
      setGuides([]);
      return;
    }

    const rawX = (event.clientX - rect.left) / rect.width * 100 - drag.gripX * drag.original.w;
    const rawY = (event.clientY - rect.top) / rect.height * 100 - drag.gripY * drag.original.h;
    const snapped = snapPosition(drag.original, rawX, rawY, rect, event.altKey);
    drag.latestX = snapped.x;
    drag.latestY = snapped.y;
    setGuides(snapped.guides);
    setTrayDropPreview({ ...drag.original, x: snapped.x, y: snapped.y, placed: true });
  };

  const endTrayDrag = (event: React.PointerEvent) => {
    const drag = trayDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active && drag.insideWall) {
      const dropped = { ...drag.original, x: drag.latestX, y: drag.latestY, placed: true };
      commit(drag.before);
      setPieces((items) => {
        const maxZ = items.reduce((highest, item, index) => Math.max(highest, pieceZ(item, index)), -1);
        return items.map((piece) => piece.id === drag.id ? {
          ...piece,
          x: drag.latestX,
          y: drag.latestY,
          placed: true,
          zIndex: piece.placed ? pieceZ(piece, items.indexOf(piece)) : maxZ + 1,
        } : piece);
      });
      selectOnly(drag.id);
      setPanelMode('inspect');
      const hit = drag.before.find((piece) => piece.placed && piece.id !== drag.id && overlaps(dropped, piece, wall));
      toast(hit ? `${codeForId(drag.id)} overlaps ${hit.code} — kept exactly where you dropped it.` : `${codeForId(drag.id)} placed at your drop point.`);
    } else if (drag.active) {
      toast('Drop cancelled — the photo stayed in the tray.');
    }
    trayDragRef.current = null;
    setTrayDragGhost(null);
    setTrayDropPreview(null);
    setStageDropActive(false);
    setDraggingId('');
    setGuides([]);
    window.setTimeout(() => { suppressTrayClickRef.current = false; }, 0);
  };

  const cancelTrayDrag = (event: React.PointerEvent) => {
    if (trayDragRef.current?.pointerId !== event.pointerId) return;
    trayDragRef.current = null;
    setTrayDragGhost(null);
    setTrayDropPreview(null);
    setStageDropActive(false);
    setDraggingId('');
    setGuides([]);
    window.setTimeout(() => { suppressTrayClickRef.current = false; }, 0);
  };

  const togglePiecePlacement = (piece: Piece) => {
    if (piece.placed && piece.locked) {
      toast(`${piece.code} is locked. Unlock it before removing it from the wall.`);
      return;
    }
    commit(pieces);
    const maxZ = pieces.reduce((highest, item, index) => Math.max(highest, pieceZ(item, index)), -1);
    const nextPieces = pieces.map((item) => item.id === piece.id ? { ...item, placed: !item.placed, zIndex: item.placed ? item.zIndex : maxZ + 1 } : item);
    const nextGroups = piece.placed ? removeMembersFromPrintGroups(printGroups, [piece.id]) : printGroups;
    const dissolved = new Set(printGroups.filter((group) => !nextGroups.some(({ id }) => id === group.id)).map(({ id }) => id));
    const nextOverrides = Object.fromEntries(Object.entries(printOverrides).filter(([id]) => !dissolved.has(id)));
    const nextRotations = Object.fromEntries(Object.entries(printRotationOverrides).filter(([id]) => !dissolved.has(id))) as Record<string, PrintRotationOverride>;
    setPieces(nextPieces);
    setPrintGroups(nextGroups);
    setPrintOverrides(nextOverrides);
    setPrintRotationOverrides(nextRotations);
    const nextContents = buildPrintContents(nextPieces.filter(({ placed }) => placed), nextGroups, wall);
    if (!nextContents.some(({ id }) => id === printSelectedId)) setPrintSelectedId(nextContents[0]?.id ?? '');
    toast(piece.placed ? `${piece.code} removed from the wall and kept in Your Pieces.` : `${piece.code} placed on the wall. Drag it for exact positioning.`);
  };

  const removeSelectedFromWall = () => {
    if (cropSession) {
      toast('Finish or cancel the crop before removing photos from the wall.');
      return;
    }
    if (!wallRemovalTargets.length) {
      toast(wallRemovalLockedCount ? 'Every selected wall photo is locked. Unlock one before removing it from the wall.' : 'No selected photos are currently on the wall.');
      return;
    }
    const targetIds = new Set(wallRemovalTargets.map((piece) => piece.id));
    const nextPieces = pieces.map((piece) => targetIds.has(piece.id) ? { ...piece, placed: false } : piece);
    const nextGroups = removeMembersFromPrintGroups(printGroups, targetIds);
    const dissolved = new Set(printGroups.filter((group) => !nextGroups.some(({ id }) => id === group.id)).map(({ id }) => id));
    const nextOverrides = Object.fromEntries(Object.entries(printOverrides).filter(([id]) => !dissolved.has(id)));
    const nextRotations = Object.fromEntries(Object.entries(printRotationOverrides).filter(([id]) => !dissolved.has(id))) as Record<string, PrintRotationOverride>;
    const retainedSelection = selectedIds.filter((id) => !targetIds.has(id));
    const nextContents = buildPrintContents(nextPieces.filter(({ placed }) => placed), nextGroups, wall);
    const nextPrintSelected = nextContents.find(({ id }) => id === printSelectedId)?.id ?? nextContents[0]?.id ?? '';
    commit(pieces);
    setPieces(nextPieces);
    setPrintGroups(nextGroups);
    setPrintOverrides(nextOverrides);
    setPrintRotationOverrides(nextRotations);
    setSelectedIds(retainedSelection);
    setPrintSelectedId(nextPrintSelected);
    setPrintPage(0);
    setPanelMode(retainedSelection.length ? 'inspect' : 'assistant');
    toast(`${targetIds.size} ${targetIds.size === 1 ? 'photo' : 'photos'} removed from the wall and kept in Your Pieces${wallRemovalLockedCount ? ` · ${wallRemovalLockedCount} locked skipped` : ''}. One Undo restores the wall.`);
  };

  const applyLayerOrder = (bottomToTop: string[], message: string) => {
    commit(pieces);
    const order = new Map(bottomToTop.map((id, index) => [id, index + 1]));
    setPieces((items) => items.map((piece) => order.has(piece.id) ? { ...piece, zIndex: order.get(piece.id) } : piece));
    toast(message);
  };

  const moveLayer = (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => {
    const order = orderedPlacedPieces.map((piece) => piece.id);
    const index = order.indexOf(id);
    if (index < 0) return;
    const next = [...order];
    next.splice(index, 1);
    const target = direction === 'front' ? next.length
      : direction === 'back' ? 0
        : direction === 'forward' ? Math.min(next.length, index + 1)
          : Math.max(0, index - 1);
    next.splice(target, 0, id);
    applyLayerOrder(next, `${codeForId(id)} moved ${direction === 'front' ? 'to the front' : direction === 'back' ? 'to the back' : direction}.`);
  };

  const dropLayerAbove = (targetId: string) => {
    const movingId = layerDragRef.current;
    layerDragRef.current = null;
    if (!movingId || movingId === targetId) return;
    const order = orderedPlacedPieces.map((piece) => piece.id).filter((id) => id !== movingId);
    const targetIndex = order.indexOf(targetId);
    if (targetIndex < 0) return;
    order.splice(targetIndex + 1, 0, movingId);
    applyLayerOrder(order, `${codeForId(movingId)} moved above ${codeForId(targetId)}.`);
  };

  const alignSelected = (alignment: 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!selected?.placed || selected.locked) {
      if (selected?.locked) toast(`${selected.code} is locked. Unlock it before aligning.`);
      return;
    }
    const patch = alignment === 'left' ? { x: 0 }
      : alignment === 'centre' ? { x: 50 - selected.w / 2 }
        : alignment === 'right' ? { x: 100 - selected.w }
          : alignment === 'top' ? { y: 0 }
            : alignment === 'middle' ? { y: 50 - selected.h / 2 }
              : { y: 100 - selected.h };
    updatePiece(selected.id, patch);
    toast(`${selected.code} aligned ${alignment}.`);
  };

  const applyTemplate = (nextLayout: LayoutName) => {
    if (cropSession) {
      toast('Finish or cancel the crop before changing the composition.');
      return;
    }
    commit(pieces);
    setLayout(nextLayout);
    setPieces(applyLayout(pieces, nextLayout, wall, density, groupStrength, printGroups));
    setCandidateOpen(false);
    toast(`${layouts.find((item) => item.id === nextLayout)?.name} rearranged positions. Every photo size stayed unchanged.`);
  };

  const addSingleAsset = (asset: PendingAsset) => {
    const { widthCm, heightCm } = photoDimensions(asset, posterPreset);
    const allocation = allocatePhotoIdentities(identityRef.current, 1);
    const { id, code } = allocation.identities[0];
    const piece: Piece = {
      id,
      code,
      name: asset.name.replace(/\.[^.]+$/, ''),
      src: asset.src,
      sourceName: asset.name,
      widthCm,
      heightCm,
      pixelW: asset.pixelW,
      pixelH: asset.pixelH,
      sizeMode: posterPreset === 'Original' ? 'original' : 'paper',
      x: 8,
      y: 8,
      w: widthCm / wall.widthCm * 100,
      h: heightCm / wall.heightCm * 100,
      rotation: 0,
      placed: false,
      locked: false,
      category: 'Unsorted',
      tone: TONES[pieces.length % TONES.length],
      color: COLORS[pieces.length % COLORS.length],
      crop: { ...DEFAULT_PHOTO_CROP },
    };
    if (!projectWithinLimits([...pieces, piece])) return;
    commit(pieces);
    adoptIdentity(allocation.registry);
    setPieces((items) => [...items, piece]);
    selectOnly(id);
    setPanelMode('inspect');
    setImportOpen(false);
    setPendingAsset(null);
    toast(`${asset.name} added with ${posterPreset === 'Original' ? 'its original proportions' : `${posterPreset} dimensions`}.`);
  };

  const importFiles = async (files: File[]) => {
    const valid = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 100 * 1024 * 1024);
    if (!valid.length) {
      toast('Use JPG, PNG or WebP images under 100 MB.');
      return;
    }
    if (valid.length > 1 && pieces.length + valid.length > MAX_PROJECT_PIECES) {
      toast(`Only ${(MAX_PROJECT_PIECES - pieces.length).toLocaleString()} more photos fit in this project. Import a smaller group.`);
      return;
    }
    void checkStorageHeadroom(valid.reduce((total, file) => total + file.size, 0) * 1.4);
    try {
      setBusy('Reading your images…');
      const assets = await Promise.all(valid.map(readFile));
      if (assets.length === 1) {
        setPendingAsset(assets[0]);
        setImportOpen(true);
      } else {
        const before = copyPieces(pieces);
        const allocation = allocatePhotoIdentities(identityRef.current, assets.length);
        const added = assets.map((asset, index) => {
          const { widthCm, heightCm } = photoDimensions(asset, posterPreset);
          return {
            ...allocation.identities[index],
            name: asset.name.replace(/\.[^.]+$/, ''), src: asset.src, sourceName: asset.name,
            widthCm, heightCm, pixelW: asset.pixelW, pixelH: asset.pixelH,
            sizeMode: posterPreset === 'Original' ? 'original' : 'paper', x: 6, y: 6,
            w: widthCm / wall.widthCm * 100, h: heightCm / wall.heightCm * 100, rotation: 0,
            placed: false, locked: false, category: 'Unsorted', tone: TONES[index % TONES.length], color: COLORS[index % COLORS.length],
            crop: { ...DEFAULT_PHOTO_CROP },
          } satisfies Piece;
        });
        if (!projectWithinLimits([...pieces, ...added])) return;
        commit(before);
        adoptIdentity(allocation.registry);
        setPieces((items) => [...items, ...added]);
        toast(`${added.length} individual photos added to your tray.`);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'These images could not be imported.');
    } finally {
      setBusy('');
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const openCutter = () => {
    setImportOpen(false);
    setCutRegions([]);
    setSelectedCutId(null);
    setAiCutMeta({});
    setAiCutError('');
    setCutMode('grid');
    setCutPreviewMode('edit');
    setCutOpen(true);
  };

  const createCutRegionId = React.useCallback(() => {
    cutRegionCounterRef.current += 1;
    return `cut-${Date.now().toString(36)}-${cutRegionCounterRef.current.toString(36)}`;
  }, []);

  const gridRegions = React.useMemo<CutRegion[]>(() => Array.from({ length: rows * columns }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column / columns;
    const right = (column + 1) / columns;
    const top = row / rows;
    const bottom = (row + 1) / rows;
    return {
      id: `grid-${row}-${column}`,
      shape: 'rectangle',
      bounds: { x: left, y: top, w: right - left, h: bottom - top },
      source: 'auto-grid',
    };
  }), [rows, columns]);

  const fineTuneGrid = () => {
    const editable = gridRegions.map((region) => ({
      ...region,
      id: createCutRegionId(),
      bounds: { ...region.bounds },
      source: 'grid-edited',
    }));
    setCutRegions(editable);
    setAiCutMeta({});
    setSelectedCutId(editable[0]?.id ?? null);
    setCutMode('manual');
    toast('Grid copied into editable cuts. Resize, move, change shape, or delete any region.');
  };

  const updateCutRegions = React.useCallback((regions: CutRegion[]) => {
    const survivingIds = new Set(regions.map(({ id }) => id));
    setCutRegions(regions);
    setAiCutMeta((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => survivingIds.has(id)),
    ));
  }, []);

  const changeSelectedCutShape = (shape: CutShape) => {
    setActiveCutShape(shape);
    if (!selectedCutId) return;
    updateCutRegions(cutRegions.map((region) => region.id === selectedCutId
      ? {
          ...region,
          shape,
          ...(shape === 'polygon'
            ? { points: region.points ?? [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }
            : { points: undefined }),
        }
      : region));
  };

  const removeSelectedCut = () => {
    if (!selectedCutId) return;
    updateCutRegions(cutRegions.filter(({ id }) => id !== selectedCutId));
    setSelectedCutId(null);
  };

  const undoLastCutRegion = () => {
    const removed = cutRegions[cutRegions.length - 1];
    if (!removed) return;
    updateCutRegions(cutRegions.slice(0, -1));
    if (selectedCutId === removed.id) setSelectedCutId(null);
  };

  const runAiCutout = async () => {
    if (!pendingAsset || aiCutBusy) return;
    const brief = aiCutBrief.trim();
    if (!brief) {
      toast('Tell AI what separate photos or subjects it should find.');
      return;
    }
    setAiCutBusy(true);
    setAiCutError('');
    try {
      const imageDataUrl = await createAiCutoutPreview(pendingAsset);
      const response = await fetch('/api/ai-cutouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, brief, shapePreference: aiCutShapePreference }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : 'AI could not suggest cuts for this sheet.';
        throw new Error(message);
      }
      const decision = parseAiCutoutDecision(body);
      const metadata: CutoutMeta = {};
      const proposals = decision.regions.map((region) => {
        const id = createCutRegionId();
        metadata[id] = { label: region.label, confidence: region.confidence };
        return mapAiCutoutRegionToCutRegion(region, id);
      });
      setCutRegions(proposals);
      setAiCutMeta(metadata);
      setSelectedCutId(proposals[0]?.id ?? null);
      setCutMode('ai');
      setCutPreviewMode('result');
      toast(`AI found ${proposals.length} editable ${proposals.length === 1 ? 'region' : 'regions'}. Review every edge before creating cutouts.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI could not suggest cuts for this sheet.';
      setAiCutError(message);
      toast(message);
    } finally {
      setAiCutBusy(false);
    }
  };

  const createCutouts = async () => {
    if (!pendingAsset) return;
    const regions = cutMode === 'grid' ? gridRegions : cutRegions;
    if (!regions.length) {
      toast('Add or detect at least one cut region first.');
      return;
    }
    if (pieces.length + regions.length > MAX_PROJECT_PIECES) {
      toast(`This cut would exceed the ${MAX_PROJECT_PIECES.toLocaleString()}-photo project limit. Use fewer crop boxes or remove some pieces first.`);
      return;
    }
    try {
      setBusy(`Creating ${regions.length} cutouts…`);
      const cutouts = await cropAsset(pendingAsset, regions);
      const base = PAPER_SIZES[sheetPaper];
      const sourcePortrait = pendingAsset.pixelH >= pendingAsset.pixelW;
      const sourceW = sourcePortrait ? base[0] : base[1];
      const sourceH = sourcePortrait ? base[1] : base[0];
      const allocation = allocateSheetIdentities(identityRef.current, cutouts.length);
      const newPieces = cutouts.map((cutout, index) => {
        const widthCm = sourceW * cutout.pixelW / pendingAsset.pixelW;
        const heightCm = sourceH * cutout.pixelH / pendingAsset.pixelH;
        return {
          ...allocation.identities[index],
          name: `${pendingAsset.name.replace(/\.[^.]+$/, '')} · ${index + 1}`,
          src: cutout.src, sourceName: pendingAsset.name, widthCm, heightCm,
          pixelW: cutout.pixelW,
          pixelH: cutout.pixelH,
          x: 5, y: 5, w: widthCm / wall.widthCm * 100, h: heightCm / wall.heightCm * 100,
          rotation: 0, placed: false, locked: false, sizeMode: 'paper', category: 'Unsorted',
          tone: TONES[index % TONES.length], color: COLORS[index % COLORS.length],
          crop: { ...DEFAULT_PHOTO_CROP },
        } satisfies Piece;
      });
      if (!projectWithinLimits([...pieces, ...newPieces])) return;
      void checkStorageHeadroom(cutouts.reduce((total, cutout) => total + (cutout.src.startsWith('data:') ? cutout.src.length * 0.75 : 0), 0));
      commit(pieces);
      adoptIdentity(allocation.registry);
      setPieces((items) => [...items, ...newPieces]);
      setCutOpen(false);
      setPendingAsset(null);
      setCutRegions([]);
      setSelectedCutId(null);
      setAiCutMeta({});
      toast(`${newPieces.length} numbered cutouts created. Original sheet kept untouched.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The sheet could not be cut.');
    } finally {
      setBusy('');
    }
  };

  const runAssistant = async () => {
    if (cropSession) {
      toast('Finish or cancel the crop before arranging the wall.');
      return;
    }
    if (!prompt.trim()) {
      toast('Describe how you want the wall to feel first.');
      return;
    }
    const layoutUnits = buildLayoutUnits(pieces, printGroups, wall);
    if (layoutUnits.length > MAX_AI_UNITS) {
      toast(`AI can arrange up to ${MAX_AI_UNITS} rigid wall items at once. Group related items or remove some from the wall first.`);
      return;
    }
    if (!layoutUnits.some((unit) => unit.hasPhoto && !unit.locked)) {
      toast('Place at least one unlocked photo or group on the wall before asking AI to arrange it.');
      return;
    }
    const unitBindings = new Map<string, string>();
    const request: AiLayoutRequest = {
      version: 1,
      brief: prompt,
      wall: { widthCm: wall.widthCm, heightCm: wall.heightCm },
      density,
      groupStrength,
      units: layoutUnits.map((unit, index) => {
        const id = `u${index.toString(36)}`;
        unitBindings.set(id, unit.id);
        return {
          id,
          code: unit.code,
          name: unit.name,
          kind: unit.kind,
          memberCount: unit.memberIds.length,
          memberCodes: unit.memberCodes,
          movable: !unit.locked,
          footprintWidthCm: unit.proxy.widthCm,
          footprintHeightCm: unit.proxy.heightCm,
          footprintAreaCm2: unit.proxy.widthCm * unit.proxy.heightCm,
          x: Math.round(clamp(unit.proxy.x + unit.proxy.w / 2, 0, 100) / 100 * AI_COORDINATE_SCALE),
          y: Math.round(clamp(unit.proxy.y + unit.proxy.h / 2, 0, 100) / 100 * AI_COORDINATE_SCALE),
          categories: unit.categories,
          tones: unit.tones,
        };
      }),
    };
    setAiBusy(true);
    try {
      let decision;
      let usedLocalFallback = false;
      try {
        const response = await fetch('/api/ai-layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        const body = await response.json() as unknown;
        if (!response.ok) throw new Error(body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'The AI layout service is unavailable.');
        decision = parseAiLayoutDecision(body, request);
        setAiMode('openai');
      } catch (error) {
        usedLocalFallback = true;
        decision = localLayoutDecision(request);
        setAiMode('local');
        const reason = error instanceof Error ? error.message : 'The secure AI connection is unavailable.';
        decision = { ...decision, rationale: `${decision.rationale} ${reason}` };
      }
      const controlsChanged = latestAiControlsRef.current.prompt !== prompt
        || latestAiControlsRef.current.density !== density
        || latestAiControlsRef.current.groupStrength !== groupStrength;
      if (latestPiecesRef.current !== pieces || latestPrintGroupsRef.current !== printGroups || latestWallRef.current !== wall || controlsChanged) {
        setAiResponse('Your wall or brief changed while the suggestion was being prepared, so I left the newer edit untouched. Run the brief again when you are ready.');
        toast('AI suggestion paused because the wall or brief changed. Your newer edit was kept.');
        return;
      }
      const targets = decision.placements.flatMap((placement) => {
        const unitId = unitBindings.get(placement.id);
        return unitId ? [{
          unitId,
          centerXPercent: placement.x / AI_COORDINATE_SCALE * 100,
          centerYPercent: placement.y / AI_COORDINATE_SCALE * 100,
        }] : [];
      });
      const nextPieces = usedLocalFallback && decision.name === 'Keep current arrangement'
        ? pieces
        : applyCustomLayout(pieces, targets, wall, density, printGroups);
      const changed = nextPieces.some((piece, index) => piece.x !== pieces[index]?.x || piece.y !== pieces[index]?.y);
      if (changed) {
        commit(copyPieces(pieces));
        setPieces(nextPieces);
        setLayout('custom');
      }
      setAiResponse(`${decision.name}. ${decision.rationale}`);
      toast(usedLocalFallback
        ? changed ? 'Secure AI was unavailable, so Cutroom used its private geometric fallback.' : 'Secure AI was unavailable. Cutroom kept your current arrangement because it could not safely infer this shape locally.'
        : changed ? 'OpenAI created a custom measured composition from your brief.' : 'OpenAI kept the current positions for this brief.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The composition could not be completed.';
      setAiResponse(`Nothing moved. ${message}`);
      toast(message);
    } finally {
      setAiBusy(false);
    }
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const allocation = allocateCopyIdentity(identityRef.current, selected.code);
    const { id, code } = allocation.identity;
    const maxZ = pieces.reduce((highest, piece, index) => Math.max(highest, pieceZ(piece, index)), -1);
    const duplicate = {
      ...selected,
      crop: selected.crop ? { ...selected.crop } : undefined,
      border: selected.border ? { ...selected.border, edges: { ...selected.border.edges } } : undefined,
      text: selected.text ? cloneTextData(selected.text) : undefined,
      id,
      code,
      name: `${selected.name} copy`,
      x: clamp(selected.x + 3, 0, 100 - selected.w),
      y: clamp(selected.y + 3, 0, 100 - selected.h),
      locked: false,
      zIndex: maxZ + 1,
    };
    if (!projectWithinLimits([...pieces, duplicate])) return;
    void checkStorageHeadroom(selected.src.startsWith('data:') ? selected.src.length : 0);
    commit(pieces);
    adoptIdentity(allocation.registry);
    setPieces((items) => [...items, duplicate]);
    selectOnly(id);
    toast('Piece duplicated.');
  };

  const requestRemoveSelected = () => {
    if (cropSession) {
      toast('Finish or cancel the crop before removing photos.');
      return;
    }
    if (!selectedPieces.length) return;
    if (!removableSelected.length) {
      toast(`${selectedPieces.length === 1 ? selectedPieces[0].code : 'Every selected photo'} is locked. Unlock before deleting from the project.`);
      return;
    }
    setRemoveOpen(true);
  };

  const applyRemoveSelected = () => {
    const targetIds = new Set(removableSelected.map((piece) => piece.id));
    if (!targetIds.size) {
      setRemoveOpen(false);
      return;
    }
    const retained = pieces.filter((piece) => !targetIds.has(piece.id));
    const nextGroups = removeMembersFromPrintGroups(printGroups, targetIds);
    const dissolved = new Set(printGroups.filter((group) => !nextGroups.some(({ id }) => id === group.id)).map(({ id }) => id));
    const clearedIds = new Set([...targetIds, ...dissolved]);
    const nextOverrides = Object.fromEntries(Object.entries(printOverrides).filter(([id]) => !clearedIds.has(id)));
    const nextRotations = Object.fromEntries(Object.entries(printRotationOverrides).filter(([id]) => !clearedIds.has(id))) as Record<string, PrintRotationOverride>;
    const retainedSelection = selectedIds.filter((id) => !targetIds.has(id) && retained.some((piece) => piece.id === id));
    const nextContents = buildPrintContents(retained.filter(({ placed }) => placed), nextGroups, wall);
    const nextPrintSelected = nextContents.find(({ id }) => id === printSelectedId)?.id ?? nextContents[0]?.id ?? '';
    commit(pieces, printOverrides, printRotationOverrides);
    setPieces(retained);
    setPrintGroups(nextGroups);
    setPrintOverrides(nextOverrides);
    setPrintRotationOverrides(nextRotations);
    setSelectedIds(retainedSelection);
    setPrintSelectedId(nextPrintSelected);
    setPrintPage(0);
    setPanelMode(retainedSelection.length ? 'inspect' : 'assistant');
    setRemoveOpen(false);
    toast(`${targetIds.size} ${targetIds.size === 1 ? 'photo' : 'photos'} deleted from the project${removeLockedCount ? ` · ${removeLockedCount} locked skipped` : ''}. One Undo restores everything.`);
  };

  const shareProject = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'My Cutroom poster wall', text: 'See the poster wall I designed in Cutroom.', url: location.href });
      else {
        await navigator.clipboard.writeText(location.href);
        toast('Project link copied.');
      }
    } catch {
      toast('Share cancelled.');
    }
  };

  const downloadProjectDocument = (project: ProjectDocument, fileName = 'cutroom-project.json') => {
    const data = JSON.stringify(project);
    const bytes = new Blob([data]).size;
    if (bytes > MAX_BACKUP_BYTES) {
      toast(`This project is larger than the ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB safe restore limit. Remove or replace some large source images before downloading a portable backup.`);
      return false;
    }
    downloadBlob(data, 'application/json', fileName);
    return true;
  };

  const exportProject = () => {
    if (downloadProjectDocument(buildProjectDocument())) toast('Portable project file downloaded.');
  };

  const openBackupPicker = () => {
    setExportOpen(false);
    setPendingRestore(null);
    backupUploadRef.current?.click();
  };

  const closeRestore = () => {
    if (busy) return;
    setRestoreOpen(false);
    setPendingRestore(null);
  };

  const importProjectBackup = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast(`That backup is larger than ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB and cannot be safely opened in this tab.`);
      if (backupUploadRef.current) backupUploadRef.current.value = '';
      return;
    }
    try {
      setBusy('Checking project backup…');
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error('This file is not valid JSON. Choose a Cutroom project backup.');
      }
      const candidate = validateProjectDocument(parsed);
      await verifyProjectImages(candidate.project);
      await checkStorageHeadroom(Math.max(0, approximateProjectBytes(candidate.project) - approximateProjectBytes(buildProjectDocument())));
      setPendingRestore({ ...candidate, fileName: file.name, fileSize: file.size });
      setRestoreOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'This project backup could not be opened.');
    } finally {
      setBusy('');
      if (backupUploadRef.current) backupUploadRef.current.value = '';
    }
  };

  const replaceWithBackup = async () => {
    if (!pendingRestore) return;
    invalidatePendingAutosaves();
    setBusy('Restoring project safely…');
    const candidate = { ...pendingRestore.project, updatedAt: new Date().toISOString() };
    const saved = await queueProjectSave(candidate, true);
    if (!saved) {
      setBusy('');
      toast('The backup was not applied because it could not be saved locally. Your current project is unchanged.');
      return;
    }
    applyProjectDocument(candidate);
    setHydrated(true);
    publishStorageNotice(null);
    setRestoreOpen(false);
    setPendingRestore(null);
    setExportOpen(false);
    setBusy('');
    toast('Project backup restored and saved locally.');
  };

  const retryLocalSave = async () => {
    invalidatePendingAutosaves();
    setBusy('Retrying local save…');
    const saved = await queueProjectSave(buildProjectDocument(), true);
    if (saved) setHydrated(true);
    setBusy('');
    toast(saved ? 'Your latest work is saved locally again.' : 'Local save still needs attention. Download an emergency backup before reloading.');
  };

  const protectLocalProject = async () => {
    try {
      const persistent = await requestPersistentStorage();
      refreshStorageHealth();
      toast(persistent ? 'This browser granted stronger protection against automatic storage cleanup.' : 'The browser did not grant persistent storage. Backups remain the safest protection.');
    } catch {
      toast('Persistent storage is not available here. Project backups still work.');
    }
  };

  const downloadRawRecovery = () => {
    if (!storageNotice?.rawRecovery) return;
    downloadBlob(storageNotice.rawRecovery, 'application/json', 'cutroom-raw-recovery.json');
    toast('Untouched raw recovery data downloaded.');
  };

  const replaceCorruptLocalData = async () => {
    invalidatePendingAutosaves();
    setBusy('Replacing damaged local data…');
    const saved = await queueProjectSave(buildProjectDocument(), true);
    if (!saved) {
      setBusy('');
      toast('The open project could not replace the damaged local data. Download a backup before closing this tab.');
      return;
    }
    publishStorageNotice(null);
    setHydrated(true);
    setFreshStartOpen(false);
    setBusy('');
    toast('A fresh local project is now saved.');
  };

  const exportWallPng = async () => {
    try {
      setBusy('Rendering wall plan…');
      await waitForDocumentFonts();
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = Math.round(1800 * wall.heightCm / wall.widthCm);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      context.fillStyle = wall.color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = 'rgba(20,20,18,.14)';
      context.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += canvas.width / 20) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke(); }
      for (let y = 0; y < canvas.height; y += canvas.height / 12) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke(); }
      for (const piece of orderedPlacedPieces) {
        const x = piece.x / 100 * canvas.width;
        const y = piece.y / 100 * canvas.height;
        const w = piece.w / 100 * canvas.width;
        const h = piece.h / 100 * canvas.height;
        context.save();
        context.translate(x + w / 2, y + h / 2);
        context.rotate(piece.rotation * Math.PI / 180);
        if (piece.kind === 'text' && piece.text) {
          context.save();
          context.beginPath();
          context.rect(-w / 2, -h / 2, w, h);
          context.clip();
          drawTextFrame(context, piece.text, -w / 2, -h / 2, w, h, canvas.width / wall.widthCm);
          context.restore();
        } else {
          const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = piece.src; });
          drawImageFrame(context, image, image.naturalWidth, image.naturalHeight, -w / 2, -h / 2, w, h, piece.crop);
          drawCanvasPhotoBorder(context, -w / 2, -h / 2, w, h, canvas.width / wall.widthCm, piece.border);
        }
        context.fillStyle = '#111';
        context.font = 'bold 18px monospace';
        context.fillRect(-w / 2, h / 2 - 28, Math.min(w, 104), 28);
        context.fillStyle = '#fff';
        context.fillText(piece.code, -w / 2 + 7, h / 2 - 8);
        context.restore();
      }
      const blob = await canvasToBlob(canvas, 'image/png');
      downloadBlob(blob, 'image/png', 'cutroom-wall-plan.png');
      setExportOpen(false);
      toast('High-resolution wall plan downloaded.');
    } catch {
      toast('The wall plan could not be rendered.');
    } finally {
      setBusy('');
    }
  };

  const exportWallPdf = async () => {
    try {
      setBusy('Building installation PDF…');
      await waitForDocumentFonts();
      const {
        PDFDocument,
        StandardFonts,
        clip,
        endPath,
        popGraphicsState,
        pushGraphicsState,
        rectangle,
        rgb,
        rotateRadians,
        scale: scalePdf,
        translate,
      } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([841.89, 595.28]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      page.drawText('CUTROOM / INSTALLATION PLAN', { x: 36, y: 558, size: 16, font: bold, color: rgb(0.07, 0.07, 0.06) });
      page.drawText(`Wall ${measurementPairText(wall.widthCm, wall.heightCm, measurementUnit)} · ${placedCount} pieces · centre-out order`, { x: 36, y: 540, size: 9, font, color: rgb(0.35, 0.35, 0.32) });
      const maxW = 760;
      const maxH = 450;
      const scale = Math.min(maxW / wall.widthCm, maxH / wall.heightCm);
      const wallW = wall.widthCm * scale;
      const wallH = wall.heightCm * scale;
      const ox = (841.89 - wallW) / 2;
      const oy = 58;
      page.drawRectangle({ x: ox, y: oy, width: wallW, height: wallH, color: rgb(0.93, 0.91, 0.86), borderColor: rgb(0.07, 0.07, 0.06), borderWidth: 1 });
      const cache = new Map<string, PDFImage>();
      page.pushOperators(pushGraphicsState(), rectangle(ox, oy, wallW, wallH), clip(), endPath());
      for (const piece of orderedPlacedPieces) {
        const source = piece.kind === 'text' && piece.text ? renderTextDataUrl(piece.text, piece.widthCm, piece.heightCm) : piece.src;
        let image = cache.get(source);
        if (!image) { image = await embedSource(pdf, source); cache.set(source, image); }
        const x = ox + piece.x / 100 * wallW;
        const yTop = piece.y / 100 * wallH;
        const w = piece.w / 100 * wallW;
        const h = piece.h / 100 * wallH;
        const y = oy + wallH - yTop - h;
        const geometry = imageFrameGeometry(image.width, image.height, w, h, piece.kind === 'text' ? DEFAULT_PHOTO_CROP : piece.crop);
        page.pushOperators(pushGraphicsState(), translate(x + w / 2, y + h / 2), rotateRadians(-piece.rotation * Math.PI / 180));
        page.pushOperators(
          pushGraphicsState(),
          rectangle(-w / 2, -h / 2, w, h),
          clip(),
          endPath(),
          translate(-w / 2 + geometry.centerX, h / 2 - geometry.centerY),
          rotateRadians(-geometry.rotationDegrees * Math.PI / 180),
          scalePdf(geometry.flipX ? -1 : 1, geometry.flipY ? -1 : 1),
        );
        page.drawImage(image, { x: -geometry.drawWidth / 2, y: -geometry.drawHeight / 2, width: geometry.drawWidth, height: geometry.drawHeight });
        page.pushOperators(popGraphicsState());
        if (piece.kind !== 'text' && piece.border) {
          const channels = rgbChannels(piece.border.color);
          photoBorderRects(piece.widthCm, piece.heightCm, piece.border).forEach((rect) => page.drawRectangle({
            x: -w / 2 + rect.x / piece.widthCm * w,
            y: h / 2 - (rect.y + rect.height) / piece.heightCm * h,
            width: rect.width / piece.widthCm * w,
            height: rect.height / piece.heightCm * h,
            color: rgb(channels.red, channels.green, channels.blue),
          }));
        }
        page.drawRectangle({ x: -w / 2, y: -h / 2, width: Math.min(w, 38), height: 9, color: rgb(0.07, 0.07, 0.06) });
        page.drawText(piece.code, { x: -w / 2 + 2, y: -h / 2 + 2.3, size: 5.5, font: bold, color: rgb(1, 1, 1) });
        page.pushOperators(popGraphicsState());
      }
      page.pushOperators(popGraphicsState());
      page.drawText(`Measure from the wall edges and install locked/central pieces first. Displayed dimensions use ${measurementUnit === 'cm' ? 'centimetres' : 'inches'}.`, { x: 36, y: 28, size: 8, font, color: rgb(0.35, 0.35, 0.32) });
      const bytes = await pdf.save();
      downloadBlob(new Uint8Array(bytes).buffer, 'application/pdf', 'cutroom-installation-plan.pdf');
      setExportOpen(false);
      toast('Installation PDF downloaded.');
    } catch {
      toast('The PDF could not be built. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const applyPrintOverridesAndFollow = (nextOverrides: Record<string, PrintOverride>, followId?: string) => {
    setPrintOverrides(nextOverrides);
    if (!followId) {
      setPrintPage(0);
      return;
    }
    const nextItems = buildPrintItems(printContents, nextOverrides, printRotationOverrides);
    const nextPlan = packPrintItems(nextItems, sheetW, sheetH, printGap, printMargin, { allow90Rotation: autoRotatePrint });
    const nextPage = nextPlan.pages.findIndex((page) => page.placements.some((placement) => placement.pieceId === followId));
    setPrintPage(nextPage >= 0 ? nextPage : 0);
  };

  const changeGlobalPrintScale = (percent: number) => {
    if (!printContents.length) return;
    const nextPercent = clamp(percent, 25, 200);
    if (globalPrintScalePercent !== null && Math.abs(globalPrintScalePercent - nextPercent) < 0.001) return;
    beginHistoryTransaction();
    markHistoryTransactionChanged();
    setPrintOverrides(scaleAllPrintContents(printContents, nextPercent));
    setPrintPage(0);
  };

  const resetGlobalPrintScale = () => {
    if (!Object.keys(printOverrides).length) return;
    commit(pieces);
    setPrintOverrides({});
    setPrintPage(0);
    toast('Every Print Pack item is back at 100% of its wall size.');
  };

  const setPrintPieceRotation = (choice: PrintRotationChoice) => {
    if (!printSelectedContent) return;
    if (choice === printSelectedRotationChoice) return;
    const nextRotations = { ...printRotationOverrides };
    if (choice === 'auto') delete nextRotations[printSelectedContent.id];
    else nextRotations[printSelectedContent.id] = choice;
    commit(pieces);
    setPrintRotationOverrides(nextRotations);
    const nextItems = buildPrintItems(printContents, printOverrides, nextRotations);
    const nextPlan = packPrintItems(nextItems, sheetW, sheetH, printGap, printMargin, { allow90Rotation: autoRotatePrint });
    const nextPage = nextPlan.pages.findIndex((page) => page.placements.some((placement) => placement.pieceId === printSelectedContent.id));
    setPrintPage(nextPage >= 0 ? nextPage : 0);
    if (nextPlan.unplaced.some((item) => item.pieceId === printSelectedContent.id)) {
      toast(`${printSelectedContent.code} cannot fit this paper in that orientation. Choose Auto, another orientation, or a larger sheet.`);
      return;
    }
    toast(choice === 'auto'
      ? `${printSelectedContent.code} now lets Smart Rotation choose its sheet orientation.`
      : `${printSelectedContent.code} set to ${printRotationText(choice)} on print sheets. Its chosen size and crop are unchanged.`);
  };

  const changePrintPieceSize = (axis: 'width' | 'height', displayValue: number) => {
    if (!printSelectedContent || !printSelectedSize || !Number.isFinite(displayValue) || displayValue <= 0) return;
    const valueCm = fromDisplayUnit(displayValue, measurementUnit);
    const ratio = printSelectedSize.widthCm / Math.max(0.01, printSelectedSize.heightCm);
    const keepRatio = printAspectLocked || printSelectedContent.kind === 'group';
    const next = axis === 'width'
      ? { widthCm: valueCm, heightCm: keepRatio ? valueCm / ratio : printSelectedSize.heightCm }
      : { widthCm: keepRatio ? valueCm * ratio : printSelectedSize.widthCm, heightCm: valueCm };
    if (Math.abs(next.widthCm - printSelectedSize.widthCm) < 0.0001 && Math.abs(next.heightCm - printSelectedSize.heightCm) < 0.0001) return;
    beginHistoryTransaction();
    markHistoryTransactionChanged();
    applyPrintOverridesAndFollow({ ...printOverrides, [printSelectedContent.id]: next }, printSelectedContent.id);
  };

  const selectPrintPiece = (id: string) => {
    setPrintSelectedId(id);
    const pageIndex = printPlan.pages.findIndex((page) => page.placements.some((placement) => placement.pieceId === id));
    if (pageIndex >= 0) setPrintPage(pageIndex);
  };

  const openPrintPack = () => {
    const selectedGroup = selected?.placed ? printGroups.find((group) => group.memberIds.includes(selected.id)) : undefined;
    const preferredId = selectedGroup?.id ?? (selected?.placed ? selected.id : printSelectedContent?.id);
    if (preferredId) selectPrintPiece(preferredId);
    else setPrintPage(0);
    setView('print');
  };

  const setPrintPiecePreset = (widthCm: number, heightCm: number) => {
    if (!printSelectedContent) return;
    const landscape = printSelectedContent.widthCm > printSelectedContent.heightCm;
    const preset = landscape ? { widthCm: heightCm, heightCm: widthCm } : { widthCm, heightCm };
    const nextSize = printSelectedContent.kind === 'group'
      ? (() => {
        const scale = Math.min(
          preset.widthCm / Math.max(0.01, printSelectedContent.widthCm),
          preset.heightCm / Math.max(0.01, printSelectedContent.heightCm),
        );
        return { widthCm: printSelectedContent.widthCm * scale, heightCm: printSelectedContent.heightCm * scale };
      })()
      : preset;
    if (printSelectedSize && Math.abs(printSelectedSize.widthCm - nextSize.widthCm) < 0.0001 && Math.abs(printSelectedSize.heightCm - nextSize.heightCm) < 0.0001) return;
    commit(pieces);
    applyPrintOverridesAndFollow({
      ...printOverrides,
      [printSelectedContent.id]: nextSize,
    }, printSelectedContent.id);
  };

  const resetPrintPieceSize = () => {
    if (!printSelectedContent || !printSelectedHasOverride) return;
    const next = { ...printOverrides };
    delete next[printSelectedContent.id];
    commit(pieces);
    applyPrintOverridesAndFollow(next, printSelectedContent.id);
    toast(`${printSelectedContent.code} reset to its wall size.`);
  };

  const updateWallFromPrintSize = () => {
    if (!printSelectedContent || !printSelectedSize || !printSelectedHasOverride) return;
    if (printSelectedContent.kind === 'group') {
      toast('A print group scales only inside Print Pack so every wall member stays editable.');
      return;
    }
    updatePiece(printSelectedContent.id, { ...printSelectedSize, sizeMode: 'custom' });
    setPrintOverrides((items) => {
      const next = { ...items };
      delete next[printSelectedContent.id];
      return next;
    });
    toast(`${printSelectedContent.code} now uses this size on the wall and in Print Pack.`);
  };

  const resetAllPrintSizes = () => {
    if (!Object.keys(printOverrides).length) {
      toast('Every print already matches its wall size.');
      return;
    }
    commit(pieces);
    setPrintOverrides({});
    setPrintPage(0);
    toast('All print-only changes reset to the wall sizes.');
  };

  const applyBestFitToOversized = (contentIds?: string[]) => {
    const requested = contentIds ? new Set(contentIds) : null;
    const targets = oversizedPrintDetails.filter(({ content }) => !requested || requested.has(content.id));
    if (!targets.length) return;
    const nextOverrides = { ...printOverrides };
    const nextRotations = { ...printRotationOverrides };
    targets.forEach(({ content, recommendation }) => {
      nextOverrides[content.id] = { widthCm: recommendation.widthCm, heightCm: recommendation.heightCm };
      nextRotations[content.id] = recommendation.sheetRotation;
    });
    commit(pieces);
    setPrintOverrides(nextOverrides);
    setPrintRotationOverrides(nextRotations);
    setPrintSelectedId(targets[0].content.id);
    setPrintPage(0);
    toast(`${targets.length} oversized ${targets.length === 1 ? 'item was' : 'items were'} reduced proportionally to the largest safe fit.`);
  };

  const changePrintPaper = (paper: keyof typeof PAPER_SIZES | 'Custom') => {
    if (paper === printPaper) return;
    commit(pieces);
    setPrintPaper(paper);
    setPrintPage(0);
  };

  const togglePrintLandscape = () => {
    commit(pieces);
    setPrintLandscape((value) => !value);
    setPrintPage(0);
  };

  const changeAutoRotatePrint = (checked: boolean) => {
    if (checked === autoRotatePrint) return;
    commit(pieces);
    setAutoRotatePrint(checked);
    setPrintPage(0);
  };

  const changeCropMarks = (checked: boolean) => {
    if (checked === cropMarks) return;
    commit(pieces);
    setCropMarks(checked);
  };

  const printExportReady = () => {
    if (!printItems.length) {
      toast('Place at least one photo on the wall before creating a Print Pack.');
      return false;
    }
    if (printPlan.unplaced.length) {
      const ids = printPlan.unplaced.slice(0, 3).map((item) => codeForPrintId(item.pieceId)).join(', ');
      toast(`${ids}${printPlan.unplaced.length > 3 ? ` +${printPlan.unplaced.length - 3} more` : ''} cannot fit this paper at their chosen size and sheet orientation.`);
      return false;
    }
    return true;
  };

  const openPrintDownload = () => {
    if (!printExportReady()) return;
    setPrintDownloadOpen(true);
  };

  const choosePrintExportFormat = (format: PrintExportFormat) => {
    setPrintExportFormat(format);
    if (format !== 'pdf' && !rasterPageSpec(sheetW, sheetH, printDpi).supported) setPrintDpi(150);
  };

  const downloadPrintPdf = async () => {
    const snapshotPages = printPlan.pages.map((page) => ({ ...page, placements: page.placements.map((placement) => ({ ...placement })) }));
    const snapshotPieces = copyPieces(printablePlacedPieces);
    const snapshotContents = printContents.map((content) => ({
      ...content,
      memberIds: [...content.memberIds],
      members: content.members.map((member) => ({ ...member })),
    }));
    const snapshotSheetW = sheetW;
    const snapshotSheetH = sheetH;
    const snapshotCropMarks = cropMarks;
    const snapshotGap = printGap;
    const snapshotPaper = printPaper;
    try {
      setBusy(`Packing ${printItems.length} exact-size images into ${totalPrintPages} print sheets…`);
      await waitForDocumentFonts();
      const {
        PDFDocument,
        StandardFonts,
        clip,
        endPath,
        popGraphicsState,
        pushGraphicsState,
        rectangle,
        rgb,
        rotateRadians,
        scale: scalePdf,
        translate,
      } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const mm = (cm: number) => cm * 72 / 2.54;
      const cache = new Map<string, PDFImage>();
      const pieceById = new Map(snapshotPieces.map((piece) => [piece.id, piece]));
      const contentById = new Map(snapshotContents.map((content) => [content.id, content]));
      for (let pageIndex = 0; pageIndex < snapshotPages.length; pageIndex += 1) {
        const page = pdf.addPage([mm(snapshotSheetW), mm(snapshotSheetH)]);
        const packedPage = snapshotPages[pageIndex];
        for (const placement of packedPage.placements) {
          const content = contentById.get(placement.pieceId);
          if (!content) continue;
          const footprint = printPlacementFootprint(placement);
          const x = mm(placement.xCm);
          const y = mm(snapshotSheetH - placement.yCm - footprint.heightCm);
          const h = mm(placement.heightCm);
          const footprintW = mm(footprint.widthCm);
          const footprintH = mm(footprint.heightCm);
          page.drawRectangle({ x, y, width: footprintW, height: footprintH, color: rgb(1, 1, 1) });
          page.pushOperators(
            pushGraphicsState(),
            rectangle(x, y, footprintW, footprintH),
            clip(),
            endPath(),
          );
          if (placement.sheetRotation === 90) {
            page.pushOperators(translate(x, y + footprintH), rotateRadians(-Math.PI / 2));
          } else if (placement.sheetRotation === -90) {
            page.pushOperators(translate(x + footprintW, y), rotateRadians(Math.PI / 2));
          } else if (placement.sheetRotation === 180) {
            page.pushOperators(translate(x + footprintW, y + footprintH), rotateRadians(Math.PI));
          } else {
            page.pushOperators(translate(x, y));
          }
          const scaleX = placement.widthCm / Math.max(0.01, content.widthCm);
          const scaleY = placement.heightCm / Math.max(0.01, content.heightCm);
          for (const member of content.members) {
            const piece = pieceById.get(member.pieceId);
            if (!piece) continue;
            const memberW = mm(member.widthCm * scaleX);
            const memberH = mm(member.heightCm * scaleY);
            const memberCenterX = mm((member.leftCm + member.widthCm / 2) * scaleX);
            const memberCenterY = h - mm((member.topCm + member.heightCm / 2) * scaleY);
            const textWidthCm = content.kind === 'group' ? member.widthCm : placement.widthCm;
            const textHeightCm = content.kind === 'group' ? member.heightCm : placement.heightCm;
            const source = piece.kind === 'text' && piece.text
              ? renderTextDataUrl(piece.text, textWidthCm, textHeightCm)
              : piece.src;
            let image = cache.get(source);
            if (!image) { image = await embedSource(pdf, source); cache.set(source, image); }
            const geometry = imageFrameGeometry(image.width, image.height, memberW, memberH, piece.kind === 'text' ? DEFAULT_PHOTO_CROP : piece.crop);
            page.pushOperators(
              pushGraphicsState(),
              translate(memberCenterX, memberCenterY),
              rotateRadians(-member.rotation * Math.PI / 180),
              pushGraphicsState(),
              rectangle(-memberW / 2, -memberH / 2, memberW, memberH),
              clip(),
              endPath(),
              translate(-memberW / 2 + geometry.centerX, memberH / 2 - geometry.centerY),
              rotateRadians(-geometry.rotationDegrees * Math.PI / 180),
              scalePdf(geometry.flipX ? -1 : 1, geometry.flipY ? -1 : 1),
            );
            page.drawImage(image, { x: -geometry.drawWidth / 2, y: -geometry.drawHeight / 2, width: geometry.drawWidth, height: geometry.drawHeight });
            page.pushOperators(popGraphicsState());
            if (piece.kind !== 'text' && piece.border) {
              const channels = rgbChannels(piece.border.color);
              const borderFrameW = content.kind === 'group' ? member.widthCm : placement.widthCm;
              const borderFrameH = content.kind === 'group' ? member.heightCm : placement.heightCm;
              photoBorderRects(borderFrameW, borderFrameH, piece.border).forEach((rect) => page.drawRectangle({
                x: -memberW / 2 + mm(content.kind === 'group' ? rect.x * scaleX : rect.x),
                y: memberH / 2 - mm(content.kind === 'group' ? (rect.y + rect.height) * scaleY : rect.y + rect.height),
                width: mm(content.kind === 'group' ? rect.width * scaleX : rect.width),
                height: mm(content.kind === 'group' ? rect.height * scaleY : rect.height),
                color: rgb(channels.red, channels.green, channels.blue),
              }));
            }
            page.pushOperators(popGraphicsState());
          }
          page.pushOperators(popGraphicsState());
          if (snapshotCropMarks) {
            const offset = mm(0.04);
            const mark = mm(0.22);
            const color = rgb(0.15, 0.15, 0.14);
            page.drawLine({ start: { x: x - offset - mark, y }, end: { x: x - offset, y }, thickness: 0.4, color });
            page.drawLine({ start: { x, y: y - offset - mark }, end: { x, y: y - offset }, thickness: 0.4, color });
            page.drawLine({ start: { x: x + footprintW + offset, y }, end: { x: x + footprintW + offset + mark, y }, thickness: 0.4, color });
            page.drawLine({ start: { x: x + footprintW, y: y - offset - mark }, end: { x: x + footprintW, y: y - offset }, thickness: 0.4, color });
            page.drawLine({ start: { x: x - offset - mark, y: y + footprintH }, end: { x: x - offset, y: y + footprintH }, thickness: 0.4, color });
            page.drawLine({ start: { x, y: y + footprintH + offset }, end: { x, y: y + footprintH + offset + mark }, thickness: 0.4, color });
            page.drawLine({ start: { x: x + footprintW + offset, y: y + footprintH }, end: { x: x + footprintW + offset + mark, y: y + footprintH }, thickness: 0.4, color });
            page.drawLine({ start: { x: x + footprintW, y: y + footprintH + offset }, end: { x: x + footprintW, y: y + footprintH + offset + mark }, thickness: 0.4, color });
          }
          if (snapshotGap >= 0.3 && y >= 6) page.drawText(content.code, { x: x + 0.5, y: y - 5.1, size: 4.2, font, color: rgb(0.35, 0.35, 0.34) });
        }
      }
      const bytes = await pdf.save();
      downloadBlob(new Uint8Array(bytes).buffer, 'application/pdf', `cutroom-${snapshotPaper}-print-sheets.pdf`);
      setPrintDownloadOpen(false);
      toast(`${snapshotPages.length} exact-size ${snapshotPaper} ${snapshotPages.length === 1 ? 'sheet' : 'sheets'} downloaded as PDF.`);
    } catch {
      toast('The print PDF could not be built. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const downloadPrintRaster = async (format: RasterPrintFormat) => {
    const snapshot = {
      pages: printPlan.pages.map((page) => ({ ...page, placements: page.placements.map((placement) => ({ ...placement })) })),
      contents: printContents.map((content) => ({ ...content, memberIds: [...content.memberIds], members: content.members.map((member) => ({ ...member })) })),
      pieces: printablePlacedPieces.map(({ id, code, src, crop, kind, text, border, widthCm, heightCm }) => ({ id, code, src, crop: crop ? { ...crop } : undefined, kind, text: text ? cloneTextData(text) : undefined, border: border ? { ...border, edges: { ...border.edges } } : undefined, widthCm, heightCm })),
      sheetWidthCm: sheetW,
      sheetHeightCm: sheetH,
      paperName: printPaper,
      cropMarks,
      cutSpacingCm: printGap,
    };
    try {
      await waitForDocumentFonts();
      const result = await createRasterPrintExport(snapshot, format, printDpi, (page, total) => {
        setBusy(`Rendering print sheet ${page} of ${total} at ${printDpi} DPI…`);
      });
      downloadBlob(result.data.buffer as ArrayBuffer, result.type, result.fileName);
      setPrintDownloadOpen(false);
      toast(result.zipped
        ? `${snapshot.pages.length} ${format.toUpperCase()} sheets downloaded in one ZIP.`
        : `Print sheet downloaded as ${format.toUpperCase()} at ${printDpi} DPI.`);
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : 'The raster print pack could not be built. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const performPrintExport = async () => {
    if (!printExportReady() || busy) return;
    if (printExportFormat === 'pdf') {
      await downloadPrintPdf();
      return;
    }
    if (!rasterSpec.supported) {
      toast(rasterSpec.reason ?? 'Choose 150 DPI or PDF for this paper size.');
      return;
    }
    await downloadPrintRaster(printExportFormat);
  };

  const changeWallDimensions = (widthCm: number, heightCm: number) => {
    if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0) return;
    if (Math.abs(widthCm - wall.widthCm) < 0.0001 && Math.abs(heightCm - wall.heightCm) < 0.0001) return;
    const nextWall = { ...wall, widthCm, heightCm };
    commit(pieces);
    setWall(nextWall);
    setPieces((items) => items.map((piece) => syncCanvasFromPhysical(piece, nextWall, false)));
  };

  const changeWallColor = (color: string) => {
    if (color === wall.color) return;
    commit(pieces);
    setWall((current) => ({ ...current, color }));
  };

  const changeWallPreset = (value: string) => {
    const presets: Record<string, [number, number]> = { desk: [180, 110], dorm: [240, 160], sofa: [300, 170], tall: [130, 220] };
    const size = presets[value];
    setWallPreset(value as WallPreset);
    if (size) setWallDraftCm({ widthCm: size[0], heightCm: size[1] });
  };

  const matchingWallPreset = (widthCm: number, heightCm: number): WallPreset => {
    const presets: Record<Exclude<WallPreset, 'custom'>, [number, number]> = { desk: [180, 110], dorm: [240, 160], sofa: [300, 170], tall: [130, 220] };
    return (Object.entries(presets).find(([, size]) => Math.abs(size[0] - widthCm) < .01 && Math.abs(size[1] - heightCm) < .01)?.[0] as WallPreset | undefined) ?? 'custom';
  };

  const openWallSettings = () => {
    setWallDraftCm({ widthCm: wall.widthCm, heightCm: wall.heightCm });
    setWallPreset(matchingWallPreset(wall.widthCm, wall.heightCm));
    setWallOpen(true);
  };

  const applyWallDraft = () => {
    if (wallDraftCm.widthCm < 40 || wallDraftCm.heightCm < 40 || wallDraftCm.widthCm > 1000 || wallDraftCm.heightCm > 500) {
      toast(`Choose a wall between ${measurementPairText(40, 40, measurementUnit)} and ${measurementPairText(1000, 500, measurementUnit)}.`);
      return;
    }
    const projected = pieces.map((piece) => syncCanvasFromPhysical(piece, { ...wall, ...wallDraftCm }, false));
    const nextWall = { ...wall, ...wallDraftCm };
    const outsideCount = projected.filter((piece) => isOutsideWall(piece, nextWall)).length;
    changeWallDimensions(wallDraftCm.widthCm, wallDraftCm.heightCm);
    setWallOpen(false);
    toast(`Wall updated to ${measurementPairText(wallDraftCm.widthCm, wallDraftCm.heightCm, measurementUnit)}${outsideCount ? ` · ${outsideCount} photos extend past an edge` : ''}.`);
  };

  const changeSinglePrintSize = (axis: 'width' | 'height', displayValue: number) => {
    if (!selected || !Number.isFinite(displayValue) || displayValue <= 0) return;
    if (!sizeEditRef.current) beginSizeEdit();
    const valueCm = fromDisplayUnit(displayValue, measurementUnit);
    const ratio = selected.widthCm / Math.max(0.01, selected.heightCm);
    const lockRatio = selected.kind !== 'text' && aspectLocked;
    const widthCm = axis === 'width' ? valueCm : lockRatio ? valueCm * ratio : selected.widthCm;
    const heightCm = axis === 'height' ? valueCm : lockRatio ? valueCm / ratio : selected.heightCm;
    if (widthCm > wall.widthCm || heightCm > wall.heightCm) {
      toast(`That print would be larger than the ${measurementText(wall.widthCm, measurementUnit)} × ${measurementText(wall.heightCm, measurementUnit)} wall.`);
      return;
    }
    if (sizeEditRef.current) sizeEditRef.current.changed = true;
    updatePiece(selected.id, { widthCm, heightCm, sizeMode: 'custom' }, false);
  };

  const batchTargets = selectedPhotoPieces.filter((piece) => piece.placed && !piece.locked);
  const batchLockedCount = selectedPhotoPieces.filter((piece) => piece.placed && piece.locked).length;

  const batchDimensionsFor = (piece: Piece) => {
    const ratio = piece.widthCm / Math.max(0.01, piece.heightCm);
    if (batchMode === 'width') return { widthCm: batchWidthCm, heightCm: batchWidthCm / ratio };
    if (batchMode === 'height') return { widthCm: batchHeightCm * ratio, heightCm: batchHeightCm };
    if (batchMode === 'exact') return { widthCm: batchWidthCm, heightCm: batchHeightCm };
    const scale = Math.min(batchWidthCm / Math.max(0.01, piece.widthCm), batchHeightCm / Math.max(0.01, piece.heightCm));
    return { widthCm: piece.widthCm * scale, heightCm: piece.heightCm * scale };
  };

  const requestBatchResize = () => {
    if (!batchTargets.length) {
      toast(batchLockedCount ? 'Every selected photo is locked. Unlock one before resizing.' : 'Select at least one photo on the wall.');
      return;
    }
    const missingRequiredSize = (batchMode !== 'height' && batchWidthCm <= 0) || (batchMode !== 'width' && batchHeightCm <= 0);
    if (missingRequiredSize || batchTargets.some((piece) => {
      const size = batchDimensionsFor(piece);
      return size.widthCm > wall.widthCm || size.heightCm > wall.heightCm;
    })) {
      toast('That target would make at least one photo larger than the wall. Choose a smaller size.');
      return;
    }
    setBatchOpen(true);
  };

  const applyBatchResize = () => {
    const targetIds = new Set(batchTargets.map((piece) => piece.id));
    const nextPieces = pieces.map((piece) => {
      if (!targetIds.has(piece.id)) return piece;
      const size = batchDimensionsFor(piece);
      return syncCanvasFromPhysical({ ...piece, ...size, sizeMode: 'custom' }, wall, false);
    });
    const affectedOverlaps = new Set<string>();
    nextPieces.filter((piece) => targetIds.has(piece.id)).forEach((piece) => {
      nextPieces.forEach((other) => {
        if (piece.id !== other.id && overlaps(piece, other, wall)) affectedOverlaps.add(piece.id);
      });
    });
    const outsideCount = nextPieces.filter((piece) => targetIds.has(piece.id) && isOutsideWall(piece, wall)).length;
    commit(pieces);
    setPieces(nextPieces);
    setBatchOpen(false);
    toast(`${batchTargets.length} photos resized${batchLockedCount ? ` · ${batchLockedCount} locked skipped` : ''}${affectedOverlaps.size ? ` · ${affectedOverlaps.size} overlap after resizing` : ''}${outsideCount ? ` · ${outsideCount} extend past the wall` : ''}.`);
  };

  const batchMethodLabel = batchMode === 'fit' ? 'Fit inside'
    : batchMode === 'width' ? 'Same width'
      : batchMode === 'height' ? 'Same height'
        : 'Exact size';
  const batchTargetLabel = batchMode === 'width' ? `${measurementText(batchWidthCm, measurementUnit)} wide`
    : batchMode === 'height' ? `${measurementText(batchHeightCm, measurementUnit)} high`
      : measurementPairText(batchWidthCm, batchHeightCm, measurementUnit);

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const editingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    if (cropSession && !editingText) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelCrop();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        finishCrop();
        return;
      }
      const panStep = event.shiftKey ? 0.05 : 0.01;
      const cropKeys: Record<string, Partial<PhotoCrop>> = {
        ArrowLeft: { offsetX: clamp(cropSession.draft.offsetX - panStep, -1, 1) },
        ArrowRight: { offsetX: clamp(cropSession.draft.offsetX + panStep, -1, 1) },
        ArrowUp: { offsetY: clamp(cropSession.draft.offsetY - panStep, -1, 1) },
        ArrowDown: { offsetY: clamp(cropSession.draft.offsetY + panStep, -1, 1) },
      };
      if (cropKeys[event.key]) {
        event.preventDefault();
        setCropDraft(cropKeys[event.key]);
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setCropDraft({ zoom: clamp(cropSession.draft.zoom + 0.05, 1, 4) });
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        setCropDraft({ zoom: clamp(cropSession.draft.zoom - 0.05, 1, 4) });
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !editingText) {
      event.preventDefault();
      selectAllPlaced();
      return;
    }
    if (!editingText && (event.key === 'Delete' || event.key === 'Backspace') && selectedPieces.length) {
      event.preventDefault();
      removeSelectedFromWall();
      return;
    }
    if (event.key === 'Escape') {
      if (positionOpen) setPositionOpen(false);
      else {
        clearSelection();
        setMultiSelectMode(false);
      }
      setGuides([]);
    }
  };

  const handleWallPieceClick = (event: React.MouseEvent, piece: Piece) => {
    event.stopPropagation();
    if (cropSession) return;
    if (suppressWallClickRef.current) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey || multiSelectMode) togglePieceSelection(piece);
    else choosePiece(piece);
  };

  return (
    <main className="studio-shell" onPointerMove={moveTrayDrag} onPointerUp={endTrayDrag} onPointerCancel={cancelTrayDrag}>
      <input ref={uploadRef} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { void importFiles(Array.from(event.target.files ?? [])); }} />
      <input ref={backupUploadRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importProjectBackup(event.target.files?.[0]); }} />
      <input ref={wallUploadRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (event) => {
        const input = event.currentTarget;
        const file = event.target.files?.[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 100 * 1024 * 1024) {
          toast('Use a JPG, PNG or WebP wall photo under 100 MB.');
          input.value = '';
          return;
        }
        void checkStorageHeadroom(file.size * 1.4);
        try {
          const asset = await readFile(file);
          const nextWall = { ...wall, photo: asset.src };
          if (projectWithinLimits(pieces, nextWall)) {
            commit(pieces);
            setWall(nextWall);
            toast('Wall photo added. Switch to Room preview to see it.');
          }
        } catch { toast('That wall image could not be opened.'); }
        input.value = '';
      }} />

      <header className="topbar" inert={!hydrated ? true : undefined}>
        <div className="brand-lockup">
          <div className="brand-mark"><span>C</span><i /></div>
          <div><strong>CUTROOM</strong><small>WALL STUDIO</small></div>
        </div>
        <nav className="product-nav" aria-label="Studio modes">
          <button className={view === 'arrange' ? 'active' : ''} onClick={() => setView('arrange')}><Move /> Arrange</button>
          <button className={view === 'print' ? 'active' : ''} disabled={Boolean(cropSession)} onClick={openPrintPack}><Printer /> Print pack</button>
        </nav>
        <div className="top-actions">
          <span className={`saved-indicator ${saveState}`}><i /> {saveState === 'loading' ? 'Restoring…' : saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : saveState === 'error' ? 'Local save paused' : 'Saved locally'}</span>
          <Button variant="outline" className="square-button" onClick={shareProject}><MessageCircleMore /> Share</Button>
          <Button className="export-button" disabled={Boolean(cropSession)} onClick={() => setExportOpen(true)}><Download /> Export</Button>
          <button className="avatar" aria-label="Profile" onClick={() => toast('This local-first prototype does not need an account.')}>UK</button>
        </div>
      </header>

      {storageNotice && <aside className={`storage-recovery-banner ${storageNotice.error.kind}`} role="alert">
        <span><TriangleAlert /></span>
        <div><b>{storageNotice.error.kind === 'corrupt' ? 'Saved project needs recovery' : storageNotice.error.kind === 'quota' ? 'Local storage is full' : 'Local saving is paused'}</b><p>{storageNotice.error.message} {storageNotice.error.kind !== 'corrupt' && 'Download an emergency backup before closing or reloading this tab.'}</p></div>
        <div className="storage-recovery-actions">
          {storageNotice.rawRecovery && <button onClick={downloadRawRecovery}><FileArchive /> Raw recovery</button>}
          <button onClick={() => { if (downloadProjectDocument(buildProjectDocument(), 'cutroom-emergency-backup.json')) toast('Emergency project backup downloaded.'); }}><Download /> Emergency backup</button>
          <button onClick={openBackupPicker}><Upload /> Restore backup</button>
          {storageNotice.error.kind === 'corrupt' ? <button className="danger" onClick={() => setFreshStartOpen(true)}><Trash2 /> Start fresh…</button> : <button className="primary" onClick={() => { void retryLocalSave(); }}><RotateCw /> Retry save</button>}
        </div>
      </aside>}
      {!storageNotice && !storageWarningDismissed && storageNeedsAttention(storageHealth) && <aside className="storage-recovery-banner warning" aria-live="polite">
        <span><TriangleAlert /></span><div><b>Local storage is getting full</b><p>{formatStorageBytes(storageHealth.usage)} of {formatStorageBytes(storageHealth.quota)} is used by this browser origin. Keep a recent backup before adding more large photos.</p></div>
        <div className="storage-recovery-actions"><button onClick={exportProject}><Download /> Download backup</button>{!storageHealth.persistent && <button className="primary" onClick={() => { void protectLocalProject(); }}><Lock /> Protect local project</button>}<button className="dismiss" aria-label="Dismiss storage warning" onClick={() => setStorageWarningDismissed(true)}><X /> Dismiss</button></div>
      </aside>}

      {view === 'arrange' ? (
        <section className="workspace" inert={!hydrated ? true : undefined}>
          <aside className={`piece-tray ${mobileTool === 'pieces' ? 'mobile-active' : ''}`}>
            <div className="panel-heading">
              <div><span>YOUR PIECES</span><h2>{pieces.length} cutouts</h2></div>
              <button aria-label="Add photos" onClick={() => uploadRef.current?.click()}><ImagePlus /></button>
            </div>
            <button className="upload-zone" onClick={() => uploadRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}>
              <span>{busy.startsWith('Reading') ? <RotateCcw className="spin" /> : <Upload />}</span><b>Drop photos or sheets</b><small>JPG, PNG or WebP · processed on-device</small>
            </button>
            <div className="size-row"><label>Default photo size</label><NativeSelect value={posterPreset} onChange={(event) => setPosterPreset(event.target.value as PhotoSizePreset)}><NativeSelectOption value="Original">Original proportions</NativeSelectOption><NativeSelectOption value="A6">A6</NativeSelectOption><NativeSelectOption value="A5">A5</NativeSelectOption><NativeSelectOption value="A4">A4</NativeSelectOption><NativeSelectOption value="A3">A3</NativeSelectOption><NativeSelectOption value="A2">A2</NativeSelectOption><NativeSelectOption value="A1">A1</NativeSelectOption></NativeSelect></div>
            <div className="tray-tools">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <b>{pieces.length}</b></button>
              <button className={filter === 'placed' ? 'active' : ''} onClick={() => setFilter('placed')}>Placed <b>{placedCount}</b></button>
              <button className={filter === 'loose' ? 'active' : ''} onClick={() => setFilter('loose')}>Loose <b>{pieces.length - placedCount}</b></button>
            </div>
            <section className="piece-grid" aria-label="Scrollable photo tray" tabIndex={0}>
              {visiblePieces.map((piece) => (
                <button
                  className={`piece-card ${selectedSet.has(piece.id) ? 'selected' : ''} ${draggingId === piece.id ? 'dragging' : ''}`}
                  data-piece-id={piece.id}
                  key={piece.id}
                  draggable={false}
                  style={{ '--tone': piece.color } as React.CSSProperties}
                  onPointerDown={(event) => beginTrayDrag(event, piece)}
                  onClick={() => { if (!suppressTrayClickRef.current) choosePiece(piece); }}
                  onDoubleClick={() => { if (!suppressTrayClickRef.current) togglePiecePlacement(piece); }}
                  aria-pressed={selectedSet.has(piece.id)}
                  aria-label={`${piece.code}, ${piece.name}, ${piece.placed ? 'placed' : 'loose'}${piece.locked ? ', locked' : ''}. Drag onto the wall or double-click to ${piece.placed ? 'remove it from the wall while keeping it in Your Pieces' : 'place it on the wall'}.`}
                >
                  <span className={`piece-image ${piece.kind === 'text' ? 'text-thumbnail' : ''}`}>{piece.kind === 'text' && piece.text ? <TextPieceVisual data={piece.text} frameWidth={piece.widthCm} frameHeight={piece.heightCm} /> : <img src={piece.src} alt={piece.name} draggable={false} />}{piece.placed && <i className="placed-dot">PLACED</i>}{piece.locked && <i className="locked-dot"><Lock /></i>}</span>
                  <span className="piece-meta"><b>{piece.code}</b><small>{piece.sizeMode === 'original' && piece.pixelW && piece.pixelH ? `Original · ${piece.pixelW} × ${piece.pixelH} px` : `${formatMeasurement(piece.widthCm, measurementUnit)} × ${formatMeasurement(piece.heightCm, measurementUnit)} ${measurementUnit}`}</small></span>
                </button>
              ))}
            </section>
            <div className="tray-footer"><span>{placedCount} / {pieces.length} placed</span><div><i style={{ width: `${pieces.length ? placedCount / pieces.length * 100 : 0}%` }} /></div><b>{pieces.length ? Math.round(placedCount / pieces.length * 100) : 0}%</b></div>
          </aside>

          <section className={`canvas-area ${mobileTool === 'wall' ? 'mobile-active' : ''}`}>
            <div className="canvas-toolbar">
              <div className="tool-cluster">
                <button className={!multiSelectMode ? 'active' : ''} aria-label="Select tool" disabled={Boolean(cropSession)} onClick={() => setMultiSelectMode(false)}><MousePointer2 /></button><button className={`multi-select-trigger ${multiSelectMode ? 'active' : ''}`} aria-label={multiSelectMode ? 'Exit multi-select' : 'Select multiple items'} aria-pressed={multiSelectMode} disabled={Boolean(cropSession)} onClick={() => setMultiSelectMode((active) => !active)}><BoxSelect /><em>Multi</em></button><button aria-label="Fit wall" onClick={() => setZoom(72)}><Maximize2 /></button><span />
                <button aria-label="Undo" disabled={!history.length || Boolean(cropSession)} onClick={undo}><Undo2 /></button><button aria-label="Redo" disabled={!future.length || Boolean(cropSession)} onClick={redo}><Redo2 /></button><span />
                <button className={`position-trigger ${positionOpen ? 'active' : ''}`} aria-label="Position" aria-expanded={positionOpen} disabled={Boolean(cropSession)} onClick={() => { setPositionOpen((open) => !open); setPositionTab('layers'); }}><Layers3 /><em>Position</em></button>
                <button className={`text-tool-trigger ${panelMode === 'text' ? 'active' : ''}`} aria-label="Add or style text" disabled={Boolean(cropSession)} onClick={() => { setPanelMode('text'); setMobileTool('inspect'); }}><Type /><em>Text</em></button>
                <button className={`tablet-inspect-trigger ${mobileTool === 'inspect' ? 'active' : ''}`} aria-label={mobileTool === 'inspect' ? 'Close photo inspector' : 'Open photo inspector'} aria-expanded={mobileTool === 'inspect'} disabled={!selected || Boolean(cropSession)} onClick={() => { if (mobileTool === 'inspect') setMobileTool('wall'); else { setPanelMode('inspect'); setMobileTool('inspect'); } }}><PanelRight /></button>
              </div>
              <div className="wall-view-controls"><div className="mode-switch"><button className={canvasMode === 'blueprint' ? 'active' : ''} onClick={() => setCanvasMode('blueprint')}><Grid3X3 /> Blueprint</button><button className={canvasMode === 'room' ? 'active' : ''} onClick={() => setCanvasMode('room')}><Eye /> Room preview</button></div><label className="wall-label-toggle"><span>Photo labels</span><Switch size="sm" checked={showWallLabels} onCheckedChange={(checked) => { if (checked !== showWallLabels) { commit(pieces); setShowWallLabels(checked); } }} aria-label="Show photo ID labels on the wall" /></label></div>
              <div className="zoom-control"><button aria-label="Zoom out" onClick={() => setZoom((value) => clamp(value - 10, 35, 300))}><ZoomOut /></button><b>{zoom}%</b><button aria-label="Zoom in" onClick={() => setZoom((value) => clamp(value + 10, 35, 300))}><ZoomIn /></button></div>
            </div>
            {cropSession && activeCropPiece && (
              <fieldset className="crop-toolbar" aria-label={`Crop ${activeCropPiece.code}`}>
                <span className="crop-toolbar-title"><Crop /><span><small>EDITING FRAME</small><b>{activeCropPiece.code}</b></span></span>
                <div className="crop-preset-buttons" aria-label="Crop display mode">
                  <button type="button" className={cropSession.draft.mode === 'fill' && !cropIsOriginal ? 'active' : ''} aria-pressed={cropSession.draft.mode === 'fill' && !cropIsOriginal} onClick={() => chooseCropPreset('fill')}>Fill</button>
                  <button type="button" className={cropSession.draft.mode === 'fit' && !cropIsOriginal ? 'active' : ''} aria-pressed={cropSession.draft.mode === 'fit' && !cropIsOriginal} onClick={() => chooseCropPreset('fit')}>Fit</button>
                  <button type="button" className={cropIsOriginal ? 'active' : ''} aria-pressed={cropIsOriginal} onClick={() => chooseCropPreset('original')}>Original</button>
                </div>
                <i className="crop-toolbar-divider" />
                <div className="crop-transform-buttons">
                  <button type="button" className={cropSession.draft.flipX ? 'active' : ''} aria-label="Flip image horizontally" aria-pressed={cropSession.draft.flipX} onClick={() => setCropDraft((crop) => ({ ...crop, flipX: !crop.flipX }))}><FlipHorizontal2 /></button>
                  <button type="button" className={cropSession.draft.flipY ? 'active' : ''} aria-label="Flip image vertically" aria-pressed={cropSession.draft.flipY} onClick={() => setCropDraft((crop) => ({ ...crop, flipY: !crop.flipY }))}><FlipVertical2 /></button>
                  <button type="button" aria-label="Rotate image 90 degrees" onClick={() => setCropDraft((crop) => ({ ...crop, quarterTurns: ((crop.quarterTurns + 1) % 4) as PhotoCrop['quarterTurns'], offsetX: 0, offsetY: 0 }))}><RotateCw /></button>
                  <button type="button" className="crop-reset" onClick={() => setCropDraft({ ...DEFAULT_PHOTO_CROP })}><RotateCcw /> Reset</button>
                </div>
                <label className="crop-zoom"><ZoomOut /><Slider aria-label="Crop zoom" aria-valuetext={`${Math.round(cropSession.draft.zoom * 100)}%`} value={[cropSession.draft.zoom]} min={1} max={4} step={0.01} onValueChange={(value) => setCropDraft({ zoom: sliderValue(value) })} /><b>{Math.round(cropSession.draft.zoom * 100)}%</b></label>
                <div className="crop-toolbar-actions"><button type="button" onClick={cancelCrop}>Cancel</button><button type="button" className="crop-done" onClick={finishCrop}><Check /> Done</button></div>
              </fieldset>
            )}
            {(multiSelectMode || selectedIds.length > 1) && <fieldset className="selection-bar" aria-label="Multiple item selection"><span><BoxSelect /><b>{selectedIds.length} selected</b>{wallRemovalLockedCount > 0 && <small>{wallRemovalLockedCount} locked</small>}</span><button onClick={selectAllPlaced}>Select all</button><button onClick={clearSelection}>Clear</button><button className="selection-remove-wall" disabled={!wallRemovalTargets.length} onClick={removeSelectedFromWall}><BoxSelect /> Remove from wall</button><button className="selection-done" onClick={() => setMultiSelectMode(false)}>Done</button></fieldset>}
            {positionOpen && (
              <dialog className="position-panel" aria-label="Position" open onCancel={(event) => { event.preventDefault(); setPositionOpen(false); }}>
                <header><div><span>LAYOUT TOOLS</span><h2>Position</h2></div><button aria-label="Close Position" onClick={() => setPositionOpen(false)}><X /></button></header>
                <div className="position-tabs" role="tablist" aria-label="Position tools"><button role="tab" aria-selected={positionTab === 'arrange'} className={positionTab === 'arrange' ? 'active' : ''} onClick={() => setPositionTab('arrange')}>Arrange</button><button role="tab" aria-selected={positionTab === 'layers'} className={positionTab === 'layers' ? 'active' : ''} onClick={() => setPositionTab('layers')}>Layers</button></div>
                {positionTab === 'arrange' ? (
                  <div className="arrange-panel">
                    <p>{selectedIds.length === 1 && selected?.placed ? `Align ${selected.code} precisely to the wall.` : selectedIds.length > 1 ? 'Alignment works after narrowing the selection to one photo.' : 'Select a photo on the wall to align it.'}</p>
                    <div className="align-grid">
                      <button disabled={selectedIds.length !== 1 || !selected?.placed} onClick={() => alignSelected('left')}><i>⇤</i><span>Left</span></button>
                      <button disabled={selectedIds.length !== 1 || !selected?.placed} onClick={() => alignSelected('centre')}><i>↔</i><span>Centre</span></button>
                      <button disabled={selectedIds.length !== 1 || !selected?.placed} onClick={() => alignSelected('right')}><i>⇥</i><span>Right</span></button>
                      <button disabled={selectedIds.length !== 1 || !selected?.placed} onClick={() => alignSelected('top')}><i>↥</i><span>Top</span></button>
                      <button disabled={selectedIds.length !== 1 || !selected?.placed} onClick={() => alignSelected('middle')}><i>↕</i><span>Middle</span></button>
                      <button disabled={selectedIds.length !== 1 || !selected?.placed} onClick={() => alignSelected('bottom')}><i>↧</i><span>Bottom</span></button>
                    </div>
                    <div className="guide-tip"><Sparkles /><span><b>Smart guides are on.</b> Edges and centres snap gently. Hold Option/Alt for free movement.</span></div>
                  </div>
                ) : (
                  <div className="layers-panel">
                    <div className="layer-filter" aria-label="Layer filter"><button className={layerFilter === 'all' ? 'active' : ''} onClick={() => setLayerFilter('all')}>All <b>{orderedPlacedPieces.length}</b></button><button className={layerFilter === 'overlapping' ? 'active' : ''} onClick={() => setLayerFilter('overlapping')}>Overlapping <b>{overlappingIds.size}</b></button></div>
                    <div className="layer-order-label"><span>FRONT</span><small>Drag a row to change the stack</small></div>
                    <div className="layer-list">
                      {layerPieces.length ? layerPieces.map((piece) => (
                        <div className={`layer-row ${selectedId === piece.id ? 'selected' : ''} ${overlappingIds.has(piece.id) ? 'has-overlap' : ''}`} data-layer-id={piece.id} key={piece.id} draggable onDragStart={(event) => { layerDragRef.current = piece.id; event.dataTransfer.effectAllowed = 'move'; }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => { event.preventDefault(); dropLayerAbove(piece.id); }}>
                          <button className="layer-main" onClick={() => choosePiece(piece)}><i className="layer-grip" aria-hidden="true">⠿</i>{piece.kind === 'text' ? <i className="layer-type-preview"><Type /></i> : <img src={piece.src} alt="" draggable={false} />}<span><b>{piece.code}</b><small>{piece.name}</small></span>{piece.locked && <Lock />}{overlappingIds.has(piece.id) && <em title="This photo overlaps another">!</em>}</button>
                          {selectedId === piece.id && <div className="layer-actions"><button type="button" onClick={() => moveLayer(piece.id, 'front')}>To front</button><button type="button" onClick={() => moveLayer(piece.id, 'forward')}>Forward</button><button type="button" onClick={() => moveLayer(piece.id, 'backward')}>Backward</button><button type="button" onClick={() => moveLayer(piece.id, 'back')}>To back</button>{layerFilter === 'overlapping' && <button type="button" className="layer-remove-wall" disabled={piece.locked} aria-label={`Remove ${piece.code} from the wall and keep it in Your Pieces`} onClick={() => togglePiecePlacement(piece)}><BoxSelect /> {piece.locked ? 'Unlock to remove from wall' : 'Remove from wall · keep in Your Pieces'}</button>}</div>}
                        </div>
                      )) : <div className="empty-layers"><Layers3 /><b>{layerFilter === 'overlapping' ? 'Nothing overlaps' : 'No photos placed yet'}</b><span>{layerFilter === 'overlapping' ? 'Touching edges are treated as neatly aligned.' : 'Drag a photo from the tray onto your wall.'}</span></div>}
                    </div>
                    <div className="layer-order-label back"><span>BACK</span><small>{overlappingIds.size ? 'Coral ! marks overlapping photos' : 'Your stack is overlap-free'}</small></div>
                  </div>
                )}
              </dialog>
            )}
            <div className="canvas-scroll">
              <div className="ruler-top" aria-hidden="true">0 <span>{formatMeasurement(wall.widthCm * .25, measurementUnit)}</span><span>{formatMeasurement(wall.widthCm * .5, measurementUnit)}</span><span>{formatMeasurement(wall.widthCm * .75, measurementUnit)}</span><span>{formatMeasurement(wall.widthCm, measurementUnit)}</span><b>{measurementUnit.toUpperCase()}</b></div>
              <div className="wall-label"><Ruler /> {formatMeasurement(wall.widthCm, measurementUnit)} × {formatMeasurement(wall.heightCm, measurementUnit)} {measurementUnit} <button onClick={openWallSettings}>Edit</button></div>
              <section className={`wall-canvas ${canvasMode} ${stageDropActive ? 'drop-active' : ''} ${draggingId ? 'is-positioning' : ''} ${cropSession ? 'crop-editing' : ''}`} tabIndex={0} aria-label={cropSession ? `Cropping ${codeForId(cropSession.pieceId)}. Drag the image, scroll to zoom, press Enter to finish or Escape to cancel.` : 'Poster wall canvas. Select a poster, then drag to move it. Hold Shift or Command to select more.'} ref={stageRef} onPointerMove={dragMove} onPointerUp={endDrag} onPointerCancel={cancelDrag} onKeyDown={handleCanvasKeyDown} onClick={(event) => { if (!cropSession && !(event.target as HTMLElement).closest('.wall-piece')) clearSelection(); }} style={{ width: `${zoom}%`, aspectRatio: `${wall.widthCm}/${wall.heightCm}`, backgroundColor: wall.color }}>
                {canvasMode === 'room' && <div className="wall-room-background" aria-hidden="true" style={{ backgroundImage: `url("${wall.photo || '/demo/wall-mockup.png'}")`, opacity: wall.photoOpacity }} />}
                {canvasMode === 'blueprint' && <div className="wall-grid" />}
                {canvasMode === 'blueprint' && <div className="eye-line" style={{ top: `${clamp(100 - 145 / wall.heightCm * 100, 4, 96)}%` }}><span>EYE LEVEL · {measurementText(145, measurementUnit).toUpperCase()}</span></div>}
                {orderedPlacedPieces.map((piece, index) => (
                  <button className={`wall-piece ${piece.kind === 'text' ? 'wall-text-piece' : ''} ${selectedSet.has(piece.id) ? 'selected' : ''} ${selectedId === piece.id ? 'primary' : ''} ${piece.locked ? 'locked' : ''} ${draggingId === piece.id ? 'dragging' : ''} ${overlappingIds.has(piece.id) ? 'overlapping' : ''} ${cropSession?.pieceId === piece.id ? 'active-crop' : cropSession ? 'crop-dimmed' : ''}`} data-piece-id={piece.id} key={piece.id} style={{ left: `${piece.x}%`, top: `${piece.y}%`, width: `${piece.w}%`, height: `${piece.h}%`, rotate: `${piece.rotation}deg`, zIndex: 10 + index, '--tone': piece.color } as React.CSSProperties} onPointerDown={(event) => beginDrag(event, piece)} onClick={(event) => handleWallPieceClick(event, piece)} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (piece.kind === 'text') { choosePiece(piece); setPanelMode('inspect'); } else startCrop(piece); }} onWheel={(event) => zoomCropWithWheel(event, piece)} aria-label={`${piece.code}, ${piece.name}${selectedSet.has(piece.id) ? ', selected' : ''}${piece.kind === 'text' ? '. Double-click to edit text.' : cropSession?.pieceId === piece.id ? ', crop editor active. Drag image or scroll to zoom.' : '. Double-click to crop.'}`} aria-pressed={selectedSet.has(piece.id)}>
                    <FramedPhoto piece={piece} cropOverride={cropSession?.pieceId === piece.id ? cropSession.draft : undefined} />{showWallLabels && <b>{piece.code}</b>}{selectedSet.has(piece.id) && <span className="piece-selection-check"><Check /></span>}{piece.locked && <span className="piece-lock"><Lock /></span>}{overlappingIds.has(piece.id) && <span className="piece-overlap" title="Overlaps another photo">!</span>}{cropSession?.pieceId === piece.id && <span className="crop-hint"><Crop /> Drag image · scroll to zoom</span>}
                    {selectedIds.length === 1 && selectedId === piece.id && !piece.locked && !cropSession && <>
                      <i className="handle tl" data-resize-handle="nw" aria-hidden="true" onPointerDown={(event) => beginDrag(event, piece, 'resize-nw')} />
                      <i className="handle tr" data-resize-handle="ne" aria-hidden="true" onPointerDown={(event) => beginDrag(event, piece, 'resize-ne')} />
                      <i className="handle bl" data-resize-handle="sw" aria-hidden="true" onPointerDown={(event) => beginDrag(event, piece, 'resize-sw')} />
                      <i className="handle br" data-resize-handle="se" aria-hidden="true" onPointerDown={(event) => beginDrag(event, piece, 'resize-se')} />
                      {(piece.kind === 'text' || !aspectLocked) && <>
                        <i className="handle edge n" data-resize-handle="n" aria-hidden="true" style={{ cursor: edgeResizeCursor('n', piece.rotation) }} onPointerDown={(event) => beginDrag(event, piece, 'resize-n')} />
                        <i className="handle edge e" data-resize-handle="e" aria-hidden="true" style={{ cursor: edgeResizeCursor('e', piece.rotation) }} onPointerDown={(event) => beginDrag(event, piece, 'resize-e')} />
                        <i className="handle edge s" data-resize-handle="s" aria-hidden="true" style={{ cursor: edgeResizeCursor('s', piece.rotation) }} onPointerDown={(event) => beginDrag(event, piece, 'resize-s')} />
                        <i className="handle edge w" data-resize-handle="w" aria-hidden="true" style={{ cursor: edgeResizeCursor('w', piece.rotation) }} onPointerDown={(event) => beginDrag(event, piece, 'resize-w')} />
                      </>}
                    </>}
                  </button>
                ))}
                {trayDropPreview && <div className={`tray-drop-preview ${pieces.some((piece) => piece.id !== trayDropPreview.id && overlaps(trayDropPreview, piece, wall)) ? 'overlapping' : ''}`} style={{ left: `${trayDropPreview.x}%`, top: `${trayDropPreview.y}%`, width: `${trayDropPreview.w}%`, height: `${trayDropPreview.h}%` }}><img src={trayDropPreview.src} alt="" /><b>{trayDropPreview.code}</b></div>}
                {guides.map((guide, index) => <div className={`smart-guide ${guide.axis}`} data-guide-axis={guide.axis} key={`${guide.axis}-${guide.position}-${index}`} style={guide.axis === 'x' ? { left: `${guide.position}%` } : { top: `${guide.position}%` }}><span>{guide.label}</span></div>)}
                {canvasMode === 'blueprint' && <div className="clearance-line" style={{ bottom: `${clamp(wall.furnitureClearanceCm / wall.heightCm * 100, 2, 45)}%` }}><span>FURNITURE CLEARANCE · {measurementText(wall.furnitureClearanceCm, measurementUnit).toUpperCase()}</span></div>}
              </section>
              <div className="canvas-status"><span><i className="ok" /> {placedCount === pieces.length ? 'All pieces placed' : `${pieces.length - placedCount} in the loose tray`}</span>{overlappingIds.size > 0 && <button className="overlap-status" data-overlap-count={overlappingIds.size} onClick={() => { setPositionOpen(true); setPositionTab('layers'); setLayerFilter('overlapping'); }}><i>!</i><b>{overlappingIds.size}</b> photos overlap</button>}{outsideWallIds.size > 0 && <span className="outside-status"><i>!</i><b>{outsideWallIds.size}</b> past wall edge</span>}<span><b>{measurementText(density < 45 ? 2 : density > 75 ? .8 : 1.2, measurementUnit)}</b> target gap</span><span><b>{coverage}%</b> poster area</span></div>
            </div>
          </section>

          <aside className={`assistant-panel ${mobileTool === 'assistant' || mobileTool === 'inspect' ? 'mobile-active' : ''}`}>
            <div className="side-tabs three"><button className={panelMode === 'assistant' ? 'active' : ''} onClick={() => setPanelMode('assistant')}><Sparkles /> Assistant</button><button className={panelMode === 'text' ? 'active' : ''} onClick={() => setPanelMode('text')}><Type /> Text</button><button className={panelMode === 'inspect' ? 'active' : ''} onClick={() => setPanelMode('inspect')} disabled={!selected}><PanelRight /> Inspect</button></div>
            {panelMode === 'inspect' && selected ? (
              <div className="inspector">
                {selectedPieces.length > 1 ? <>
                  <div className="multi-inspect-hero"><div className="multi-thumbnails">{selectedPieces.slice(-3).map((piece) => piece.kind === 'text' ? <span className="multi-text-thumb" key={piece.id}><Type /></span> : <img src={piece.src} alt="" key={piece.id} />)}</div><div><small>MULTI-SELECTION</small><h2>{selectedPieces.length} items selected</h2><p>{batchTargets.length} photos ready to resize{batchLockedCount ? ` · ${batchLockedCount} locked` : ''}</p></div></div>
                  <div className="inspect-section measurement-section"><div className="inspect-heading-row"><label>MEASUREMENT UNIT</label><UnitToggle value={measurementUnit} onChange={setProjectUnit} /></div><p>The unit changes everywhere; real sizes and positions stay unchanged.</p></div>
                  <div className="inspect-section print-group-editor"><div className="print-group-heading"><span><Link2 /></span><div><label>GROUP AS ONE</label><p>Keep photos, text, overlap, and layer order together for AI movement and Print Pack.</p></div></div>{selectedPrintGroupIds.length > 0 && <div className="active-print-groups">{selectedPrintGroupIds.map((id) => <b key={id}>{printGroups.find((group) => group.id === id)?.code}</b>)}</div>}<div className="print-group-actions"><Button variant="outline" disabled={selectedPieces.length < 2 || selectedPieces.some((piece) => !piece.placed)} onClick={groupSelectedForPrint}><Link2 /> Group as one</Button><Button variant="outline" disabled={!selectedPrintGroupIds.length} onClick={ungroupSelectedForPrint}><Unlink2 /> Ungroup</Button></div></div>
                  <div className="inspect-section lock-row multi-lock-row"><div><label>LOCK SELECTED POSITIONS</label><p>Protect all selected wall items from dragging and Composition in one action.</p></div><Switch checked={allSelectedPiecesLocked} onCheckedChange={setSelectedPiecesLocked} aria-label="Lock every selected wall item" /></div>
                  {selectedPhotoPieces.length > 0 && <PhotoBorderEditor pieces={selectedPhotoPieces} unit={measurementUnit} onChange={updateSelectedPhotoBorders} onBeginContinuous={beginHistoryTransaction} onEndContinuous={endHistoryTransaction} />}
                  <div className="inspect-section batch-size-section">
                    <label>MAKE SAME SIZE <b>{batchMode === 'fit' ? 'Recommended' : batchMode === 'exact' ? 'May crop' : 'Keep proportions'}</b></label>
                    <NativeSelect value={batchMode} onChange={(event) => setBatchMode(event.target.value as BatchSizeMode)} aria-label="Batch resize method">
                      <NativeSelectOption value="fit">Fit inside W × H · preserve ratio</NativeSelectOption>
                      <NativeSelectOption value="width">Same width · preserve ratio</NativeSelectOption>
                      <NativeSelectOption value="height">Same height · preserve ratio</NativeSelectOption>
                      <NativeSelectOption value="exact">Exact W × H · crop to fill</NativeSelectOption>
                    </NativeSelect>
                    <div className="preset-chips batch-presets"><button onClick={() => { setBatchWidthCm(10.5); setBatchHeightCm(14.8); }}>A6</button><button onClick={() => { setBatchWidthCm(14.8); setBatchHeightCm(21); }}>A5</button><button onClick={() => { setBatchWidthCm(21); setBatchHeightCm(29.7); }}>A4</button></div>
                    <div className={`two-inputs batch-inputs ${batchMode}`}>
                      {batchMode !== 'height' && <span>{batchMode === 'width' ? 'Width' : 'W'} ({measurementUnit})<Input aria-label={`Target width in ${measurementUnit}`} type="number" value={formatMeasurement(batchWidthCm, measurementUnit)} min={measurementUnit === 'in' ? .2 : .5} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const value = Number(event.target.value); if (value > 0) setBatchWidthCm(fromDisplayUnit(value, measurementUnit)); }} /></span>}
                      {batchMode !== 'width' && <span>{batchMode === 'height' ? 'Height' : 'H'} ({measurementUnit})<Input aria-label={`Target height in ${measurementUnit}`} type="number" value={formatMeasurement(batchHeightCm, measurementUnit)} min={measurementUnit === 'in' ? .2 : .5} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const value = Number(event.target.value); if (value > 0) setBatchHeightCm(fromDisplayUnit(value, measurementUnit)); }} /></span>}
                    </div>
                    <p>{batchMode === 'fit' ? 'Every photo becomes as large as possible inside this box without stretching.' : batchMode === 'exact' ? 'Every frame gets these exact dimensions; different proportions are cropped, never distorted.' : `Every photo gets the same ${batchMode}, while its other edge adjusts naturally.`}</p>
                    <Button className="batch-review" onClick={requestBatchResize}><BoxSelect /> Review resize for {batchTargets.length}</Button>
                  </div>
                  <div className="multi-project-actions">
                    <Button variant="outline" className="remove-wall-batch" disabled={!wallRemovalTargets.length} onClick={removeSelectedFromWall}><BoxSelect /> Remove {wallRemovalTargets.length} from wall</Button>
                    <Button variant="destructive" disabled={!removableSelected.length} onClick={requestRemoveSelected}><Trash2 /> Delete from project…</Button>
                    {(wallRemovalLockedCount > 0 || removeLockedCount > 0) && <small>{removeLockedCount} locked {removeLockedCount === 1 ? 'photo is' : 'photos are'} protected.</small>}
                  </div>
                  <div className="multi-selection-note"><Check /><span><b>Selection stays flexible.</b> Shift/Cmd-click photos or text. Drag any unlocked selected item to move the current selection.</span></div>
                </> : selected.kind === 'text' && selected.text ? <>
                  <div className="inspect-hero text-inspect-hero"><span className="text-hero-icon"><Type /></span><span style={{ background: selected.text.style.color }} /><div><small>EDITABLE TEXT</small><h2>{selected.code}</h2><p>{selected.text.value || 'Empty text box'}</p></div></div>
                  <div className="inspect-section text-content-editor">
                    <label>TEXT</label>
                    <Textarea
                      value={selected.text.value}
                      maxLength={2000}
                      aria-label={`Text content for ${selected.code}`}
                      onFocus={beginHistoryTransaction}
                      onBlur={endHistoryTransaction}
                      onChange={(event) => {
                        beginHistoryTransaction();
                        markHistoryTransactionChanged();
                        const value = event.target.value;
                        updateSelectedText((data) => ({ ...data, value }), false);
                      }}
                    />
                    <small>{selected.text.value.length} / 2,000 characters · line breaks are preserved</small>
                  </div>
                  <div className="inspect-section text-preset-section">
                    <div className="inspect-heading-row"><label>TEXT STYLE</label><b>{selected.text.presetId === 'custom' ? 'Custom' : TEXT_PRESETS.find((preset) => preset.id === selected.text?.presetId)?.name}</b></div>
                    <div className="text-preset-grid">{TEXT_PRESETS.map((preset) => <button type="button" key={preset.id} className={selected.text?.presetId === preset.id ? 'active' : ''} aria-pressed={selected.text?.presetId === preset.id} onClick={() => applyTextPreset(preset.id)}><span style={{ fontFamily: FONT_STACKS[preset.style.fontId], fontWeight: preset.style.fontWeight, fontStyle: preset.style.italic ? 'italic' : 'normal', color: preset.style.color, background: preset.style.backgroundColor }} >{preset.sample}</span><small>{preset.name}</small></button>)}</div>
                  </div>
                  <div className="inspect-section text-typography-section">
                    <label>TYPOGRAPHY</label>
                    <div className="text-font-row"><NativeSelect value={selected.text.style.fontId} aria-label="Text font family" onChange={(event) => updateSelectedTextStyle({ fontId: event.target.value as TextFontId })}><NativeSelectOption value="sans">Modern sans</NativeSelectOption><NativeSelectOption value="serif">Editorial serif</NativeSelectOption><NativeSelectOption value="mono">Monospace</NativeSelectOption><NativeSelectOption value="condensed">Condensed display</NativeSelectOption><NativeSelectOption value="hand">Handwritten</NativeSelectOption></NativeSelect><label><span>Size</span><Input type="number" min={4} max={300} step={1} value={selected.text.style.fontSizePt} aria-label="Font size in points" onFocus={(event) => { event.currentTarget.select(); beginHistoryTransaction(); }} onBlur={endHistoryTransaction} onChange={(event) => { const fontSizePt = clamp(Number(event.target.value), 4, 300); beginHistoryTransaction(); markHistoryTransactionChanged(); updateSelectedTextStyle({ fontSizePt }, false); }} /></label></div>
                    <div className="text-format-buttons" aria-label="Text formatting"><button type="button" className={selected.text.style.fontWeight >= 700 ? 'active' : ''} aria-label="Bold" aria-pressed={selected.text.style.fontWeight >= 700} onClick={() => updateSelectedTextStyle({ fontWeight: selected.text!.style.fontWeight >= 700 ? 500 : 800 })}><Bold /></button><button type="button" className={selected.text.style.italic ? 'active' : ''} aria-label="Italic" aria-pressed={selected.text.style.italic} onClick={() => updateSelectedTextStyle({ italic: !selected.text!.style.italic })}><Italic /></button><button type="button" className={selected.text.style.underline ? 'active' : ''} aria-label="Underline" aria-pressed={selected.text.style.underline} onClick={() => updateSelectedTextStyle({ underline: !selected.text!.style.underline })}><Underline /></button><button type="button" className={selected.text.style.uppercase ? 'active' : ''} aria-label="Uppercase" aria-pressed={selected.text.style.uppercase} onClick={() => updateSelectedTextStyle({ uppercase: !selected.text!.style.uppercase })}>AA</button><i /><button type="button" className={selected.text.style.align === 'left' ? 'active' : ''} aria-label="Align left" onClick={() => updateSelectedTextStyle({ align: 'left' })}><AlignLeft /></button><button type="button" className={selected.text.style.align === 'center' ? 'active' : ''} aria-label="Align center" onClick={() => updateSelectedTextStyle({ align: 'center' })}><AlignCenter /></button><button type="button" className={selected.text.style.align === 'right' ? 'active' : ''} aria-label="Align right" onClick={() => updateSelectedTextStyle({ align: 'right' })}><AlignRight /></button></div>
                    <div className="text-color-row"><label>Text color <input type="color" value={selected.text.style.color} aria-label="Text color" onChange={(event) => updateSelectedTextStyle({ color: event.target.value })} /></label><label className="text-gradient-toggle"><Switch size="sm" checked={Boolean(selected.text.style.gradientFrom && selected.text.style.gradientTo)} onCheckedChange={(checked) => updateSelectedTextStyle(checked ? { gradientFrom: selected.text!.style.color, gradientTo: '#ff6b9a' } : { gradientFrom: undefined, gradientTo: undefined })} /> Gradient</label>{selected.text.style.gradientFrom && selected.text.style.gradientTo && <><input type="color" value={selected.text.style.gradientFrom} aria-label="Gradient start color" onChange={(event) => updateSelectedTextStyle({ gradientFrom: event.target.value })} /><input type="color" value={selected.text.style.gradientTo} aria-label="Gradient end color" onChange={(event) => updateSelectedTextStyle({ gradientTo: event.target.value })} /></>}</div>
                    <label className="text-slider-label">LETTER SPACING <b>{selected.text.style.letterSpacingEm.toFixed(2)} em</b><Slider value={[selected.text.style.letterSpacingEm]} min={-.15} max={.8} step={.01} onValueChange={(value) => { beginHistoryTransaction(); markHistoryTransactionChanged(); updateSelectedTextStyle({ letterSpacingEm: sliderValue(value) }, false); }} onValueCommitted={endHistoryTransaction} /></label>
                    <label className="text-slider-label">LINE HEIGHT <b>{selected.text.style.lineHeight.toFixed(2)}</b><Slider value={[selected.text.style.lineHeight]} min={.7} max={2.4} step={.05} onValueChange={(value) => { beginHistoryTransaction(); markHistoryTransactionChanged(); updateSelectedTextStyle({ lineHeight: sliderValue(value) }, false); }} onValueCommitted={endHistoryTransaction} /></label>
                    <label className="text-slider-label">OPACITY <b>{Math.round(selected.text.style.opacity * 100)}%</b><Slider value={[selected.text.style.opacity]} min={.05} max={1} step={.01} onValueChange={(value) => { beginHistoryTransaction(); markHistoryTransactionChanged(); updateSelectedTextStyle({ opacity: sliderValue(value) }, false); }} onValueCommitted={endHistoryTransaction} /></label>
                  </div>
                  <div className="inspect-section text-effects-section">
                    <label>EFFECTS</label>
                    <div className={`text-effect-row text-background-row ${selected.text.style.backgroundColor && selected.text.style.backgroundOpacity > 0 ? 'enabled' : 'transparent'}`}><span><b>Text box background</b><small>{selected.text.style.backgroundColor && selected.text.style.backgroundOpacity > 0 ? 'A colour sits behind the letters' : 'Transparent · only the letters remain'}</small></span><input type="color" aria-label="Text box background color" value={selected.text.style.backgroundColor ?? '#ffffff'} onChange={(event) => updateSelectedTextStyle({ backgroundColor: event.target.value, backgroundOpacity: selected.text!.style.backgroundOpacity || 1 })} /><Switch size="sm" aria-label="Show text box background" checked={Boolean(selected.text.style.backgroundColor && selected.text.style.backgroundOpacity)} onCheckedChange={(checked) => updateSelectedTextStyle(checked ? { backgroundColor: selected.text!.style.backgroundColor ?? '#ffffff', backgroundOpacity: 1 } : { backgroundColor: undefined, backgroundOpacity: 0 })} />{selected.text.style.backgroundColor && selected.text.style.backgroundOpacity > 0 && <><label className="text-background-opacity">BACKGROUND OPACITY <b>{Math.round(selected.text.style.backgroundOpacity * 100)}%</b><Slider aria-label="Text box background opacity" value={[selected.text.style.backgroundOpacity]} min={.05} max={1} step={.01} onValueChange={(value) => { beginHistoryTransaction(); markHistoryTransactionChanged(); updateSelectedTextStyle({ backgroundOpacity: sliderValue(value) }, false); }} onValueCommitted={endHistoryTransaction} /></label><button type="button" className="text-background-remove" onClick={() => updateSelectedTextStyle({ backgroundColor: undefined, backgroundOpacity: 0 })}><X /> Make background transparent</button></>}</div>
                    <div className="text-effect-row"><span><b>Outline</b><small>Sticker and title effect</small></span><input type="color" aria-label="Text outline color" value={selected.text.style.strokeColor ?? '#ffffff'} onChange={(event) => updateSelectedTextStyle({ strokeColor: event.target.value, strokeWidthPt: selected.text!.style.strokeWidthPt || 2 })} /><Switch size="sm" checked={Boolean(selected.text.style.strokeColor && selected.text.style.strokeWidthPt)} onCheckedChange={(checked) => updateSelectedTextStyle(checked ? { strokeColor: selected.text!.style.strokeColor ?? '#ffffff', strokeWidthPt: 2 } : { strokeWidthPt: 0 })} /></div>
                    <div className="text-effect-row"><span><b>Shadow</b><small>Depth without changing the box size</small></span><input type="color" aria-label="Text shadow color" value={selected.text.style.shadowColor ?? '#171923'} onChange={(event) => updateSelectedTextStyle({ shadowColor: event.target.value, shadowBlurPt: selected.text!.style.shadowBlurPt || 3, shadowXPt: selected.text!.style.shadowXPt || 2, shadowYPt: selected.text!.style.shadowYPt || 2 })} /><Switch size="sm" checked={Boolean(selected.text.style.shadowColor && (selected.text.style.shadowBlurPt || selected.text.style.shadowXPt || selected.text.style.shadowYPt))} onCheckedChange={(checked) => updateSelectedTextStyle(checked ? { shadowColor: selected.text!.style.shadowColor ?? '#171923', shadowBlurPt: 3, shadowXPt: 2, shadowYPt: 2 } : { shadowBlurPt: 0, shadowXPt: 0, shadowYPt: 0 })} /></div>
                  </div>
                  <div className="inspect-section measurement-section"><div className="inspect-heading-row"><label>TEXT BOX SIZE</label><UnitToggle value={measurementUnit} onChange={setProjectUnit} label="Text box size unit" /></div><div className="two-inputs"><span>W ({measurementUnit})<Input type="number" value={formatMeasurement(selected.widthCm, measurementUnit)} min={.5} step={.1} onFocus={(event) => { event.currentTarget.select(); beginSizeEdit(); }} onBlur={endSizeEdit} onChange={(event) => changeSinglePrintSize('width', Number(event.target.value))} /></span><span>H ({measurementUnit})<Input type="number" value={formatMeasurement(selected.heightCm, measurementUnit)} min={.5} step={.1} onFocus={(event) => { event.currentTarget.select(); beginSizeEdit(); }} onBlur={endSizeEdit} onChange={(event) => changeSinglePrintSize('height', Number(event.target.value))} /></span></div></div>
                  <div className="inspect-section rotation-control"><label>ROTATION <b>{Math.round(selected.rotation)}°</b></label><Slider value={[selected.rotation]} min={-180} max={180} step={1} onValueChange={(value) => { beginHistoryTransaction(); markHistoryTransactionChanged(); updatePiece(selected.id, { rotation: sliderValue(value) }, false); }} onValueCommitted={endHistoryTransaction} /><div className="rotation-scale"><span>−180°</span><span>0°</span><span>180°</span></div></div>
                  <div className="inspect-section lock-row"><div><label>LOCK POSITION</label><p>Composition never moves text; lock also prevents hand dragging.</p></div><Switch checked={selected.locked} onCheckedChange={(checked) => updatePiece(selected.id, { locked: checked })} /></div>
                  <div className="inspect-section lock-row"><div><label>INCLUDE IN PRINT PACK</label><p>Print this text box at its exact wall size.</p></div><Switch checked={selected.text.printable} onCheckedChange={(checked) => updateSelectedText((data) => ({ ...data, printable: checked }))} /></div>
                  <div className="inspect-actions"><Button variant="outline" onClick={duplicateSelected}><Copy /> Duplicate</Button><Button variant="destructive" disabled={selected.locked} onClick={requestRemoveSelected}><Trash2 /> Delete text…</Button></div>
                </> : <>
                  <div className="inspect-hero"><img src={selected.src} alt={selected.name} /><span style={{ background: selected.color }} /><div><small>{selected.category}</small><h2>{selected.code}</h2><p>{selected.name}</p></div></div>
                  <div className="inspect-section measurement-section"><div className="inspect-heading-row"><label>PRINT SIZE</label><UnitToggle value={measurementUnit} onChange={setProjectUnit} label="Print size unit" /></div><div className="size-inputs-with-lock"><div className="two-inputs"><span>W ({measurementUnit})<Input aria-label={`Print width in ${measurementUnit}`} type="number" value={formatMeasurement(selected.widthCm, measurementUnit)} min={measurementUnit === 'in' ? .2 : .5} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => { event.currentTarget.select(); beginSizeEdit(); }} onBlur={endSizeEdit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onChange={(event) => changeSinglePrintSize('width', Number(event.target.value))} /></span><span>H ({measurementUnit})<Input aria-label={`Print height in ${measurementUnit}`} type="number" value={formatMeasurement(selected.heightCm, measurementUnit)} min={measurementUnit === 'in' ? .2 : .5} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => { event.currentTarget.select(); beginSizeEdit(); }} onBlur={endSizeEdit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onChange={(event) => changeSinglePrintSize('height', Number(event.target.value))} /></span></div><button className="aspect-toggle" aria-label={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'} aria-pressed={aspectLocked} onClick={() => setAspectLocked((locked) => !locked)}>{aspectLocked ? <Link2 /> : <Unlink2 />}</button></div><p>{aspectLocked ? 'Ratio locked · use any corner to resize proportionally.' : 'Ratio unlocked · drag a side handle to change only width or height; the image crops, never stretches.'}</p></div>
                  <div className="inspect-section"><label>WALL SCALE <b>{Math.round(selected.w)}%</b></label><Slider aria-label={`Wall scale for ${selected.code}`} value={[selected.w]} min={4} max={35} onValueChange={(value) => { const w = sliderValue(value); if (Math.abs(w - selected.w) < 0.0001) return; beginHistoryTransaction(); markHistoryTransactionChanged(); updatePiece(selected.id, { w, h: w * (selected.h / selected.w), sizeMode: 'custom' }, false); }} onValueCommitted={endHistoryTransaction} /></div>
                  <div className="inspect-section rotation-control">
                    <label>ROTATION <b>{Math.abs(selected.rotation) < 0.5 ? 0 : Math.round(selected.rotation)}°</b></label>
                    <Slider aria-label={`Rotation for ${selected.code}`} value={[selected.rotation]} min={-180} max={180} step={1} onValueChange={(value) => { const rotation = clamp(sliderValue(value), -180, 180); if (Math.abs(rotation - selected.rotation) < 0.0001) return; beginHistoryTransaction(); markHistoryTransactionChanged(); updatePiece(selected.id, { rotation }, false); }} onValueCommitted={endHistoryTransaction} />
                    <div className="rotation-scale" aria-hidden="true"><span>−180°</span><span>0°</span><span>180°</span></div>
                    <div className="nudge-row"><button onClick={() => updatePiece(selected.id, { rotation: 0 })}>Straighten · 0°</button><button aria-pressed={Math.abs(selected.rotation - 90) < 0.5} onClick={() => updatePiece(selected.id, { rotation: 90 })}><RotateCw /> Horizontal · 90°</button></div>
                  </div>
                  <PhotoBorderEditor pieces={[selected]} unit={measurementUnit} onChange={updateSelectedPhotoBorders} onBeginContinuous={beginHistoryTransaction} onEndContinuous={endHistoryTransaction} />
                  <div className="inspect-section lock-row"><div><label>LOCK POSITION</label><p>AI layouts will leave this piece exactly here.</p></div><Switch checked={selected.locked} onCheckedChange={(checked) => updatePiece(selected.id, { locked: checked })} /></div>
                  <div className="inspect-actions"><Button variant="outline" disabled={Boolean(cropSession)} onClick={duplicateSelected}><Copy /> Duplicate</Button><Button variant="outline" className="remove-from-wall" disabled={Boolean(cropSession)} onClick={() => togglePiecePlacement(selected)}>{selected.placed ? <BoxSelect /> : <Plus />}{selected.placed ? 'Remove from wall' : 'Place on wall'}</Button><Button variant="outline" disabled={!selected.placed || Boolean(cropSession)} onClick={() => startCrop(selected)}><Crop /> Crop & frame</Button><Button variant="destructive" disabled={selected.locked || Boolean(cropSession)} onClick={requestRemoveSelected}><Trash2 /> Delete from project…</Button></div>
                </>}
              </div>
            ) : panelMode === 'text' ? (
              <div className="text-panel-content">
                <div className="text-panel-heading"><span><Type /></span><div><small>TEXT TOOL</small><h2>Add words with personality</h2><p>Start with a style, then edit every detail in Inspect.</p></div></div>
                <div className="text-quick-add"><button onClick={() => addTextPiece('bold-headline', 'ADD A HEADING')}><b>Add a heading</b><small>Bold focal text</small></button><button onClick={() => addTextPiece('minimal-caption', 'Add a subheading')}><b>Add a subheading</b><small>Supporting copy</small></button><button onClick={() => addTextPiece('clean-sans', 'Type something')}><b>Add body text</b><small>Clean and flexible</small></button></div>
                <div className="text-library-heading"><div><label>STYLE LIBRARY</label><span>{TEXT_PRESETS.length} editable looks</span></div><p>Styles are starting points—not flattened images.</p></div>
                <div className="text-library-grid">{TEXT_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => addTextPiece(preset.id)}><span style={{ fontFamily: FONT_STACKS[preset.style.fontId], fontWeight: preset.style.fontWeight, fontStyle: preset.style.italic ? 'italic' : 'normal', color: preset.style.color, backgroundColor: preset.style.backgroundColor }}>{preset.sample}</span><small>{preset.name}</small><i><Plus /></i></button>)}</div>
                <div className="text-panel-tip"><Sparkles /><p><b>Print-ready text.</b> New text is included in Print Pack by default at the exact size shown on your wall. You can switch that off in Inspect.</p></div>
              </div>
            ) : (
              <div className="assistant-content">
                <div className="ai-heading"><span><Sparkles /></span><div><small>LAYOUT ASSISTANT</small><h2>Ask Cutroom</h2></div><i>{aiMode === 'openai' ? 'OPENAI' : aiMode === 'local' ? 'LOCAL FALLBACK' : 'SECURE AI'}</i></div>
                <div className="assistant-copy"><p>Describe any shape or visual rhythm—heart, wave, left ladder, spiral, or something entirely new. AI places rigid wall units while Cutroom protects their exact sizes.</p><div className="quick-prompts"><button onClick={() => setPrompt('Compare the wall items by physical size and arrange them as a ladder rising to the right, largest at the bottom.')}>Size ladder</button><button onClick={() => setPrompt('Arrange the wall items in a clear heart silhouette with balanced visual weight.')}>Heart</button><button onClick={() => setPrompt('Create a playful flowing wave, alternating warm and cool images along the curve.')}>Color wave</button></div><Textarea value={prompt} maxLength={MAX_AI_BRIEF_LENGTH} onChange={(event) => setPrompt(event.target.value)} aria-label="Layout brief" /></div>
                <div className="control-section"><label>GROUP BY <b>{groupStrength}%</b></label><div className="range-labels"><span>Color contrast</span><span>Theme</span></div><Slider value={[groupStrength]} onValueChange={(value) => setGroupStrength(sliderValue(value))} className="accent-slider" /></div>
                <div className="control-section"><label>CLASSIC TEMPLATES {layout === 'custom' && <b>AI CUSTOM ACTIVE</b>}</label><div className="choice-grid six">{layouts.map((item) => <button key={item.id} className={layout === item.id ? 'active' : ''} onClick={() => applyTemplate(item.id)}><i className={`shape ${item.id}`} /><span>{item.name}<small>{item.note}</small></span></button>)}</div></div>
                <div className="control-section compact"><label>DENSITY <b>{density < 40 ? 'Airy' : density > 75 ? 'Packed' : 'Balanced'}</b></label><Slider value={[density]} onValueChange={(value) => setDensity(sliderValue(value))} /></div>
                <div className="ai-note"><WandSparkles /><p><b>Why this works.</b> {aiResponse}</p></div>
                <Button className="generate-button" disabled={aiBusy} aria-busy={aiBusy} onClick={() => { void runAssistant(); }}><Send /> {aiBusy ? 'Thinking about your wall…' : 'Arrange from my brief'} <span>⌘ ↵</span></Button>
                <button className="candidate-link" onClick={() => setCandidateOpen(true)}><Layers3 /> Browse classic templates</button>
                <p className="privacy-note"><Lock /> {aiMode === 'local' ? 'Local fallback used—nothing was sent.' : 'Only your brief and piece details are sent. Photo files stay in this browser.'}</p>
              </div>
            )}
          </aside>

          {trayDragGhost && <div className="tray-drag-ghost" aria-hidden="true" style={{ left: trayDragGhost.x, top: trayDragGhost.y, width: trayDragGhost.w, height: trayDragGhost.h }}><img src={trayDragGhost.src} alt="" /><b>{codeForId(trayDragGhost.id)}</b></div>}

          {cropSession ? (
            <nav className="mobile-tool-nav mobile-crop-nav" aria-label="Mobile crop actions">
              <button onClick={cancelCrop}><X /><span>Cancel crop</span></button>
              <button className="active" onClick={finishCrop}><Check /><span>Done</span></button>
            </nav>
          ) : (
            <nav className="mobile-tool-nav" aria-label="Mobile editing tools">
              <button className={mobileTool === 'pieces' ? 'active' : ''} onClick={() => setMobileTool('pieces')}><ImagePlus /><span>Pieces</span></button>
              <button className={mobileTool === 'wall' ? 'active' : ''} onClick={() => setMobileTool('wall')}><Grid3X3 /><span>Wall</span></button>
              <button className={mobileTool === 'assistant' ? 'active' : ''} onClick={() => { setPanelMode('assistant'); setMobileTool('assistant'); }}><Sparkles /><span>AI layout</span></button>
              <button className={mobileTool === 'inspect' ? 'active' : ''} disabled={!selected} onClick={() => { setPanelMode('inspect'); setMobileTool('inspect'); }}><PanelRight /><span>Inspect</span></button>
            </nav>
          )}
        </section>
      ) : (
        <section className="print-workspace" inert={!hydrated ? true : undefined}>
          <aside className={`print-sidebar ${mobilePrintTool === 'settings' ? 'mobile-active' : ''}`}>
            <div className="panel-heading"><div><span>PRINT PACKER</span><h2>Save paper & time</h2></div><Scissors /></div>
            <div className="print-intro">Pack the photos and printable text placed on your wall. Every item starts at its exact wall size—even when all sizes differ.</div>
            <div className="print-unit-row"><span>MEASUREMENTS</span><UnitToggle value={measurementUnit} onChange={setProjectUnit} label="Print pack measurement unit" /></div>
            <div className="print-control"><label>PAPER SIZE</label><div className="two-inputs"><NativeSelect value={printPaper} onChange={(event) => changePrintPaper(event.target.value as keyof typeof PAPER_SIZES | 'Custom')}><NativeSelectOption value="A6">A6</NativeSelectOption><NativeSelectOption value="A5">A5</NativeSelectOption><NativeSelectOption value="A4">A4</NativeSelectOption><NativeSelectOption value="A3">A3</NativeSelectOption><NativeSelectOption value="A2">A2</NativeSelectOption><NativeSelectOption value="A1">A1</NativeSelectOption><NativeSelectOption value="Custom">Custom</NativeSelectOption></NativeSelect><button className={printLandscape ? 'active' : ''} onClick={togglePrintLandscape}><RotateCcw /> {printLandscape ? 'Landscape' : 'Portrait'}</button></div>{printPaper === 'Custom' && <div className="two-inputs custom-paper"><span>Width ({measurementUnit})<Input aria-label={`Custom sheet width in ${measurementUnit}`} type="number" value={formatMeasurement(customSheetW, measurementUnit)} min={formatMeasurement(10, measurementUnit)} max={formatMeasurement(200, measurementUnit)} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => { event.currentTarget.select(); beginHistoryTransaction(); }} onBlur={endHistoryTransaction} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onChange={(event) => { const value = Number(event.target.value); if (value > 0) { const widthCm = fromDisplayUnit(value, measurementUnit); if (Math.abs(widthCm - customSheetW) >= 0.0001) { beginHistoryTransaction(); markHistoryTransactionChanged(); setCustomSheetW(widthCm); setPrintPage(0); } } }} /></span><span>Height ({measurementUnit})<Input aria-label={`Custom sheet height in ${measurementUnit}`} type="number" value={formatMeasurement(customSheetH, measurementUnit)} min={formatMeasurement(10, measurementUnit)} max={formatMeasurement(200, measurementUnit)} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => { event.currentTarget.select(); beginHistoryTransaction(); }} onBlur={endHistoryTransaction} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onChange={(event) => { const value = Number(event.target.value); if (value > 0) { const heightCm = fromDisplayUnit(value, measurementUnit); if (Math.abs(heightCm - customSheetH) >= 0.0001) { beginHistoryTransaction(); markHistoryTransactionChanged(); setCustomSheetH(heightCm); setPrintPage(0); } } }} /></span></div>}</div>
            <div className="print-source-card"><span><Link2 /> SIZE SOURCE</span><b>{globalPrintScalePercent === null ? 'Mixed print-only sizes' : globalPrintScalePercent === 100 ? 'Actual wall sizes' : `${Math.round(globalPrintScalePercent)}% of wall sizes`}</b><p>The packer moves rectangles to save pages. It never enlarges them automatically to fill blank paper.</p></div>
            <div className={`print-control global-print-scale ${globalPrintScalePercent === null ? 'mixed' : ''}`}>
              <div className="global-scale-heading"><label>ALL ITEMS SCALE <b>{globalPrintScalePercent === null ? 'MIXED' : `${Math.round(globalPrintScalePercent)}%`}</b></label><button type="button" disabled={!Object.keys(printOverrides).length} onClick={resetGlobalPrintScale}><RotateCcw /> Original 100%</button></div>
              <Slider aria-label="Scale every Print Pack item from its original wall size" aria-valuetext={globalPrintScalePercent === null ? 'Mixed individual sizes' : `${Math.round(globalPrintScalePercent)} percent`} value={[globalPrintScalePercent ?? 100]} min={25} max={200} step={5} disabled={!printContents.length} onValueChange={(value) => changeGlobalPrintScale(sliderValue(value))} onValueCommitted={(value) => { endHistoryTransaction(); toast(`All Print Pack items scaled to ${Math.round(sliderValue(value))}% of their wall size.`); }} />
              <div className="global-scale-range"><span>25%</span><span>100% original</span><span>200%</span></div>
              <p>{globalPrintScalePercent === null ? 'Individual Print Pack sizes are mixed. Move the slider to replace them with one proportional scale.' : 'Every item keeps its original proportions and relative size. This changes Print Pack only, never the wall.'}</p>
            </div>
            <div className="print-control toggle-row"><div><label>SMART 90° ROTATION</label><p>Chooses 0° or 90° only for Auto photos. Any manual orientation always wins.</p></div><Switch checked={autoRotatePrint} onCheckedChange={changeAutoRotatePrint} aria-label="Auto-rotate photos 90 degrees to save print sheets" /></div>
            <div className="print-control print-piece-editor">
              <div className="print-editor-label"><label>SELECTED ITEM</label>{printSelectedHasOverride ? <b>PRINT OVERRIDE</b> : <span>WALL SIZE</span>}</div>
              {printSelectedContent && printSelectedSize ? <>
                <NativeSelect value={printSelectedContent.id} onChange={(event) => selectPrintPiece(event.target.value)} aria-label="Item or group to resize in Print Pack">
                  {printContents.map((content) => <NativeSelectOption value={content.id} key={content.id}>{content.code} · {content.name}</NativeSelectOption>)}
                </NativeSelect>
                <button className={`print-piece-hero ${printSelectedContent.kind === 'group' ? 'group-print-hero' : ''}`} aria-label={`Show ${printSelectedContent.code} in the Print Pack`} onClick={() => selectPrintPiece(printSelectedContent.id)}><i className="print-content-hero-preview"><PrintContentVisual content={printSelectedContent} pieces={printablePlacedPieces} frameWidth={printSelectedSize.widthCm} frameHeight={printSelectedSize.heightCm} /></i><span><b>{printSelectedContent.code}{printSelectedContent.kind === 'group' ? ` · ${printSelectedContent.memberIds.length} items together` : ''}</b><small>{printSelectedContent.kind === 'group' ? 'Wall group bounds' : 'Wall'} {measurementPairText(printSelectedContent.widthCm, printSelectedContent.heightCm, measurementUnit)}</small></span></button>
                <div className="preset-chips"><button onClick={() => setPrintPiecePreset(10.5, 14.8)}>A6</button><button onClick={() => setPrintPiecePreset(14.8, 21)}>A5</button><button onClick={() => setPrintPiecePreset(21, 29.7)}>A4</button></div>
                <div className="size-inputs-with-lock print-size-inputs"><div className="two-inputs"><span>W ({measurementUnit})<Input aria-label={`Print-only width for ${printSelectedContent.code} in ${measurementUnit}`} type="number" value={formatMeasurement(printSelectedSize.widthCm, measurementUnit)} min={measurementUnit === 'in' ? .2 : .5} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => { event.currentTarget.select(); beginHistoryTransaction(); }} onBlur={endHistoryTransaction} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onChange={(event) => changePrintPieceSize('width', Number(event.target.value))} /></span><span>H ({measurementUnit})<Input aria-label={`Print-only height for ${printSelectedContent.code} in ${measurementUnit}`} type="number" value={formatMeasurement(printSelectedSize.heightCm, measurementUnit)} min={measurementUnit === 'in' ? .2 : .5} step={measurementUnit === 'in' ? .05 : .1} onFocus={(event) => { event.currentTarget.select(); beginHistoryTransaction(); }} onBlur={endHistoryTransaction} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onChange={(event) => changePrintPieceSize('height', Number(event.target.value))} /></span></div><button className="aspect-toggle" disabled={printSelectedContent.kind === 'group'} aria-label={printSelectedContent.kind === 'group' ? 'Grouped print pieces always keep their aspect ratio' : printAspectLocked ? 'Unlock print aspect ratio' : 'Lock print aspect ratio'} aria-pressed={printSelectedContent.kind === 'group' || printAspectLocked} onClick={() => setPrintAspectLocked((locked) => !locked)}>{printSelectedContent.kind === 'group' || printAspectLocked ? <Link2 /> : <Unlink2 />}</button></div>
                <div className="print-orientation-editor">
                  <div><label>SHEET ORIENTATION</label><small>{printSelectedPlacement ? `Currently ${printRotationText(printSelectedPlacement.sheetRotation)} on its sheet` : 'Does not fit the current sheet'}</small></div>
                  <fieldset className="print-orientation-buttons">
                    <legend className="sr-only">Sheet orientation for {printSelectedContent.code}</legend>
                    <button type="button" className={printSelectedRotationChoice === 'auto' ? 'active' : ''} aria-pressed={printSelectedRotationChoice === 'auto'} onClick={() => setPrintPieceRotation('auto')}><Sparkles /> Auto</button>
                    <button type="button" className={printSelectedRotationChoice === 0 ? 'active' : ''} aria-pressed={printSelectedRotationChoice === 0} aria-label="Keep original sheet orientation" onClick={() => setPrintPieceRotation(0)}>0°</button>
                    <button type="button" className={printSelectedRotationChoice === 90 ? 'active' : ''} aria-pressed={printSelectedRotationChoice === 90} aria-label="Rotate 90 degrees clockwise on print sheets" onClick={() => setPrintPieceRotation(90)}><RotateCw /> 90°</button>
                    <button type="button" className={printSelectedRotationChoice === -90 ? 'active' : ''} aria-pressed={printSelectedRotationChoice === -90} aria-label="Rotate 90 degrees counter-clockwise on print sheets" onClick={() => setPrintPieceRotation(-90)}><RotateCcw /> −90°</button>
                    <button type="button" className={printSelectedRotationChoice === 180 ? 'active' : ''} aria-pressed={printSelectedRotationChoice === 180} aria-label="Rotate 180 degrees on print sheets" onClick={() => setPrintPieceRotation(180)}><RotateCw /> 180°</button>
                  </fieldset>
                </div>
                <p>{printSelectedHasOverride ? `Printing at ${measurementPairText(printSelectedSize.widthCm, printSelectedSize.heightCm, measurementUnit)}. The wall is still unchanged.` : 'This is the exact size selected on the wall. Edit either value only if this print needs a special trim size.'}</p>
                {printSelectedContent.kind === 'group' && <p className="print-group-note"><Link2 /> Group resizing stays proportional so its overlap and internal layout cannot drift.</p>}
                <div className="print-override-actions"><button disabled={!printSelectedHasOverride} onClick={resetPrintPieceSize}><RotateCcw /> Reset to wall</button><button disabled={!printSelectedHasOverride || printSelectedContent.kind === 'group'} onClick={updateWallFromPrintSize}><Move /> Update wall size too</button></div>
              </> : <div className="print-empty-editor"><ImagePlus /><b>No printable wall items</b><span>Place a photo or enable Print Pack for a text box.</span></div>}
            </div>
            <div className="print-control"><label>CUT SPACING <b>{measurementText(printGap, measurementUnit)}</b></label><Slider aria-label="Cut spacing" aria-valuetext={measurementText(printGap, measurementUnit)} value={[printGap]} min={0} max={2} step={0.1} onValueChange={(value) => { const gap = sliderValue(value); if (Math.abs(gap - printGap) < 0.0001) return; beginHistoryTransaction(); markHistoryTransactionChanged(); setPrintGap(gap); }} onValueCommitted={endHistoryTransaction} />{zeroCutSpacing && <p className="print-setting-note info"><Scissors /> Photos touch. Crop marks may overlap between pieces.</p>}</div>
            <div className="print-control"><label>PAGE MARGIN <b>{measurementText(printMargin, measurementUnit)}</b></label><Slider aria-label="Page margin" aria-valuetext={measurementText(printMargin, measurementUnit)} value={[printMargin]} min={0} max={3} step={0.1} onValueChange={(value) => { const margin = sliderValue(value); if (Math.abs(margin - printMargin) < 0.0001) return; beginHistoryTransaction(); markHistoryTransactionChanged(); setPrintMargin(margin); }} onValueCommitted={endHistoryTransaction} />{lowPageMargin && <output className="print-setting-note warning"><TriangleAlert /> Below {measurementText(0.3, measurementUnit)}, many printers may clip edge content. Export is still allowed.</output>}</div>
            <div className="print-control toggle-row"><div><label>CROP MARKS</label><p>Tiny corner guides for faster cutting.</p></div><Switch checked={cropMarks} onCheckedChange={changeCropMarks} /></div>
            <div className={`fit-summary ${printPlan.unplaced.length ? 'invalid' : ''}`}><span><b>{printItems.length - printPlan.unplaced.length}</b> items packed</span><span><b>{totalPrintPages || '—'}</b> sheets total</span><span><b>{printPlan.unplaced.length ? 'Too big' : `${printPlan.sparePercent}%`}</b> blank area</span></div>
            {oversizedPrintDetails.length > 0 && <div className="oversize-panel">
              <div className="oversize-heading"><span><TriangleAlert /><b>{oversizedPrintDetails.length} {oversizedPrintDetails.length === 1 ? 'item is' : 'items are'} too large</b></span><button onClick={() => applyBestFitToOversized()}>Fit all safely</button></div>
              <p>The named pieces cannot fit inside the selected page and margin. Nothing will export until you choose a larger page or resize them.</p>
              <div className="oversize-list">{oversizedPrintDetails.map(({ content, item, recommendation }) => <article key={content.id}>
                <div><b>{content.code} · {content.name}</b><small>Current {measurementPairText(item.widthCm, item.heightCm, measurementUnit)}</small><small>Best fit {measurementPairText(recommendation.widthCm, recommendation.heightCm, measurementUnit)} · {Math.round(recommendation.scale * 100)}% · {printRotationText(recommendation.sheetRotation)}</small></div>
                <button onClick={() => applyBestFitToOversized([content.id])}>Apply best fit</button>
              </article>)}</div>
            </div>}
            <Button className="print-export" disabled={!printItems.length || Boolean(printPlan.unplaced.length)} onClick={openPrintDownload}><Download /> Download print pack</Button>
          </aside>
          <section className={`print-stage ${mobilePrintTool === 'preview' ? 'mobile-active' : ''}`}>
            <div className="print-toolbar"><button onClick={() => setView('arrange')}><ArrowLeft /> Back to wall</button><div className="print-history-actions"><button aria-label="Undo" disabled={!history.length} onClick={undo}><Undo2 /> Undo</button><button aria-label="Redo" disabled={!future.length} onClick={redo}><Redo2 /> Redo</button></div><div><span>Sheet {totalPrintPages ? activePrintPage + 1 : 0} of {totalPrintPages}</span><button disabled={activePrintPage === 0} onClick={() => setPrintPage(activePrintPage - 1)}>Previous</button><button disabled={!totalPrintPages || activePrintPage >= totalPrintPages - 1} onClick={() => setPrintPage(activePrintPage + 1)}>Next</button></div></div>
            <div className="print-canvas-wrap">
              <div className={`print-sheet mixed-pack ${printLandscape ? 'landscape' : ''}`} style={{ aspectRatio: `${sheetW}/${sheetH}` }}>
                {pagePlan?.placements.map((placement) => {
                  const content = printContents.find((item) => item.id === placement.pieceId);
                  if (!content) return null;
                  const isSelected = printSelectedContent?.id === content.id;
                  const footprint = printPlacementFootprint(placement);
                  const rotated = placement.sheetRotation !== 0;
                  const rotationText = printRotationText(placement.sheetRotation);
                  return (
                    <button
                      type="button"
                      className={`print-cell mixed ${content.kind === 'group' ? 'print-group-cell' : ''} ${isSelected ? 'selected' : ''} ${printOverrides[content.id] ? 'overridden' : ''} ${rotated ? 'sheet-rotated' : ''}`}
                      key={placement.instanceId}
                      aria-label={`Select ${content.code}, ${content.name}, ${measurementPairText(placement.widthCm, placement.heightCm, measurementUnit)}, ${printRotationDescription(placement.sheetRotation)} on this sheet`}
                      aria-pressed={isSelected}
                      onClick={() => selectPrintPiece(content.id)}
                      style={{ left: `${placement.xCm / sheetW * 100}%`, top: `${placement.yCm / sheetH * 100}%`, width: `${footprint.widthCm / sheetW * 100}%`, height: `${footprint.heightCm / sheetH * 100}%` }}
                    >
                      <span className="print-placement-visual">
                        {rotated
                          ? <span className="print-placement-rotated-frame" style={{ width: `${placement.widthCm / footprint.widthCm * 100}%`, height: `${placement.heightCm / footprint.heightCm * 100}%`, transform: `translate(-50%, -50%) rotate(${placement.sheetRotation}deg)` }}><PrintContentVisual content={content} pieces={printablePlacedPieces} frameWidth={placement.widthCm} frameHeight={placement.heightCm} /></span>
                          : <PrintContentVisual content={content} pieces={printablePlacedPieces} frameWidth={placement.widthCm} frameHeight={placement.heightCm} />}
                      </span>
                      <b>{content.code}</b>
                      <small>{measurementPairText(placement.widthCm, placement.heightCm, measurementUnit)}</small>
                      {rotated && <i className="sheet-rotation-badge" title={`${rotationText} on this print sheet`}>{placement.sheetRotation === -90 ? <RotateCcw /> : <RotateCw />} {rotationText}</i>}
                      {cropMarks && <><i className="crop-mark tl" /><i className="crop-mark tr" /><i className="crop-mark bl" /><i className="crop-mark br" /></>}
                    </button>
                  );
                })}
                {!pagePlan && <div className="empty-print-sheet"><ImagePlus /><b>No wall photos to pack</b><span>Place photos on the wall, then return here.</span></div>}
              </div>
              <div className="sheet-caption"><b>{printPaper} · {measurementPairText(sheetW, sheetH, measurementUnit)}</b><span>Exact relative scale preview · Download as PDF, PNG or JPG</span></div>
            </div>
          </section>
          <aside className="print-help"><div className="mini-kicker">SMART PACK</div><h2>Original sizes, fewer sheets</h2><div className="saving-number">{totalPrintPages}<small>{printPaper} sheets</small></div><p>Cutroom packs mixed rectangles closely but leaves blank paper whenever filling it would require changing a photo’s chosen size.</p><div className="pack-checks"><span><Check /> Wall sizes are the default</span><span><Check /> Mixed sizes share one sheet</span><span><Check /> Wall crop is preserved</span><span><Check /> Preview and downloads use one plan</span><span><Check /> {rotatedPrintCount ? `${rotatedPrintCount} rotated on print sheets` : 'No rotated placements in this pack'}</span></div><button onClick={resetAllPrintSizes}><RotateCcw /> Reset every print to wall size</button></aside>

          <nav className="mobile-tool-nav mobile-print-nav" aria-label="Mobile print tools">
            <button className={mobilePrintTool === 'settings' ? 'active' : ''} onClick={() => setMobilePrintTool('settings')}><Scissors /><span>Print settings</span></button>
            <button className={mobilePrintTool === 'preview' ? 'active' : ''} onClick={() => setMobilePrintTool('preview')}><FileImage /><span>Sheet preview</span></button>
          </nav>
        </section>
      )}

      {notice && <output className="notice" aria-live="polite"><Check /> {notice}</output>}
      {!hydrated && !storageNotice && <output className="busy-overlay hydration-overlay" aria-live="polite" aria-busy="true"><span className="busy-spinner" /><b>Restoring your local project…</b><small>The editor will unlock after the saved project is checked.</small></output>}
      {!hydrated && storageNotice && <div className="recovery-workspace-lock" aria-hidden="true" />}
      {busy && <output className="busy-overlay" aria-live="polite" aria-busy="true"><span className="busy-spinner" /><b>{busy}</b><small>Large images are processed one step at a time.</small></output>}

      <Dialog open={printDownloadOpen} onOpenChange={(open) => { if (!busy) setPrintDownloadOpen(open); }}>
        <DialogContent className="cutroom-dialog print-download-dialog">
          <DialogHeader><DialogTitle>Download Print Pack</DialogTitle><DialogDescription>Your chosen photo sizes and the current sheet packing stay unchanged. Pick the file type that suits what you’re doing next.</DialogDescription></DialogHeader>
          <div className="print-download-summary"><span><Printer /></span><div><small>{printPaper} PAPER · {totalPrintPages} {totalPrintPages === 1 ? 'SHEET' : 'SHEETS'}</small><b>{measurementPairText(sheetW, sheetH, measurementUnit)}</b><p>{printItems.length} exact-size items · {measurementText(printGap, measurementUnit)} cut spacing</p></div></div>
          <fieldset className="print-format-grid"><legend className="sr-only">Print Pack file type</legend>
            <button type="button" aria-pressed={printExportFormat === 'pdf'} className={printExportFormat === 'pdf' ? 'active' : ''} onClick={() => choosePrintExportFormat('pdf')}><span className="format-icon pdf"><FileText /></span><span><b>PDF <em>Recommended</em></b><small>Guaranteed physical size and every sheet in one file.</small></span><i>{printExportFormat === 'pdf' && <Check />}</i></button>
            <button type="button" aria-pressed={printExportFormat === 'png'} className={printExportFormat === 'png' ? 'active' : ''} onClick={() => choosePrintExportFormat('png')}><span className="format-icon png"><FileImage /></span><span><b>PNG</b><small>Lossless image. Multiple sheets download as one ZIP.</small></span><i>{printExportFormat === 'png' && <Check />}</i></button>
            <button type="button" aria-pressed={printExportFormat === 'jpg'} className={printExportFormat === 'jpg' ? 'active' : ''} onClick={() => choosePrintExportFormat('jpg')}><span className="format-icon jpg"><ImageIcon /></span><span><b>JPG</b><small>Smaller image files. Multiple sheets download as one ZIP.</small></span><i>{printExportFormat === 'jpg' && <Check />}</i></button>
          </fieldset>
          {printExportFormat !== 'pdf' && <div className="print-dpi-section"><div><b>IMAGE QUALITY</b><span>Pixel size includes print-density metadata</span></div><fieldset aria-label="Raster export quality"><button type="button" className={printDpi === 150 ? 'active' : ''} aria-pressed={printDpi === 150} onClick={() => setPrintDpi(150)}>150 DPI<small>Compact</small></button><button type="button" className={printDpi === 300 ? 'active' : ''} aria-pressed={printDpi === 300} disabled={!raster300Spec.supported} onClick={() => setPrintDpi(300)}>300 DPI<small>Print quality</small></button></fieldset><p>Print at 100% / Actual size. PDF remains the safest choice when exact physical dimensions are critical.</p>{!rasterSpec.supported && <p className="raster-limit" role="alert"><TriangleAlert /> {rasterSpec.reason}</p>}</div>}
          {zeroCutSpacing && <div className="print-download-alert info"><Scissors /><p><b>Edge-to-edge packing</b><span>There is no cutting gap, so crop marks from neighbouring photos may touch.</span></p></div>}
          {lowPageMargin && <div className="print-download-alert warning" role="alert"><TriangleAlert /><p><b>Low page margin: {measurementText(printMargin, measurementUnit)}</b><span>Many home printers need at least {measurementText(0.3, measurementUnit)}. Borderless printers and print shops can continue, but an ordinary printer may clip the outer edge.</span></p></div>}
          <DialogFooter><Button variant="outline" onClick={() => setPrintDownloadOpen(false)}>Cancel</Button><Button onClick={() => void performPrintExport()} disabled={Boolean(busy) || (printExportFormat !== 'pdf' && !rasterSpec.supported)}><Download /> {lowPageMargin ? `Download anyway as ${printExportFormat.toUpperCase()}` : `Download ${printExportFormat.toUpperCase()}`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="cutroom-dialog import-dialog">
          <DialogHeader><DialogTitle>What did you upload?</DialogTitle><DialogDescription>We’ll keep the original untouched. Choose how it should enter the project.</DialogDescription></DialogHeader>
          {pendingAsset && <div className="import-preview"><img src={pendingAsset.src} alt={pendingAsset.name} /><span>{pendingAsset.name}<b>{pendingAsset.pixelW} × {pendingAsset.pixelH} px</b></span></div>}
          <div className="import-choices"><button onClick={() => pendingAsset && addSingleAsset(pendingAsset)}><FileImage /><span><b>One finished poster</b><small>Keep the whole image and assign a print size.</small></span><ChevronDown /></button><button onClick={openCutter}><Scissors /><span><b>A sheet with many photos</b><small>Use a grid, editable AI suggestions, or draw shaped cuts yourself.</small></span><ChevronDown /></button></div>
          <div className="import-size"><label>Finished poster size</label><UnitToggle value={measurementUnit} onChange={setProjectUnit} label="Imported poster measurement unit" /><NativeSelect value={posterPreset} onChange={(event) => setPosterPreset(event.target.value as PhotoSizePreset)}><NativeSelectOption value="Original">Original proportions · no crop</NativeSelectOption><NativeSelectOption value="A6">A6 · {measurementPairText(10.5, 14.8, measurementUnit)}</NativeSelectOption><NativeSelectOption value="A5">A5 · {measurementPairText(14.8, 21, measurementUnit)}</NativeSelectOption><NativeSelectOption value="A4">A4 · {measurementPairText(21, 29.7, measurementUnit)}</NativeSelectOption><NativeSelectOption value="A3">A3 · {measurementPairText(29.7, 42, measurementUnit)}</NativeSelectOption><NativeSelectOption value="A2">A2 · {measurementPairText(42, 59.4, measurementUnit)}</NativeSelectOption><NativeSelectOption value="A1">A1 · {measurementPairText(59.4, 84.1, measurementUnit)}</NativeSelectOption></NativeSelect>{posterPreset === 'Original' && <small className="original-size-note">Keeps the file’s exact ratio without cropping. Its starting print size is editable in Inspect.</small>}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={cutOpen} onOpenChange={setCutOpen}>
        <DialogContent className="cutroom-dialog cutter-dialog" showCloseButton={false}>
          <div className="cutter-head"><div><span>CUTOUT STUDIO</span><h2>Find, shape, then approve</h2></div><button onClick={() => setCutOpen(false)} aria-label="Close cutter"><X /></button></div>
          <div className="cutter-body">
            <aside>
              <label>METHOD</label>
              <div className="method-toggle cut-method-toggle">
                <button className={cutMode === 'grid' ? 'active' : ''} onClick={() => { setCutMode('grid'); setCutPreviewMode('edit'); setSelectedCutId(null); }}><Grid3X3 /> Grid</button>
                <button className={cutMode === 'ai' ? 'active' : ''} onClick={() => { setCutMode('ai'); setCutPreviewMode(cutRegions.length ? 'result' : 'edit'); setSelectedCutId(cutRegions[0]?.id ?? null); }}><WandSparkles /> AI detect</button>
                <button className={cutMode === 'manual' ? 'active' : ''} onClick={() => { setCutMode('manual'); setCutPreviewMode('edit'); setSelectedCutId(cutRegions[0]?.id ?? null); }}><Crop /> Manual</button>
              </div>

              {cutMode === 'grid' && <>
                <label>GRID</label>
                <div className="two-inputs"><span>Rows<Input type="number" min={1} max={10} value={rows} onChange={(event) => setRows(clamp(Number(event.target.value), 1, 10))} /></span><span>Columns<Input type="number" min={1} max={10} value={columns} onChange={(event) => setColumns(clamp(Number(event.target.value), 1, 10))} /></span></div>
                <p>Fastest for evenly divided sheets. Every source pixel, including the printed grid-line area, stays inside a cutout.</p>
                <button type="button" className="fine-tune-grid" onClick={fineTuneGrid}><Move /> Fine-tune this grid</button>
              </>}

              {cutMode === 'ai' && <>
                <label>WHAT SHOULD AI FIND?</label>
                <Textarea value={aiCutBrief} maxLength={1200} rows={4} onChange={(event) => setAiCutBrief(event.target.value)} placeholder="Example: Find the 3 couples and suggest one heart around each couple." />
                <label>PREFERRED SHAPE</label>
                <NativeSelect value={aiCutShapePreference} onChange={(event) => setAiCutShapePreference(event.target.value as AiCutoutShapePreference)}>
                  {AI_CUTOUT_SHAPE_PREFERENCES.map((shape) => <NativeSelectOption key={shape} value={shape}>{AI_CUTOUT_SHAPE_LABELS[shape]}</NativeSelectOption>)}
                </NativeSelect>
                <button type="button" className="ai-cut-detect" disabled={aiCutBusy} onClick={() => void runAiCutout()}><Sparkles /> {aiCutBusy ? 'Finding separate regions…' : 'Find editable cuts'}</button>
                <p className="ai-review-note"><TriangleAlert /> AI suggests geometry only. Inspect every edge and adjust it before creating files.</p>
                {aiCutError && <div className="ai-cut-status error" role="alert"><TriangleAlert /><span><b>Detection didn’t finish</b><small>{aiCutError}</small></span><button type="button" onClick={() => void runAiCutout()}>Retry</button></div>}
                {!aiCutError && cutRegions.some(({ source }) => source === 'ai-vision') && <output className="ai-cut-status success"><Check /><span><b>{cutRegions.length} editable cuts found</b><small>Preview them, then edit any region that needs correction.</small></span></output>}
              </>}

              {cutMode !== 'grid' && <>
                <label>{selectedCutId ? 'SELECTED / NEXT SHAPE' : 'ADD A SHAPE'}</label>
                <div className="cut-shape-grid">
                  {CUT_SHAPES.map((shape) => {
                    const selectedRegion = cutRegions.find(({ id }) => id === selectedCutId);
                    const pressed = selectedRegion ? selectedRegion.shape === shape : activeCutShape === shape;
                    return <button key={shape} type="button" className={pressed ? 'active' : ''} aria-pressed={pressed} onClick={() => changeSelectedCutShape(shape)}><span className={`cut-shape-swatch ${shape}`} />{CUT_SHAPE_LABELS[shape]}</button>;
                  })}
                </div>
                <p>{activeCutShape === 'polygon' ? 'Click point by point, then click the first dot or Finish shape. Every point stays editable.' : 'Drag on empty image space to add a cut. Drag a cut to move it; use any side or corner handle to resize it.'}</p>
                <div className="manual-actions cut-review-actions">
                  <button type="button" onClick={() => setSelectedCutId(null)}><Plus /> Add another</button>
                  <button type="button" onClick={removeSelectedCut} disabled={!selectedCutId}><Trash2 /> Delete selected</button>
                  <button type="button" onClick={undoLastCutRegion} disabled={!cutRegions.length}><Undo2 /> Undo last</button>
                  <button type="button" onClick={() => { updateCutRegions([]); setSelectedCutId(null); }} disabled={!cutRegions.length}><X /> Clear all</button>
                </div>
              </>}

              <label>SOURCE PAPER</label>
              <NativeSelect value={sheetPaper} onChange={(event) => setSheetPaper(event.target.value as keyof typeof PAPER_SIZES)}><NativeSelectOption value="A6">A6</NativeSelectOption><NativeSelectOption value="A5">A5</NativeSelectOption><NativeSelectOption value="A4">A4</NativeSelectOption><NativeSelectOption value="A3">A3</NativeSelectOption><NativeSelectOption value="A2">A2</NativeSelectOption><NativeSelectOption value="A1">A1</NativeSelectOption></NativeSelect>
              <div className="cut-count"><b>{cutMode === 'grid' ? gridRegions.length : cutRegions.length}</b><span>editable cutouts ready</span></div>
            </aside>
            <div className="cut-preview-wrap">
              <fieldset className="cut-preview-switch" aria-label="Cutout review view">
                <button type="button" className={cutPreviewMode === 'edit' ? 'active' : ''} aria-pressed={cutPreviewMode === 'edit'} onClick={() => setCutPreviewMode('edit')}><Crop /> Edit regions</button>
                <button type="button" className={cutPreviewMode === 'result' ? 'active' : ''} aria-pressed={cutPreviewMode === 'result'} disabled={(cutMode === 'grid' ? gridRegions.length : cutRegions.length) === 0} onClick={() => setCutPreviewMode('result')}><Eye /> Preview cuts <b>{cutMode === 'grid' ? gridRegions.length : cutRegions.length}</b></button>
                <span>LIVE PREVIEW · NOTHING CREATED YET</span>
              </fieldset>
              {pendingAsset && cutPreviewMode === 'edit' && <CutoutCanvas
                asset={{ src: pendingAsset.src, alt: `Sheet being cut: ${pendingAsset.name}`, pixelW: pendingAsset.pixelW, pixelH: pendingAsset.pixelH }}
                regions={cutMode === 'grid' ? gridRegions : cutRegions}
                activeShape={activeCutShape}
                selectedId={selectedCutId}
                onSelectedIdChange={setSelectedCutId}
                onRegionsChange={updateCutRegions}
                createRegionId={createCutRegionId}
                metadata={aiCutMeta}
                editable={cutMode !== 'grid'}
                disabled={aiCutBusy}
                className={`cut-preview ${cutMode}`}
                source={cutMode === 'ai' ? 'manual-after-ai' : 'manual'}
              />}
              {pendingAsset && cutPreviewMode === 'result' && <div className="cut-result-scroll"><CutoutResultPreview
                asset={{ src: pendingAsset.src, alt: pendingAsset.name, pixelW: pendingAsset.pixelW, pixelH: pendingAsset.pixelH }}
                regions={cutMode === 'grid' ? gridRegions : cutRegions}
                selectedId={selectedCutId}
                onSelectedIdChange={setSelectedCutId}
                metadata={aiCutMeta}
                heading="This is how the approved cutouts will look"
              /></div>}
              <p>{cutPreviewMode === 'result' ? <><b>Checkerboard areas will be transparent.</b> Click a preview to select it, then return to Edit regions for corrections.</> : cutMode === 'grid' ? <><b>Every source pixel is kept.</b> Grid lines are guides only; neighbouring cuts share the same source-pixel edge and include the outer border.</> : cutMode === 'ai' ? <><b>Dashed shapes are AI proposals.</b> Select, move, resize, reshape, add, or delete them—nothing is cut yet.</> : <><b>You control every cut.</b> Use geometric shapes or draw a custom outline point by point.</>}</p>
            </div>
          </div>
          <DialogFooter className="cutter-footer"><span className="cut-approval-copy"><Check /> Review complete? Only this button creates new Pieces.</span><Button variant="outline" onClick={() => setCutOpen(false)}>Cancel</Button><Button onClick={createCutouts} disabled={aiCutBusy || (cutMode === 'grid' ? !gridRegions.length : !cutRegions.length)}><Scissors /> Create {cutMode === 'grid' ? gridRegions.length : cutRegions.length} cutouts</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wallOpen} onOpenChange={(open) => { if (!open) endHistoryTransaction(); setWallOpen(open); if (open) { setWallDraftCm({ widthCm: wall.widthCm, heightCm: wall.heightCm }); setWallPreset(matchingWallPreset(wall.widthCm, wall.heightCm)); } }}>
        <DialogContent className="cutroom-dialog wall-dialog">
          <DialogHeader><DialogTitle>Set the real wall</DialogTitle><DialogDescription>Accurate dimensions keep generated layouts buildable in your room. Existing photos keep their physical print size.</DialogDescription></DialogHeader>
          <div className="wall-settings">
            <div className="wall-unit-row"><label>MEASUREMENT UNIT</label><UnitToggle value={measurementUnit} onChange={setProjectUnit} label="Wall measurement unit" /></div>
            <label>QUICK SIZE</label>
            <NativeSelect value={wallPreset} onChange={(event) => changeWallPreset(event.target.value)}>
              <NativeSelectOption value="custom">Custom size</NativeSelectOption>
              <NativeSelectOption value="desk">Desk wall · {measurementPairText(180, 110, measurementUnit)}</NativeSelectOption>
              <NativeSelectOption value="dorm">Bedroom · {measurementPairText(240, 160, measurementUnit)}</NativeSelectOption>
              <NativeSelectOption value="sofa">Above sofa · {measurementPairText(300, 170, measurementUnit)}</NativeSelectOption>
              <NativeSelectOption value="tall">Tall wall · {measurementPairText(130, 220, measurementUnit)}</NativeSelectOption>
            </NativeSelect>
            <div className="two-inputs">
              <span>Width ({measurementUnit})<Input aria-label={`Wall width in ${measurementUnit}`} type="number" value={formatMeasurement(wallDraftCm.widthCm, measurementUnit)} min={formatMeasurement(40, measurementUnit)} max={formatMeasurement(1000, measurementUnit)} step={measurementUnit === 'in' ? .1 : 1} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const value = Number(event.target.value); if (value > 0) { setWallDraftCm((current) => ({ ...current, widthCm: fromDisplayUnit(value, measurementUnit) })); setWallPreset('custom'); } }} /></span>
              <span>Height ({measurementUnit})<Input aria-label={`Wall height in ${measurementUnit}`} type="number" value={formatMeasurement(wallDraftCm.heightCm, measurementUnit)} min={formatMeasurement(40, measurementUnit)} max={formatMeasurement(500, measurementUnit)} step={measurementUnit === 'in' ? .1 : 1} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const value = Number(event.target.value); if (value > 0) { setWallDraftCm((current) => ({ ...current, heightCm: fromDisplayUnit(value, measurementUnit) })); setWallPreset('custom'); } }} /></span>
            </div>
            <small className="wall-size-note"><Link2 /> Photos stay at their real print dimensions while the wall preview rescales around them.</small>
            <label>WALL LOOK</label>
            <div className="wall-look"><button onClick={() => changeWallColor('#eee8dc')} style={{ background: '#eee8dc' }} aria-label="Warm chalk" /><button onClick={() => changeWallColor('#d4cbc0')} style={{ background: '#d4cbc0' }} aria-label="Greige" /><button onClick={() => changeWallColor('#b9c5c8')} style={{ background: '#b9c5c8' }} aria-label="Blue grey" /><button onClick={() => changeWallColor('#54605c')} style={{ background: '#54605c' }} aria-label="Deep green" /><span><PaintBucket /><Input type="color" value={wall.color} aria-label="Custom wall color" onFocus={beginHistoryTransaction} onBlur={endHistoryTransaction} onChange={(event) => { if (event.target.value !== wall.color) { beginHistoryTransaction(); markHistoryTransactionChanged(); setWall((current) => ({ ...current, color: event.target.value })); } }} /></span></div>
            <button className="wall-photo-button" onClick={() => wallUploadRef.current?.click()}><ImageIcon /><span><b>{wall.photo ? 'Replace wall photo' : 'Upload your wall photo'}</b><small>For a realistic room preview. Straight-on photos work best.</small></span></button>
            <label>ROOM BACKGROUND OPACITY <b>{Math.round(wall.photoOpacity * 100)}%</b></label><Slider aria-label="Room background photo opacity" aria-valuetext={`${Math.round(wall.photoOpacity * 100)}%`} value={[wall.photoOpacity * 100]} min={0} max={100} step={1} onValueChange={(value) => { const photoOpacity = sliderValue(value) / 100; if (Math.abs(photoOpacity - wall.photoOpacity) < .0001) return; beginHistoryTransaction(); markHistoryTransactionChanged(); setWall((current) => ({ ...current, photoOpacity })); }} onValueCommitted={endHistoryTransaction} /><small className="wall-opacity-note">0% shows only the wall colour · 100% shows the room photo fully.</small>
            <label>FURNITURE CLEARANCE <b>{measurementText(wall.furnitureClearanceCm, measurementUnit)}</b></label><Slider aria-label="Furniture clearance" aria-valuetext={measurementText(wall.furnitureClearanceCm, measurementUnit)} value={[wall.furnitureClearanceCm]} min={0} max={80} onValueChange={(value) => { const clearance = sliderValue(value); if (Math.abs(clearance - wall.furnitureClearanceCm) < 0.0001) return; beginHistoryTransaction(); markHistoryTransactionChanged(); setWall((current) => ({ ...current, furnitureClearanceCm: clearance })); }} onValueCommitted={endHistoryTransaction} />
          </div>
          <DialogFooter><Button onClick={applyWallDraft}>Use this wall</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="cutroom-dialog batch-resize-dialog">
          <DialogHeader><DialogTitle>Resize {batchTargets.length} of {selectedPieces.length} selected photos?</DialogTitle><DialogDescription>This is one reversible change. Locked photos are left exactly as they are.</DialogDescription></DialogHeader>
          <div className="batch-confirm-summary">
            <span><BoxSelect /></span>
            <div><small>{batchMethodLabel.toUpperCase()}</small><b>{batchTargetLabel}</b><p>{batchMode === 'exact' ? 'Frames use these exact dimensions; images crop to fill without stretching.' : 'Every image keeps its original proportions.'}</p></div>
          </div>
          <div className="batch-confirm-counts"><span><b>{selectedPieces.length}</b> selected</span><span><b>{batchTargets.length}</b> will resize</span><span className={batchLockedCount ? 'skipped' : ''}><b>{batchLockedCount}</b> locked skipped</span></div>
          <div className="batch-warning"><i>!</i><p><b>Positions will stay fixed.</b> Larger photos may overlap nearby photos or extend past a wall edge. Cutroom will flag either result after resizing, and one Undo restores every changed size.</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setBatchOpen(false)}>Cancel</Button><Button onClick={applyBatchResize}><BoxSelect /> Resize {batchTargets.length} photos</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="cutroom-dialog batch-resize-dialog remove-selected-dialog">
          <DialogHeader><DialogTitle>Delete {removableSelected.length} of {selectedPieces.length} selected {selectedPieces.length === 1 ? 'photo' : 'photos'} from the project?</DialogTitle><DialogDescription>This permanently removes them from Your Pieces, the wall, and Print Pack unless you use Undo.</DialogDescription></DialogHeader>
          <div className="batch-confirm-summary remove-confirm-summary">
            <span><Trash2 /></span>
            <div><small>DELETE SELECTED</small><b>{removableSelected.length} {removableSelected.length === 1 ? 'photo' : 'photos'} will be removed</b><p>Locked photos are protected. One Undo restores the photos, their crops, placements, and print-only sizes.</p></div>
          </div>
          <div className="batch-confirm-counts"><span><b>{selectedPieces.length}</b> selected</span><span><b>{removableSelected.length}</b> will delete</span><span className={removeLockedCount ? 'skipped' : ''}><b>{removeLockedCount}</b> locked skipped</span></div>
          <div className="batch-warning remove-warning"><i>!</i><p><b>This affects the whole project.</b> The selected unlocked photos disappear from the wall, loose tray, layer stack, and every print sheet.</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button><Button variant="destructive" onClick={applyRemoveSelected}><Trash2 /> Delete from project</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={candidateOpen} onOpenChange={setCandidateOpen}>
        <DialogContent className="cutroom-dialog candidate-dialog"><DialogHeader><DialogTitle>Classic starting points</DialogTitle><DialogDescription>These are dependable manual templates, separate from the AI’s freeform compositions. Every option keeps physical proportions and rigid groups.</DialogDescription></DialogHeader><div className="candidate-grid">{([
          { layout: 'compass' as const, reason: 'Build a central hero with supporting zones around it.' },
          { layout: 'organic' as const, reason: 'Create a loose, playful cloud with measured spacing.' },
          { layout: 'strip' as const, reason: 'Use clean cinematic bands for a strong reading rhythm.' },
        ]).map(({ layout: name, reason }, index) => <button key={name} onClick={() => { applyTemplate(name); setAiResponse(reason); }}><div className={`candidate-mini ${name}`}>{Array.from({ length: 13 }, (_, n) => <i key={n} style={{ background: COLORS[n % COLORS.length] }} />)}</div><span><em>0{index + 1}</em><b>{layouts.find((item) => item.id === name)?.name}</b><small>{reason}</small></span></button>)}</div></DialogContent>
      </Dialog>

      <Dialog open={restoreOpen} onOpenChange={(open) => { if (open) setRestoreOpen(true); else closeRestore(); }}>
        <DialogContent className="cutroom-dialog restore-dialog" aria-busy={Boolean(busy)}>
          <DialogHeader><DialogTitle>Replace this project?</DialogTitle><DialogDescription>The backup has been checked and decoded. Nothing changes until you confirm, and Cutroom saves the replacement before showing it.</DialogDescription></DialogHeader>
          {pendingRestore && <>
            <div className="restore-file-summary"><span><FileArchive /></span><div><small>VALID CUTROOM BACKUP</small><b>{pendingRestore.fileName}</b><p>{formatStorageBytes(pendingRestore.fileSize)} · format v{pendingRestore.sourceSchemaVersion}</p></div><Check /></div>
            <div className="restore-project-stats"><span><b>{pendingRestore.project.pieces.length}</b> photos</span><span><b>{pendingRestore.project.pieces.filter((piece) => piece.placed).length}</b> placed</span><span><b>{measurementPairText(pendingRestore.project.wall.widthCm, pendingRestore.project.wall.heightCm, pendingRestore.project.measurementUnit)}</b> wall</span></div>
            {pendingRestore.warnings.length > 0 && <div className="restore-warnings"><Sparkles /><div><b>Safe upgrades will be applied</b>{pendingRestore.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
            <div className="restore-replace-warning"><TriangleAlert /><p><b>Your open project will be replaced.</b><span>Download it first if you may want to return to it. Restore begins only after the backup is successfully written to local storage.</span></p></div>
          </>}
          <DialogFooter className="restore-footer"><Button variant="outline" disabled={Boolean(busy)} onClick={closeRestore}>Cancel</Button><Button variant="outline" disabled={Boolean(busy)} onClick={exportProject}><Download /> Download current first</Button><Button variant="destructive" disabled={Boolean(busy) || !pendingRestore} onClick={() => { void replaceWithBackup(); }}><FileArchive /> Replace project</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freshStartOpen} onOpenChange={(open) => { if (!busy) setFreshStartOpen(open); }}>
        <DialogContent className="cutroom-dialog fresh-start-dialog" aria-busy={Boolean(busy)}>
          <DialogHeader><DialogTitle>Replace damaged local data?</DialogTitle><DialogDescription>This saves the project currently visible on screen as a new local project. The damaged record cannot be recovered after replacement unless you download it first.</DialogDescription></DialogHeader>
          <div className="restore-replace-warning"><TriangleAlert /><p><b>Download raw recovery before continuing.</b><span>That untouched file gives us the best chance to inspect or repair the old record later.</span></p></div>
          <DialogFooter><Button variant="outline" disabled={Boolean(busy)} onClick={() => setFreshStartOpen(false)}>Cancel</Button>{storageNotice?.rawRecovery && <Button variant="outline" disabled={Boolean(busy)} onClick={downloadRawRecovery}><Download /> Raw recovery</Button>}<Button variant="destructive" disabled={Boolean(busy)} onClick={() => { void replaceCorruptLocalData(); }}><Trash2 /> Replace with open project</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="cutroom-dialog export-dialog"><DialogHeader><DialogTitle>Take the plan with you</DialogTitle><DialogDescription>Everything remains numbered so the digital design matches the pieces in your hands.</DialogDescription></DialogHeader><div className="export-options"><button onClick={exportWallPng}><FileImage /><span><b>Wall plan PNG</b><small>High-resolution numbered image for your phone.</small></span><Download /></button><button onClick={exportWallPdf}><FileText /><span><b>Installation PDF</b><small>Measured blueprint with a centre-out hanging guide.</small></span><Download /></button><button onClick={() => { setExportOpen(false); openPrintPack(); }}><Printer /><span><b>Print-sheet packer</b><small>Pack mixed wall-selected sizes efficiently on A6 through A1 or a custom sheet.</small></span><ChevronDown /></button><button onClick={exportProject}><FileArchive /><span><b>Download project backup</b><small>Portable JSON with photos, sizes, crops, IDs, print settings and placements.</small></span><Download /></button><button onClick={openBackupPicker}><Upload /><span><b>Restore project backup</b><small>Validate a Cutroom JSON backup, review it, then safely replace this project.</small></span><ChevronDown /></button></div>{storageHealth.supported && <div className={`export-storage-health ${storageNeedsAttention(storageHealth) ? 'warning' : ''}`}><span><Lock /></span><div><b>LOCAL STORAGE {storageHealth.persistent ? 'PROTECTED' : 'STANDARD'}</b><p>{storageHealth.usage !== undefined && storageHealth.quota !== undefined ? `${formatStorageBytes(storageHealth.usage)} of ${formatStorageBytes(storageHealth.quota)} used` : 'Your browser did not report a storage estimate.'}</p><small>Persistent storage reduces automatic browser cleanup; downloaded backups protect against device or browser-data loss.</small></div>{!storageHealth.persistent && <button onClick={() => { void protectLocalProject(); }}>Protect</button>}</div>}</DialogContent>
      </Dialog>
    </main>
  );
}
