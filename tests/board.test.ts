import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertThrows,
  assertDeepEqual,
} from "./runner";
import { Board } from "../src/game/Board";

describe("Board", () => {
  test("초기화: 유효한 2D 배열로 cols/rows 결정", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertEqual(b.getCols(), 3);
    assertEqual(b.getRows(), 2);
  });

  test("잘못된 셀 값(>9, 음수, 소수)은 에러", () => {
    assertThrows(() => new Board([[1, 2, 10]]));
    assertThrows(() => new Board([[1, 2, -1]]));
    assertThrows(() => new Board([[1, 2, 3.5]]));
  });

  test("행별 길이 불일치는 에러", () => {
    assertThrows(
      () =>
        new Board([
          [1, 2, 3],
          [4, 5],
        ]),
    );
  });

  test("빈 보드는 에러", () => {
    assertThrows(() => new Board([]));
    assertThrows(() => new Board([[]]));
  });

  test("getCell: (col,row) 순서", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertEqual(b.getCell(0, 0), 1);
    assertEqual(b.getCell(2, 0), 3);
    assertEqual(b.getCell(1, 1), 5);
  });

  test("inBounds", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertTrue(b.inBounds(0, 0));
    assertTrue(b.inBounds(2, 1));
    assertFalse(b.inBounds(3, 0));
    assertFalse(b.inBounds(0, 2));
    assertFalse(b.inBounds(-1, 0));
  });

  test("isEmpty: 0 값 감지", () => {
    const b = new Board([[1, 0, 3]]);
    assertTrue(b.isEmpty(1, 0));
    assertFalse(b.isEmpty(0, 0));
  });

  test("clearCell / clearCells", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    b.clearCell(1, 0);
    assertTrue(b.isEmpty(1, 0));
    b.clearCells([
      [0, 1],
      [2, 1],
    ]);
    assertTrue(b.isEmpty(0, 1));
    assertTrue(b.isEmpty(2, 1));
    assertFalse(b.isEmpty(1, 1));
  });

  test("isCleared", () => {
    const b = new Board([[1, 2]]);
    assertFalse(b.isCleared());
    b.clearCells([
      [0, 0],
      [1, 0],
    ]);
    assertTrue(b.isCleared());
  });

  test("isCleared: 초기가 전부 0", () => {
    const b = new Board([
      [0, 0],
      [0, 0],
    ]);
    assertTrue(b.isCleared());
  });

  test("sumAt", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertEqual(
      b.sumAt([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
      6,
    );
    assertEqual(b.sumAt([[2, 1]]), 6);
  });

  test("snapshot: 복사본 반환으로 원본 보호", () => {
    const b = new Board([
      [1, 2],
      [3, 4],
    ]);
    const snap = b.snapshot();
    snap[0][0] = 99;
    assertEqual(b.getCell(0, 0), 1);
  });

  test("경계 밖 접근은 RangeError", () => {
    const b = new Board([[1, 2]]);
    assertThrows(() => b.getCell(5, 5));
    assertThrows(() => b.clearCell(-1, 0));
  });

  test("remainingCount", () => {
    const b = new Board([
      [1, 2, 0],
      [0, 3, 4],
    ]);
    assertEqual(b.remainingCount(), 4);
    b.clearCell(0, 0);
    assertEqual(b.remainingCount(), 3);
  });

  test("applyGravity: 각 열의 빈 칸이 위로, 값은 아래로 이동", () => {
    const b = new Board([
      [1, 2, 0],
      [0, 3, 4],
      [5, 0, 6],
    ]);
    const moved = b.applyGravity();
    assertTrue(moved);
    assertDeepEqual(b.snapshot(), [
      [0, 0, 0],
      [1, 2, 4],
      [5, 3, 6],
    ]);
  });

  test("applyGravity: 이미 바닥 정렬이면 moved=false, 값 변화 없음", () => {
    const b = new Board([
      [0, 0],
      [1, 2],
      [3, 4],
    ]);
    const moved = b.applyGravity();
    assertFalse(moved);
    assertDeepEqual(b.snapshot(), [
      [0, 0],
      [1, 2],
      [3, 4],
    ]);
  });

  test("applyGravity: 전체 빈 열/전체 꽉찬 열 혼합", () => {
    const b = new Board([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    b.applyGravity();
    assertDeepEqual(b.snapshot(), [
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  test("applyGravity: 단일 열 중간 빈 칸", () => {
    const b = new Board([[1], [0], [3]]);
    b.applyGravity();
    assertDeepEqual(b.snapshot(), [[0], [1], [3]]);
  });

  test("nonEmptyCells 순회", () => {
    const b = new Board([
      [1, 0],
      [0, 2],
    ]);
    const cells = Array.from(b.nonEmptyCells());
    assertDeepEqual(cells, [
      { col: 0, row: 0, value: 1 },
      { col: 1, row: 1, value: 2 },
    ]);
  });
});
