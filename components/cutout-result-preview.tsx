'use client';

import * as React from 'react';
import {
  cutRegionSvgPath,
  type CutRegion,
  type CutShape,
} from '@/lib/sheet-cuts';

export type CutoutResultPreviewAsset = {
  src: string;
  alt?: string;
  pixelW?: number;
  pixelH?: number;
};

export type CutoutResultPreviewMetadata = {
  label?: string;
  confidence?: number;
};

export type CutoutResultPreviewProps = {
  asset: CutoutResultPreviewAsset;
  regions: readonly CutRegion[];
  /**
   * Pass a string or null to control selection. Leave undefined to let the
   * gallery keep its own selection.
   */
  selectedId?: string | null;
  onSelectedIdChange?: (id: string) => void;
  metadata?: Readonly<Record<string, CutoutResultPreviewMetadata | undefined>>;
  heading?: string;
  className?: string;
  ariaLabel?: string;
};

type SourceSize = {
  src: string;
  width: number;
  height: number;
};

const SHAPE_LABELS: Record<CutShape, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  heart: 'Heart',
  diamond: 'Diamond',
  polygon: 'Polygon',
};

const STYLES = `
  .cutout-result-preview {
    --crp-ink: #252838;
    --crp-muted: #73798a;
    --crp-line: #e1e4ec;
    --crp-accent: #6157ee;
    --crp-accent-soft: #f1efff;
    width: 100%;
    min-width: 0;
    color: var(--crp-ink);
  }

  .crp-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 16px;
  }

  .crp-heading-copy {
    min-width: 0;
  }

  .crp-eyebrow {
    display: block;
    margin-bottom: 4px;
    color: var(--crp-accent);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .13em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .crp-title {
    margin: 0;
    color: var(--crp-ink);
    font-size: clamp(17px, 2.3vw, 22px);
    font-weight: 800;
    letter-spacing: -.025em;
    line-height: 1.15;
  }

  .crp-description {
    max-width: 610px;
    margin: 7px 0 0;
    color: var(--crp-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .crp-transparency-key {
    white-space: nowrap;
    color: #5e6475;
    font-size: 10px;
    font-weight: 700;
  }

  .crp-key-swatch {
    display: inline-block;
    width: 13px;
    height: 13px;
    margin-right: 5px;
    border: 1px solid #d6d9e1;
    border-radius: 3px;
    background-color: #fff;
    background-image:
      linear-gradient(45deg, #dfe2e9 25%, transparent 25%),
      linear-gradient(-45deg, #dfe2e9 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #dfe2e9 75%),
      linear-gradient(-45deg, transparent 75%, #dfe2e9 75%);
    background-position: 0 0, 0 3px, 3px -3px, -3px 0;
    background-size: 6px 6px;
    vertical-align: -3px;
  }

  .crp-count {
    flex: 0 0 auto;
    padding: 7px 10px;
    border: 1px solid #dad6ff;
    border-radius: 999px;
    background: var(--crp-accent-soft);
    color: #5148d7;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }

  .crp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(172px, 1fr));
    gap: 12px;
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .crp-list-item {
    min-width: 0;
  }

  .crp-card {
    width: 100%;
    min-width: 0;
    padding: 7px;
    border: 1px solid var(--crp-line);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 3px 10px rgb(31 36 52 / 5%);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease,
      transform 150ms ease;
  }

  .crp-card:hover {
    border-color: #c5c0ff;
    box-shadow: 0 8px 20px rgb(59 53 140 / 11%);
    transform: translateY(-1px);
  }

  .crp-card:focus-visible {
    outline: 3px solid rgb(97 87 238 / 28%);
    outline-offset: 2px;
    border-color: var(--crp-accent);
  }

  .crp-card[data-selected='true'] {
    border-color: var(--crp-accent);
    box-shadow:
      0 0 0 2px rgb(97 87 238 / 13%),
      0 10px 24px rgb(59 53 140 / 14%);
  }

  .crp-stage {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border: 1px solid #dde0e8;
    border-radius: 10px;
    background-color: #fff;
    background-image:
      linear-gradient(45deg, #e5e7ed 25%, transparent 25%),
      linear-gradient(-45deg, #e5e7ed 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e5e7ed 75%),
      linear-gradient(-45deg, transparent 75%, #e5e7ed 75%);
    background-position: 0 0, 0 9px, 9px -9px, -9px 0;
    background-size: 18px 18px;
  }

  .crp-stage svg {
    display: block;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 3px 3px rgb(20 25 39 / 20%));
  }

  .crp-number {
    position: absolute;
    top: 7px;
    left: 7px;
    display: inline-grid;
    min-width: 26px;
    height: 24px;
    padding: 0 6px;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 62%);
    border-radius: 7px;
    background: rgb(25 28 41 / 82%);
    box-shadow: 0 2px 7px rgb(0 0 0 / 18%);
    color: #fff;
    font-size: 10px;
    font-weight: 850;
    letter-spacing: .05em;
    line-height: 1;
  }

  .crp-selected-badge {
    position: absolute;
    right: 7px;
    bottom: 7px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 7px;
    border: 1px solid rgb(255 255 255 / 60%);
    border-radius: 999px;
    background: rgb(74 64 207 / 91%);
    box-shadow: 0 2px 8px rgb(35 29 119 / 25%);
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
  }

  .crp-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    padding: 9px 3px 3px;
  }

  .crp-meta-copy {
    display: block;
    min-width: 0;
  }

  .crp-name {
    display: block;
    overflow: hidden;
    color: var(--crp-ink);
    font-size: 11px;
    font-weight: 800;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crp-shape {
    display: block;
    margin-top: 3px;
    color: var(--crp-muted);
    font-size: 9px;
    font-weight: 650;
    line-height: 1.2;
  }

  .crp-confidence {
    flex: 0 0 auto;
    padding: 4px 6px;
    border-radius: 6px;
    background: #edf8f3;
    color: #147955;
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
  }

  .crp-empty {
    display: grid;
    min-height: 190px;
    padding: 28px;
    place-items: center;
    border: 1px dashed #cfd3df;
    border-radius: 14px;
    background: #fafafe;
    color: var(--crp-muted);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
  }

  @media (max-width: 560px) {
    .crp-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
    }

    .crp-description {
      font-size: 11px;
    }

    .crp-transparency-key {
      display: block;
      margin-top: 7px;
    }

    .crp-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }

    .crp-card {
      padding: 5px;
      border-radius: 11px;
    }

    .crp-stage {
      border-radius: 8px;
    }
  }

  @media (max-width: 350px) {
    .crp-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .crp-card {
      transition: none;
    }
  }
`;

function isPositiveNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function clampedConfidence(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function buttonLabel(
  index: number,
  shape: CutShape,
  selected: boolean,
  label?: string,
  confidence?: number | null,
) {
  return [
    `Cutout ${index + 1}`,
    label?.trim() || undefined,
    SHAPE_LABELS[shape],
    confidence === null || confidence === undefined
      ? undefined
      : `${confidence}% AI confidence`,
    selected ? 'selected' : 'select to inspect',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Displays non-destructive, masked previews directly from the source sheet.
 * Nothing is rasterized: every tile is an SVG view of the original asset.
 */
export function CutoutResultPreview({
  asset,
  regions,
  selectedId,
  onSelectedIdChange,
  metadata,
  heading = 'See every cutout before creating',
  className,
  ariaLabel = 'Cutout approval preview',
}: CutoutResultPreviewProps) {
  const clipNamespace = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [internalSelectedId, setInternalSelectedId] = React.useState<
    string | null
  >(() => regions[0]?.id ?? null);
  const [intrinsicSize, setIntrinsicSize] = React.useState<SourceSize | null>(
    null,
  );
  const controlled = selectedId !== undefined;
  const internalSelectionExists = regions.some(
    (region) => region.id === internalSelectedId,
  );
  const activeId = controlled
    ? selectedId
    : internalSelectionExists
      ? internalSelectedId
      : (regions[0]?.id ?? null);

  const suppliedSize =
    isPositiveNumber(asset.pixelW) && isPositiveNumber(asset.pixelH)
      ? { width: asset.pixelW, height: asset.pixelH }
      : null;
  const measuredSize =
    intrinsicSize?.src === asset.src
      ? { width: intrinsicSize.width, height: intrinsicSize.height }
      : null;
  const sourceSize = suppliedSize ?? measuredSize ?? { width: 1, height: 1 };

  React.useEffect(() => {
    if (
      (isPositiveNumber(asset.pixelW) && isPositiveNumber(asset.pixelH)) ||
      !asset.src
    ) {
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      setIntrinsicSize({
        src: asset.src,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.src = asset.src;
    return () => {
      cancelled = true;
    };
  }, [asset.pixelH, asset.pixelW, asset.src]);

  const selectRegion = (id: string) => {
    if (!controlled) setInternalSelectedId(id);
    onSelectedIdChange?.(id);
  };

  const rootClassName = className
    ? `cutout-result-preview ${className}`
    : 'cutout-result-preview';
  const sourceLabel = asset.alt?.trim();

  return (
    <section
      className={rootClassName}
      aria-label={sourceLabel ? `${ariaLabel} for ${sourceLabel}` : ariaLabel}
    >
      <style>{STYLES}</style>
      <div className="crp-header">
        <div className="crp-heading-copy">
          <span className="crp-eyebrow">Approval preview</span>
          <h3 className="crp-title">{heading}</h3>
          <p className="crp-description">
            Select a preview to inspect its region.{' '}
            <span className="crp-transparency-key">
              <span className="crp-key-swatch" aria-hidden="true" />
              Checkerboard = transparent
            </span>
          </p>
        </div>
        <span
          className="crp-count"
          aria-label={`${regions.length} cutouts ready`}
        >
          {regions.length} ready
        </span>
      </div>

      {regions.length ? (
        <ul className="crp-grid" aria-label="Cutouts to review">
          {regions.map((region, index) => {
            const selected = region.id === activeId;
            const detail = metadata?.[region.id];
            const label = detail?.label?.trim();
            const confidence = clampedConfidence(detail?.confidence);
            const left = region.bounds.x * sourceSize.width;
            const top = region.bounds.y * sourceSize.height;
            const width = Math.max(region.bounds.w * sourceSize.width, 0.001);
            const height = Math.max(region.bounds.h * sourceSize.height, 0.001);
            const localPath = cutRegionSvgPath(region, width, height);
            const clipId = `crp-${clipNamespace}-${index}`;

            return (
              <li className="crp-list-item" key={region.id}>
                <button
                  type="button"
                  className="crp-card"
                  data-selected={selected}
                  aria-label={buttonLabel(
                    index,
                    region.shape,
                    selected,
                    label,
                    confidence,
                  )}
                  aria-pressed={selected}
                  onClick={() => selectRegion(region.id)}
                >
                  <span className="crp-stage" aria-hidden="true">
                    <svg
                      viewBox={`${left} ${top} ${width} ${height}`}
                      preserveAspectRatio="xMidYMid meet"
                      focusable="false"
                    >
                      <defs>
                        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                          <path
                            d={localPath}
                            transform={`translate(${left} ${top})`}
                          />
                        </clipPath>
                      </defs>
                      <image
                        href={asset.src}
                        x="0"
                        y="0"
                        width={sourceSize.width}
                        height={sourceSize.height}
                        preserveAspectRatio="none"
                        clipPath={`url(#${clipId})`}
                      />
                    </svg>
                    <span className="crp-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {selected ? (
                      <span className="crp-selected-badge">✓ Selected</span>
                    ) : null}
                  </span>
                  <span className="crp-meta">
                    <span className="crp-meta-copy">
                      <span className="crp-name">
                        {label || `Cutout ${index + 1}`}
                      </span>
                      <span className="crp-shape">
                        {SHAPE_LABELS[region.shape]} mask
                      </span>
                    </span>
                    {confidence === null ? null : (
                      <span
                        className="crp-confidence"
                        title="AI detection confidence"
                      >
                        {confidence}%
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <output className="crp-empty">
          No cutouts to preview yet. Add regions or run detection to see the
          approval gallery here.
        </output>
      )}
    </section>
  );
}
