/**
 * BoardRenderer — 보드 격자와 셀 이모지를 그리고, 선택/힌트 하이라이트를 시각화한다.
 *
 * 레이아웃은 주어진 bounds 안에 정사각 셀을 균등 배치하며,
 * CSS 픽셀 좌표계로 그린다 (HiDPI는 `CanvasRenderer`가 처리).
 */
import type { Board, Position } from "../game/Board";
import type { CanvasRenderer } from "./CanvasRenderer";

export interface BoardLayout {
  readonly cellSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly cols: number;
  readonly rows: number;
}

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const CELL_EMOJIS: readonly string[] = [
  "",
  "1\uFE0F\u20E3",
  "2\uFE0F\u20E3",
  "3\uFE0F\u20E3",
  "4\uFE0F\u20E3",
  "5\uFE0F\u20E3",
  "6\uFE0F\u20E3",
  "7\uFE0F\u20E3",
  "8\uFE0F\u20E3",
  "9\uFE0F\u20E3",
];

export function computeBoardLayout(
  bounds: Bounds,
  cols: number,
  rows: number,
  padding = 8,
): BoardLayout {
  if (cols <= 0 || rows <= 0) {
    throw new Error(`computeBoardLayout: cols/rows는 양수여야 합니다 (${cols}x${rows}).`);
  }
  const availW = Math.max(0, bounds.width - padding * 2);
  const availH = Math.max(0, bounds.height - padding * 2);
  const cellSize = Math.max(1, Math.floor(Math.min(availW / cols, availH / rows)));
  const boardW = cellSize * cols;
  const boardH = cellSize * rows;
  const originX = bounds.x + Math.floor((bounds.width - boardW) / 2);
  const originY = bounds.y + Math.floor((bounds.height - boardH) / 2);
  return { cellSize, originX, originY, cols, rows };
}

export function cellRect(
  layout: BoardLayout,
  col: number,
  row: number,
): { x: number; y: number; size: number } {
  return {
    x: layout.originX + col * layout.cellSize,
    y: layout.originY + row * layout.cellSize,
    size: layout.cellSize,
  };
}

/** 스크린 좌표(CSS 픽셀)를 셀 좌표로 변환. 밖이면 null. */
export function hitTestCell(
  layout: BoardLayout,
  x: number,
  y: number,
): Position | null {
  const c = Math.floor((x - layout.originX) / layout.cellSize);
  const r = Math.floor((y - layout.originY) / layout.cellSize);
  if (c < 0 || c >= layout.cols || r < 0 || r >= layout.rows) return null;
  return [c, r];
}

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function inList(positions: ReadonlyArray<Position>, c: number, r: number): boolean {
  for (const p of positions) if (p[0] === c && p[1] === r) return true;
  return false;
}

export interface BoardDrawOptions {
  readonly selection?: ReadonlyArray<Position>;
  readonly highlight?: ReadonlyArray<Position> | null;
  readonly invalidSelection?: boolean;
}

const COLOR_BG = "#1b222b";
const COLOR_GRID = "#2a323c";
const COLOR_CELL = "#f5f6fa";
const COLOR_CELL_SELECTED = "#7dd4fc";
const COLOR_CELL_INVALID = "#ff8787";
const COLOR_CELL_HINT = "#ffd666";
const COLOR_TEXT = "#14213d";

export class BoardRenderer {
  private readonly renderer: CanvasRenderer;
  private layout: BoardLayout;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
    this.layout = {
      cellSize: 0,
      originX: 0,
      originY: 0,
      cols: 0,
      rows: 0,
    };
  }

  setLayout(layout: BoardLayout): void {
    this.layout = layout;
  }

  getLayout(): BoardLayout {
    return this.layout;
  }

  draw(board: Board, options: BoardDrawOptions = {}): void {
    const layout = this.layout;
    if (layout.cellSize <= 0) return;
    const ctx = this.renderer.getCtx();

    const selection = options.selection ?? [];
    const highlight = options.highlight ?? null;
    const invalid = options.invalidSelection === true;

    // 보드 배경
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(
      layout.originX - 4,
      layout.originY - 4,
      layout.cellSize * layout.cols + 8,
      layout.cellSize * layout.rows + 8,
    );

    const size = layout.cellSize;
    const fontSize = Math.floor(size * 0.6);
    ctx.font = `${fontSize}px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        const x = layout.originX + c * size;
        const y = layout.originY + r * size;

        ctx.fillStyle = COLOR_GRID;
        ctx.fillRect(x, y, size, size);

        if (!board.inBounds(c, r)) continue;
        const value = board.getCell(c, r);
        if (value === 0) continue;

        let fill = COLOR_CELL;
        if (inList(selection, c, r)) {
          fill = invalid ? COLOR_CELL_INVALID : COLOR_CELL_SELECTED;
        } else if (highlight && inList(highlight, c, r)) {
          fill = COLOR_CELL_HINT;
        }

        const pad = 2;
        ctx.fillStyle = fill;
        ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);

        ctx.fillStyle = COLOR_TEXT;
        ctx.fillText(CELL_EMOJIS[value] ?? String(value), x + size / 2, y + size / 2 + 2);
      }
    }

    // 선택 셀들을 잇는 경로 표시
    if (selection.length >= 2) {
      ctx.strokeStyle = invalid ? COLOR_CELL_INVALID : COLOR_CELL_SELECTED;
      ctx.lineWidth = Math.max(3, Math.floor(size * 0.12));
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < selection.length; i++) {
        const [c, r] = selection[i];
        const cx = layout.originX + c * size + size / 2;
        const cy = layout.originY + r * size + size / 2;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // selection 내부 이모지 재그리기 (선 위에 덮이지 않도록)
    if (selection.length > 0) {
      ctx.fillStyle = COLOR_TEXT;
      for (const [c, r] of selection) {
        if (!board.inBounds(c, r)) continue;
        const v = board.getCell(c, r);
        if (v === 0) continue;
        const cx = layout.originX + c * size + size / 2;
        const cy = layout.originY + r * size + size / 2;
        ctx.fillText(CELL_EMOJIS[v] ?? String(v), cx, cy + 2);
      }
    }

    // 사용하지 않는 참조 제거(타입체커 조용히 하기용) — 아래 eqGuard는 외부 호출자가 이용.
    void samePosition;
  }
}
