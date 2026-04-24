/**
 * Hint — 유효 조합 탐색 + 힌트 사용 횟수/하이라이트 수명 관리.
 *
 * 탐색 전략: 2셀 쌍을 먼저 훑고, 없으면 3셀 경로를 탐색한다(간단한 힌트 우선).
 * 좌표 규약: `(col, row)`.
 */
import type { Board, Position } from "./Board";

export const HINT_HIGHLIGHT_MS = 3000;
const TARGET_SUM = 10;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 합이 10인 2셀 또는 3셀 연속 경로를 찾으면 해당 위치 배열을 반환. 없으면 null. */
export function findValidCombination(board: Board): readonly Position[] | null {
  const cols = board.getCols();
  const rows = board.getRows();

  // 2셀(가로/세로 인접)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board.isEmpty(c, r)) continue;
      const v = board.getCell(c, r);
      if (c + 1 < cols && !board.isEmpty(c + 1, r)) {
        if (v + board.getCell(c + 1, r) === TARGET_SUM) {
          return [
            [c, r],
            [c + 1, r],
          ];
        }
      }
      if (r + 1 < rows && !board.isEmpty(c, r + 1)) {
        if (v + board.getCell(c, r + 1) === TARGET_SUM) {
          return [
            [c, r],
            [c, r + 1],
          ];
        }
      }
    }
  }

  // 3셀(4방향 경로). 직전 셀로 돌아가는 경로만 제외.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board.isEmpty(c, r)) continue;
      const v1 = board.getCell(c, r);
      for (const [dx1, dy1] of DIRS) {
        const c2 = c + dx1;
        const r2 = r + dy1;
        if (!board.inBounds(c2, r2) || board.isEmpty(c2, r2)) continue;
        const v2 = board.getCell(c2, r2);
        for (const [dx2, dy2] of DIRS) {
          const c3 = c2 + dx2;
          const r3 = r2 + dy2;
          if (c3 === c && r3 === r) continue;
          if (!board.inBounds(c3, r3) || board.isEmpty(c3, r3)) continue;
          if (v1 + v2 + board.getCell(c3, r3) === TARGET_SUM) {
            return [
              [c, r],
              [c2, r2],
              [c3, r3],
            ];
          }
        }
      }
    }
  }

  return null;
}

export class Hint {
  private readonly board: Board;
  private remaining: number;
  private highlighted: readonly Position[] | null;
  private highlightLeftMs: number;

  constructor(board: Board, count: number) {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Hint: count는 0 이상 정수여야 합니다 (${count}).`);
    }
    this.board = board;
    this.remaining = count;
    this.highlighted = null;
    this.highlightLeftMs = 0;
  }

  getRemaining(): number {
    return this.remaining;
  }

  getHighlighted(): readonly Position[] | null {
    return this.highlighted;
  }

  isHighlighting(): boolean {
    return this.highlighted !== null && this.highlightLeftMs > 0;
  }

  /** 힌트 요청. 사용 가능하고 유효 조합이 존재할 때만 횟수를 차감하고 하이라이트를 시작한다. */
  request(): readonly Position[] | null {
    if (this.remaining <= 0) return null;
    const combo = findValidCombination(this.board);
    if (!combo) return null;
    this.remaining--;
    this.highlighted = combo;
    this.highlightLeftMs = HINT_HIGHLIGHT_MS;
    return combo;
  }

  tick(deltaMs: number): void {
    if (this.highlightLeftMs <= 0 || deltaMs <= 0) return;
    this.highlightLeftMs -= deltaMs;
    if (this.highlightLeftMs <= 0) {
      this.highlightLeftMs = 0;
      this.highlighted = null;
    }
  }

  clear(): void {
    this.highlighted = null;
    this.highlightLeftMs = 0;
  }
}
