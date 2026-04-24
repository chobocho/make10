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
