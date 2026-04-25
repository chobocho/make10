import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertDeepEqual,
} from "./runner";
import { generateMap } from "../tools/gen-maps";

describe("gen-maps", () => {
  test("결정성: 동일 id 호출은 동일 결과 (mulberry32 시드 고정)", () => {
    const a = generateMap(15);
    const b = generateMap(15);
    assertDeepEqual(a.initialBoard, b.initialBoard);
    assertDeepEqual(a.initialLives, b.initialLives);
    assertEqual(a.timeLimit, b.timeLimit);
    assertEqual(a.hintCount, b.hintCount);
    assertDeepEqual(a.starThresholds, b.starThresholds);
  });

  test("id < 10: initialLives 미생성", () => {
    for (const id of [1, 5, 9]) {
      const m = generateMap(id);
      assertEqual(m.initialLives, undefined, `id=${id}`);
    }
  });

  test("id 경계값: 9→10, 19→20, 29→30, 39→40, 49→50 maxLife 변화", () => {
    function maxLifeOf(spec: ReturnType<typeof generateMap>): number {
      if (!spec.initialLives) return 1;
      let max = 1;
      for (const row of spec.initialLives) for (const v of row) if (v > max) max = v;
      return max;
    }
    assertEqual(maxLifeOf(generateMap(9)), 1);
    assertTrue(maxLifeOf(generateMap(10)) <= 2);
    assertTrue(maxLifeOf(generateMap(19)) <= 2);
    assertTrue(maxLifeOf(generateMap(20)) <= 3);
    assertTrue(maxLifeOf(generateMap(29)) <= 3);
    assertTrue(maxLifeOf(generateMap(30)) <= 4);
    assertTrue(maxLifeOf(generateMap(39)) <= 4);
    assertTrue(maxLifeOf(generateMap(40)) <= 5);
    assertTrue(maxLifeOf(generateMap(50)) <= 5);
    assertTrue(maxLifeOf(generateMap(100)) <= 5);
  });

  test("멀티라이프 셀 비율은 항상 ≤ 15%", () => {
    for (const id of [10, 20, 30, 50, 75, 100]) {
      const m = generateMap(id);
      if (!m.initialLives) continue;
      let multi = 0;
      let total = 0;
      for (const row of m.initialLives) {
        for (const v of row) {
          if (v >= 2) multi++;
          total++;
        }
      }
      const ratio = multi / total;
      assertTrue(ratio <= 0.15 + 1e-9, `id=${id} multi ratio=${ratio}`);
    }
  });

  test("initialLives 값은 항상 [1..maxLife] 범위 정수", () => {
    for (const id of [10, 25, 40, 80]) {
      const m = generateMap(id);
      if (!m.initialLives) continue;
      const expectedMax = Math.min(5, 1 + Math.floor(id / 10));
      for (const row of m.initialLives) {
        for (const v of row) {
          assertTrue(Number.isInteger(v), `id=${id} v=${v}`);
          assertTrue(v >= 1 && v <= expectedMax, `id=${id} v=${v} max=${expectedMax}`);
        }
      }
    }
  });

  test("initialLives 차원은 initialBoard 와 동일", () => {
    for (const id of [10, 50, 100]) {
      const m = generateMap(id);
      if (!m.initialLives) continue;
      assertEqual(m.initialLives.length, m.rows);
      for (const row of m.initialLives) assertEqual(row.length, m.cols);
    }
  });

  test("id < 101: initialObstacles 미생성", () => {
    for (const id of [1, 50, 100]) {
      const m = generateMap(id);
      assertEqual(m.initialObstacles, undefined, `id=${id}`);
    }
  });

  test("id 101~199: initialObstacles 존재 + 비율 ≤ 2%, ≥ 1개", () => {
    for (const id of [101, 120, 150, 199]) {
      const m = generateMap(id);
      assertTrue(m.initialObstacles !== undefined, `id=${id}`);
      let count = 0;
      for (const row of m.initialObstacles!) for (const v of row) if (v === 1) count++;
      const ratio = count / (m.rows * m.cols);
      assertTrue(ratio <= 0.02 + 1e-9, `id=${id} ratio=${ratio}`);
      assertTrue(count >= 1, `id=${id} count=${count}`);
    }
  });

  test("id ≥ 200: initialObstacles 존재 + 비율 ≤ 5%, ≥ 1개", () => {
    for (const id of [200, 250, 300]) {
      const m = generateMap(id);
      assertTrue(m.initialObstacles !== undefined, `id=${id}`);
      let count = 0;
      for (const row of m.initialObstacles!) for (const v of row) if (v === 1) count++;
      const ratio = count / (m.rows * m.cols);
      assertTrue(ratio <= 0.05 + 1e-9, `id=${id} ratio=${ratio}`);
      assertTrue(count >= 1, `id=${id} count=${count}`);
    }
  });

  test("장애물 자리는 initialBoard=0, initialLives=0", () => {
    for (const id of [101, 200, 300]) {
      const m = generateMap(id);
      if (!m.initialObstacles) continue;
      for (let r = 0; r < m.rows; r++) {
        for (let c = 0; c < m.cols; c++) {
          if (m.initialObstacles[r][c] === 1) {
            assertEqual(m.initialBoard[r][c], 0, `id=${id} (${c},${r})`);
            if (m.initialLives) {
              assertEqual(m.initialLives[r][c], 0, `id=${id} (${c},${r})`);
            }
          }
        }
      }
    }
  });

  test("결정성: 장애물 포함 맵도 동일 id 호출이면 obstacles 동일", () => {
    for (const id of [105, 220]) {
      const a = generateMap(id);
      const b = generateMap(id);
      assertDeepEqual(a.initialObstacles, b.initialObstacles);
    }
  });
});
