export type TextFontId = 'sans' | 'serif' | 'mono' | 'condensed' | 'hand';
export type TextAlign = 'left' | 'center' | 'right';

export type TextStyle = {
  fontId: TextFontId;
  fontSizePt: number;
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  lineHeight: number;
  letterSpacingEm: number;
  uppercase: boolean;
  color: string;
  gradientFrom?: string;
  gradientTo?: string;
  opacity: number;
  strokeColor?: string;
  strokeWidthPt: number;
  shadowColor?: string;
  shadowBlurPt: number;
  shadowXPt: number;
  shadowYPt: number;
  backgroundColor?: string;
  backgroundOpacity: number;
  radiusCm: number;
};

export type TextPreset = {
  id: string;
  name: string;
  sample: string;
  style: TextStyle;
};

export type TextPieceData = {
  value: string;
  presetId: string;
  printable: boolean;
  style: TextStyle;
};

export const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8WQAAAABJRU5ErkJggg==';

const base: TextStyle = {
  fontId: 'sans', fontSizePt: 32, fontWeight: 700, italic: false, underline: false,
  align: 'center', lineHeight: 1.05, letterSpacingEm: 0, uppercase: false,
  color: '#171923', opacity: 1, strokeWidthPt: 0, shadowBlurPt: 0,
  shadowXPt: 0, shadowYPt: 0, backgroundOpacity: 0, radiusCm: 0.3,
};

const preset = (id: string, name: string, sample: string, style: Partial<TextStyle>): TextPreset => ({
  id, name, sample, style: { ...base, ...style },
});

export const TEXT_PRESETS: TextPreset[] = [
  preset('clean-sans', 'Clean Sans', 'Your story', { fontSizePt: 30, fontWeight: 600 }),
  preset('bold-headline', 'Bold Headline', 'MAKE IT BIG', { fontSizePt: 42, fontWeight: 900, uppercase: true, letterSpacingEm: -.04 }),
  preset('tall-poster', 'Tall Poster', 'MIDNIGHT', { fontId: 'condensed', fontSizePt: 44, fontWeight: 800, uppercase: true, letterSpacingEm: .08 }),
  preset('minimal-caption', 'Minimal Caption', 'a quiet little note', { fontSizePt: 17, fontWeight: 500, letterSpacingEm: .08 }),
  preset('soft-serif', 'Soft Serif', 'Slow Sunday', { fontId: 'serif', fontSizePt: 34, fontWeight: 500, color: '#423b4f' }),
  preset('editorial-italic', 'Editorial Italic', 'The Edit', { fontId: 'serif', fontSizePt: 38, fontWeight: 700, italic: true, align: 'left' }),
  preset('luxe-gold', 'Luxe Gold', 'GOLDEN HOUR', { fontId: 'serif', fontSizePt: 32, fontWeight: 600, uppercase: true, color: '#9b6b12', letterSpacingEm: .16 }),
  preset('film-credits', 'Film Credits', 'A CUTROOM FILM', { fontId: 'condensed', fontSizePt: 19, fontWeight: 600, uppercase: true, letterSpacingEm: .24 }),
  preset('typewriter', 'Typewriter', 'chapter one_', { fontId: 'mono', fontSizePt: 25, fontWeight: 500, align: 'left' }),
  preset('handwritten', 'Handwritten Note', 'remember this!', { fontId: 'hand', fontSizePt: 33, fontWeight: 600, italic: true, color: '#1747c9', align: 'left' }),
  preset('brush-script', 'Brush Script', 'Good vibes', { fontId: 'hand', fontSizePt: 40, fontWeight: 800, italic: true, color: '#ad2f66' }),
  preset('marker', 'Marker Scribble', 'NO RULES', { fontId: 'hand', fontSizePt: 38, fontWeight: 900, uppercase: true, letterSpacingEm: .04 }),
  preset('comic-pop', 'Comic Pop', 'WOW!', { fontSizePt: 44, fontWeight: 900, uppercase: true, color: '#ffe34f', strokeColor: '#171923', strokeWidthPt: 3, shadowColor: '#ff5a78', shadowXPt: 4, shadowYPt: 4 }),
  preset('sticker-pop', 'Sticker Pop', 'GOOD STUFF', { fontSizePt: 35, fontWeight: 900, uppercase: true, color: '#635bff', strokeColor: '#ffffff', strokeWidthPt: 5, shadowColor: '#171923', shadowXPt: 3, shadowYPt: 3 }),
  preset('white-outline', 'White Outline', 'OUTLINE', { fontSizePt: 38, fontWeight: 900, uppercase: true, color: '#171923', strokeColor: '#ffffff', strokeWidthPt: 3 }),
  preset('neon-glow', 'Neon Glow', 'AFTER DARK', { fontSizePt: 36, fontWeight: 800, uppercase: true, color: '#ffffff', shadowColor: '#8b5cff', shadowBlurPt: 9, backgroundColor: '#171923', backgroundOpacity: 1, radiusCm: .55 }),
  preset('retro-offset', 'Retro Offset', 'WEEKEND', { fontId: 'serif', fontSizePt: 37, fontWeight: 900, uppercase: true, color: '#ff6b88', shadowColor: '#30c6c4', shadowXPt: 5, shadowYPt: 4, backgroundColor: '#fff2bd', backgroundOpacity: 1, radiusCm: .2 }),
  preset('y2k-bubble', 'Y2K Bubble', 'dream.exe', { fontSizePt: 34, fontWeight: 900, color: '#ffffff', gradientFrom: '#765cff', gradientTo: '#ff72b5', strokeColor: '#ffffff', strokeWidthPt: 2, radiusCm: .8 }),
  preset('varsity', 'Varsity', 'CHAMPIONS', { fontId: 'serif', fontSizePt: 35, fontWeight: 900, uppercase: true, color: '#f7efe3', strokeColor: '#17395c', strokeWidthPt: 4, letterSpacingEm: .04 }),
  preset('grunge-stamp', 'Grunge Stamp', 'APPROVED', { fontId: 'condensed', fontSizePt: 35, fontWeight: 900, uppercase: true, color: '#a33a33', strokeColor: '#a33a33', strokeWidthPt: 1, letterSpacingEm: .1, italic: true }),
  preset('mono-label', 'Monochrome Label', 'ARCHIVE 001', { fontId: 'mono', fontSizePt: 20, fontWeight: 700, uppercase: true, color: '#ffffff', backgroundColor: '#171923', backgroundOpacity: 1, letterSpacingEm: .08, radiusCm: .1 }),
  preset('pastel-highlight', 'Pastel Highlight', 'tiny joy club', { fontSizePt: 29, fontWeight: 800, color: '#473d78', backgroundColor: '#ddd6ff', backgroundOpacity: 1, radiusCm: .5 }),
  preset('gradient-punch', 'Gradient Punch', 'CREATE MORE', { fontSizePt: 40, fontWeight: 900, uppercase: true, color: '#635bff', gradientFrom: '#635bff', gradientTo: '#ff5f9e', letterSpacingEm: -.03 }),
  preset('horror-title', 'Horror Title', 'DON’T LOOK', { fontId: 'serif', fontSizePt: 38, fontWeight: 900, uppercase: true, color: '#d72e3e', strokeColor: '#120b0d', strokeWidthPt: 2, shadowColor: '#120b0d', shadowBlurPt: 3, letterSpacingEm: .09 }),
];

export const TEXT_PRESET_IDS = new Set(TEXT_PRESETS.map(({ id }) => id));
export const TEXT_FONT_IDS = new Set<TextFontId>(['sans', 'serif', 'mono', 'condensed', 'hand']);

export const FONT_STACKS: Record<TextFontId, string> = {
  sans: 'var(--font-geist-sans), Arial, sans-serif',
  serif: 'Georgia, Times New Roman, serif',
  mono: 'var(--font-geist-mono), Menlo, monospace',
  condensed: 'Impact, Arial Narrow, sans-serif',
  hand: 'Comic Sans MS, Marker Felt, cursive',
};

const POINT_TO_CM = 2.54 / 72;
const TEXT_MEASUREMENT_PIXELS_PER_CM = 100;
let sharedMeasurementContext: CanvasRenderingContext2D | null | undefined;
let sharedGraphemeSegmenter: Intl.Segmenter | undefined;

export type TextBoxInsetsCm = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TextBoxSize = {
  widthCm: number;
  heightCm: number;
  lineCount: number;
};

function canvasFontStack(fontId: TextFontId) {
  if (typeof document !== 'undefined') {
    const styles = getComputedStyle(document.body);
    if (fontId === 'sans') return `${styles.getPropertyValue('--font-geist-sans').trim() || 'Arial'}, Arial, sans-serif`;
    if (fontId === 'mono') return `${styles.getPropertyValue('--font-geist-mono').trim() || 'Menlo'}, Menlo, monospace`;
  }
  if (fontId === 'serif') return 'Georgia, Times New Roman, serif';
  if (fontId === 'condensed') return 'Impact, Arial Narrow, sans-serif';
  if (fontId === 'hand') return 'Comic Sans MS, Marker Felt, cursive';
  return 'Arial, sans-serif';
}

const hex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const finite = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function cloneTextData(data: TextPieceData): TextPieceData {
  return { ...data, style: { ...data.style } };
}

export function styleForPreset(id: string): TextStyle {
  const found = TEXT_PRESETS.find((item) => item.id === id) ?? TEXT_PRESETS[0];
  return { ...found.style };
}

export function createTextData(presetId = TEXT_PRESETS[0].id, value?: string): TextPieceData {
  const found = TEXT_PRESETS.find((item) => item.id === presetId) ?? TEXT_PRESETS[0];
  return { value: value ?? found.sample, presetId: found.id, printable: true, style: { ...found.style } };
}

export function sanitizeTextData(value: unknown): TextPieceData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const rawStyle = source.style && typeof source.style === 'object' && !Array.isArray(source.style) ? source.style as Record<string, unknown> : {};
  const presetId = typeof source.presetId === 'string' && TEXT_PRESET_IDS.has(source.presetId) ? source.presetId : TEXT_PRESETS[0].id;
  const fallback = styleForPreset(presetId);
  const weight = finite(rawStyle.fontWeight, fallback.fontWeight, 400, 900);
  const normalizedWeight = ([400, 500, 600, 700, 800, 900] as const).reduce((best, item) => Math.abs(item - weight) < Math.abs(best - weight) ? item : best, 400);
  return {
    value: typeof source.value === 'string' ? source.value.slice(0, 2_000) : 'Your text',
    presetId,
    printable: source.printable !== false,
    style: {
      fontId: typeof rawStyle.fontId === 'string' && TEXT_FONT_IDS.has(rawStyle.fontId as TextFontId) ? rawStyle.fontId as TextFontId : fallback.fontId,
      fontSizePt: finite(rawStyle.fontSizePt, fallback.fontSizePt, 4, 300),
      fontWeight: normalizedWeight,
      italic: rawStyle.italic === true,
      underline: rawStyle.underline === true,
      align: rawStyle.align === 'left' || rawStyle.align === 'right' ? rawStyle.align : 'center',
      lineHeight: finite(rawStyle.lineHeight, fallback.lineHeight, .7, 3),
      letterSpacingEm: finite(rawStyle.letterSpacingEm, fallback.letterSpacingEm, -.15, .8),
      uppercase: rawStyle.uppercase === true,
      color: hex(rawStyle.color, fallback.color),
      gradientFrom: rawStyle.gradientFrom === undefined ? undefined : hex(rawStyle.gradientFrom, fallback.color),
      gradientTo: rawStyle.gradientTo === undefined ? undefined : hex(rawStyle.gradientTo, fallback.color),
      opacity: finite(rawStyle.opacity, fallback.opacity, .05, 1),
      strokeColor: rawStyle.strokeColor === undefined ? undefined : hex(rawStyle.strokeColor, '#ffffff'),
      strokeWidthPt: finite(rawStyle.strokeWidthPt, fallback.strokeWidthPt, 0, 20),
      shadowColor: rawStyle.shadowColor === undefined ? undefined : hex(rawStyle.shadowColor, '#171923'),
      shadowBlurPt: finite(rawStyle.shadowBlurPt, fallback.shadowBlurPt, 0, 50),
      shadowXPt: finite(rawStyle.shadowXPt, fallback.shadowXPt, -50, 50),
      shadowYPt: finite(rawStyle.shadowYPt, fallback.shadowYPt, -50, 50),
      backgroundColor: rawStyle.backgroundColor === undefined ? undefined : hex(rawStyle.backgroundColor, '#ffffff'),
      backgroundOpacity: finite(rawStyle.backgroundOpacity, fallback.backgroundOpacity, 0, 1),
      radiusCm: finite(rawStyle.radiusCm, fallback.radiusCm, 0, 20),
    },
  };
}

function rgba(hexColor: string, opacity: number) {
  const value = Number.parseInt(hexColor.slice(1), 16);
  return `rgba(${value >> 16},${value >> 8 & 255},${value & 255},${opacity})`;
}

function graphemes(value: string) {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    sharedGraphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...sharedGraphemeSegmenter.segment(value)].map(({ segment }) => segment);
  }
  return Array.from(value);
}

function spacedWidth(context: CanvasRenderingContext2D, value: string, spacing: number) {
  const chars = graphemes(value);
  return Math.max(0, chars.reduce((sum, char) => sum + context.measureText(char).width, 0) + Math.max(0, chars.length - 1) * spacing);
}

function wrapMeasuredLines(value: string, maxWidth: number, measure: (text: string) => number) {
  const paragraphs = value.split(/\r?\n/);
  const lines: string[] = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); return; }
    let line = '';
    words.forEach((word) => {
      const chunks: string[] = [];
      let chunk = '';
      graphemes(word).forEach((character) => {
        const nextChunk = `${chunk}${character}`;
        if (chunk && measure(nextChunk) > maxWidth) {
          chunks.push(chunk);
          chunk = character;
        } else chunk = nextChunk;
      });
      if (chunk || !chunks.length) chunks.push(chunk);

      chunks.forEach((part, index) => {
        const candidate = line ? `${line} ${part}` : part;
        if (measure(candidate) <= maxWidth) line = candidate;
        else {
          if (line) lines.push(line);
          line = part;
        }
        if (index < chunks.length - 1) {
          if (line) lines.push(line);
          line = '';
        }
      });
    });
    lines.push(line || '');
  });
  return lines;
}

function wrapLines(context: CanvasRenderingContext2D, value: string, maxWidth: number, spacing: number) {
  return wrapMeasuredLines(value, maxWidth, (text) => spacedWidth(context, text, spacing));
}

function fallbackTextWidth(value: string, fontSize: number, style: TextStyle) {
  const baseRatio = style.fontId === 'mono' ? .61 : style.fontId === 'condensed' ? .48 : style.fontId === 'hand' ? .57 : .55;
  const weightAdjustment = Math.max(0, style.fontWeight - 400) / 25_000;
  const italicAdjustment = style.italic ? .015 : 0;
  const width = graphemes(value).reduce((total, character) => {
    if (/\s/u.test(character)) return total + fontSize * .32;
    if (/[ilI1|.,'!:;]/u.test(character)) return total + fontSize * .28;
    if (/[MW@#%&]/u.test(character)) return total + fontSize * .88;
    let extendedCharacter = false;
    for (const part of character) {
      if ((part.codePointAt(0) ?? 0) > 255) extendedCharacter = true;
    }
    if (extendedCharacter) return total + fontSize;
    return total + fontSize * (baseRatio + weightAdjustment + italicAdjustment);
  }, 0);
  return Math.max(0, width);
}

/**
 * Returns only the room required to prevent intentional text effects from
 * being clipped. It is not decorative textbox padding.
 */
export function textBoxInsetsCm(style: TextStyle): TextBoxInsetsCm {
  const safety = .01;
  const stroke = style.strokeColor && style.strokeWidthPt > 0 ? style.strokeWidthPt * POINT_TO_CM / 2 : 0;
  const shadowEnabled = Boolean(style.shadowColor && (style.shadowBlurPt || style.shadowXPt || style.shadowYPt));
  const blur = shadowEnabled ? style.shadowBlurPt * POINT_TO_CM : 0;
  const shadowX = shadowEnabled ? style.shadowXPt * POINT_TO_CM : 0;
  const shadowY = shadowEnabled ? style.shadowYPt * POINT_TO_CM : 0;
  const italicOverhang = style.italic ? style.fontSizePt * POINT_TO_CM * .055 : 0;
  return {
    top: safety + stroke + Math.max(0, blur - shadowY),
    right: safety + stroke + italicOverhang + Math.max(0, blur + shadowX),
    bottom: safety + stroke + Math.max(0, blur + shadowY),
    left: safety + stroke + italicOverhang * .2 + Math.max(0, blur - shadowX),
  };
}

/**
 * Measures a textbox in real centimetres. A single line is one font-size
 * high; extra height is added only for additional lines, outlines or shadows.
 */
export function measureTextBoxSize(data: TextPieceData, maxWidthCm = 120): TextBoxSize {
  const { style } = data;
  const insets = textBoxInsetsCm(style);
  const fontSizeCm = style.fontSizePt * POINT_TO_CM;
  const fontSizePx = fontSizeCm * TEXT_MEASUREMENT_PIXELS_PER_CM;
  const spacingPx = style.letterSpacingEm * fontSizePx;
  const text = style.uppercase ? data.value.toUpperCase() : data.value;
  if (sharedMeasurementContext === undefined && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    sharedMeasurementContext = canvas.getContext('2d');
  }
  const context = sharedMeasurementContext ?? null;
  if (context) context.font = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${fontSizePx}px ${canvasFontStack(style.fontId)}`;
  const measure = (value: string) => context
    ? spacedWidth(context, value, spacingPx)
    : Math.max(0, fallbackTextWidth(value, fontSizePx, style) + Math.max(0, graphemes(value).length - 1) * spacingPx);
  const maximumTextWidthPx = Math.max(fontSizePx * .35, (Math.max(.2, maxWidthCm) - insets.left - insets.right) * TEXT_MEASUREMENT_PIXELS_PER_CM);
  const lines = wrapMeasuredLines(text, maximumTextWidthPx, measure);
  const measuredWidthCm = Math.max(...lines.map(measure), 0) / TEXT_MEASUREMENT_PIXELS_PER_CM;
  const lineCount = Math.max(1, lines.length);
  const measuredHeightCm = fontSizeCm * (1 + (lineCount - 1) * style.lineHeight);
  return {
    widthCm: Math.min(Math.max(.2, maxWidthCm), Math.max(fontSizeCm * .35, measuredWidthCm) + insets.left + insets.right),
    heightCm: Math.max(.2, measuredHeightCm + insets.top + insets.bottom),
    lineCount,
  };
}

function drawSpacedLine(context: CanvasRenderingContext2D, value: string, x: number, y: number, spacing: number, align: TextAlign, stroke: boolean) {
  const chars = graphemes(value);
  const width = spacedWidth(context, value, spacing);
  let cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  chars.forEach((char) => {
    if (stroke) context.strokeText(char, cursor, y); else context.fillText(char, cursor, y);
    cursor += context.measureText(char).width + spacing;
  });
  return { start: align === 'center' ? x - width / 2 : align === 'right' ? x - width : x, width };
}

export function drawTextFrame(
  context: CanvasRenderingContext2D,
  data: TextPieceData,
  x: number,
  y: number,
  width: number,
  height: number,
  pixelsPerCm: number,
) {
  const style = data.style;
  const ptToPx = pixelsPerCm * 2.54 / 72;
  const insets = textBoxInsetsCm(style);
  const insetTop = insets.top * pixelsPerCm;
  const insetRight = insets.right * pixelsPerCm;
  const insetBottom = insets.bottom * pixelsPerCm;
  const insetLeft = insets.left * pixelsPerCm;
  const radius = Math.min(Math.min(width, height) / 2, style.radiusCm * pixelsPerCm);
  context.save();
  context.globalAlpha = style.opacity;
  if (style.backgroundColor && style.backgroundOpacity > 0) {
    context.fillStyle = rgba(style.backgroundColor, style.backgroundOpacity);
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
  }
  const fontSize = style.fontSizePt * ptToPx;
  context.font = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${fontSize}px ${canvasFontStack(style.fontId)}`;
  context.textBaseline = 'alphabetic';
  const spacing = style.letterSpacingEm * fontSize;
  const text = style.uppercase ? data.value.toUpperCase() : data.value;
  const contentWidth = Math.max(1, width - insetLeft - insetRight);
  const contentHeight = Math.max(1, height - insetTop - insetBottom);
  const lines = wrapLines(context, text, contentWidth, spacing);
  const lineStep = fontSize * style.lineHeight;
  const totalHeight = fontSize + Math.max(0, lines.length - 1) * lineStep;
  let baseline = y + insetTop + (contentHeight - totalHeight) / 2 + fontSize * .82;
  const anchorX = style.align === 'left' ? x + insetLeft : style.align === 'right' ? x + width - insetRight : x + insetLeft + contentWidth / 2;
  const gradient = style.gradientFrom && style.gradientTo ? context.createLinearGradient(x, y, x + width, y + height) : undefined;
  if (gradient) { gradient.addColorStop(0, style.gradientFrom!); gradient.addColorStop(1, style.gradientTo!); }
  context.fillStyle = gradient ?? style.color;
  context.strokeStyle = style.strokeColor ?? style.color;
  context.lineWidth = style.strokeWidthPt * ptToPx;
  context.lineJoin = 'round';
  lines.forEach((line) => {
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    if (style.strokeColor && style.strokeWidthPt > 0) drawSpacedLine(context, line, anchorX, baseline, spacing, style.align, true);
    context.shadowColor = style.shadowColor ?? 'transparent';
    context.shadowBlur = style.shadowBlurPt * ptToPx;
    context.shadowOffsetX = style.shadowXPt * ptToPx;
    context.shadowOffsetY = style.shadowYPt * ptToPx;
    const metrics = drawSpacedLine(context, line, anchorX, baseline, spacing, style.align, false);
    if (style.underline) {
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
      context.fillRect(metrics.start, baseline + fontSize * .09, metrics.width, Math.max(1, fontSize * .055));
    }
    baseline += lineStep;
  });
  context.restore();
}

export function renderTextDataUrl(data: TextPieceData, widthCm: number, heightCm: number, dpi = 300) {
  const pixelsPerCm = dpi / 2.54;
  const maxEdge = 4_096;
  const rawW = Math.max(1, Math.round(widthCm * pixelsPerCm));
  const rawH = Math.max(1, Math.round(heightCm * pixelsPerCm));
  const scale = Math.min(1, maxEdge / Math.max(rawW, rawH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rawW * scale));
  canvas.height = Math.max(1, Math.round(rawH * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Text rendering is unavailable in this browser.');
  drawTextFrame(context, data, 0, 0, canvas.width, canvas.height, pixelsPerCm * scale);
  return canvas.toDataURL('image/png');
}
