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
  BoardRenderer,
} from "../src/renderer/BoardRenderer";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";
import { Board } from "../src/game/Board";

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

describe("BoardRenderer.draw — 멀티라이프 색상 분기", () => {
  function fakeRenderer(): { renderer: CanvasRenderer; calls: { fillRect: number; fillText: number; fillStyles: string[] } } {
    const calls = { fillRect: 0, fillText: 0, fillStyles: [] as string[] };
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "butt",
      font: "",
      textAlign: "left",
      textBaseline: "top",
      fillRect: () => {
        calls.fillRect++;
      },
      strokeRect: () => {},
      clearRect: () => {},
      fillText: () => {
        calls.fillText++;
      },
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as unknown as CanvasRenderingContext2D;
    // fillStyle 셋터 추적
    Object.defineProperty(ctx, "fillStyle", {
      get(): string {
        return "";
      },
      set(v: string) {
        calls.fillStyles.push(v);
      },
    });
    const canvas = {
      width: 0,
      height: 0,
      style: {} as Record<string, string>,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    const renderer = new CanvasRenderer(canvas);
    renderer.resize(400, 400, 1);
    return { renderer, calls };
  }

  test("렌더링 통과 — 멀티라이프 셀 포함 보드 (lives 1~5)", () => {
    const { renderer, calls } = fakeRenderer();
    const br = new BoardRenderer(renderer);
    br.setLayout(
      computeBoardLayout({ x: 0, y: 0, width: 400, height: 400 }, 5, 1, 0),
    );
    const b = new Board([[3, 7, 2, 5, 5]], [[1, 2, 3, 4, 5]]);
    br.draw(b);
    assertTrue(calls.fillRect > 0, "fillRect 호출됨");
    assertTrue(calls.fillText > 0, "fillText 호출됨");
    // lives≥2 셀들의 배경색이 사용되었는지 확인 (적어도 하나)
    const usedColors = new Set(calls.fillStyles);
    assertTrue(usedColors.has("#d4ebf8") || usedColors.has("#8cc1de") || usedColors.has("#4291bd") || usedColors.has("#1e4d80"));
  });

  test("렌더링: 멀티라이프 셀에 xN 배지 텍스트 출력", () => {
    const { renderer, calls } = fakeRenderer();
    const br = new BoardRenderer(renderer);
    br.setLayout(
      computeBoardLayout({ x: 0, y: 0, width: 200, height: 200 }, 2, 1, 0),
    );
    const b = new Board([[3, 7]], [[3, 1]]);
    const beforeText = calls.fillText;
    br.draw(b);
    // (3,3lives) + (7,1) → 2개 셀 + 멀티 1개의 xN 배지 = 최소 3회 fillText
    assertTrue(calls.fillText >= beforeText + 3, `fillText delta: ${calls.fillText - beforeText}`);
  });

  test("일반(lives=1) 셀만 있는 보드는 멀티 배경/배지 분기 미진입", () => {
    const { renderer, calls } = fakeRenderer();
    const br = new BoardRenderer(renderer);
    br.setLayout(
      computeBoardLayout({ x: 0, y: 0, width: 200, height: 200 }, 2, 1, 0),
    );
    const b = new Board([[3, 7]]);
    br.draw(b);
    // 멀티 배경 색상이 사용되지 않아야 함
    const usedColors = new Set(calls.fillStyles);
    assertTrue(!usedColors.has("#d4ebf8"));
    assertTrue(!usedColors.has("#8cc1de"));
    assertTrue(!usedColors.has("#4291bd"));
    assertTrue(!usedColors.has("#1e4d80"));
  });
});
