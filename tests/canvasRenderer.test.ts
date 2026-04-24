import {
  describe,
  test,
  assertEqual,
  assertThrows,
  assertTrue,
} from "./runner";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";

interface FakeCtxCalls {
  readonly transforms: Array<readonly [number, number, number, number, number, number]>;
  readonly fills: Array<readonly [number, number, number, number, string]>;
  readonly clears: Array<readonly [number, number, number, number]>;
  saveCount: number;
  restoreCount: number;
}

function makeFakeCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  calls: FakeCtxCalls;
} {
  const calls: FakeCtxCalls = {
    transforms: [],
    fills: [],
    clears: [],
    saveCount: 0,
    restoreCount: 0,
  };
  const ctx = {
    fillStyle: "#000",
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      (calls.transforms as Array<readonly [number, number, number, number, number, number]>).push([
        a,
        b,
        c,
        d,
        e,
        f,
      ]);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      (calls.fills as Array<readonly [number, number, number, number, string]>).push([
        x,
        y,
        w,
        h,
        (ctx as unknown as { fillStyle: string }).fillStyle,
      ]);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      (calls.clears as Array<readonly [number, number, number, number]>).push([x, y, w, h]);
    },
    save() {
      calls.saveCount++;
    },
    restore() {
      calls.restoreCount++;
    },
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext(type: string) {
      return type === "2d" ? ctx : null;
    },
  } as unknown as HTMLCanvasElement;

  return { canvas, ctx, calls };
}

describe("CanvasRenderer", () => {
  test("2D 컨텍스트 없으면 에러", () => {
    const canvas = {
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    assertThrows(() => new CanvasRenderer(canvas));
  });

  test("resize: CSS/물리 픽셀 모두 적용, dpr 변환", () => {
    const { canvas, calls } = makeFakeCanvas();
    const r = new CanvasRenderer(canvas);
    r.resize(400, 300, 2);
    assertEqual(canvas.width, 800);
    assertEqual(canvas.height, 600);
    assertEqual(canvas.style.width, "400px");
    assertEqual(canvas.style.height, "300px");
    const last = calls.transforms[calls.transforms.length - 1];
    assertEqual(last[0], 2);
    assertEqual(last[3], 2);
  });

  test("resize: 0/음수는 에러", () => {
    const { canvas } = makeFakeCanvas();
    const r = new CanvasRenderer(canvas);
    assertThrows(() => r.resize(0, 100));
    assertThrows(() => r.resize(100, -1));
  });

  test("getSize: 설정값 반환", () => {
    const { canvas } = makeFakeCanvas();
    const r = new CanvasRenderer(canvas);
    r.resize(320, 240, 1.5);
    const s = r.getSize();
    assertEqual(s.width, 320);
    assertEqual(s.height, 240);
    assertEqual(s.dpr, 1.5);
  });

  test("clear(color): fillRect 호출, 물리 픽셀 기준", () => {
    const { canvas, calls } = makeFakeCanvas();
    const r = new CanvasRenderer(canvas);
    r.resize(200, 100, 2);
    r.clear("#abcdef");
    const last = calls.fills[calls.fills.length - 1];
    assertEqual(last[0], 0);
    assertEqual(last[1], 0);
    assertEqual(last[2], 400); // 200 * 2
    assertEqual(last[3], 200); // 100 * 2
    assertEqual(last[4], "#abcdef");
  });

  test("clear() 기본은 clearRect", () => {
    const { canvas, calls } = makeFakeCanvas();
    const r = new CanvasRenderer(canvas);
    r.resize(100, 100, 1);
    r.clear();
    assertTrue(calls.clears.length >= 1);
  });

  test("onResize 콜백 호출", () => {
    const { canvas } = makeFakeCanvas();
    const r = new CanvasRenderer(canvas);
    let called = 0;
    r.onResize((s) => {
      if (s.width === 500) called++;
    });
    r.resize(500, 400, 1);
    assertEqual(called, 1);
  });
});
