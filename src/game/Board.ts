/**
 * Board — 격자 데이터 및 셀 제거 규칙.
 *
 * 게임 규칙:
 *   - 셀 값 0은 빈 칸(제거됨). 1~9만 유효한 값이다.
 *   - 제거 후 중력/보충 없음 — 제거된 칸은 영구적으로 비어 있다.
 *   - 보드의 모든 셀이 비면 클리어 조건 충족.
 *
 * 좌표 규약: (col, row) — 첫 번째가 x(열), 두 번째가 y(행).
 */

export type Cell = number;
export type Position = readonly [col: number, row: number];

export class Board {
  private readonly cols: number;
  private readonly rows: number;
  /** grid[row][col] 순으로 저장한다. */
  private readonly grid: Cell[][];

  constructor(initial: ReadonlyArray<ReadonlyArray<Cell>>) {
    if (initial.length === 0) {
      throw new Error("Board: 최소 1행이 필요합니다.");
    }
    const rows = initial.length;
    const cols = initial[0].length;
    if (cols === 0) {
      throw new Error("Board: 최소 1열이 필요합니다.");
    }
    for (let r = 0; r < rows; r++) {
      const row = initial[r];
      if (row.length !== cols) {
        throw new Error(
          `Board: 모든 행의 열 수가 같아야 합니다 (row ${r} 길이 ${row.length}, 기준 ${cols}).`,
        );
      }
      for (let c = 0; c < cols; c++) {
        const v = row[c];
        if (!Number.isInteger(v) || v < 0 || v > 9) {
          throw new Error(`Board: 잘못된 셀 값 ${v} @ (${c},${r}). 0~9 정수만 허용.`);
        }
      }
    }
    this.cols = cols;
    this.rows = rows;
    this.grid = initial.map((row) => row.slice());
  }

  getCols(): number {
    return this.cols;
  }

  getRows(): number {
    return this.rows;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  getCell(col: number, row: number): Cell {
    if (!this.inBounds(col, row)) {
      throw new RangeError(`Board.getCell: 경계 밖 (${col},${row}).`);
    }
    return this.grid[row][col];
  }

  isEmpty(col: number, row: number): boolean {
    return this.getCell(col, row) === 0;
  }

  clearCell(col: number, row: number): void {
    if (!this.inBounds(col, row)) {
      throw new RangeError(`Board.clearCell: 경계 밖 (${col},${row}).`);
    }
    this.grid[row][col] = 0;
  }

  clearCells(positions: ReadonlyArray<Position>): void {
    for (const [c, r] of positions) this.clearCell(c, r);
  }

  /**
   * 중력 적용 — 각 열에서 위에 있던 비어있지 않은 셀이 아래의 빈 칸을 채우며 낙하한다.
   * (Bejeweled 스타일: 셀이 위에서 아래로 떨어진다.)
   * 상대적 순서는 유지된다. 외부 상태(선택/힌트)는 호출자가 재설정해야 한다.
   * @returns 실제로 이동이 발생했는지 여부
   */
  applyGravity(): boolean {
    let moved = false;
    for (let c = 0; c < this.cols; c++) {
      const column: number[] = [];
      for (let r = 0; r < this.rows; r++) {
        const v = this.grid[r][c];
        if (v !== 0) column.push(v);
      }
      const emptyCount = this.rows - column.length;
      for (let r = 0; r < emptyCount; r++) {
        if (this.grid[r][c] !== 0) moved = true;
        this.grid[r][c] = 0;
      }
      for (let i = 0; i < column.length; i++) {
        const newRow = emptyCount + i;
        if (this.grid[newRow][c] !== column[i]) moved = true;
        this.grid[newRow][c] = column[i];
      }
    }
    return moved;
  }

  isCleared(): boolean {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== 0) return false;
      }
    }
    return true;
  }

  /** 여러 위치 값의 합. 경계 밖 좌표는 예외를 던진다. */
  sumAt(positions: ReadonlyArray<Position>): number {
    let s = 0;
    for (const [c, r] of positions) s += this.getCell(c, r);
    return s;
  }

  /** 렌더러/테스트에서 읽기 전용 사본이 필요할 때 사용. */
  snapshot(): Cell[][] {
    return this.grid.map((row) => row.slice());
  }

  /** 남은 비어있지 않은 셀 개수. */
  remainingCount(): number {
    let n = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== 0) n++;
      }
    }
    return n;
  }

  /** 모든 비어있지 않은 셀의 좌표를 순회한다. */
  *nonEmptyCells(): IterableIterator<{ col: number; row: number; value: number }> {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = this.grid[r][c];
        if (v !== 0) yield { col: c, row: r, value: v };
      }
    }
  }
}
