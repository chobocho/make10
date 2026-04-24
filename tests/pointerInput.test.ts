import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
} from "./runner";
import { PointerInput } from "../src/input/PointerInput";

interface Listener {
  type: string;
  cb: (e: unknown) => void;
}

function fakeTarget(rect = { left: 10, top: 20 }) {
  const listeners: Listener[] = [];
  return {
    listeners,
    rect,
    addEventListener(type: string, cb: (e: unknown) => void) {
      listeners.push({ type, cb });
    },
    removeEventListener(type: string, cb: (e: unknown) => void) {
      const i = listeners.findIndex((l) => l.type === type && l.cb === cb);
      if (i >= 0) listeners.splice(i, 1);
    },
    getBoundingClientRect() {
      return { left: rect.left, top: rect.top };
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    dispatch(type: string, e: unknown) {
      for (const l of listeners) if (l.type === type) l.cb(e);
    },
  };
}

function evt(pointerId: number, clientX: number, clientY: number): Record<string, unknown> {
  return {
    pointerId,
    clientX,
    clientY,
    preventDefault() {},
  };
}

describe("PointerInput", () => {
  test("attach/detach: 리스너 등록/해제", () => {
    const t = fakeTarget();
    const input = new PointerInput(t as unknown as HTMLElement);
    input.attach();
    assertTrue(t.listeners.length > 0);
    const countAfterAttach = t.listeners.length;
    input.detach();
    assertEqual(t.listeners.length, 0);
    // 재 attach 가능
    input.attach();
    assertEqual(t.listeners.length, countAfterAttach);
  });

  test("down → move → up 기본 플로우, 좌표가 rect 기준 로컬로 변환", () => {
    const events: Array<readonly [string, number, number]> = [];
    const t = fakeTarget({ left: 10, top: 20 });
    const input = new PointerInput(t as unknown as HTMLElement, {
      onDown: (x, y) => events.push(["down", x, y]),
      onMove: (x, y) => events.push(["move", x, y]),
      onUp: (x, y) => events.push(["up", x, y]),
    });
    input.attach();
    t.dispatch("pointerdown", evt(1, 50, 80));
    t.dispatch("pointermove", evt(1, 60, 90));
    t.dispatch("pointerup", evt(1, 70, 100));
    assertDeepEqual(events, [
      ["down", 40, 60],
      ["move", 50, 70],
      ["up", 60, 80],
    ]);
  });

  test("2번째 포인터는 무시 (멀티터치 방지)", () => {
    const events: string[] = [];
    const t = fakeTarget();
    const input = new PointerInput(t as unknown as HTMLElement, {
      onDown: () => events.push("down"),
      onMove: () => events.push("move"),
      onUp: () => events.push("up"),
    });
    input.attach();
    t.dispatch("pointerdown", evt(1, 0, 0));
    t.dispatch("pointerdown", evt(2, 0, 0));
    t.dispatch("pointermove", evt(2, 10, 10));
    t.dispatch("pointerup", evt(2, 10, 10));
    // 2번 포인터 이벤트는 모두 무시되어야 함
    assertDeepEqual(events, ["down"]);
    assertTrue(input.isActive());
  });

  test("cancel 시 상태 초기화 + onCancel 호출", () => {
    let canceled = 0;
    const t = fakeTarget();
    const input = new PointerInput(t as unknown as HTMLElement, {
      onCancel: () => canceled++,
    });
    input.attach();
    t.dispatch("pointerdown", evt(1, 5, 5));
    assertTrue(input.isActive());
    t.dispatch("pointercancel", evt(1, 5, 5));
    assertEqual(canceled, 1);
    assertFalse(input.isActive());
  });

  test("down 없이 move/up은 무시", () => {
    const events: string[] = [];
    const t = fakeTarget();
    const input = new PointerInput(t as unknown as HTMLElement, {
      onMove: () => events.push("move"),
      onUp: () => events.push("up"),
    });
    input.attach();
    t.dispatch("pointermove", evt(1, 0, 0));
    t.dispatch("pointerup", evt(1, 0, 0));
    assertEqual(events.length, 0);
  });
});
