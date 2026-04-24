import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertThrows,
} from "./runner";
import {
  computeBoardLayout,
  cellRect,
  hitTestCell,
} from "../src/renderer/BoardRenderer";

describe("computeBoardLayout", () => {
  test("정사각 비율: 넓이에 맞춰 축소", () => {
    const layout = computeBoardLayout(
      { x: 0, y: 0, width: 600, height: 400 },
      6,
      9,
      0,
    );
    // 600/6=100, 400/9≈44. → 44 채택
    assertEqual(layout.cellSize, 44);
    assertEqual(layout.cols, 6);
    assertEqual(layout.rows, 9);
  });

  test("중앙 정렬 오리진 계산", () => {
    const layout = computeBoardLayout(
      { x: 10, y: 20, width: 100, height: 100 },
      4,
      4,
      0,
    );
    assertEqual(layout.cellSize, 25);
    assertEqual(layout.originX, 10);
    assertEqual(layout.originY, 20);
  });

  test("패딩 적용", () => {
    const layout = computeBoardLayout(
      { x: 0, y: 0, width: 100, height: 100 },
      2,
      2,
      10,
    );
    // avail 80x80 → 40px
    assertEqual(layout.cellSize, 40);
  });

  test("셀 크기는 최소 1", () => {
    const layout = computeBoardLayout(
      { x: 0, y: 0, width: 10, height: 10 },
      20,
      20,
      0,
    );
    assertTrue(layout.cellSize >= 1);
  });

  test("cols/rows 0 이하는 에러", () => {
    assertThrows(() =>
      computeBoardLayout({ x: 0, y: 0, width: 100, height: 100 }, 0, 5),
    );
  });
});

describe("cellRect + hitTestCell", () => {
  test("cellRect: 인덱스에 따른 좌표", () => {
    const layout = computeBoardLayout(
      { x: 0, y: 0, width: 300, height: 300 },
      3,
      3,
      0,
    );
    const r = cellRect(layout, 1, 2);
    assertEqual(r.size, 100);
    assertEqual(r.x, 100);
    assertEqual(r.y, 200);
  });

  test("hitTestCell: 셀 중앙 좌표는 해당 인덱스로 변환", () => {
    const layout = computeBoardLayout(
      { x: 0, y: 0, width: 300, height: 300 },
      3,
      3,
      0,
    );
    const p = hitTestCell(layout, 150, 150);
    assertEqual(p![0], 1);
    assertEqual(p![1], 1);
  });

  test("hitTestCell: 경계 밖은 null", () => {
    const layout = computeBoardLayout(
      { x: 0, y: 0, width: 300, height: 300 },
      3,
      3,
      0,
    );
    assertEqual(hitTestCell(layout, -5, 10), null);
    assertEqual(hitTestCell(layout, 500, 10), null);
  });
});
