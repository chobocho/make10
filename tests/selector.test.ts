import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
} from "./runner";
import { Board } from "../src/game/Board";
import { Selector } from "../src/game/Selector";

function posArray(
  s: Selector,
): ReadonlyArray<readonly [number, number]> {
  return s.getPositions().map((p) => [p[0], p[1]] as const);
}

describe("Selector", () => {
  test("begin: 유효 셀 선택 성공", () => {
    const b = new Board([[1, 2, 3]]);
    const s = new Selector(b);
    assertTrue(s.begin(0, 0));
    assertDeepEqual(posArray(s), [[0, 0]]);
  });

  test("begin: 빈 셀(0)은 거부", () => {
    const b = new Board([[0, 2]]);
    const s = new Selector(b);
    assertFalse(s.begin(0, 0));
    assertEqual(s.getPositions().length, 0);
  });

  test("begin: 경계 밖은 거부", () => {
    const b = new Board([[1]]);
    const s = new Selector(b);
    assertFalse(s.begin(5, 5));
  });

  test("extend: 가로 인접", () => {
    const b = new Board([[4, 6]]);
    const s = new Selector(b);
    s.begin(0, 0);
    assertTrue(s.extend(1, 0));
    assertEqual(s.getPositions().length, 2);
  });

  test("extend: 세로 인접", () => {
    const b = new Board([[3], [7]]);
    const s = new Selector(b);
    s.begin(0, 0);
    assertTrue(s.extend(0, 1));
  });

  test("extend: 대각선 거부", () => {
    const b = new Board([
      [1, 2],
      [3, 4],
    ]);
    const s = new Selector(b);
    s.begin(0, 0);
    assertFalse(s.extend(1, 1));
  });

  test("extend: 비인접(2칸 이상) 거부", () => {
    const b = new Board([[1, 2, 3]]);
    const s = new Selector(b);
    s.begin(0, 0);
    assertFalse(s.extend(2, 0));
  });

  test("extend: 빈 셀 거부", () => {
    const b = new Board([[1, 0, 3]]);
    const s = new Selector(b);
    s.begin(0, 0);
    assertFalse(s.extend(1, 0));
  });

  test("extend: 4개 이상 거부", () => {
    const b = new Board([[1, 2, 3, 4, 5]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    s.extend(2, 0);
    assertFalse(s.extend(3, 0));
    assertEqual(s.getPositions().length, 3);
  });

  test("extend: 직전-직전 셀로 되돌아가면 undo", () => {
    const b = new Board([[1, 2, 3]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    assertTrue(s.extend(0, 0));
    assertDeepEqual(posArray(s), [[0, 0]]);
  });

  test("extend: 이미 선택된 중간 셀은 거부(undo 대상 아님)", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    s.extend(2, 0);
    // (0,0)은 second-last가 아닌 첫 셀. (2,0) 기준 인접도 아님.
    assertFalse(s.extend(0, 0));
  });

  test("isValidForRemoval: 2개·합10 → true", () => {
    const b = new Board([[4, 6]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    assertTrue(s.isValidForRemoval());
  });

  test("isValidForRemoval: 3개·합10 → true", () => {
    const b = new Board([[2, 3, 5]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    s.extend(2, 0);
    assertTrue(s.isValidForRemoval());
  });

  test("isValidForRemoval: 2개·합≠10 → false", () => {
    const b = new Board([[4, 5]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    assertFalse(s.isValidForRemoval());
  });

  test("isValidForRemoval: 1개는 항상 false", () => {
    const b = new Board([[10].map(() => 9)]);
    const s = new Selector(b);
    s.begin(0, 0);
    assertFalse(s.isValidForRemoval());
  });

  test("commit: 결과 반환 후 선택 초기화", () => {
    const b = new Board([[4, 6]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    const r = s.commit();
    assertEqual(r.sum, 10);
    assertTrue(r.valid);
    assertEqual(r.positions.length, 2);
    assertFalse(s.isActive());
  });

  test("cancel: 상태 초기화", () => {
    const b = new Board([[4, 6]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    s.cancel();
    assertFalse(s.isActive());
    assertEqual(s.getSum(), 0);
  });

  test("begin 재호출 시 이전 선택은 버려짐", () => {
    const b = new Board([[1, 2, 3]]);
    const s = new Selector(b);
    s.begin(0, 0);
    s.extend(1, 0);
    s.begin(2, 0);
    assertDeepEqual(posArray(s), [[2, 0]]);
  });
});

describe("Selector + 장애물", () => {
  test("begin: 장애물 셀(grid=0)은 거부", () => {
    const b = new Board([[3, 0, 7]], undefined, [[0, 1, 0]]);
    const s = new Selector(b);
    assertFalse(s.begin(1, 0));
  });

  test("extend: 장애물 셀로의 확장은 거부 (grid=0이라 isEmpty)", () => {
    const b = new Board([[3, 0, 7]], undefined, [[0, 1, 0]]);
    const s = new Selector(b);
    assertTrue(s.begin(0, 0));
    assertFalse(s.extend(1, 0)); // 장애물
  });

  test("extend: 장애물 너머의 셀로 직접 점프 불가 (인접 1 위반)", () => {
    const b = new Board([[3, 0, 7]], undefined, [[0, 1, 0]]);
    const s = new Selector(b);
    assertTrue(s.begin(0, 0));
    // (0,0)에서 (2,0)으로 바로 이동 — 거리 2라 거부
    assertFalse(s.extend(2, 0));
  });

  test("commit: 장애물을 포함하지 않는 우회 경로는 정상 (수직 → 수평)", () => {
    // 3 [장애물] 7
    // 1   2     6
    // (0,0)=3 → (0,1)=1 사이는 인접하지만 합 4. 다른 경로 시연:
    // (2,0)=7 → (2,1)=6 → (1,1)=2: 합 15. 장애물 없는 셀로만 이동 OK.
    const b = new Board(
      [
        [3, 0, 7],
        [1, 2, 6],
      ],
      undefined,
      [
        [0, 1, 0],
        [0, 0, 0],
      ],
    );
    const s = new Selector(b);
    assertTrue(s.begin(2, 0));
    assertTrue(s.extend(2, 1));
    assertTrue(s.extend(1, 1));
    const r = s.commit();
    assertEqual(r.positions.length, 3);
    assertEqual(r.sum, 15);
  });
});
