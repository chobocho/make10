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

  /** 제거 조건(길이 2~3, 합 10) 충족 여부. */
  isValidForRemoval(): boolean {
    const n = this.positions.length;
    if (n < MIN_SELECTION || n > MAX_SELECTION) return false;
    return this.getSum() === TARGET_SUM;
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
