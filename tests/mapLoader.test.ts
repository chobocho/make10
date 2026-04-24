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
  mapJsonUrl,
  loadMap,
} from "../src/data/MapLoader";
import { findValidCombination } from "../src/game/Hint";
import { Board } from "../src/game/Board";

const DATA_DIR = join(__dirname, "..", "data");

function readMap(id: number): string {
  return readFileSync(join(DATA_DIR, `map${String(id).padStart(3, "0")}.json`), "utf-8");
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

  test("mapJsonUrl: 3자리 zero-padded", () => {
    assertEqual(mapJsonUrl(7), "data/map007.json");
    assertEqual(mapJsonUrl(123), "data/map123.json");
  });

  test("loadMap: 주입된 fetcher 사용", async () => {
    const text = readMap(1);
    const fakeFetch = async (url: string): Promise<Response> => {
      assertEqual(url, "data/map001.json");
      return new Response(text, { status: 200 });
    };
    const m = await loadMap(1, fakeFetch as unknown as typeof fetch);
    assertEqual(m.id, 1);
  });

  test("loadMap: 404는 에러", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("", { status: 404 });
    let threw = false;
    try {
      await loadMap(1, fakeFetch as unknown as typeof fetch);
    } catch {
      threw = true;
    }
    assertTrue(threw);
  });
});

const MAP_COUNT = 100;

describe("생성된 맵 JSON 실제 검증 (전체 100개)", () => {
  test("100개 맵 모두 스키마 유효 & 유효 조합 존재", () => {
    for (let id = 1; id <= MAP_COUNT; id++) {
      const m = parseMapJson(readMap(id));
      assertEqual(m.id, id);
      assertEqual(m.initialBoard.length, m.rows);
      for (const row of m.initialBoard) assertEqual(row.length, m.cols);
      const board = new Board(m.initialBoard);
      const combo = findValidCombination(board);
      assertTrue(combo !== null, `map${id}: 유효 조합 없음`);
    }
  });

  test("map001 합이 10인 쌍을 포함", () => {
    const m = parseMapJson(readMap(1));
    const board = new Board(m.initialBoard);
    const combo = findValidCombination(board);
    assertTrue(combo !== null);
    const sum = combo!.reduce((s, [c, r]) => s + board.getCell(c, r), 0);
    assertEqual(sum, 10);
  });

  test("모든 맵의 timeLimit > 0, hintCount ≥ 0, id 1..100", () => {
    const ids: number[] = [];
    for (let id = 1; id <= MAP_COUNT; id++) {
      const m = parseMapJson(readMap(id));
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
        total += parseMapJson(readMap(id)).timeLimit;
      }
      return total / (to - from + 1);
    }
    assertTrue(avgTime(60, 100) < avgTime(1, 10));
  });

  test("맵 셀 값은 1~9 범위 (빈 칸 0은 초기 보드에 없어야 함)", () => {
    for (let id = 1; id <= MAP_COUNT; id++) {
      const m = parseMapJson(readMap(id));
      for (const row of m.initialBoard) {
        for (const v of row) {
          assertTrue(v >= 1 && v <= 9);
        }
      }
    }
  });
});
