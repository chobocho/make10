import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertThrows,
  assertDeepEqual,
} from "./runner";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateMap,
  parseMapJson,
  parseMapsJson,
  mapsJsonUrl,
  loadMap,
  clearMapsCache,
  MapData,
} from "../src/data/MapLoader";
import { findValidCombination } from "../src/game/Hint";
import { Board } from "../src/game/Board";

const DATA_DIR = join(__dirname, "..", "data");
const MAPS_JSON_TEXT = readFileSync(join(DATA_DIR, "maps.json"), "utf-8");
const ALL_MAPS: ReadonlyArray<MapData> = parseMapsJson(MAPS_JSON_TEXT);
const MAP_BY_ID = new Map<number, MapData>(ALL_MAPS.map((m) => [m.id, m]));

function getMap(id: number): MapData {
  const m = MAP_BY_ID.get(id);
  if (!m) throw new Error(`map${id} 누락`);
  return m;
}

describe("MapLoader — validation", () => {
  test("validateMap: 정상 맵", () => {
    const m = {
      id: 1,
      name: "test",
      cols: 2,
      rows: 2,
      timeLimit: 30,
      hintCount: 1,
      targetScore: 0,
      starThresholds: [100, 500, 1000],
      initialBoard: [
        [1, 9],
        [2, 8],
      ],
    };
    assertTrue(validateMap(m));
  });

  test("validateMap: starThresholds 누락/오름차순 위반 거부", () => {
    const base = {
      id: 1,
      name: "t",
      cols: 2,
      rows: 1,
      timeLimit: 10,
      hintCount: 0,
      targetScore: 0,
      initialBoard: [[4, 6]],
    };
    assertFalse(validateMap(base));
    assertFalse(validateMap({ ...base, starThresholds: [100, 100, 200] }));
    assertFalse(validateMap({ ...base, starThresholds: [200, 100, 300] }));
    assertFalse(validateMap({ ...base, starThresholds: [100, 200] }));
  });

  test("validateMap: 값 범위 위반", () => {
    assertFalse(
      validateMap({
        id: 1,
        name: "x",
        cols: 2,
        rows: 1,
        timeLimit: 10,
        hintCount: 0,
        targetScore: 0,
        initialBoard: [[1, 10]],
      }),
    );
  });

  test("validateMap: 행/열 개수 불일치", () => {
    assertFalse(
      validateMap({
        id: 1,
        name: "x",
        cols: 2,
        rows: 2,
        timeLimit: 10,
        hintCount: 0,
        targetScore: 0,
        initialBoard: [[1, 2]],
      }),
    );
  });

  test("parseMapJson: 잘못된 JSON은 에러", () => {
    assertThrows(() => parseMapJson("not-json"));
  });

  test("mapsJsonUrl: 단일 묶음 경로", () => {
    assertEqual(mapsJsonUrl(), "data/maps.json");
    assertEqual(mapsJsonUrl("custom"), "custom/maps.json");
  });

  test("loadMap: 주입된 fetcher 로 묶음 1회 fetch 후 캐시", async () => {
    clearMapsCache();
    let calls = 0;
    const fakeFetch = async (url: string): Promise<Response> => {
      calls++;
      assertEqual(url, "data/maps.json");
      return new Response(MAPS_JSON_TEXT, { status: 200 });
    };
    const m1 = await loadMap(1, fakeFetch as unknown as typeof fetch);
    const m2 = await loadMap(2, fakeFetch as unknown as typeof fetch);
    assertEqual(m1.id, 1);
    assertEqual(m2.id, 2);
    assertEqual(calls, 1);
    clearMapsCache();
  });

  test("loadMap: 404는 에러 (캐시도 비워져 재시도 가능)", async () => {
    clearMapsCache();
    const fakeFetch = async (): Promise<Response> =>
      new Response("", { status: 404 });
    let threw = false;
    try {
      await loadMap(1, fakeFetch as unknown as typeof fetch);
    } catch {
      threw = true;
    }
    assertTrue(threw);
    clearMapsCache();
  });

  test("loadMap: 묶음에 없는 id는 에러", async () => {
    clearMapsCache();
    const fakeFetch = async (): Promise<Response> =>
      new Response(MAPS_JSON_TEXT, { status: 200 });
    let threw = false;
    try {
      await loadMap(99999, fakeFetch as unknown as typeof fetch);
    } catch {
      threw = true;
    }
    assertTrue(threw);
    clearMapsCache();
  });

  test("parseMapsJson: 배열 아님 거부", () => {
    assertThrows(() => parseMapsJson("{}"));
  });
});

const MAP_COUNT = 300;

describe("생성된 맵 JSON 실제 검증 (전체 300개)", () => {
  test("300개 맵 모두 스키마 유효 & 유효 조합 존재", () => {
    for (let id = 1; id <= MAP_COUNT; id++) {
      const m = getMap(id);
      assertEqual(m.id, id);
      assertEqual(m.initialBoard.length, m.rows);
      for (const row of m.initialBoard) assertEqual(row.length, m.cols);
      // 장애물(>=200)은 Board 생성 시 함께 전달해야 정합성 통과.
      const obstacles = m.initialObstacles
        ? m.initialObstacles.map((row) => row.slice())
        : undefined;
      const board = new Board(m.initialBoard, m.initialLives, obstacles);
      const combo = findValidCombination(board);
      assertTrue(combo !== null, `map${id}: 유효 조합 없음`);
    }
  });

  test("map001 합이 10인 쌍을 포함", () => {
    const m = getMap(1);
    const board = new Board(m.initialBoard);
    const combo = findValidCombination(board);
    assertTrue(combo !== null);
    const sum = combo!.reduce((s, [c, r]) => s + board.getCell(c, r), 0);
    assertEqual(sum, 10);
  });

  test("모든 맵의 timeLimit > 0, hintCount ≥ 0, id 1..300", () => {
    const ids: number[] = [];
    for (let id = 1; id <= MAP_COUNT; id++) {
      const m = getMap(id);
      assertTrue(m.timeLimit > 0);
      assertTrue(m.hintCount >= 0);
      ids.push(m.id);
    }
    assertDeepEqual(ids, Array.from({ length: MAP_COUNT }, (_, i) => i + 1));
  });

  test("난이도 경향: 후반(id>=60)은 평균 시간 제한이 초반(id<=10)보다 짧음", () => {
    function avgTime(from: number, to: number): number {
      let total = 0;
      for (let id = from; id <= to; id++) {
        total += getMap(id).timeLimit;
      }
      return total / (to - from + 1);
    }
    assertTrue(avgTime(60, 100) < avgTime(1, 10));
    // 100~300 구간이 1~60 구간보다 평균이 짧음
    assertTrue(avgTime(101, 300) < avgTime(1, 60));
  });

  test("맵 셀 값은 1~9 범위 (장애물 자리만 0 허용)", () => {
    for (let id = 1; id <= MAP_COUNT; id++) {
      const m = getMap(id);
      for (let r = 0; r < m.rows; r++) {
        for (let c = 0; c < m.cols; c++) {
          const v = m.initialBoard[r][c];
          const isObs = m.initialObstacles?.[r]?.[c] === 1;
          if (isObs) {
            assertEqual(v, 0, `map${id} (${c},${r}): 장애물 자리에 ${v}`);
          } else {
            assertTrue(v >= 1 && v <= 9, `map${id} (${c},${r}): ${v}`);
          }
        }
      }
    }
  });

  test("id < 10: initialLives 필드 없음 (멀티라이프 미도입 구간)", () => {
    for (let id = 1; id <= 9; id++) {
      const m = getMap(id);
      assertEqual(m.initialLives, undefined);
    }
  });

  test("id ≥ 10: initialLives 존재, 셀별 값은 [1..maxLife], 멀티라이프 셀 ≤ 15%", () => {
    function maxLifeForId(id: number): number {
      return Math.min(5, 1 + Math.floor(id / 10));
    }
    for (let id = 10; id <= MAP_COUNT; id++) {
      const m = getMap(id);
      assertTrue(m.initialLives !== undefined, `map${id}: initialLives 누락`);
      const maxLife = maxLifeForId(id);
      let multi = 0;
      let total = 0;
      for (let r = 0; r < m.rows; r++) {
        for (let c = 0; c < m.cols; c++) {
          const lv = m.initialLives![r][c];
          // 장애물 자리는 lives=0이어야 함.
          if (m.initialObstacles?.[r]?.[c] === 1) {
            assertEqual(lv, 0, `map${id} (${c},${r}): 장애물 자리에 lives=${lv}`);
            total++;
            continue;
          }
          assertTrue(lv >= 1 && lv <= maxLife, `map${id} (${c},${r}): lives=${lv}`);
          if (lv >= 2) multi++;
          total++;
        }
      }
      const ratio = multi / total;
      assertTrue(ratio <= 0.15 + 1e-9, `map${id}: 멀티 비율 ${ratio.toFixed(3)} > 15%`);
    }
  });

  test("id < 101: initialObstacles 없음", () => {
    for (let id = 1; id < 101; id++) {
      const m = getMap(id);
      assertEqual(m.initialObstacles, undefined, `map${id}`);
    }
  });

  test("id 101~199: initialObstacles 존재 + 비율 ≤ 2%", () => {
    for (let id = 101; id <= 199; id++) {
      const m = getMap(id);
      assertTrue(m.initialObstacles !== undefined, `map${id}: initialObstacles 누락`);
      let count = 0;
      for (const row of m.initialObstacles!) {
        for (const v of row) {
          assertTrue(v === 0 || v === 1, `map${id}: 0/1 외 값 ${v}`);
          if (v === 1) count++;
        }
      }
      const ratio = count / (m.rows * m.cols);
      assertTrue(ratio <= 0.02 + 1e-9, `map${id}: 장애물 비율 ${ratio.toFixed(3)} > 2%`);
      assertTrue(count >= 1, `map${id}: 장애물 0개`);
    }
  });

  test("id ≥ 200: initialObstacles 존재 + 비율 ≤ 5%", () => {
    for (let id = 200; id <= MAP_COUNT; id++) {
      const m = getMap(id);
      assertTrue(m.initialObstacles !== undefined, `map${id}: initialObstacles 누락`);
      let count = 0;
      for (const row of m.initialObstacles!) {
        for (const v of row) {
          assertTrue(v === 0 || v === 1, `map${id}: 0/1 외 값 ${v}`);
          if (v === 1) count++;
        }
      }
      const ratio = count / (m.rows * m.cols);
      assertTrue(ratio <= 0.05 + 1e-9, `map${id}: 장애물 비율 ${ratio.toFixed(3)} > 5%`);
      assertTrue(count >= 1, `map${id}: 장애물 0개`);
    }
  });
});

describe("MapLoader — initialLives 검증", () => {
  function baseMap(): unknown {
    return {
      id: 1,
      name: "t",
      cols: 2,
      rows: 1,
      timeLimit: 10,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300],
      initialBoard: [[3, 7]],
    };
  }

  test("initialLives 미지정은 통과", () => {
    assertTrue(validateMap(baseMap()));
  });

  test("initialLives 정상 (1=일반, 2~5=멀티)", () => {
    assertTrue(validateMap({ ...(baseMap() as object), initialLives: [[3, 1]] }));
    assertTrue(validateMap({ ...(baseMap() as object), initialLives: [[5, 5]] }));
  });

  test("initialLives 차원 불일치 거부", () => {
    assertFalse(
      validateMap({ ...(baseMap() as object), initialLives: [[1]] }), // 열 부족
    );
    assertFalse(
      validateMap({ ...(baseMap() as object), initialLives: [[1, 1], [1, 1]] }), // 행 초과
    );
  });

  test("initialLives 범위 위반 거부 (>5, 음수, 비정수)", () => {
    assertFalse(validateMap({ ...(baseMap() as object), initialLives: [[6, 1]] }));
    assertFalse(validateMap({ ...(baseMap() as object), initialLives: [[-1, 1]] }));
    assertFalse(validateMap({ ...(baseMap() as object), initialLives: [[1.5, 1]] }));
  });

  test("initialLives 빈칸 정합성 — 비빈칸인데 lives=0 거부", () => {
    assertFalse(validateMap({ ...(baseMap() as object), initialLives: [[0, 1]] }));
  });
});

describe("MapLoader — initialObstacles 검증", () => {
  function baseMapWithObstacle(): unknown {
    return {
      id: 200,
      name: "t",
      cols: 3,
      rows: 1,
      timeLimit: 10,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300],
      initialBoard: [[3, 0, 7]], // (1,0)이 0 → 장애물 자리
    };
  }

  test("initialObstacles 미지정은 통과", () => {
    assertTrue(
      validateMap({
        ...(baseMapWithObstacle() as object),
        initialBoard: [[3, 7, 1]],
      }),
    );
  });

  test("initialObstacles: 장애물 칸은 board=0이어야 함", () => {
    assertTrue(
      validateMap({
        ...(baseMapWithObstacle() as object),
        initialObstacles: [[0, 1, 0]],
      }),
    );
  });

  test("initialObstacles: 차원 불일치 거부", () => {
    assertFalse(
      validateMap({
        ...(baseMapWithObstacle() as object),
        initialObstacles: [[0, 1]],
      }),
    );
  });

  test("initialObstacles: 0/1 외 값 거부", () => {
    assertFalse(
      validateMap({
        ...(baseMapWithObstacle() as object),
        initialObstacles: [[0, 2, 0]],
      }),
    );
  });

  test("initialObstacles: board≠0 위치를 장애물로 마킹하면 거부", () => {
    assertFalse(
      validateMap({
        ...(baseMapWithObstacle() as object),
        initialBoard: [[3, 4, 7]],
        initialObstacles: [[0, 1, 0]],
      }),
    );
  });
});
