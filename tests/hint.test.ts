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
});
