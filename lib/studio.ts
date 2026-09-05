export type LayoutName = 'salon' | 'organic' | 'strip' | 'diamond' | 'flow' | 'compass';

export type Piece = {
  id: string;
  name: string;
  src: string;
  sourceName?: string;
  widthCm: number;
  heightCm: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  placed: boolean;
  locked: boolean;
  category: string;
  tone: 'pastel' | 'warm' | 'cool' | 'dark' | 'neutral';
  color: string;
};

export type Wall = {
  widthCm: number;
  heightCm: number;
  color: string;
  photo?: string;
  furnitureClearanceCm: number;
};

export const PAPER_SIZES = {
  A4: [21, 29.7],
  A3: [29.7, 42],
  A2: [42, 59.4],
  A1: [59.4, 84.1],
} as const;

export const DEMO_PIECES: Piece[] = [
  { id: 'S01-01', name: 'Friends together', src: '/demo/cuts/friends-group.png', widthCm: 9.9, heightCm: 14.1, x: 11, y: 18, w: 10, h: 22, rotation: -0.5, placed: true, locked: false, category: 'Friends', tone: 'pastel', color: '#b494f3' },
  { id: 'S01-02', name: 'Yellow frame', src: '/demo/cuts/friends-frame.png', widthCm: 9.9, heightCm: 14.1, x: 23, y: 13, w: 10, h: 22, rotation: 0, placed: true, locked: false, category: 'Friends', tone: 'pastel', color: '#8c6fd8' },
  { id: 'S01-04', name: 'Phoebe', src: '/demo/cuts/phoebe.png', widthCm: 9.9, heightCm: 14.1, x: 35, y: 18, w: 10, h: 22, rotation: 0, placed: true, locked: false, category: 'Friends', tone: 'neutral', color: '#e2c79f' },
  { id: 'S01-05', name: 'Chandler', src: '/demo/cuts/chandler.png', widthCm: 9.9, heightCm: 14.1, x: 47, y: 10, w: 10, h: 22, rotation: 0, placed: true, locked: false, category: 'Friends', tone: 'pastel', color: '#c7a0de' },
  { id: 'S09-01', name: 'Pirates', src: '/demo/cuts/pirates.png', widthCm: 9.9, heightCm: 16.1, x: 59, y: 16, w: 10, h: 25, rotation: 0.4, placed: true, locked: false, category: 'Adventure', tone: 'warm', color: '#af6a35' },
  { id: 'S09-03', name: 'La La Land', src: '/demo/cuts/lalaland.png', widthCm: 9.9, heightCm: 16.1, x: 71, y: 13, w: 10, h: 25, rotation: 0, placed: true, locked: false, category: 'Cinema', tone: 'pastel', color: '#766ad4' },
  { id: 'S09-06', name: 'Jon Snow', src: '/demo/cuts/jonsnow.png', widthCm: 9.9, heightCm: 15.8, x: 16, y: 48, w: 10, h: 24, rotation: 0, placed: true, locked: false, category: 'Fantasy', tone: 'cool', color: '#55768b' },
  { id: 'S09-08', name: 'Squid Game', src: '/demo/cuts/squid.png', widthCm: 9.9, heightCm: 15.8, x: 28, y: 46, w: 10, h: 24, rotation: -0.3, placed: true, locked: false, category: 'Thriller', tone: 'dark', color: '#bc2846' },
  { id: 'S04-01', name: 'G.O.A.T.', src: '/demo/cuts/goat.png', widthCm: 19.8, heightCm: 37.5, x: 42, y: 39, w: 16, h: 38, rotation: 0, placed: true, locked: true, category: 'Personal', tone: 'cool', color: '#5689b6' },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const aspect = (piece: Piece) => piece.widthCm / piece.heightCm;

function withSlot(piece: Piece, x: number, y: number, w: number, h: number): Piece {
  return { ...piece, x: clamp(x, 1, 98 - w), y: clamp(y, 1, 98 - h), w, h, placed: true, rotation: 0 };
}

function fitRows(items: Piece[], wall: Wall, density: number, startY = 8, height = 78): Piece[] {
  if (!items.length) return [];
  const columns = Math.max(2, Math.ceil(Math.sqrt(items.length * (wall.widthCm / wall.heightCm))));
  const rows = Math.ceil(items.length / columns);
  const gap = 1.5 + (100 - density) * 0.025;
  const rowBox = height / rows;
  const result: Piece[] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowItems = items.slice(row * columns, (row + 1) * columns);
    const desiredH = rowBox * 0.72;
    const rawWidths = rowItems.map((item) => desiredH * aspect(item) * (wall.heightCm / wall.widthCm));
    const scale = Math.min(1, (88 - gap * Math.max(0, rowItems.length - 1)) / Math.max(1, rawWidths.reduce((a, b) => a + b, 0)));
    const widths = rawWidths.map((width) => width * scale);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    let cursor = (100 - totalWidth) / 2;
    rowItems.forEach((item, index) => {
      const w = widths[index];
      const h = (w / aspect(item)) * (wall.widthCm / wall.heightCm);
      result.push(withSlot(item, cursor, startY + row * rowBox + (rowBox - h) / 2, w, h));
      cursor += w + gap;
    });
  }
  return result;
}

function masonry(items: Piece[], wall: Wall, density: number): Piece[] {
  if (!items.length) return [];
  const columns = Math.max(3, Math.min(7, Math.round(Math.sqrt(items.length * 1.4))));
  const gap = 1.2 + (100 - density) * 0.022;
  const width = (88 - gap * (columns - 1)) / columns;
  const heights = Array.from({ length: columns }, () => 6);
  const result = items.map((item) => {
    const col = heights.indexOf(Math.min(...heights));
    const h = (width / aspect(item)) * (wall.widthCm / wall.heightCm);
    const placed = withSlot(item, 6 + col * (width + gap), heights[col], width, h);
    heights[col] += h + gap;
    return placed;
  });
  const maxY = Math.max(...result.map((item) => item.y + item.h));
  if (maxY <= 94) return result;
  const scale = 88 / (maxY - 6);
  return result.map((item) => withSlot(item, 50 + (item.x - 50) * scale, 6 + (item.y - 6) * scale, item.w * scale, item.h * scale));
}

function filmStrip(items: Piece[], wall: Wall, density: number): Piece[] {
  if (!items.length) return [];
  const rows = Math.min(3, Math.ceil(items.length / 3));
  const perRow = Math.ceil(items.length / rows);
  const gap = 1.1 + (100 - density) * 0.018;
  const result: Piece[] = [];
  for (let row = 0; row < rows; row += 1) {
    const rowItems = items.slice(row * perRow, (row + 1) * perRow);
    let targetH = 24;
    let widths = rowItems.map((item) => targetH * aspect(item) * (wall.heightCm / wall.widthCm));
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    if (total > 90) {
      const scale = 90 / total;
      targetH *= scale;
      widths = widths.map((width) => width * scale);
    }
    const actualTotal = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    let cursor = row % 2 === 0 ? 5 : Math.max(5, 95 - actualTotal);
    rowItems.forEach((item, index) => {
      result.push(withSlot(item, cursor, 8 + row * 28, widths[index], targetH));
      cursor += widths[index] + gap;
    });
  }
  return result;
}

function diamond(items: Piece[], wall: Wall, density: number): Piece[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm);
  const columns = Math.max(3, Math.ceil(Math.sqrt(items.length)));
  const rows = Math.ceil(items.length / columns);
  const gap = 1.1 + (100 - density) * 0.018;
  const h = Math.min(19, (82 - gap * (rows - 1)) / rows);
  return sorted.map((item, index) => {
    const row = Math.floor(index / columns);
    const rowItems = sorted.slice(row * columns, (row + 1) * columns);
    const widths = rowItems.map((entry) => h * aspect(entry) * (wall.heightCm / wall.widthCm));
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    const inRow = index % columns;
    const preceding = widths.slice(0, inRow).reduce((a, b) => a + b, 0) + gap * inRow;
    const middleDistance = Math.abs(row - (rows - 1) / 2);
    const indent = middleDistance * 3.2;
    const scale = Math.min(1, (92 - indent * 2) / total);
    const w = widths[inRow] * scale;
    return withSlot(item, (100 - total * scale) / 2 + preceding * scale, 9 + row * (h + gap), w, h * scale);
  });
}

function compass(items: Piece[], wall: Wall, density: number): Piece[] {
  if (items.length < 5) return fitRows(items, wall, density);
  const heroIndex = items.reduce((best, item, index) => item.widthCm * item.heightCm > items[best].widthCm * items[best].heightCm ? index : best, 0);
  const hero = items[heroIndex];
  const rest = items.filter((_, index) => index !== heroIndex);
  const ordered = [...rest].sort((a, b) => {
    const toneOrder = { pastel: 0, warm: 1, neutral: 2, cool: 3, dark: 4 };
    return toneOrder[a.tone] - toneOrder[b.tone];
  });
  const laid = fitRows(ordered, wall, density, 8, 82).map((item) => ({ ...item, w: item.w * 0.82, h: item.h * 0.82, x: 50 + (item.x - 50) * 1.05 }));
  const heroH = 38;
  const heroW = heroH * aspect(hero) * (wall.heightCm / wall.widthCm);
  const withHero = laid.map((item) => {
    const nearCenter = item.x < 58 && item.x + item.w > 42 && item.y < 76 && item.y + item.h > 25;
    return nearCenter ? { ...item, x: item.x < 50 ? item.x - 9 : item.x + 9 } : item;
  });
  return [...withHero, withSlot(hero, 50 - heroW / 2, 31, heroW, heroH)];
}

export function applyLayout(pieces: Piece[], layout: LayoutName, wall: Wall, density = 58): Piece[] {
  const movable = pieces.filter((piece) => !piece.locked);
  const hasLockedHero = pieces.some((piece) => piece.locked);
  const ordered = layout === 'flow'
    ? [...movable].sort((a, b) => ({ pastel: 0, warm: 1, neutral: 2, cool: 3, dark: 4 }[a.tone] - ({ pastel: 0, warm: 1, neutral: 2, cool: 3, dark: 4 }[b.tone])))
    : movable;
  const laid = layout === 'organic' ? masonry(ordered, wall, density)
    : layout === 'strip' ? filmStrip(ordered, wall, density)
      : layout === 'diamond' ? diamond(ordered, wall, density)
        : layout === 'compass' ? (hasLockedHero
          ? fitRows(ordered, wall, density, 7, 84).map((piece) => {
            const overlapsCentre = piece.x < 62 && piece.x + piece.w > 38 && piece.y < 78 && piece.y + piece.h > 24;
            return overlapsCentre ? { ...piece, x: clamp(piece.x < 50 ? piece.x - 10 : piece.x + 10, 1, 98 - piece.w) } : piece;
          })
          : compass(ordered, wall, density))
          : fitRows(ordered, wall, density);
  const map = new Map(laid.map((piece) => [piece.id, piece]));
  return pieces.map((piece) => piece.locked ? piece : map.get(piece.id) ?? piece).map((piece) => ({ ...piece, placed: true }));
}

export function calculatePrintGrid(sheetWidthCm: number, sheetHeightCm: number, cardWidthCm: number, cardHeightCm: number, gapCm: number, marginCm: number) {
  const usableWidth = Math.max(0, sheetWidthCm - marginCm * 2);
  const usableHeight = Math.max(0, sheetHeightCm - marginCm * 2);
  const fits = cardWidthCm <= usableWidth && cardHeightCm <= usableHeight;
  const columns = fits ? Math.max(1, Math.floor((usableWidth + gapCm) / (cardWidthCm + gapCm))) : 1;
  const rows = fits ? Math.max(1, Math.floor((usableHeight + gapCm) / (cardHeightCm + gapCm))) : 1;
  return { columns, rows, perSheet: fits ? columns * rows : 1, fits };
}
