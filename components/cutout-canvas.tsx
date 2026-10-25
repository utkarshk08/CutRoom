'use client';

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, next/no-img-element */

import * as React from 'react';
import {
  createPolygonCutRegion,
  cutRegionSvgPath,
  moveCutRegion,
  resizeCutRegion,
  sanitizeCutRegion,
  type CutPoint,
  type CutRegion,
  type CutResizeHandle,
  type CutShape,
} from '@/lib/sheet-cuts';

export type CutoutCanvasAsset = {
  src: string;
  alt?: string;
  pixelW?: number;
  pixelH?: number;
};

export type CutoutRegionMetadata = {
  label?: string;
  confidence?: number;
};

export type CutoutCanvasProps = {
  asset: CutoutCanvasAsset;
  regions: readonly CutRegion[];
  activeShape: CutShape;
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  onRegionsChange: (regions: CutRegion[]) => void;
  createRegionId: () => string;
  metadata?: Readonly<Record<string, CutoutRegionMetadata | undefined>>;
  editable?: boolean;
  disabled?: boolean;
  className?: string;
  source?: string;
};

type DragInteraction =
  | {
      kind: 'draw';
      pointerId: number;
      start: CutPoint;
      current: CutPoint;
    }
  | {
      kind: 'move';
      pointerId: number;
      start: CutPoint;
      original: CutRegion;
    }
  | {
      kind: 'resize';
      pointerId: number;
      start: CutPoint;
      original: CutRegion;
      handle: CutResizeHandle;
    }
  | {
      kind: 'vertex';
      pointerId: number;
      start: CutPoint;
      original: CutRegion;
      vertexIndex: number;
    };

type ExistingRegionInteraction =
  | { kind: 'move'; original: CutRegion }
  | {
      kind: 'resize';
      original: CutRegion;
      handle: CutResizeHandle;
    }
  | {
      kind: 'vertex';
      original: CutRegion;
      vertexIndex: number;
    };

const HANDLES: Array<{
  id: CutResizeHandle;
  left: number;
  top: number;
  cursor: React.CSSProperties['cursor'];
  label: string;
}> = [
  { id: 'nw', left: 0, top: 0, cursor: 'nwse-resize', label: 'top left' },
  { id: 'n', left: 0.5, top: 0, cursor: 'ns-resize', label: 'top' },
  { id: 'ne', left: 1, top: 0, cursor: 'nesw-resize', label: 'top right' },
  { id: 'e', left: 1, top: 0.5, cursor: 'ew-resize', label: 'right' },
  { id: 'se', left: 1, top: 1, cursor: 'nwse-resize', label: 'bottom right' },
  { id: 's', left: 0.5, top: 1, cursor: 'ns-resize', label: 'bottom' },
  { id: 'sw', left: 0, top: 1, cursor: 'nesw-resize', label: 'bottom left' },
  { id: 'w', left: 0, top: 0.5, cursor: 'ew-resize', label: 'left' },
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function regionBoxStyle(region: CutRegion): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${region.bounds.x * 100}%`,
    top: `${region.bounds.y * 100}%`,
    width: `${region.bounds.w * 100}%`,
    height: `${region.bounds.h * 100}%`,
    overflow: 'visible',
    pointerEvents: 'none',
  };
}

function normalizedRectangle(a: CutPoint, b: CutPoint) {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function pointerName(shape: CutShape) {
  if (shape === 'ellipse') return 'oval';
  if (shape === 'polygon') return 'custom polygon';
  return shape;
}

/**
 * A controlled, image-normalized cut-region editor. The source image is never
 * mutated here: this component only proposes and edits geometry for its parent.
 */
export function CutoutCanvas({
  asset,
  regions,
  activeShape,
  selectedId,
  onSelectedIdChange,
  onRegionsChange,
  createRegionId,
  metadata,
  editable = true,
  disabled = false,
  className,
  source = 'manual',
}: CutoutCanvasProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const regionsRef = React.useRef(regions);
  const interactionRef = React.useRef<DragInteraction | null>(null);
  const [fitWidth, setFitWidth] = React.useState<number | null>(null);
  const [drawingRect, setDrawingRect] = React.useState<{
    assetSrc: string;
    shape: Exclude<CutShape, 'polygon'>;
    start: CutPoint;
    current: CutPoint;
  } | null>(null);
  const [polygonDraftState, setPolygonDraftState] = React.useState<{
    assetSrc: string;
    points: CutPoint[];
  }>({ assetSrc: asset.src, points: [] });

  const canEdit = editable && !disabled;
  const polygonDraft = React.useMemo(
    () =>
      activeShape === 'polygon' && polygonDraftState.assetSrc === asset.src
        ? polygonDraftState.points
        : [],
    [activeShape, asset.src, polygonDraftState],
  );
  const currentDrawingRect =
    drawingRect?.assetSrc === asset.src ? drawingRect : null;
  const validAspect =
    typeof asset.pixelW === 'number' &&
    typeof asset.pixelH === 'number' &&
    asset.pixelW > 0 &&
    asset.pixelH > 0
      ? asset.pixelW / asset.pixelH
      : undefined;

  React.useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent || !validAspect || typeof ResizeObserver === 'undefined') {
      setFitWidth(null);
      return;
    }
    const fit = () => {
      const style = getComputedStyle(parent);
      const availableWidth = Math.max(1, parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const availableHeight = Math.max(1, parent.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      setFitWidth(
        Math.min(availableWidth, availableHeight * validAspect),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [asset.src, validAspect]);

  React.useLayoutEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  React.useEffect(() => {
    if (selectedId && !regions.some((region) => region.id === selectedId)) {
      onSelectedIdChange(null);
    }
  }, [onSelectedIdChange, regions, selectedId]);

  const pointFromPointer = React.useCallback(
    (event: Pick<React.PointerEvent, 'clientX' | 'clientY'>): CutPoint => {
      const bounds = rootRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return { x: 0, y: 0 };
      }
      return {
        x: clamp01((event.clientX - bounds.left) / bounds.width),
        y: clamp01((event.clientY - bounds.top) / bounds.height),
      };
    },
    [],
  );

  const replaceRegion = React.useCallback(
    (nextRegion: CutRegion) => {
      onRegionsChange(
        regionsRef.current.map((region) =>
          region.id === nextRegion.id ? nextRegion : { ...region },
        ),
      );
    },
    [onRegionsChange],
  );

  const beginInteraction = React.useCallback(
    (event: React.PointerEvent, interaction: ExistingRegionInteraction) => {
      if (!canEdit) return;
      event.preventDefault();
      event.stopPropagation();
      const start = pointFromPointer(event);
      interactionRef.current = {
        ...interaction,
        pointerId: event.pointerId,
        start,
      } as DragInteraction;
      rootRef.current?.setPointerCapture(event.pointerId);
      rootRef.current?.focus({ preventScroll: true });
    },
    [canEdit, pointFromPointer],
  );

  const finishPolygon = React.useCallback(() => {
    if (!canEdit || polygonDraft.length < 3) return;
    const region = createPolygonCutRegion(
      createRegionId(),
      polygonDraft,
      source,
    );
    if (!region) return;
    onRegionsChange([...regionsRef.current, region]);
    onSelectedIdChange(region.id);
    setPolygonDraftState({ assetSrc: asset.src, points: [] });
  }, [
    asset.src,
    canEdit,
    createRegionId,
    onRegionsChange,
    onSelectedIdChange,
    polygonDraft,
    source,
  ]);

  const deleteSelected = React.useCallback(() => {
    if (!canEdit || !selectedId) return;
    const next = regionsRef.current.filter(
      (region) => region.id !== selectedId,
    );
    if (next.length === regionsRef.current.length) return;
    onRegionsChange(next.map((region) => ({ ...region })));
    onSelectedIdChange(null);
  }, [canEdit, onRegionsChange, onSelectedIdChange, selectedId]);

  const handleBackgroundPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!canEdit || event.button !== 0 || event.target !== event.currentTarget)
      return;
    event.preventDefault();
    rootRef.current?.focus({ preventScroll: true });
    onSelectedIdChange(null);
    const point = pointFromPointer(event);
    if (activeShape === 'polygon') {
      setPolygonDraftState((current) => ({
        assetSrc: asset.src,
        points: [
          ...(current.assetSrc === asset.src ? current.points : []),
          point,
        ],
      }));
      return;
    }
    interactionRef.current = {
      kind: 'draw',
      pointerId: event.pointerId,
      start: point,
      current: point,
    };
    setDrawingRect({
      assetSrc: asset.src,
      shape: activeShape,
      start: point,
      current: point,
    });
    rootRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !canEdit)
      return;
    const point = pointFromPointer(event);
    const deltaX = point.x - interaction.start.x;
    const deltaY = point.y - interaction.start.y;
    if (interaction.kind === 'draw') {
      interactionRef.current = { ...interaction, current: point };
      setDrawingRect((current) =>
        current ? { ...current, current: point } : current,
      );
      return;
    }
    if (interaction.kind === 'move') {
      replaceRegion(moveCutRegion(interaction.original, deltaX, deltaY));
      return;
    }
    if (interaction.kind === 'resize') {
      replaceRegion(
        resizeCutRegion(
          interaction.original,
          interaction.handle,
          deltaX,
          deltaY,
        ),
      );
      return;
    }
    const points = interaction.original.points?.map((vertex) => ({
      ...vertex,
    }));
    if (!points?.[interaction.vertexIndex]) return;
    points[interaction.vertexIndex] = {
      x: clamp01(
        points[interaction.vertexIndex].x +
          deltaX / interaction.original.bounds.w,
      ),
      y: clamp01(
        points[interaction.vertexIndex].y +
          deltaY / interaction.original.bounds.h,
      ),
    };
    const next = sanitizeCutRegion({ ...interaction.original, points });
    if (next) replaceRegion(next);
  };

  const endInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === 'draw') {
      const point = pointFromPointer(event);
      const bounds = normalizedRectangle(interaction.start, point);
      const region = sanitizeCutRegion({
        id: createRegionId(),
        shape: activeShape,
        bounds,
        source,
      });
      if (region) {
        onRegionsChange([...regionsRef.current, region]);
        onSelectedIdChange(region.id);
      }
      setDrawingRect(null);
    }
    interactionRef.current = null;
    if (rootRef.current?.hasPointerCapture(event.pointerId)) {
      rootRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const cancelInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind !== 'draw') replaceRegion(interaction.original);
    interactionRef.current = null;
    setDrawingRect(null);
    if (rootRef.current?.hasPointerCapture(event.pointerId)) {
      rootRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target)) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.key === 'Escape') {
      if (polygonDraft.length || currentDrawingRect) {
        event.preventDefault();
        setPolygonDraftState({ assetSrc: asset.src, points: [] });
        setDrawingRect(null);
        interactionRef.current = null;
      }
      return;
    }
    if (
      event.key === 'Enter' &&
      activeShape === 'polygon' &&
      polygonDraft.length >= 3
    ) {
      event.preventDefault();
      finishPolygon();
    }
  };

  const drawingRegion: CutRegion | null = currentDrawingRect
    ? {
        id: '__drawing__',
        shape: currentDrawingRect.shape,
        bounds: normalizedRectangle(
          currentDrawingRect.start,
          currentDrawingRect.current,
        ),
      }
    : null;
  const polygonPath = polygonDraft.length
    ? polygonDraft
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'} ${point.x * 1000} ${point.y * 1000}`,
        )
        .join(' ')
    : '';

  return (
    <div
      ref={rootRef}
      className={className ? `cutout-canvas ${className}` : 'cutout-canvas'}
      role="application"
      aria-label={`Cutout editor. Draw a ${pointerName(activeShape)} on the source image.`}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={cancelInteraction}
      style={{
        position: 'relative',
        display: 'block',
        width: fitWidth ? `${fitWidth}px` : '100%',
        height: fitWidth && validAspect ? `${fitWidth / validAspect}px` : undefined,
        aspectRatio: validAspect,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        outline: 'none',
        cursor: canEdit
          ? activeShape === 'polygon'
            ? 'crosshair'
            : 'crosshair'
          : 'default',
      }}
    >
      <img
        src={asset.src}
        alt={asset.alt ?? 'Source sheet being divided into cutouts'}
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />

      {regions.map((region, index) => {
        const selected = region.id === selectedId;
        const detail = metadata?.[region.id];
        const label = detail?.label?.trim() || `Cut ${index + 1}`;
        const confidence =
          typeof detail?.confidence === 'number' &&
          Number.isFinite(detail.confidence)
            ? Math.round(Math.min(100, Math.max(0, detail.confidence)))
            : null;
        return (
          <React.Fragment key={region.id}>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={regionBoxStyle(region)}
              aria-hidden="true"
            >
              <path
                d={cutRegionSvgPath(region, 100, 100)}
                vectorEffect="non-scaling-stroke"
                fill={
                  selected
                    ? 'rgba(99, 91, 255, 0.19)'
                    : 'rgba(99, 91, 255, 0.10)'
                }
                stroke={selected ? '#635bff' : '#8a82ff'}
                strokeWidth={selected ? 2.5 : 1.75}
                strokeDasharray={
                  region.source === 'ai-vision' ? '7 4' : undefined
                }
                style={{
                  pointerEvents: disabled ? 'none' : 'all',
                  cursor: canEdit ? 'move' : 'pointer',
                }}
                onPointerDown={(event) => {
                  onSelectedIdChange(region.id);
                  if (canEdit)
                    beginInteraction(event, { kind: 'move', original: region });
                  else event.stopPropagation();
                }}
              />
            </svg>

            <button
              type="button"
              aria-label={`Select ${label}${confidence === null ? '' : `, ${confidence}% confidence`}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onSelectedIdChange(region.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                position: 'absolute',
                left: `calc(${region.bounds.x * 100}% + 5px)`,
                top: `calc(${region.bounds.y * 100}% + 5px)`,
                zIndex: selected ? 6 : 3,
                maxWidth: `calc(${region.bounds.w * 100}% - 10px)`,
                minHeight: 22,
                border: 0,
                borderRadius: 6,
                padding: '4px 7px',
                overflow: 'hidden',
                color: '#fff',
                background: selected ? '#5147e5' : 'rgba(20, 22, 32, 0.82)',
                boxShadow: '0 2px 8px rgba(17, 24, 39, 0.18)',
                font: '700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {String(index + 1).padStart(2, '0')} · {label}
              {confidence === null ? '' : ` · ${confidence}%`}
            </button>

            {selected &&
              canEdit &&
              HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  aria-label={`Resize ${label} from ${handle.label}`}
                  title={`Resize from ${handle.label}`}
                  onPointerDown={(event) =>
                    beginInteraction(event, {
                      kind: 'resize',
                      original: region,
                      handle: handle.id,
                    })
                  }
                  style={{
                    position: 'absolute',
                    zIndex: 8,
                    left: `${(region.bounds.x + region.bounds.w * handle.left) * 100}%`,
                    top: `${(region.bounds.y + region.bounds.h * handle.top) * 100}%`,
                    width: 14,
                    height: 14,
                    margin: -7,
                    padding: 0,
                    border: '2px solid #5147e5',
                    borderRadius:
                      handle.id === 'n' ||
                      handle.id === 'e' ||
                      handle.id === 's' ||
                      handle.id === 'w'
                        ? 4
                        : '50%',
                    background: '#fff',
                    boxShadow: '0 1px 5px rgba(17, 24, 39, 0.26)',
                    cursor: handle.cursor,
                  }}
                />
              ))}

            {selected &&
              canEdit &&
              region.shape === 'polygon' &&
              region.points?.map((vertex, vertexIndex) => (
                <button
                  key={`${region.id}-vertex-${vertexIndex}`}
                  type="button"
                  aria-label={`Move point ${vertexIndex + 1} of ${label}`}
                  title={`Polygon point ${vertexIndex + 1}`}
                  onPointerDown={(event) =>
                    beginInteraction(event, {
                      kind: 'vertex',
                      original: region,
                      vertexIndex,
                    })
                  }
                  style={{
                    position: 'absolute',
                    zIndex: 9,
                    left: `${
                      (region.bounds.x + region.bounds.w * vertex.x) * 100
                    }%`,
                    top: `${
                      (region.bounds.y + region.bounds.h * vertex.y) * 100
                    }%`,
                    width: 10,
                    height: 10,
                    margin: -5,
                    padding: 0,
                    border: '2px solid #fff',
                    borderRadius: '50%',
                    background: '#ff5fa2',
                    boxShadow:
                      '0 0 0 1px #5147e5, 0 1px 4px rgba(17, 24, 39, .24)',
                    cursor: 'move',
                  }}
                />
              ))}
          </React.Fragment>
        );
      })}

      {drawingRegion &&
        drawingRegion.bounds.w >= 0 &&
        drawingRegion.bounds.h >= 0 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ ...regionBoxStyle(drawingRegion), zIndex: 10 }}
            aria-hidden="true"
          >
            <path
              d={cutRegionSvgPath(drawingRegion, 100, 100)}
              vectorEffect="non-scaling-stroke"
              fill="rgba(255, 95, 162, 0.16)"
              stroke="#5147e5"
              strokeWidth={2}
              strokeDasharray="7 5"
            />
          </svg>
        )}

      {activeShape === 'polygon' && polygonDraft.length > 0 && (
        <>
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              zIndex: 10,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <path
              d={polygonPath}
              fill="none"
              stroke="#5147e5"
              strokeWidth={2}
              strokeDasharray="7 5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {polygonDraft.map((point, index) => (
            <button
              key={`${point.x}-${point.y}-${index}`}
              type="button"
              aria-label={
                index === 0 && polygonDraft.length >= 3
                  ? 'Close and finish custom shape'
                  : `Custom shape point ${index + 1}`
              }
              title={
                index === 0 && polygonDraft.length >= 3
                  ? 'Click to close shape'
                  : `Point ${index + 1}`
              }
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (index === 0 && polygonDraft.length >= 3) finishPolygon();
              }}
              style={{
                position: 'absolute',
                zIndex: 12,
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                width: index === 0 ? 14 : 10,
                height: index === 0 ? 14 : 10,
                margin: index === 0 ? -7 : -5,
                padding: 0,
                border: '2px solid #fff',
                borderRadius: '50%',
                background: index === 0 ? '#ff5fa2' : '#635bff',
                boxShadow: '0 0 0 1px #5147e5, 0 1px 4px rgba(17, 24, 39, .24)',
                cursor:
                  index === 0 && polygonDraft.length >= 3
                    ? 'pointer'
                    : 'default',
              }}
            />
          ))}
          <output
            style={{
              position: 'absolute',
              zIndex: 13,
              right: 10,
              bottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 6,
              border: '1px solid rgba(99, 91, 255, .2)',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, .94)',
              boxShadow: '0 7px 22px rgba(17, 24, 39, .16)',
            }}
          >
            <span
              style={{
                padding: '0 4px',
                color: '#4b5064',
                font: '650 10px/1.2 ui-sans-serif, system-ui, sans-serif',
              }}
            >
              {polygonDraft.length < 3
                ? `${3 - polygonDraft.length} more ${3 - polygonDraft.length === 1 ? 'point' : 'points'}`
                : `${polygonDraft.length} points ready`}
            </span>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setPolygonDraftState({ assetSrc: asset.src, points: [] });
              }}
              style={{
                minHeight: 30,
                border: '1px solid #dfe2ea',
                borderRadius: 7,
                padding: '0 10px',
                color: '#3f4352',
                background: '#fff',
                font: '700 10px/1 ui-sans-serif, system-ui, sans-serif',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={polygonDraft.length < 3}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                finishPolygon();
              }}
              style={{
                minHeight: 30,
                border: 0,
                borderRadius: 7,
                padding: '0 11px',
                color: '#fff',
                background: polygonDraft.length >= 3 ? '#635bff' : '#b9b6d9',
                font: '750 10px/1 ui-sans-serif, system-ui, sans-serif',
                cursor: polygonDraft.length >= 3 ? 'pointer' : 'not-allowed',
              }}
            >
              Finish shape
            </button>
          </output>
        </>
      )}

      <span className="sr-only" aria-live="polite">
        {selectedId
          ? `${metadata?.[selectedId]?.label ?? 'Cutout'} selected. Use the handles to resize, drag the shape to move it, or press Delete to remove it.`
          : activeShape === 'polygon'
            ? `Custom shape tool. Click point by point, then choose Finish shape.`
            : `${pointerName(activeShape)} tool. Drag across the photo to create a cutout.`}
      </span>
    </div>
  );
}
