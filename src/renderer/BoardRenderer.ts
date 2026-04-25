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
  /** 무지개 보너스 셀 애니메이션을 위한 단조 진행 시간(ms). 미설정이면 0(정지). */
  readonly phaseMs?: number;
}

const COLOR_BG = "#1b222b";
const COLOR_GRID = "#2a323c";
const COLOR_CELL = "#f5f6fa";
const COLOR_CELL_SELECTED = "#7dd4fc";
const COLOR_CELL_INVALID = "#ff8787";
const COLOR_CELL_HINT = "#ffd666";
const COLOR_TEXT = "#14213d";
const COLOR_OBSTACLE = "#3a342c";
const COLOR_OBSTACLE_BORDER = "#6b5b3f";
const COLOR_WILD_BG = "#a78bfa";
const COLOR_WILD_BG_2 = "#ec4899";
const COLOR_WILD_BORDER = "#ffffff";
const COLOR_WILD_TEXT = "#ffffff";

/**
 * 멀티라이프 셀 배경색 — 적록 색맹을 고려한 단색조(파랑) 명도 그라데이션.
 * lives 1은 일반 셀과 동일하므로 사용 안 함; index 0은 placeholder.
 */
const COLOR_CELL_LIFE: ReadonlyArray<string> = [
  "",        // 0: 빈칸 (사용 안 함)
  "#f5f6fa", // 1: 일반 (기본 흰)
  "#d4ebf8", // 2: 연하늘
  "#8cc1de", // 3: 하늘
  "#4291bd", // 4: 중파랑
  "#1e4d80", // 5: 네이비
];

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
    const phaseMs = options.phaseMs ?? 0;

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
        // 장애물: 어두운 회갈색 + 자물쇠 이모지로 표시. 중력/제거 영향 없음.
        if (board.isObstacle(c, r)) {
          const pad = 2;
          ctx.fillStyle = COLOR_OBSTACLE;
          ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
          ctx.strokeStyle = COLOR_OBSTACLE_BORDER;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + pad + 1, y + pad + 1, size - pad * 2 - 2, size - pad * 2 - 2);
          ctx.fillStyle = "#d8c79a";
          ctx.fillText("🪨", x + size / 2, y + size / 2 + 2);
          continue;
        }
        // 만능(?) 블럭: 그라데이션 배경 + 흰 ? 글리프. 선택 시 별도 색상 처리는 일반 셀과 동일.
        if (board.isWildcard(c, r)) {
          const pad = 2;
          const grad = ctx.createLinearGradient(x, y, x + size, y + size);
          grad.addColorStop(0, COLOR_WILD_BG);
          grad.addColorStop(1, COLOR_WILD_BG_2);
          const isSel = inList(selection, c, r);
          if (isSel) {
            ctx.fillStyle = invalid ? COLOR_CELL_INVALID : COLOR_CELL_SELECTED;
            ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
          } else {
            ctx.fillStyle = grad;
            ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
          }
          ctx.strokeStyle = COLOR_WILD_BORDER;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + pad + 1, y + pad + 1, size - pad * 2 - 2, size - pad * 2 - 2);
          ctx.fillStyle = COLOR_WILD_TEXT;
          ctx.font = `900 ${Math.floor(size * 0.7)}px -apple-system, "Segoe UI", sans-serif`;
          ctx.fillText("?", x + size / 2, y + size / 2 + 2);
          // 폰트 복원 (이후 일반 셀 렌더용)
          ctx.font = `${fontSize}px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
          continue;
        }
        const value = board.getCell(c, r);
        if (value === 0) continue;
        const lives = board.getLives(c, r);
        const isBonus = board.isBonus(c, r);

        const pad = 2;
        if (isBonus) {
          // 무지개 그라데이션 — phaseMs 기준으로 색상 회전 + 사선 방향에 stops 분배.
          const hueBase = (phaseMs / 18) % 360;
          const grad = ctx.createLinearGradient(x, y, x + size, y + size);
          for (let i = 0; i <= 4; i++) {
            grad.addColorStop(i / 4, `hsl(${(hueBase + i * 90) % 360}, 95%, 60%)`);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
          // 선택/힌트 색을 보너스 위에 반투명으로 덮어 시각 정합 유지.
          if (inList(selection, c, r)) {
            ctx.fillStyle = invalid
              ? "rgba(255, 135, 135, 0.55)"
              : "rgba(125, 212, 252, 0.55)";
            ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
          } else if (highlight && inList(highlight, c, r)) {
            ctx.fillStyle = "rgba(255, 214, 102, 0.55)";
            ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
          }
          // 흰 외곽선 + 흰 숫자 + ×2 배지
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + pad + 1, y + pad + 1, size - pad * 2 - 2, size - pad * 2 - 2);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(CELL_EMOJIS[value] ?? String(value), x + size / 2, y + size / 2 + 2);
          // 좌상단 ×2 배지 (밝은 배경에서도 보이게 어두운 그림자)
          const badgeFont = Math.max(10, Math.floor(size * 0.24));
          ctx.font = `900 ${badgeFont}px -apple-system, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillStyle = "rgba(20, 25, 40, 0.65)";
          ctx.fillText("×2", x + 5, y + 4);
          ctx.fillStyle = "#ffffff";
          ctx.fillText("×2", x + 4, y + 3);
          // 폰트/정렬 복원
          ctx.font = `${fontSize}px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          continue;
        }

        let fill: string;
        if (inList(selection, c, r)) {
          fill = invalid ? COLOR_CELL_INVALID : COLOR_CELL_SELECTED;
        } else if (highlight && inList(highlight, c, r)) {
          fill = COLOR_CELL_HINT;
        } else if (lives >= 2 && lives <= 5) {
          fill = COLOR_CELL_LIFE[lives];
        } else {
          fill = COLOR_CELL;
        }

        ctx.fillStyle = fill;
        ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);

        ctx.fillStyle = COLOR_TEXT;
        ctx.fillText(CELL_EMOJIS[value] ?? String(value), x + size / 2, y + size / 2 + 2);

        // 멀티라이프 셀: 좌상단에 lives 카운트 배지 (색맹 보조)
        if (lives >= 2) {
          const badgeFont = Math.max(10, Math.floor(size * 0.22));
          ctx.font = `bold ${badgeFont}px -apple-system, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillStyle = lives >= 4 ? "#ffffff" : "#1e4d80";
          ctx.fillText(`x${lives}`, x + 4, y + 3);
          // 폰트/정렬 복원
          ctx.font = `${fontSize}px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
        }
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
