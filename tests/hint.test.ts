import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  assertThrows,
} from "./runner";
import { Board } from "../src/game/Board";
import { Hint, findValidCombination, HINT_HIGHLIGHT_MS } from "../src/game/Hint";

describe("findValidCombination", () => {
  test("합 10 가로 쌍 탐지", () => {
    const b = new Board([[3, 7, 2]]);
    const r = findValidCombination(b);
    assertDeepEqual(r?.map((p) => [p[0], p[1]]), [
      [0, 0],
      [1, 0],
    ]);
  });

  test("합 10 세로 쌍 탐지", () => {
    const b = new Board([[4], [6]]);
    const r = findValidCombination(b);
    assertDeepEqual(r?.map((p) => [p[0], p[1]]), [
      [0, 0],
      [0, 1],
    ]);
  });

  test("2셀이 없으면 3셀 경로 탐색", () => {
    // 1+2+7=10, 가로 삼중, 2셀 쌍 조합은 없음 (1+2=3,2+7=9,1+7=8)
    const b = new Board([[1, 2, 7]]);
    const r = findValidCombination(b);
    assertEqual(r?.length, 3);
    const sum = r!.reduce((s, [c, row]) => s + b.getCell(c, row), 0);
    assertEqual(sum, 10);
  });

  test("빈 셀은 건너뛴다", () => {
    const b = new Board([[3, 0, 7]]);
    // 3,7 둘이 인접 아님. 세로도 없음. 조합 없음 → null
    assertEqual(findValidCombination(b), null);
  });

  test("유효 조합이 없으면 null", () => {
    const b = new Board([[1, 1]]);
    assertEqual(findValidCombination(b), null);
  });

  test("꺾인 3셀 경로(ㄱ자)도 탐지", () => {
    // 2,3이 가로 인접 합5. 5가 (1,0) 아래 (1,1) 에 있으면 (0,0)→(1,0)→(1,1)이 ㄱ자
    const b = new Board([
      [2, 3],
      [9, 5],
    ]);
    // 2셀: 2+3=5,3+5=8,9+5=14,2+9=11 → 없음
    const r = findValidCombination(b);
    assertEqual(r?.length, 3);
  });
});

describe("Hint", () => {
  test("초기 상태: count 반영, 하이라이트 없음", () => {
    const b = new Board([[3, 7]]);
    const h = new Hint(b, 3);
    assertEqual(h.getRemaining(), 3);
    assertEqual(h.getHighlighted(), null);
    assertFalse(h.isHighlighting());
  });

  test("count 음수/소수는 에러", () => {
    const b = new Board([[1]]);
    assertThrows(() => new Hint(b, -1));
    assertThrows(() => new Hint(b, 1.5));
  });

  test("request: 유효 조합 반환, 카운트 1 감소", () => {
    const b = new Board([[3, 7]]);
    const h = new Hint(b, 2);
    const r = h.request();
    assertTrue(r !== null);
    assertEqual(h.getRemaining(), 1);
    assertTrue(h.isHighlighting());
  });

  test("request: 유효 조합 없으면 카운트 차감 없이 null", () => {
    const b = new Board([[1, 1]]);
    const h = new Hint(b, 3);
    assertEqual(h.request(), null);
    assertEqual(h.getRemaining(), 3);
  });

  test("request: 카운트 소진 후 null", () => {
    const b = new Board([[3, 7]]);
    const h = new Hint(b, 1);
    h.request();
    assertEqual(h.request(), null);
    assertEqual(h.getRemaining(), 0);
  });

  test("tick: 하이라이트 수명 감소 후 사라짐", () => {
    const b = new Board([[3, 7]]);
    const h = new Hint(b, 1);
    h.request();
    h.tick(HINT_HIGHLIGHT_MS - 100);
    assertTrue(h.isHighlighting());
    h.tick(200);
    assertFalse(h.isHighlighting());
    assertEqual(h.getHighlighted(), null);
  });

  test("clear: 즉시 하이라이트 해제", () => {
    const b = new Board([[3, 7]]);
    const h = new Hint(b, 1);
    h.request();
    h.clear();
    assertFalse(h.isHighlighting());
  });

  test("findValidCombination: 멀티라이프 셀도 face value 기준 매치 조합 탐지", () => {
    // 멀티라이프(lives≥2)여도 합=10 판정에는 영향 없음 — face value만 본다.
    const b = new Board(
      [[3, 7, 2]],
      [[5, 1, 1]], // (0,0)는 lives=5 멀티
    );
    const r = findValidCombination(b);
    assertDeepEqual(r?.map((p) => [p[0], p[1]]), [
      [0, 0],
      [1, 0],
    ]);
  });

  test("findValidCombination: 양쪽 모두 멀티라이프인 합=10 쌍도 탐지", () => {
    const b = new Board(
      [[4, 6]],
      [[3, 4]], // 둘 다 멀티
    );
    const r = findValidCombination(b);
    assertTrue(r !== null);
  });

  test("Hint.request: 멀티라이프 보드에서도 정상 카운트 차감", () => {
    const b = new Board([[3, 7]], [[2, 2]]);
    const h = new Hint(b, 2);
    assertTrue(h.request() !== null);
    assertEqual(h.getRemaining(), 1);
  });
});

describe("findValidCombination + 장애물", () => {
  test("3 [장애물] 7 가로 — 인접 쌍 없음 → null", () => {
    const b = new Board([[3, 0, 7]], undefined, [[0, 1, 0]]);
    assertEqual(findValidCombination(b), null);
  });

  test("3 [장애물] 7 + 다른 행에 합10이 있으면 그 쌍을 반환", () => {
    // 0행: 3 [장] 7  → 가로 무효
    // 1행: 4 5 6     → 4+6 비인접, 5+5 없음, 4+5+1=? 없음. 다른 조합 필요.
    // 1+9 세로: (0,0)=3,(0,1)=4 → 7, X. 그냥 (1,1)=5 와 인접한 5는 없음.
    // 더 명확하게: 1행에 4,6를 인접 배치. (0,1)=4, (1,1)=6 → 4+6=10 ✓
    const b = new Board(
      [
        [3, 0, 7],
        [4, 6, 1],
      ],
      undefined,
      [
        [0, 1, 0],
        [0, 0, 0],
      ],
    );
    const r = findValidCombination(b);
    assertTrue(r !== null);
    const sum = r!.reduce((s, [c, row]) => s + b.getCell(c, row), 0);
    assertEqual(sum, 10);
    // 장애물 좌표가 결과에 포함되지 않는지 확인.
    for (const [c, row] of r!) {
      assertFalse(b.isObstacle(c, row));
    }
  });

  test("3셀 경로가 장애물을 가로지르려 시도해도 반환되지 않음", () => {
    // 1+2+7=10 직선이지만 가운데가 장애물. 다른 합10 조합 없으면 null.
    const b = new Board([[1, 0, 7]], undefined, [[0, 1, 0]]);
    assertEqual(findValidCombination(b), null);
  });
});
