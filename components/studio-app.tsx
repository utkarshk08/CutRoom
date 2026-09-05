'use client';

/* eslint-disable next/no-img-element, jsx-a11y/label-has-associated-control, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */

import * as React from 'react';
import {
  AlignCenter,
  ArrowLeft,
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
  Grid3X3,
  ImageIcon,
  ImagePlus,
  Layers3,
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
  Ruler,
  Scissors,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
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
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  applyLayout,
  calculatePrintGrid,
  DEMO_PIECES,
  LayoutName,
  PAPER_SIZES,
  Piece,
  Wall,
} from '@/lib/studio';

type ViewMode = 'arrange' | 'print';
type PanelMode = 'assistant' | 'inspect';
type PendingAsset = { src: string; name: string; pixelW: number; pixelH: number };
type CutRect = { x: number; y: number; w: number; h: number };
type DragState = {
  id: string;
  startX: number;
  startY: number;
  original: Piece;
  before: Piece[];
  rect: DOMRect;
  mode: 'move' | 'resize';
};

type StoredProject = { pieces: Piece[]; wall: Wall; updatedAt: string };

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
const copyPieces = (items: Piece[]) => items.map((piece) => ({ ...piece }));
const sliderValue = (value: number | readonly number[]) => typeof value === 'number' ? value : value[0];

function openCutroomDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('cutroom-studio', 1);
    request.onerror = () => reject(request.error ?? new Error('Local storage is unavailable.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projects')) database.createObjectStore('projects');
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function loadStoredProject() {
  const database = await openCutroomDatabase();
  return new Promise<StoredProject | undefined>((resolve, reject) => {
    const transaction = database.transaction('projects', 'readonly');
    const request = transaction.objectStore('projects').get('current');
    request.onsuccess = () => resolve(request.result as StoredProject | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not restore the project.'));
    transaction.oncomplete = () => database.close();
  });
}

async function saveStoredProject(project: StoredProject) {
  const database = await openCutroomDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put(project, 'current');
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the project.'));
  });
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
      image.onload = () => resolve({ src, name: file.name, pixelW: image.naturalWidth, pixelH: image.naturalHeight });
      image.src = src;
    };
    reader.readAsDataURL(file);
  });
}

async function cropAsset(asset: PendingAsset, rects: CutRect[]) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not crop this image.'));
    element.src = asset.src;
  });
  return rects.map((rect) => {
    const sourceX = Math.round(rect.x * image.naturalWidth);
    const sourceY = Math.round(rect.y * image.naturalHeight);
    const sourceW = Math.max(1, Math.round(rect.w * image.naturalWidth));
    const sourceH = Math.max(1, Math.round(rect.h * image.naturalHeight));
    const longest = Math.max(sourceW, sourceH);
    const scale = Math.min(1, 1800 / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceW * scale));
    canvas.height = Math.max(1, Math.round(sourceH * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');
    context.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  });
}

function downloadBlob(data: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function embedSource(pdf: PdfDocument, src: string) {
  const bytes = await fetch(src).then((response) => response.arrayBuffer());
  const looksJpeg = src.startsWith('data:image/jpeg') || src.toLowerCase().match(/\.jpe?g($|\?)/);
  return looksJpeg ? pdf.embedJpg(bytes) : pdf.embedPng(bytes);
}

export function StudioApp() {
  const [pieces, setPieces] = React.useState<Piece[]>(() => copyPieces(DEMO_PIECES));
  const [wall, setWall] = React.useState<Wall>({ widthCm: 240, heightCm: 160, color: '#eee8dc', furnitureClearanceCm: 24 });
  const [selectedId, setSelectedId] = React.useState('S04-01');
  const [view, setView] = React.useState<ViewMode>('arrange');
  const [panelMode, setPanelMode] = React.useState<PanelMode>('assistant');
  const [canvasMode, setCanvasMode] = React.useState<'blueprint' | 'room'>('blueprint');
  const [filter, setFilter] = React.useState<'all' | 'placed' | 'loose'>('all');
  const [zoom, setZoom] = React.useState(72);
  const [layout, setLayout] = React.useState<LayoutName>('compass');
  const [density, setDensity] = React.useState(62);
  const [groupStrength, setGroupStrength] = React.useState(65);
  const [prompt, setPrompt] = React.useState('Keep Friends together, blend warm into cool, and make the tall portrait the hero.');
  const [aiResponse, setAiResponse] = React.useState('Your locked hero stays centred. Pastels lead into warm cinema, then cool fantasy and darker thrillers.');
  const [notice, setNotice] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [cutOpen, setCutOpen] = React.useState(false);
  const [wallOpen, setWallOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [candidateOpen, setCandidateOpen] = React.useState(false);
  const [pendingAsset, setPendingAsset] = React.useState<PendingAsset | null>(null);
  const [cutMode, setCutMode] = React.useState<'auto' | 'manual'>('auto');
  const [rows, setRows] = React.useState(3);
  const [columns, setColumns] = React.useState(3);
  const [manualCuts, setManualCuts] = React.useState<CutRect[]>([]);
  const [drawingCut, setDrawingCut] = React.useState<CutRect | null>(null);
  const [sheetPaper, setSheetPaper] = React.useState<keyof typeof PAPER_SIZES>('A3');
  const [sheetCount, setSheetCount] = React.useState(13);
  const [posterPreset, setPosterPreset] = React.useState<keyof typeof PAPER_SIZES>('A4');
  const [busy, setBusy] = React.useState('');
  const [printPaper, setPrintPaper] = React.useState<keyof typeof PAPER_SIZES | 'Custom'>('A3');
  const [customSheetW, setCustomSheetW] = React.useState(32);
  const [customSheetH, setCustomSheetH] = React.useState(45);
  const [printLandscape, setPrintLandscape] = React.useState(false);
  const [printCardW, setPrintCardW] = React.useState(9.9);
  const [printCardH, setPrintCardH] = React.useState(14.1);
  const [printGap, setPrintGap] = React.useState(0.6);
  const [printMargin, setPrintMargin] = React.useState(1);
  const [cropMarks, setCropMarks] = React.useState(true);
  const [printPage, setPrintPage] = React.useState(0);
  const [history, setHistory] = React.useState<Piece[][]>([]);
  const [future, setFuture] = React.useState<Piece[][]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'saved' | 'saving' | 'error'>('saved');

  const stageRef = React.useRef<HTMLDivElement>(null);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const wallUploadRef = React.useRef<HTMLInputElement>(null);
  const cutPreviewRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const cutStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = pieces.find((piece) => piece.id === selectedId);
  const visiblePieces = pieces.filter((piece) => filter === 'all' || (filter === 'placed' ? piece.placed : !piece.placed));
  const placedCount = pieces.filter((piece) => piece.placed).length;
  const coverage = Math.round(pieces.filter((piece) => piece.placed).reduce((sum, piece) => sum + piece.w * piece.h, 0) / 100);

  const basePaper = printPaper === 'Custom' ? [customSheetW, customSheetH] as const : PAPER_SIZES[printPaper];
  const sheetW = printLandscape ? basePaper[1] : basePaper[0];
  const sheetH = printLandscape ? basePaper[0] : basePaper[1];
  const printGrid = calculatePrintGrid(sheetW, sheetH, printCardW, printCardH, printGap, printMargin);
  const totalPrintPages = Math.max(1, Math.ceil(pieces.length / printGrid.perSheet));
  const pagePieces = pieces.slice(printPage * printGrid.perSheet, (printPage + 1) * printGrid.perSheet);

  const toast = React.useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2800);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void loadStoredProject().then((stored) => {
      if (cancelled || !stored || !Array.isArray(stored.pieces) || !stored.wall) return;
      setPieces(stored.pieces);
      setWall(stored.wall);
      setSelectedId(stored.pieces.find((piece) => piece.locked)?.id ?? stored.pieces[0]?.id ?? '');
    }).catch(() => setSaveState('error')).finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      setSaveState('saving');
      void saveStoredProject({ pieces, wall, updatedAt: new Date().toISOString() })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 450);
    return () => clearTimeout(timer);
  }, [hydrated, pieces, wall]);

  const commit = React.useCallback((before: Piece[]) => {
    setHistory((items) => [...items.slice(-39), copyPieces(before)]);
    setFuture([]);
  }, []);

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture((items) => [copyPieces(pieces), ...items].slice(0, 40));
    setHistory((items) => items.slice(0, -1));
    setPieces(copyPieces(previous));
    toast('Undid the last change.');
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((items) => [...items, copyPieces(pieces)].slice(-40));
    setFuture((items) => items.slice(1));
    setPieces(copyPieces(next));
    toast('Restored the change.');
  };

  const updatePiece = (id: string, patch: Partial<Piece>, record = true) => {
    if (record) commit(pieces);
    setPieces((items) => items.map((piece) => piece.id === id ? { ...piece, ...patch } : piece));
  };

  const choosePiece = (piece: Piece) => {
    setSelectedId(piece.id);
    setPanelMode('inspect');
  };

  const beginDrag = (event: React.PointerEvent, piece: Piece, mode: 'move' | 'resize' = 'move') => {
    if (piece.locked) {
      toast(`${piece.id} is locked. Unlock it in Inspect to move it.`);
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: piece.id, startX: event.clientX, startY: event.clientY, original: { ...piece }, before: copyPieces(pieces), rect, mode };
    choosePiece(piece);
  };

  const dragMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = ((event.clientX - drag.startX) / drag.rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / drag.rect.height) * 100;
    setPieces((items) => items.map((piece) => {
      if (piece.id !== drag.id) return piece;
      if (drag.mode === 'resize') {
        const ratio = drag.original.h / drag.original.w;
        const w = clamp(drag.original.w + dx, 4, 100 - drag.original.x);
        const h = clamp(w * ratio, 5, 100 - drag.original.y);
        return { ...piece, w, h };
      }
      return {
        ...piece,
        x: clamp(drag.original.x + dx, 0, 100 - piece.w),
        y: clamp(drag.original.y + dy, 0, 100 - piece.h),
      };
    }));
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    commit(dragRef.current.before);
    dragRef.current = null;
  };

  const applyTemplate = (nextLayout: LayoutName) => {
    commit(pieces);
    setLayout(nextLayout);
    setPieces(applyLayout(pieces, nextLayout, wall, density));
    setCandidateOpen(false);
    toast(`${layouts.find((item) => item.id === nextLayout)?.name} arranged ${pieces.length} pieces.`);
  };

  const addSingleAsset = (asset: PendingAsset) => {
    const paper = PAPER_SIZES[posterPreset];
    const portrait = asset.pixelH >= asset.pixelW;
    const widthCm = portrait ? paper[0] : paper[1];
    const heightCm = portrait ? paper[1] : paper[0];
    const id = `P${String(pieces.length + 1).padStart(3, '0')}`;
    const piece: Piece = {
      id,
      name: asset.name.replace(/\.[^.]+$/, ''),
      src: asset.src,
      sourceName: asset.name,
      widthCm,
      heightCm,
      x: 8,
      y: 8,
      w: 13,
      h: 13 * (heightCm / widthCm) * (wall.widthCm / wall.heightCm),
      rotation: 0,
      placed: false,
      locked: false,
      category: 'Unsorted',
      tone: TONES[pieces.length % TONES.length],
      color: COLORS[pieces.length % COLORS.length],
    };
    commit(pieces);
    setPieces((items) => [...items, piece]);
    setSelectedId(id);
    setPanelMode('inspect');
    setImportOpen(false);
    setPendingAsset(null);
    toast(`${asset.name} added as one ${posterPreset} poster.`);
  };

  const importFiles = async (files: File[]) => {
    const valid = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 100 * 1024 * 1024);
    if (!valid.length) {
      toast('Use JPG, PNG or WebP images under 100 MB.');
      return;
    }
    try {
      setBusy('Reading your images…');
      const assets = await Promise.all(valid.map(readFile));
      if (assets.length === 1) {
        setPendingAsset(assets[0]);
        setImportOpen(true);
      } else {
        const before = copyPieces(pieces);
        const added = assets.map((asset, index) => {
          const portrait = asset.pixelH >= asset.pixelW;
          const paper = PAPER_SIZES[posterPreset];
          const widthCm = portrait ? paper[0] : paper[1];
          const heightCm = portrait ? paper[1] : paper[0];
          return {
            id: `P${String(pieces.length + index + 1).padStart(3, '0')}`,
            name: asset.name.replace(/\.[^.]+$/, ''), src: asset.src, sourceName: asset.name,
            widthCm, heightCm, x: 6, y: 6, w: 12,
            h: 12 * (heightCm / widthCm) * (wall.widthCm / wall.heightCm), rotation: 0,
            placed: false, locked: false, category: 'Unsorted', tone: TONES[index % TONES.length], color: COLORS[index % COLORS.length],
          } satisfies Piece;
        });
        commit(before);
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
    setManualCuts([]);
    setDrawingCut(null);
    setCutMode('auto');
    setCutOpen(true);
  };

  const autoRects = React.useMemo(() => Array.from({ length: rows * columns }, (_, index) => ({
    x: (index % columns) / columns,
    y: Math.floor(index / columns) / rows,
    w: 1 / columns,
    h: 1 / rows,
  })), [rows, columns]);

  const cutPointer = (event: React.PointerEvent, phase: 'start' | 'move' | 'end') => {
    if (cutMode !== 'manual') return;
    const rect = cutPreviewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
    if (phase === 'start') {
      event.currentTarget.setPointerCapture(event.pointerId);
      cutStartRef.current = point;
      setDrawingCut({ ...point, w: 0, h: 0 });
    } else if (phase === 'move' && cutStartRef.current) {
      const start = cutStartRef.current;
      setDrawingCut({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) });
    } else if (phase === 'end' && drawingCut) {
      if (drawingCut.w > 0.025 && drawingCut.h > 0.025) setManualCuts((items) => [...items, drawingCut]);
      setDrawingCut(null);
      cutStartRef.current = null;
    }
  };

  const createCutouts = async () => {
    if (!pendingAsset) return;
    const rects = cutMode === 'auto' ? autoRects : manualCuts;
    if (!rects.length) {
      toast('Draw at least one crop box first.');
      return;
    }
    try {
      setBusy(`Creating ${rects.length} cutouts…`);
      const images = await cropAsset(pendingAsset, rects);
      const base = PAPER_SIZES[sheetPaper];
      const sourcePortrait = pendingAsset.pixelH >= pendingAsset.pixelW;
      const sourceW = sourcePortrait ? base[0] : base[1];
      const sourceH = sourcePortrait ? base[1] : base[0];
      const newPieces = images.map((src, index) => {
        const rect = rects[index];
        const widthCm = Math.round(sourceW * rect.w * 10) / 10;
        const heightCm = Math.round(sourceH * rect.h * 10) / 10;
        return {
          id: `S${String(sheetCount).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
          name: `${pendingAsset.name.replace(/\.[^.]+$/, '')} · ${index + 1}`,
          src, sourceName: pendingAsset.name, widthCm, heightCm,
          x: 5, y: 5, w: 10, h: 10 * (heightCm / widthCm) * (wall.widthCm / wall.heightCm),
          rotation: 0, placed: false, locked: false, category: 'Unsorted',
          tone: TONES[index % TONES.length], color: COLORS[index % COLORS.length],
        } satisfies Piece;
      });
      commit(pieces);
      setPieces((items) => [...items, ...newPieces]);
      setSheetCount((count) => count + 1);
      setCutOpen(false);
      setPendingAsset(null);
      setManualCuts([]);
      toast(`${newPieces.length} numbered cutouts created. Original sheet kept untouched.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The sheet could not be cut.');
    } finally {
      setBusy('');
    }
  };

  const runAssistant = () => {
    const lower = prompt.toLowerCase();
    let suggestion: LayoutName = layout;
    if (lower.includes('strip') || lower.includes('band') || lower.includes('film')) suggestion = 'strip';
    else if (lower.includes('diamond') || lower.includes('burst')) suggestion = 'diamond';
    else if (lower.includes('organic') || lower.includes('cloud') || lower.includes('loose')) suggestion = 'organic';
    else if (lower.includes('color') || lower.includes('warm') || lower.includes('cool') || lower.includes('contrast')) suggestion = 'flow';
    else if (lower.includes('theme') || lower.includes('group') || lower.includes('hero') || lower.includes('centre') || lower.includes('center')) suggestion = 'compass';
    const before = copyPieces(pieces);
    setPieces(applyLayout(pieces, suggestion, wall, density));
    commit(before);
    setLayout(suggestion);
    const locked = pieces.filter((piece) => piece.locked).map((piece) => piece.id);
    setAiResponse(`${layouts.find((item) => item.id === suggestion)?.name} fits your brief best. I preserved every aspect ratio${locked.length ? ` and kept ${locked.join(', ')} locked` : ''}; ${density < 45 ? 'spacing stays airy' : 'the composition stays connected'}.`);
    toast('Your brief has been turned into a new layout.');
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const id = `${selected.id}-COPY`;
    commit(pieces);
    setPieces((items) => [...items, { ...selected, id, name: `${selected.name} copy`, x: clamp(selected.x + 3, 0, 100 - selected.w), y: clamp(selected.y + 3, 0, 100 - selected.h), locked: false }]);
    setSelectedId(id);
    toast('Piece duplicated.');
  };

  const removeSelected = () => {
    if (!selected) return;
    commit(pieces);
    setPieces((items) => items.filter((piece) => piece.id !== selected.id));
    setSelectedId('');
    setPanelMode('assistant');
    toast(`${selected.id} removed. You can undo this.`);
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

  const exportProject = () => {
    const data = JSON.stringify({ schemaVersion: 1, name: 'My cinematic wall', wall, pieces, savedAt: new Date().toISOString() }, null, 2);
    downloadBlob(data, 'application/json', 'cutroom-project.json');
    toast('Portable project file downloaded.');
  };

  const exportWallPng = async () => {
    try {
      setBusy('Rendering wall plan…');
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
      for (const piece of pieces.filter((item) => item.placed)) {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = piece.src; });
        const x = piece.x / 100 * canvas.width;
        const y = piece.y / 100 * canvas.height;
        const w = piece.w / 100 * canvas.width;
        const h = piece.h / 100 * canvas.height;
        context.save();
        context.translate(x + w / 2, y + h / 2);
        context.rotate(piece.rotation * Math.PI / 180);
        context.fillStyle = '#fff';
        context.fillRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
        context.drawImage(image, -w / 2, -h / 2, w, h);
        context.fillStyle = '#111';
        context.font = 'bold 18px monospace';
        context.fillRect(-w / 2, h / 2 - 28, Math.min(w, 104), 28);
        context.fillStyle = '#fff';
        context.fillText(piece.id, -w / 2 + 7, h / 2 - 8);
        context.restore();
      }
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, 'image/png', 'cutroom-wall-plan.png');
      }, 'image/png');
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
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([841.89, 595.28]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      page.drawText('CUTROOM / INSTALLATION PLAN', { x: 36, y: 558, size: 16, font: bold, color: rgb(0.07, 0.07, 0.06) });
      page.drawText(`Wall ${wall.widthCm} × ${wall.heightCm} cm · ${placedCount} pieces · centre-out order`, { x: 36, y: 540, size: 9, font, color: rgb(0.35, 0.35, 0.32) });
      const maxW = 760;
      const maxH = 450;
      const scale = Math.min(maxW / wall.widthCm, maxH / wall.heightCm);
      const wallW = wall.widthCm * scale;
      const wallH = wall.heightCm * scale;
      const ox = (841.89 - wallW) / 2;
      const oy = 58;
      page.drawRectangle({ x: ox, y: oy, width: wallW, height: wallH, color: rgb(0.93, 0.91, 0.86), borderColor: rgb(0.07, 0.07, 0.06), borderWidth: 1 });
      const cache = new Map<string, PDFImage>();
      for (const piece of pieces.filter((item) => item.placed)) {
        let image = cache.get(piece.src);
        if (!image) { image = await embedSource(pdf, piece.src); cache.set(piece.src, image); }
        const x = ox + piece.x / 100 * wallW;
        const yTop = piece.y / 100 * wallH;
        const w = piece.w / 100 * wallW;
        const h = piece.h / 100 * wallH;
        const y = oy + wallH - yTop - h;
        page.drawRectangle({ x: x - 1, y: y - 1, width: w + 2, height: h + 2, color: rgb(1, 1, 1) });
        page.drawImage(image, { x, y, width: w, height: h });
        page.drawRectangle({ x, y, width: Math.min(w, 38), height: 9, color: rgb(0.07, 0.07, 0.06) });
        page.drawText(piece.id, { x: x + 2, y: y + 2.3, size: 5.5, font: bold, color: rgb(1, 1, 1) });
      }
      page.drawText('Measure from the wall edges and install locked/central pieces first. All dimensions use centimetres.', { x: 36, y: 28, size: 8, font, color: rgb(0.35, 0.35, 0.32) });
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

  const exportPrintPdf = async () => {
    if (!printGrid.fits) {
      toast(`A ${printCardW} × ${printCardH} cm image does not fit inside this sheet and margin.`);
      return;
    }
    try {
      setBusy(`Packing ${pieces.length} images into ${totalPrintPages} print sheets…`);
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const mm = (cm: number) => cm * 72 / 2.54;
      const cache = new Map<string, PDFImage>();
      for (let pageIndex = 0; pageIndex < totalPrintPages; pageIndex += 1) {
        const page = pdf.addPage([mm(sheetW), mm(sheetH)]);
        const batch = pieces.slice(pageIndex * printGrid.perSheet, (pageIndex + 1) * printGrid.perSheet);
        for (let index = 0; index < batch.length; index += 1) {
          const piece = batch[index];
          let image = cache.get(piece.src);
          if (!image) { image = await embedSource(pdf, piece.src); cache.set(piece.src, image); }
          const col = index % printGrid.columns;
          const row = Math.floor(index / printGrid.columns);
          const x = mm(printMargin + col * (printCardW + printGap));
          const y = mm(sheetH - printMargin - (row + 1) * printCardH - row * printGap);
          const w = mm(printCardW);
          const h = mm(printCardH);
          page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
          const imageRatio = image.width / image.height;
          const slotRatio = w / h;
          const drawW = imageRatio > slotRatio ? w : h * imageRatio;
          const drawH = imageRatio > slotRatio ? w / imageRatio : h;
          page.drawImage(image, { x: x + (w - drawW) / 2, y: y + (h - drawH) / 2, width: drawW, height: drawH });
          if (cropMarks) {
            const mark = mm(0.3);
            const color = rgb(0.15, 0.15, 0.14);
            page.drawLine({ start: { x: x - mark, y }, end: { x: x + mark, y }, thickness: 0.4, color });
            page.drawLine({ start: { x, y: y - mark }, end: { x, y: y + mark }, thickness: 0.4, color });
            page.drawLine({ start: { x: x + w - mark, y: y + h }, end: { x: x + w + mark, y: y + h }, thickness: 0.4, color });
            page.drawLine({ start: { x: x + w, y: y + h - mark }, end: { x: x + w, y: y + h + mark }, thickness: 0.4, color });
          }
          page.drawRectangle({ x: x + 2, y: y + 2, width: Math.min(42, w - 4), height: 10, color: rgb(0.07, 0.07, 0.06), opacity: 0.88 });
          page.drawText(piece.id, { x: x + 4, y: y + 4.1, size: 5.5, font, color: rgb(1, 1, 1) });
        }
      }
      const bytes = await pdf.save();
      downloadBlob(new Uint8Array(bytes).buffer, 'application/pdf', `cutroom-${printPaper}-print-sheets.pdf`);
      toast(`${totalPrintPages} exact-size ${printPaper} sheets downloaded.`);
    } catch {
      toast('The print PDF could not be built. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const changeWallPreset = (value: string) => {
    const presets: Record<string, [number, number]> = { desk: [180, 110], dorm: [240, 160], sofa: [300, 170], tall: [130, 220] };
    const size = presets[value];
    if (size) setWall((current) => ({ ...current, widthCm: size[0], heightCm: size[1] }));
  };

  return (
    <main className="studio-shell">
      <input ref={uploadRef} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { void importFiles(Array.from(event.target.files ?? [])); }} />
      <input ref={wallUploadRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try { const asset = await readFile(file); setWall((current) => ({ ...current, photo: asset.src })); toast('Wall photo added. Switch to Room preview to see it.'); } catch { toast('That wall image could not be opened.'); }
      }} />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>C</span><i /></div>
          <div><strong>CUTROOM</strong><small>WALL STUDIO</small></div>
        </div>
        <nav className="product-nav" aria-label="Studio modes">
          <button className={view === 'arrange' ? 'active' : ''} onClick={() => setView('arrange')}><Move /> Arrange</button>
          <button className={view === 'print' ? 'active' : ''} onClick={() => setView('print')}><Printer /> Print pack</button>
        </nav>
        <div className="top-actions">
          <span className={`saved-indicator ${saveState}`}><i /> {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Local save paused' : 'Saved locally'}</span>
          <Button variant="outline" className="square-button" onClick={shareProject}><MessageCircleMore /> Share</Button>
          <Button className="export-button" onClick={() => setExportOpen(true)}><Download /> Export</Button>
          <button className="avatar" aria-label="Profile" onClick={() => toast('This local-first prototype does not need an account.')}>UK</button>
        </div>
      </header>

      {view === 'arrange' ? (
        <section className="workspace">
          <aside className="piece-tray">
            <div className="panel-heading">
              <div><span>YOUR PIECES</span><h2>{pieces.length} cutouts</h2></div>
              <button aria-label="Add photos" onClick={() => uploadRef.current?.click()}><ImagePlus /></button>
            </div>
            <button className="upload-zone" onClick={() => uploadRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}>
              <span>{busy.startsWith('Reading') ? <RotateCcw className="spin" /> : <Upload />}</span><b>Drop photos or sheets</b><small>JPG, PNG or WebP · processed on-device</small>
            </button>
            <div className="size-row"><label>Default photo size</label><NativeSelect value={posterPreset} onChange={(event) => setPosterPreset(event.target.value as keyof typeof PAPER_SIZES)}><NativeSelectOption>A4</NativeSelectOption><NativeSelectOption>A3</NativeSelectOption><NativeSelectOption>A2</NativeSelectOption></NativeSelect></div>
            <div className="tray-tools">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <b>{pieces.length}</b></button>
              <button className={filter === 'placed' ? 'active' : ''} onClick={() => setFilter('placed')}>Placed <b>{placedCount}</b></button>
              <button className={filter === 'loose' ? 'active' : ''} onClick={() => setFilter('loose')}>Loose <b>{pieces.length - placedCount}</b></button>
            </div>
            <div className="piece-grid">
              {visiblePieces.map((piece) => (
                <button className={`piece-card ${selectedId === piece.id ? 'selected' : ''}`} key={piece.id} style={{ '--tone': piece.color } as React.CSSProperties} onClick={() => choosePiece(piece)} onDoubleClick={() => updatePiece(piece.id, { placed: !piece.placed })}>
                  <span className="piece-image"><img src={piece.src} alt={piece.name} />{piece.placed && <i className="placed-dot">PLACED</i>}{piece.locked && <i className="locked-dot"><Lock /></i>}</span>
                  <span className="piece-meta"><b>{piece.id}</b><small>{piece.widthCm.toFixed(1)} × {piece.heightCm.toFixed(1)} cm</small></span>
                </button>
              ))}
            </div>
            <div className="tray-footer"><span>{placedCount} / {pieces.length} placed</span><div><i style={{ width: `${pieces.length ? placedCount / pieces.length * 100 : 0}%` }} /></div><b>{pieces.length ? Math.round(placedCount / pieces.length * 100) : 0}%</b></div>
          </aside>

          <section className="canvas-area">
            <div className="canvas-toolbar">
              <div className="tool-cluster">
                <button className="active" aria-label="Select tool"><MousePointer2 /></button><button aria-label="Fit wall" onClick={() => setZoom(72)}><Maximize2 /></button><span />
                <button aria-label="Undo" disabled={!history.length} onClick={undo}><Undo2 /></button><button aria-label="Redo" disabled={!future.length} onClick={redo}><Redo2 /></button>
              </div>
              <div className="mode-switch"><button className={canvasMode === 'blueprint' ? 'active' : ''} onClick={() => setCanvasMode('blueprint')}><Grid3X3 /> Blueprint</button><button className={canvasMode === 'room' ? 'active' : ''} onClick={() => setCanvasMode('room')}><Eye /> Room preview</button></div>
              <div className="zoom-control"><button aria-label="Zoom out" onClick={() => setZoom((value) => clamp(value - 10, 35, 120))}><ZoomOut /></button><b>{zoom}%</b><button aria-label="Zoom in" onClick={() => setZoom((value) => clamp(value + 10, 35, 120))}><ZoomIn /></button></div>
            </div>
            <div className="canvas-scroll">
              <div className="ruler-top" aria-hidden="true">0 <span>{Math.round(wall.widthCm * .25)}</span><span>{Math.round(wall.widthCm * .5)}</span><span>{Math.round(wall.widthCm * .75)}</span><span>{wall.widthCm}</span><b>CM</b></div>
              <div className="wall-label"><Ruler /> {wall.widthCm} × {wall.heightCm} cm <button onClick={() => setWallOpen(true)}>Edit</button></div>
              <div className={`wall-canvas ${canvasMode}`} role="application" tabIndex={0} aria-label="Poster wall canvas. Select a poster, then drag to move it." ref={stageRef} onPointerMove={dragMove} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => { if (event.key === 'Escape') { setSelectedId(''); setPanelMode('assistant'); } }} onClick={(event) => { if (event.target === event.currentTarget) { setSelectedId(''); setPanelMode('assistant'); } }} style={{ width: `${zoom}%`, aspectRatio: `${wall.widthCm}/${wall.heightCm}`, backgroundColor: wall.color, backgroundImage: canvasMode === 'room' && (wall.photo || '/demo/wall-mockup.png') ? `linear-gradient(rgb(255 255 255 / 20%),rgb(255 255 255 / 20%)),url("${wall.photo || '/demo/wall-mockup.png'}")` : undefined }}>
                {canvasMode === 'blueprint' && <div className="wall-grid" />}
                {canvasMode === 'blueprint' && <div className="eye-line" style={{ top: `${clamp(100 - 145 / wall.heightCm * 100, 4, 96)}%` }}><span>EYE LEVEL · 145 CM</span></div>}
                {pieces.filter((piece) => piece.placed).map((piece) => (
                  <button className={`wall-piece ${selectedId === piece.id ? 'selected' : ''} ${piece.locked ? 'locked' : ''}`} key={piece.id} style={{ left: `${piece.x}%`, top: `${piece.y}%`, width: `${piece.w}%`, height: `${piece.h}%`, rotate: `${piece.rotation}deg`, '--tone': piece.color } as React.CSSProperties} onPointerDown={(event) => beginDrag(event, piece)} onClick={(event) => { event.stopPropagation(); choosePiece(piece); }} aria-label={`${piece.id}, ${piece.name}`}>
                    <img src={piece.src} alt="" draggable={false} /><b>{piece.id}</b>{piece.locked && <span className="piece-lock"><Lock /></span>}
                    {selectedId === piece.id && !piece.locked && <><i className="handle tl" /><i className="handle tr" /><i className="handle bl" /><i className="handle br" onPointerDown={(event) => beginDrag(event, piece, 'resize')} /></>}
                  </button>
                ))}
                {canvasMode === 'blueprint' && <div className="clearance-line" style={{ bottom: `${clamp(wall.furnitureClearanceCm / wall.heightCm * 100, 2, 45)}%` }}><span>FURNITURE CLEARANCE · {wall.furnitureClearanceCm} CM</span></div>}
              </div>
              <div className="canvas-status"><span><i className="ok" /> {placedCount === pieces.length ? 'All pieces fit' : `${pieces.length - placedCount} in the loose tray`}</span><span><b>{density < 45 ? '2.0' : density > 75 ? '0.8' : '1.2'} cm</b> minimum gap</span><span><b>{coverage}%</b> wall coverage</span></div>
            </div>
          </section>

          <aside className="assistant-panel">
            <div className="side-tabs"><button className={panelMode === 'assistant' ? 'active' : ''} onClick={() => setPanelMode('assistant')}><Sparkles /> Assistant</button><button className={panelMode === 'inspect' ? 'active' : ''} onClick={() => setPanelMode('inspect')} disabled={!selected}><PanelRight /> Inspect</button></div>
            {panelMode === 'inspect' && selected ? (
              <div className="inspector">
                <div className="inspect-hero"><img src={selected.src} alt={selected.name} /><span style={{ background: selected.color }} /><div><small>{selected.category}</small><h2>{selected.id}</h2><p>{selected.name}</p></div></div>
                <div className="inspect-section"><label>PRINT SIZE</label><div className="two-inputs"><span>W<Input type="number" value={selected.widthCm} min={1} step={0.1} onChange={(event) => updatePiece(selected.id, { widthCm: Number(event.target.value) }, false)} /></span><span>H<Input type="number" value={selected.heightCm} min={1} step={0.1} onChange={(event) => updatePiece(selected.id, { heightCm: Number(event.target.value) }, false)} /></span></div><p>Centimetres · aspect ratio stays protected on the wall.</p></div>
                <div className="inspect-section"><label>WALL SCALE <b>{Math.round(selected.w)}%</b></label><Slider value={[selected.w]} min={4} max={35} onValueChange={(value) => { const w = sliderValue(value); updatePiece(selected.id, { w, h: w * (selected.h / selected.w) }, false); }} /></div>
                <div className="inspect-section"><label>ROTATION <b>{selected.rotation.toFixed(1)}°</b></label><Slider value={[selected.rotation]} min={-8} max={8} step={0.5} onValueChange={(value) => updatePiece(selected.id, { rotation: sliderValue(value) }, false)} /><div className="nudge-row"><button onClick={() => updatePiece(selected.id, { rotation: 0 })}>Straighten</button><button onClick={() => updatePiece(selected.id, { x: 50 - selected.w / 2 })}><AlignCenter /> Centre</button></div></div>
                <div className="inspect-section lock-row"><div><label>LOCK POSITION</label><p>AI layouts will leave this piece exactly here.</p></div><Switch checked={selected.locked} onCheckedChange={(checked) => updatePiece(selected.id, { locked: checked })} /></div>
                <div className="inspect-actions"><Button variant="outline" onClick={duplicateSelected}><Copy /> Duplicate</Button><Button variant="outline" onClick={() => updatePiece(selected.id, { placed: !selected.placed })}>{selected.placed ? <BoxSelect /> : <Plus />}{selected.placed ? 'Move to tray' : 'Place'}</Button><Button variant="destructive" onClick={removeSelected}><Trash2 /> Remove</Button></div>
              </div>
            ) : (
              <div className="assistant-content">
                <div className="ai-heading"><span><Sparkles /></span><div><small>LAYOUT ASSISTANT</small><h2>Ask Cutroom</h2></div><i>LOCAL AI</i></div>
                <div className="assistant-copy"><p>Describe the feeling—not coordinates. I’ll translate it into a measured layout while keeping each image’s real proportions.</p><div className="quick-prompts"><button onClick={() => setPrompt('Create a cinematic compass. Group similar themes and balance warm against cool.')}>Theme groups</button><button onClick={() => setPrompt('Make it airy and organic, with the biggest portrait as the hero.')}>Airy hero</button><button onClick={() => setPrompt('Build a bold color flow from warm red and gold into cool blue and green.')}>Color flow</button></div><Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Layout brief" /></div>
                <div className="control-section"><label>GROUP BY <b>{groupStrength}%</b></label><div className="range-labels"><span>Color contrast</span><span>Theme</span></div><Slider value={[groupStrength]} onValueChange={(value) => setGroupStrength(sliderValue(value))} className="accent-slider" /></div>
                <div className="control-section"><label>COMPOSITION</label><div className="choice-grid six">{layouts.map((item) => <button key={item.id} className={layout === item.id ? 'active' : ''} onClick={() => applyTemplate(item.id)}><i className={`shape ${item.id}`} /><span>{item.name}<small>{item.note}</small></span></button>)}</div></div>
                <div className="control-section compact"><label>DENSITY <b>{density < 40 ? 'Airy' : density > 75 ? 'Packed' : 'Balanced'}</b></label><Slider value={[density]} onValueChange={(value) => setDensity(sliderValue(value))} /></div>
                <div className="ai-note"><WandSparkles /><p><b>Why this works.</b> {aiResponse}</p></div>
                <Button className="generate-button" onClick={runAssistant}><Send /> Arrange from my brief <span>⌘ ↵</span></Button>
                <button className="candidate-link" onClick={() => setCandidateOpen(true)}><Layers3 /> Compare 3 generated options</button>
                <p className="privacy-note"><Lock /> Photos stay in this browser. Nothing is uploaded to a server.</p>
              </div>
            )}
          </aside>
        </section>
      ) : (
        <section className="print-workspace">
          <aside className="print-sidebar">
            <div className="panel-heading"><div><span>PRINT PACKER</span><h2>Save paper & time</h2></div><Scissors /></div>
            <div className="print-intro">Make every image the same physical size, then pack as many as possible onto exact A-series or custom sheets.</div>
            <div className="print-control"><label>PAPER SIZE</label><div className="two-inputs"><NativeSelect value={printPaper} onChange={(event) => { setPrintPaper(event.target.value as keyof typeof PAPER_SIZES | 'Custom'); setPrintPage(0); }}><NativeSelectOption>A4</NativeSelectOption><NativeSelectOption>A3</NativeSelectOption><NativeSelectOption>A2</NativeSelectOption><NativeSelectOption>A1</NativeSelectOption><NativeSelectOption>Custom</NativeSelectOption></NativeSelect><button className={printLandscape ? 'active' : ''} onClick={() => { setPrintLandscape((value) => !value); setPrintPage(0); }}><RotateCcw /> {printLandscape ? 'Landscape' : 'Portrait'}</button></div>{printPaper === 'Custom' && <div className="two-inputs custom-paper"><span>Width cm<Input type="number" value={customSheetW} min={10} max={200} step={0.1} onChange={(event) => { setCustomSheetW(Number(event.target.value)); setPrintPage(0); }} /></span><span>Height cm<Input type="number" value={customSheetH} min={10} max={200} step={0.1} onChange={(event) => { setCustomSheetH(Number(event.target.value)); setPrintPage(0); }} /></span></div>}</div>
            <div className="print-control"><label>EACH IMAGE</label><div className="preset-chips"><button onClick={() => { setPrintCardW(9.9); setPrintCardH(14.1); }}>A6-ish</button><button onClick={() => { setPrintCardW(10); setPrintCardH(15); }}>10 × 15</button><button onClick={() => { setPrintCardW(12); setPrintCardH(18); }}>12 × 18</button></div><div className="two-inputs"><span>W<Input type="number" value={printCardW} min={2} step={0.1} onChange={(event) => setPrintCardW(Number(event.target.value))} /></span><span>H<Input type="number" value={printCardH} min={2} step={0.1} onChange={(event) => setPrintCardH(Number(event.target.value))} /></span></div><p>Images are contained, never stretched. Any blank edge stays white.</p></div>
            <div className="print-control"><label>CUT SPACING <b>{printGap.toFixed(1)} cm</b></label><Slider value={[printGap]} min={0.2} max={2} step={0.1} onValueChange={(value) => setPrintGap(sliderValue(value))} /></div>
            <div className="print-control"><label>PAGE MARGIN <b>{printMargin.toFixed(1)} cm</b></label><Slider value={[printMargin]} min={0.4} max={3} step={0.1} onValueChange={(value) => setPrintMargin(sliderValue(value))} /></div>
            <div className="print-control toggle-row"><div><label>CROP MARKS</label><p>Tiny corner guides for faster cutting.</p></div><Switch checked={cropMarks} onCheckedChange={setCropMarks} /></div>
            <div className={`fit-summary ${printGrid.fits ? '' : 'invalid'}`}><span><b>{printGrid.fits ? printGrid.perSheet : 0}</b> images / sheet</span><span><b>{printGrid.fits ? totalPrintPages : '—'}</b> sheets total</span><span><b>{printGrid.fits ? `${Math.max(0, Math.round((1 - (printGrid.perSheet * printCardW * printCardH) / (sheetW * sheetH)) * 100))}%` : 'Too big'}</b> spare area</span></div>
            {!printGrid.fits && <p className="pack-error">Reduce image size or margin, or choose a larger sheet.</p>}
            <Button className="print-export" disabled={!printGrid.fits} onClick={exportPrintPdf}><Printer /> Download print-ready PDF</Button>
          </aside>
          <section className="print-stage">
            <div className="print-toolbar"><button onClick={() => setView('arrange')}><ArrowLeft /> Back to wall</button><div><span>Sheet {printPage + 1} of {totalPrintPages}</span><button disabled={printPage === 0} onClick={() => setPrintPage((page) => page - 1)}>Previous</button><button disabled={printPage >= totalPrintPages - 1} onClick={() => setPrintPage((page) => page + 1)}>Next</button></div></div>
            <div className="print-canvas-wrap">
              <div className={`print-sheet ${printLandscape ? 'landscape' : ''}`} style={{ aspectRatio: `${sheetW}/${sheetH}`, gridTemplateColumns: `repeat(${printGrid.columns}, 1fr)`, gridTemplateRows: `repeat(${printGrid.rows}, 1fr)`, gap: `${Math.max(3, printGap * 5)}px`, padding: `${Math.max(8, printMargin * 7)}px` }}>
                {pagePieces.map((piece) => <div className="print-cell" key={piece.id}><img src={piece.src} alt={piece.name} /><b>{piece.id}</b>{cropMarks && <><i className="crop-mark tl" /><i className="crop-mark tr" /><i className="crop-mark bl" /><i className="crop-mark br" /></>}</div>)}
              </div>
              <div className="sheet-caption"><b>{printPaper} · {sheetW.toFixed(1)} × {sheetH.toFixed(1)} cm</b><span>1:1 PDF export · {printGrid.columns} columns × {printGrid.rows} rows</span></div>
            </div>
          </section>
          <aside className="print-help"><div className="mini-kicker">SMART PACK</div><h2>What Cutroom just saved</h2><div className="saving-number">{totalPrintPages}<small>{printPaper} sheets</small></div><p>Every poster keeps its aspect ratio and is placed inside a same-size trim box. Sheet dimensions in the PDF are exact.</p><div className="pack-checks"><span><Check /> No stretched faces</span><span><Check /> Stable IDs on every piece</span><span><Check /> Optional crop marks</span><span><Check /> Home-printer safe margins</span></div><button onClick={() => setPrintCardH(Number((printCardW * 1.414).toFixed(1)))}><Sparkles /> Match A-series ratio</button></aside>
        </section>
      )}

      {notice && <div className="notice"><Check /> {notice}</div>}
      {busy && <div className="busy-overlay"><span className="busy-spinner" /><b>{busy}</b><small>Large images are processed one step at a time.</small></div>}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="cutroom-dialog import-dialog">
          <DialogHeader><DialogTitle>What did you upload?</DialogTitle><DialogDescription>We’ll keep the original untouched. Choose how it should enter the project.</DialogDescription></DialogHeader>
          {pendingAsset && <div className="import-preview"><img src={pendingAsset.src} alt={pendingAsset.name} /><span>{pendingAsset.name}<b>{pendingAsset.pixelW} × {pendingAsset.pixelH} px</b></span></div>}
          <div className="import-choices"><button onClick={() => pendingAsset && addSingleAsset(pendingAsset)}><FileImage /><span><b>One finished poster</b><small>Keep the whole image and assign a print size.</small></span><ChevronDown /></button><button onClick={openCutter}><Scissors /><span><b>A sheet with many photos</b><small>Auto-split a grid or draw every crop yourself.</small></span><ChevronDown /></button></div>
          <div className="import-size"><label>Finished poster size</label><NativeSelect value={posterPreset} onChange={(event) => setPosterPreset(event.target.value as keyof typeof PAPER_SIZES)}><NativeSelectOption>A4 · 21 × 29.7 cm</NativeSelectOption><NativeSelectOption>A3 · 29.7 × 42 cm</NativeSelectOption><NativeSelectOption>A2 · 42 × 59.4 cm</NativeSelectOption></NativeSelect></div>
        </DialogContent>
      </Dialog>

      <Dialog open={cutOpen} onOpenChange={setCutOpen}>
        <DialogContent className="cutroom-dialog cutter-dialog" showCloseButton={false}>
          <div className="cutter-head"><div><span>SHEET CUTTER</span><h2>Find every photo</h2></div><button onClick={() => setCutOpen(false)} aria-label="Close cutter"><X /></button></div>
          <div className="cutter-body">
            <aside><label>METHOD</label><div className="method-toggle"><button className={cutMode === 'auto' ? 'active' : ''} onClick={() => setCutMode('auto')}><Grid3X3 /> Auto grid</button><button className={cutMode === 'manual' ? 'active' : ''} onClick={() => setCutMode('manual')}><Crop /> Draw cuts</button></div>{cutMode === 'auto' ? <><label>GRID</label><div className="two-inputs"><span>Rows<Input type="number" min={1} max={10} value={rows} onChange={(event) => setRows(clamp(Number(event.target.value), 1, 10))} /></span><span>Columns<Input type="number" min={1} max={10} value={columns} onChange={(event) => setColumns(clamp(Number(event.target.value), 1, 10))} /></span></div><p>Best for sheets with an even grid. Switch to Draw cuts for mixed sizes.</p></> : <><label>MANUAL CUTS</label><p>Drag a box around each photo. Boxes may be any size or shape ratio.</p><div className="manual-actions"><button onClick={() => setManualCuts((items) => items.slice(0, -1))} disabled={!manualCuts.length}><Undo2 /> Undo box</button><button onClick={() => setManualCuts([])} disabled={!manualCuts.length}><Trash2 /> Clear</button></div></>}<label>SOURCE PAPER</label><NativeSelect value={sheetPaper} onChange={(event) => setSheetPaper(event.target.value as keyof typeof PAPER_SIZES)}><NativeSelectOption>A4</NativeSelectOption><NativeSelectOption>A3</NativeSelectOption><NativeSelectOption>A2</NativeSelectOption><NativeSelectOption>A1</NativeSelectOption></NativeSelect><div className="cut-count"><b>{cutMode === 'auto' ? autoRects.length : manualCuts.length}</b><span>cutouts ready</span></div></aside>
            <div className="cut-preview-wrap">{pendingAsset && <div className={`cut-preview ${cutMode}`} ref={cutPreviewRef} onPointerDown={(event) => cutPointer(event, 'start')} onPointerMove={(event) => cutPointer(event, 'move')} onPointerUp={(event) => cutPointer(event, 'end')} style={{ aspectRatio: `${pendingAsset.pixelW}/${pendingAsset.pixelH}` }}><img src={pendingAsset.src} alt="Sheet being cut" draggable={false} />{(cutMode === 'auto' ? autoRects : manualCuts).map((rect, index) => <i key={index} className="crop-box" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}><b>{String(index + 1).padStart(2, '0')}</b></i>)}{drawingCut && <i className="crop-box drawing" style={{ left: `${drawingCut.x * 100}%`, top: `${drawingCut.y * 100}%`, width: `${drawingCut.w * 100}%`, height: `${drawingCut.h * 100}%` }} />}</div>}<p>{cutMode === 'auto' ? 'Adjust rows and columns until every grid cell contains one photo.' : 'Draw from one corner of a photo to the opposite corner.'}</p></div>
          </div>
          <DialogFooter className="cutter-footer"><Button variant="outline" onClick={() => setCutOpen(false)}>Cancel</Button><Button onClick={createCutouts}><Scissors /> Create {cutMode === 'auto' ? autoRects.length : manualCuts.length} cutouts</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wallOpen} onOpenChange={setWallOpen}>
        <DialogContent className="cutroom-dialog wall-dialog"><DialogHeader><DialogTitle>Set the real wall</DialogTitle><DialogDescription>Accurate dimensions keep generated layouts buildable in your room.</DialogDescription></DialogHeader><div className="wall-settings"><label>QUICK SIZE</label><NativeSelect defaultValue="dorm" onChange={(event) => changeWallPreset(event.target.value)}><NativeSelectOption value="desk">Desk wall · 180 × 110</NativeSelectOption><NativeSelectOption value="dorm">Bedroom · 240 × 160</NativeSelectOption><NativeSelectOption value="sofa">Above sofa · 300 × 170</NativeSelectOption><NativeSelectOption value="tall">Tall wall · 130 × 220</NativeSelectOption></NativeSelect><div className="two-inputs"><span>Width cm<Input type="number" value={wall.widthCm} min={40} max={1000} onChange={(event) => setWall((current) => ({ ...current, widthCm: Number(event.target.value) }))} /></span><span>Height cm<Input type="number" value={wall.heightCm} min={40} max={500} onChange={(event) => setWall((current) => ({ ...current, heightCm: Number(event.target.value) }))} /></span></div><label>WALL LOOK</label><div className="wall-look"><button onClick={() => setWall((current) => ({ ...current, color: '#eee8dc' }))} style={{ background: '#eee8dc' }} aria-label="Warm chalk" /><button onClick={() => setWall((current) => ({ ...current, color: '#d4cbc0' }))} style={{ background: '#d4cbc0' }} aria-label="Greige" /><button onClick={() => setWall((current) => ({ ...current, color: '#b9c5c8' }))} style={{ background: '#b9c5c8' }} aria-label="Blue grey" /><button onClick={() => setWall((current) => ({ ...current, color: '#54605c' }))} style={{ background: '#54605c' }} aria-label="Deep green" /><span><PaintBucket /><Input type="color" value={wall.color} onChange={(event) => setWall((current) => ({ ...current, color: event.target.value }))} /></span></div><button className="wall-photo-button" onClick={() => wallUploadRef.current?.click()}><ImageIcon /><span><b>{wall.photo ? 'Replace wall photo' : 'Upload your wall photo'}</b><small>For a realistic room preview. Straight-on photos work best.</small></span></button><label>FURNITURE CLEARANCE <b>{wall.furnitureClearanceCm} cm</b></label><Slider value={[wall.furnitureClearanceCm]} min={0} max={80} onValueChange={(value) => setWall((current) => ({ ...current, furnitureClearanceCm: sliderValue(value) }))} /></div><DialogFooter><Button onClick={() => { setWallOpen(false); toast('Wall measurements updated.'); }}>Use this wall</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={candidateOpen} onOpenChange={setCandidateOpen}>
        <DialogContent className="cutroom-dialog candidate-dialog"><DialogHeader><DialogTitle>Three strong directions</DialogTitle><DialogDescription>Every option keeps physical proportions and locked pieces. Pick one, then refine it by hand.</DialogDescription></DialogHeader><div className="candidate-grid">{(['compass', 'organic', 'strip'] as LayoutName[]).map((name, index) => <button key={name} onClick={() => applyTemplate(name)}><div className={`candidate-mini ${name}`}>{Array.from({ length: 13 }, (_, n) => <i key={n} style={{ background: COLORS[n % COLORS.length] }} />)}</div><span><em>0{index + 1}</em><b>{layouts.find((item) => item.id === name)?.name}</b><small>{layouts.find((item) => item.id === name)?.note}</small></span></button>)}</div></DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="cutroom-dialog export-dialog"><DialogHeader><DialogTitle>Take the plan with you</DialogTitle><DialogDescription>Everything remains numbered so the digital design matches the pieces in your hands.</DialogDescription></DialogHeader><div className="export-options"><button onClick={exportWallPng}><FileImage /><span><b>Wall plan PNG</b><small>High-resolution numbered image for your phone.</small></span><Download /></button><button onClick={exportWallPdf}><FileText /><span><b>Installation PDF</b><small>Measured blueprint with a centre-out hanging guide.</small></span><Download /></button><button onClick={() => { setExportOpen(false); setView('print'); }}><Printer /><span><b>Print-sheet packer</b><small>Fit same-size photos efficiently on A4, A3, A2 or A1.</small></span><ChevronDown /></button><button onClick={exportProject}><FileArchive /><span><b>Project backup</b><small>Portable JSON with dimensions, IDs and placements.</small></span><Download /></button></div></DialogContent>
      </Dialog>
    </main>
  );
}
