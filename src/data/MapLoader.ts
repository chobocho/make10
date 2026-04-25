/**
 * MapLoader — 맵 JSON 로드/검증.
 *
 * 네트워크 fetch와 파싱/검증을 분리하여 테스트 가능하게 구성했다.
 */
export interface MapData {
  readonly id: number;
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
  readonly timeLimit: number;
  readonly hintCount: number;
  readonly targetScore: number;
  /** 별 3개 단계 임계값. 엄격히 오름차순 [★1, ★2, ★3]. */
  readonly starThresholds: readonly [number, number, number];
  readonly initialBoard: ReadonlyArray<ReadonlyArray<number>>;
  /**
   * 초기 보드의 셀별 lives (1=일반, 2~5=멀티라이프).
   * 미지정 시 모든 비빈칸은 lives=1로 간주. id ≥ 10 맵에서 사용.
   */
  readonly initialLives?: ReadonlyArray<ReadonlyArray<number>>;
  /**
   * 초기 보드의 장애물 위치 (0=일반, 1=장애물). 장애물 칸은 initialBoard에서 0이어야 한다.
   * 미지정 시 장애물 없음. id ≥ 101 맵에서 사용.
   */
  readonly initialObstacles?: ReadonlyArray<ReadonlyArray<number>>;
  /**
   * 초기 만능(?) 블럭 위치 (0=일반, 1=만능). 만능 칸은 board=0, obstacle=0이어야 한다.
   * 정적 맵에는 거의 사용 안 됨; 세션 복원과의 형식 통일을 위해 정의.
   */
  readonly initialWildcards?: ReadonlyArray<ReadonlyArray<number>>;
}

function isPosInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export function validateMap(input: unknown): input is MapData {
  if (input === null || typeof input !== "object") return false;
  const o = input as Record<string, unknown>;
  if (!isPosInt(o.id) || (o.id as number) < 1) return false;
  if (typeof o.name !== "string") return false;
  if (!isPosInt(o.cols) || (o.cols as number) < 1) return false;
  if (!isPosInt(o.rows) || (o.rows as number) < 1) return false;
  if (!isPosInt(o.timeLimit) || (o.timeLimit as number) < 1) return false;
  if (!isPosInt(o.hintCount)) return false;
  if (!isPosInt(o.targetScore)) return false;
  if (!Array.isArray(o.starThresholds) || o.starThresholds.length !== 3) return false;
  for (const s of o.starThresholds) {
    if (!Number.isInteger(s) || s < 1) return false;
  }
  const [s1, s2, s3] = o.starThresholds as number[];
  if (!(s1 < s2 && s2 < s3)) return false;
  if (!Array.isArray(o.initialBoard)) return false;
  if (o.initialBoard.length !== (o.rows as number)) return false;
  for (const row of o.initialBoard) {
    if (!Array.isArray(row) || row.length !== (o.cols as number)) return false;
    for (const v of row) {
      if (!Number.isInteger(v) || v < 0 || v > 9) return false;
    }
  }
  // initialLives 옵셔널 — 차원과 셀별 정합성(빈칸=0, 비빈칸=1~5) 엄격 검증
  if (o.initialLives !== undefined) {
    if (!Array.isArray(o.initialLives)) return false;
    if (o.initialLives.length !== (o.rows as number)) return false;
    const board = o.initialBoard as number[][];
    for (let r = 0; r < (o.rows as number); r++) {
      const lr = (o.initialLives as unknown[])[r];
      if (!Array.isArray(lr) || lr.length !== (o.cols as number)) return false;
      for (let c = 0; c < (o.cols as number); c++) {
        const lv = lr[c];
        if (!Number.isInteger(lv) || lv < 0 || lv > 5) return false;
        const gv = board[r][c];
        if (gv === 0 && lv !== 0) return false;
        if (gv !== 0 && lv < 1) return false;
      }
    }
  }
  // initialObstacles 옵셔널 — 0/1 정수, 1인 칸은 initialBoard에서 0이어야 함.
  if (o.initialObstacles !== undefined) {
    if (!Array.isArray(o.initialObstacles)) return false;
    if (o.initialObstacles.length !== (o.rows as number)) return false;
    const board = o.initialBoard as number[][];
    for (let r = 0; r < (o.rows as number); r++) {
      const or = (o.initialObstacles as unknown[])[r];
      if (!Array.isArray(or) || or.length !== (o.cols as number)) return false;
      for (let c = 0; c < (o.cols as number); c++) {
        const ov = or[c];
        if (ov !== 0 && ov !== 1) return false;
        if (ov === 1 && board[r][c] !== 0) return false;
      }
    }
  }
  // initialWildcards — 0/1 정수, 1인 칸은 board=0 + obstacle=0 이어야 함.
  if (o.initialWildcards !== undefined) {
    if (!Array.isArray(o.initialWildcards)) return false;
    if (o.initialWildcards.length !== (o.rows as number)) return false;
    const board = o.initialBoard as number[][];
    const obs = o.initialObstacles as number[][] | undefined;
    for (let r = 0; r < (o.rows as number); r++) {
      const wr = (o.initialWildcards as unknown[])[r];
      if (!Array.isArray(wr) || wr.length !== (o.cols as number)) return false;
      for (let c = 0; c < (o.cols as number); c++) {
        const wv = wr[c];
        if (wv !== 0 && wv !== 1) return false;
        if (wv === 1) {
          if (board[r][c] !== 0) return false;
          if (obs && obs[r][c] === 1) return false;
        }
      }
    }
  }
  return true;
}

export function parseMapJson(text: string): MapData {
  const v: unknown = JSON.parse(text);
  if (!validateMap(v)) {
    throw new Error("MapLoader: 잘못된 맵 스키마 또는 값.");
  }
  return v;
}

export function mapJsonUrl(mapId: number, base = "data"): string {
  return `${base}/map${String(mapId).padStart(3, "0")}.json`;
}

export type Fetcher = (url: string) => Promise<Response>;

export async function loadMap(mapId: number, fetcher?: Fetcher): Promise<MapData> {
  const f = fetcher ?? ((typeof fetch !== "undefined" ? fetch : null) as Fetcher | null);
  if (!f) {
    throw new Error("MapLoader: fetch를 사용할 수 없는 환경.");
  }
  const url = mapJsonUrl(mapId);
  const res = await f(url);
  if (!res.ok) {
    throw new Error(`MapLoader: ${url} 로드 실패 (${res.status}).`);
  }
  const text = await res.text();
  return parseMapJson(text);
}
