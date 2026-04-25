/**
 * Board — 격자 데이터 및 셀 제거 규칙.
 *
 * 게임 규칙:
 *   - 셀 값 0은 빈 칸(제거됨). 1~9만 유효한 값이다.
 *   - 셀 lives: 0=빈 칸, 1=일반(매치 즉시 제거), 2~5=멀티라이프(매치마다 lives -1, 0이면 제거).
 *   - obstacle: 파괴 불가의 고정 장애물. grid=0, lives=0, obstacle=true 로 표현.
 *     선택 대상이 아니며(grid=0), 중력의 영향을 받지 않고 제자리에 머무른다.
 *     장애물 위쪽의 블럭이 떨어질 때는 장애물을 "통과"하여 아래쪽 빈 칸으로 쌓인다.
 *   - 제거 후 중력 적용 + 빈 칸 리필로 보드는 항상 가득 찬 상태를 유지.
 *
 * 좌표 규약: (col, row) — 첫 번째가 x(열), 두 번째가 y(행).
 */

export type Cell = number;
export type Position = readonly [col: number, row: number];

export const MAX_LIFE = 5;

export class Board {
  private readonly cols: number;
  private readonly rows: number;
  /** grid[row][col] — 셀의 face value (0=빈칸, 1~9). 장애물 셀도 0. */
  private readonly grid: Cell[][];
  /** lives[row][col] — 잔여 lives (0=빈칸/장애물, 1=일반, 2~5=멀티라이프). */
  private readonly lives: number[][];
  /** obstacle[row][col] — 파괴 불가 장애물 여부. true면 grid=0, lives=0이어야 함. */
  private readonly obstacles: boolean[][];

  constructor(
    initial: ReadonlyArray<ReadonlyArray<Cell>>,
    initialLives?: ReadonlyArray<ReadonlyArray<number>>,
    initialObstacles?: ReadonlyArray<ReadonlyArray<boolean | number>>,
  ) {
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

    if (initialLives) {
      if (initialLives.length !== rows) {
        throw new Error(
          `Board: initialLives 행 수 불일치 (기준 ${rows}, ${initialLives.length}).`,
        );
      }
      for (let r = 0; r < rows; r++) {
        const lr = initialLives[r];
        if (!Array.isArray(lr) || lr.length !== cols) {
          throw new Error(`Board: initialLives row ${r} 열 수 불일치.`);
        }
        for (let c = 0; c < cols; c++) {
          const lv = lr[c];
          if (!Number.isInteger(lv) || lv < 0 || lv > MAX_LIFE) {
            throw new Error(`Board: 잘못된 lives ${lv} @ (${c},${r}). 0~${MAX_LIFE}만 허용.`);
          }
          // 빈칸과 lives 정합성: grid=0이면 lives=0, grid>0이면 lives≥1.
          const gv = this.grid[r][c];
          if (gv === 0 && lv !== 0) {
            throw new Error(`Board: 빈칸인데 lives=${lv} @ (${c},${r}).`);
          }
          if (gv !== 0 && lv < 1) {
            throw new Error(`Board: 비빈칸인데 lives=${lv} @ (${c},${r}).`);
          }
        }
      }
      this.lives = initialLives.map((row) => row.slice());
    } else {
      // 기본: 비빈칸은 lives=1, 빈칸은 lives=0.
      this.lives = this.grid.map((row) => row.map((v) => (v === 0 ? 0 : 1)));
    }

    // obstacles — 장애물 셀은 반드시 grid=0, lives=0이어야 함.
    if (initialObstacles) {
      if (initialObstacles.length !== rows) {
        throw new Error(
          `Board: initialObstacles 행 수 불일치 (기준 ${rows}, ${initialObstacles.length}).`,
        );
      }
      const out: boolean[][] = [];
      for (let r = 0; r < rows; r++) {
        const or = initialObstacles[r];
        if (!Array.isArray(or) || or.length !== cols) {
          throw new Error(`Board: initialObstacles row ${r} 열 수 불일치.`);
        }
        const row: boolean[] = new Array(cols);
        for (let c = 0; c < cols; c++) {
          const ov = or[c];
          const flag = ov === true || ov === 1;
          if (flag) {
            if (this.grid[r][c] !== 0) {
              throw new Error(`Board: 장애물 셀에 값 ${this.grid[r][c]} @ (${c},${r}).`);
            }
            this.lives[r][c] = 0;
          }
          row[c] = flag;
        }
        out.push(row);
      }
      this.obstacles = out;
    } else {
      this.obstacles = this.grid.map((row) => row.map(() => false));
    }
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

  getLives(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      throw new RangeError(`Board.getLives: 경계 밖 (${col},${row}).`);
    }
    return this.lives[row][col];
  }

  isEmpty(col: number, row: number): boolean {
    return this.getCell(col, row) === 0;
  }

  isObstacle(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) {
      throw new RangeError(`Board.isObstacle: 경계 밖 (${col},${row}).`);
    }
    return this.obstacles[row][col];
  }

  /** 셀을 즉시 비운다(테스트/레거시 용). lives도 0으로 동기화. */
  clearCell(col: number, row: number): void {
    if (!this.inBounds(col, row)) {
      throw new RangeError(`Board.clearCell: 경계 밖 (${col},${row}).`);
    }
    this.grid[row][col] = 0;
    this.lives[row][col] = 0;
  }

  clearCells(positions: ReadonlyArray<Position>): void {
    for (const [c, r] of positions) this.clearCell(c, r);
  }

  /**
   * 매치 데미지를 적용한다 (게임 규칙).
   *   - 2셀 매치이고 양쪽 모두 lives ≥ 2: damage = min(lives_a, lives_b).
   *     양쪽에서 그만큼 차감 → 작은 쪽은 0이 되어 제거, 큰 쪽은 잔여만큼 남음.
   *   - 그 외(2셀 한쪽 일반 / 3셀): 매치된 각 셀 lives -1, 0이면 제거.
   * 빈 칸 또는 경계 밖 좌표는 무시된다(상위에서 검증한 positions 가정).
   * @returns 제거(lives→0)된 셀 수
   */
  applyMatch(positions: ReadonlyArray<Position>): number {
    if (positions.length === 0) return 0;

    if (positions.length === 2) {
      const [c1, r1] = positions[0];
      const [c2, r2] = positions[1];
      // 경계 밖 좌표면 특수 규칙 분기 진입을 막고 기본 경로(applyDamageAt)에 위임 — 안전하게 무시됨.
      if (this.inBounds(c1, r1) && this.inBounds(c2, r2)) {
        const l1 = this.lives[r1][c1];
        const l2 = this.lives[r2][c2];
        if (l1 >= 2 && l2 >= 2) {
          const dmg = Math.min(l1, l2);
          return this.applyDamageAt(c1, r1, dmg) + this.applyDamageAt(c2, r2, dmg);
        }
      }
    }

    let destroyed = 0;
    for (const [c, r] of positions) destroyed += this.applyDamageAt(c, r, 1);
    return destroyed;
  }

  /** 단일 셀에 데미지 적용. lives→0 도달 시 셀을 제거. 제거되었으면 1, 아니면 0 반환. */
  private applyDamageAt(col: number, row: number, amount: number): number {
    if (!this.inBounds(col, row)) return 0;
    const cur = this.lives[row][col];
    if (cur <= 0) return 0;
    const next = Math.max(0, cur - amount);
    this.lives[row][col] = next;
    if (next === 0) {
      this.grid[row][col] = 0;
      return 1;
    }
    return 0;
  }

  /**
   * 리필 — 남아있는 빈 칸(0)을 1~9 임의 값으로 채운다 (lives는 항상 1).
   * `applyGravity` 후 호출하면 각 열의 상단 빈 칸이 채워져, 시각적으로
   * "위에서 새 블럭이 내려오는" 효과가 된다.
   * @param randomFn 0~1 난수 팩토리(기본 `Math.random`). 테스트 주입 가능.
   * @returns 새로 채워진 셀 개수
   */
  refill(randomFn: () => number = Math.random): number {
    let filled = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.obstacles[r][c]) continue; // 장애물은 건드리지 않음
        if (this.grid[r][c] === 0) {
          this.grid[r][c] = 1 + Math.floor(randomFn() * 9);
          this.lives[r][c] = 1;
          filled++;
        }
      }
    }
    return filled;
  }

  /**
   * 중력 적용 — 각 열에서 비어있지 않은 셀이 아래로 떨어진다 (Bejeweled 스타일).
   * 장애물은 고정되어 움직이지 않고, 위쪽 블럭은 장애물을 통과해 아래쪽 빈 칸에 쌓인다.
   *
   * 알고리즘: 한 열의 비-장애물 슬롯만 모아 하나의 가상 스택으로 본다.
   *   1) 위→아래 순회로 비-장애물 셀의 (value, life) 중 비어있지 않은 것만 수집(상대 순서 유지).
   *   2) 비-장애물 슬롯 인덱스를 위→아래로 정렬한 뒤, 끝부분 N개에 수집한 블럭들을 순서대로 배치.
   *   3) 나머지 비-장애물 슬롯(상단)은 빈 칸으로 클리어 → 후속 refill로 채워짐.
   * 장애물 셀은 절대 변경되지 않는다. 외부 상태(선택/힌트)는 호출자가 재설정.
   * @returns 실제로 이동이 발생했는지 여부
   */
  applyGravity(): boolean {
    let moved = false;
    for (let c = 0; c < this.cols; c++) {
      const slots: number[] = []; // 비-장애물 행 인덱스 (위→아래)
      for (let r = 0; r < this.rows; r++) {
        if (!this.obstacles[r][c]) slots.push(r);
      }
      const blocks: Array<{ value: number; life: number }> = [];
      for (const r of slots) {
        const v = this.grid[r][c];
        if (v !== 0) blocks.push({ value: v, life: this.lives[r][c] });
      }
      const emptyCount = slots.length - blocks.length;
      // 상단 emptyCount 슬롯은 비움
      for (let i = 0; i < emptyCount; i++) {
        const r = slots[i];
        if (this.grid[r][c] !== 0 || this.lives[r][c] !== 0) moved = true;
        this.grid[r][c] = 0;
        this.lives[r][c] = 0;
      }
      // 하단 슬롯에 순서 그대로 배치
      for (let i = 0; i < blocks.length; i++) {
        const r = slots[emptyCount + i];
        const item = blocks[i];
        if (this.grid[r][c] !== item.value || this.lives[r][c] !== item.life) {
          moved = true;
        }
        this.grid[r][c] = item.value;
        this.lives[r][c] = item.life;
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

  /** lives 배열 사본. 세션 저장에 사용. */
  livesSnapshot(): number[][] {
    return this.lives.map((row) => row.slice());
  }

  /** obstacles 배열 사본 (boolean). 세션 저장/맵 검증용. */
  obstaclesSnapshot(): boolean[][] {
    return this.obstacles.map((row) => row.slice());
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
  *nonEmptyCells(): IterableIterator<{
    col: number;
    row: number;
    value: number;
    lives: number;
  }> {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = this.grid[r][c];
        if (v !== 0) yield { col: c, row: r, value: v, lives: this.lives[r][c] };
      }
    }
  }
}
