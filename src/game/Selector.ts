/**
 * Selector — 드래그 선택 상태와 유효성 판정.
 *
 * 게임 규칙:
 *   - 상하좌우 4방향 인접 셀만 연속 선택 (대각선 금지).
 *   - 2개 또는 3개를 선택했을 때 합이 정확히 10이면 제거 가능.
 *   - 드래그 중 직전 셀로 되돌아가면 마지막 셀이 취소된다(자연스러운 undo).
 *   - 빈 셀(0)은 시작/확장 모두 거부.
 */
import type { Board, Position } from "./Board";

export interface SelectionResult {
  readonly positions: readonly Position[];
  readonly sum: number;
  readonly valid: boolean;
}

export const MIN_SELECTION = 2;
export const MAX_SELECTION = 3;
export const TARGET_SUM = 10;

/**
 * 만능(?) 블럭을 고려한 합 10 매칭 판정. positions 길이는 호출자가 책임.
 * - W=만능 개수, S=고정 셀의 face value 합. (10 - S) ∈ [W, 9·W] 면 매치 가능.
 * - W=0 이면 S = 10.
 */
export function isWildSum10(
  positions: ReadonlyArray<Position>,
  board: Board,
): boolean {
  let fixed = 0;
  let wild = 0;
  for (const [c, r] of positions) {
    if (!board.inBounds(c, r)) return false;
    if (board.isWildcard(c, r)) wild++;
    else fixed += board.getCell(c, r);
  }
  const need = TARGET_SUM - fixed;
  if (wild === 0) return need === 0;
  return need >= wild && need <= wild * 9;
}

export class Selector {
  private readonly board: Board;
  private positions: Position[] = [];

  constructor(board: Board) {
    this.board = board;
  }

  getPositions(): readonly Position[] {
    return this.positions;
  }

  getSum(): number {
    return this.positions.length === 0 ? 0 : this.board.sumAt(this.positions);
  }

  isActive(): boolean {
    return this.positions.length > 0;
  }

  /**
   * 제거 조건 — 길이 2~3 + (만능 고려) 합 10 충족 여부.
   * 만능 셀은 1~9 중 어떤 값으로도 채택될 수 있으므로 다음 조건과 동치:
   *   `(10 - 고정합) ∈ [W, 9·W]`  (W = 선택 내 만능 개수)
   * 만능이 없으면 기존 규칙(고정합 = 10).
   */
  isValidForRemoval(): boolean {
    const n = this.positions.length;
    if (n < MIN_SELECTION || n > MAX_SELECTION) return false;
    return isWildSum10(this.positions, this.board);
  }

  begin(col: number, row: number): boolean {
    this.positions = [];
    if (!this.board.inBounds(col, row) || this.board.isEmpty(col, row)) {
      return false;
    }
    this.positions = [[col, row]];
    return true;
  }

  extend(col: number, row: number): boolean {
    if (this.positions.length === 0) return false;
    if (!this.board.inBounds(col, row)) return false;
    if (this.board.isEmpty(col, row)) return false;

    // 직전-직전 셀로 되돌아가면 마지막 셀을 pop (undo).
    if (this.positions.length >= 2) {
      const secondLast = this.positions[this.positions.length - 2];
      if (secondLast[0] === col && secondLast[1] === row) {
        this.positions.pop();
        return true;
      }
    }

    // 이미 선택된 셀은 거부.
    for (const [c, r] of this.positions) {
      if (c === col && r === row) return false;
    }

    if (this.positions.length >= MAX_SELECTION) return false;

    // 직전 위치와 4방향 인접(맨해튼 거리 1)만 허용.
    const last = this.positions[this.positions.length - 1];
    const dx = Math.abs(col - last[0]);
    const dy = Math.abs(row - last[1]);
    if (dx + dy !== 1) return false;

    this.positions.push([col, row]);
    return true;
  }

  /** 선택 종료: 결과를 반환하고 내부 상태를 초기화한다. */
  commit(): SelectionResult {
    const result: SelectionResult = {
      positions: this.positions.slice(),
      sum: this.getSum(),
      valid: this.isValidForRemoval(),
    };
    this.positions = [];
    return result;
  }

  cancel(): void {
    this.positions = [];
  }
}
