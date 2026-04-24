import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
} from "./runner";
import { FSM } from "../src/core/FSM";
import type { Scene, SceneId } from "../src/scenes/Scene";

function makeSpyScene(name: string, log: string[]): Scene {
  return {
    enter(args?: unknown) {
      log.push(`${name}:enter:${JSON.stringify(args ?? null)}`);
    },
    exit() {
      log.push(`${name}:exit`);
    },
    update(dt) {
      log.push(`${name}:update:${dt}`);
    },
    render() {
      log.push(`${name}:render`);
    },
    onPointerDown(x, y) {
      log.push(`${name}:down:${x},${y}`);
    },
    onPointerMove(x, y) {
      log.push(`${name}:move:${x},${y}`);
    },
    onPointerUp(x, y) {
      log.push(`${name}:up:${x},${y}`);
    },
    onPointerCancel() {
      log.push(`${name}:cancel`);
    },
  };
}

describe("FSM", () => {
  test("start: 초기 씬의 enter 호출", async () => {
    const log: string[] = [];
    const fsm = new FSM();
    fsm.register("title", makeSpyScene("title", log));
    await fsm.start("title");
    assertEqual(fsm.getCurrentId(), "title");
    assertTrue(log.includes("title:enter:null"));
  });

  test("transition: 이전 씬 exit → 다음 씬 enter(args)", async () => {
    const log: string[] = [];
    const fsm = new FSM();
    fsm.register("title", makeSpyScene("title", log));
    fsm.register("game", makeSpyScene("game", log));
    await fsm.start("title");
    log.length = 0;
    await fsm.transition("game", { foo: 1 });
    assertEqual(log[0], "title:exit");
    assertEqual(log[1], `game:enter:${JSON.stringify({ foo: 1 })}`);
    assertEqual(fsm.getCurrentId(), "game");
  });

  test("update/render/포인터 이벤트 현재 씬에 위임", async () => {
    const log: string[] = [];
    const fsm = new FSM();
    fsm.register("title", makeSpyScene("title", log));
    await fsm.start("title");
    log.length = 0;
    fsm.update(16);
    fsm.render();
    fsm.onPointerDown(1, 2);
    fsm.onPointerMove(3, 4);
    fsm.onPointerUp(5, 6);
    fsm.onPointerCancel();
    assertEqual(log[0], "title:update:16");
    assertEqual(log[1], "title:render");
    assertEqual(log[2], "title:down:1,2");
    assertEqual(log[3], "title:move:3,4");
    assertEqual(log[4], "title:up:5,6");
    assertEqual(log[5], "title:cancel");
  });

  test("미등록 씬으로 transition 시 에러", async () => {
    const fsm = new FSM();
    let threw = false;
    try {
      await fsm.transition("game" as SceneId);
    } catch {
      threw = true;
    }
    assertTrue(threw);
  });

  test("현재 씬 없을 때 update/pointer 이벤트는 noop", () => {
    const fsm = new FSM();
    fsm.update(16);
    fsm.render();
    fsm.onPointerDown(0, 0);
    fsm.onPointerMove(0, 0);
    fsm.onPointerUp(0, 0);
    fsm.onPointerCancel();
    assertEqual(fsm.getCurrentId(), null);
    assertFalse(fsm.getCurrent() !== null);
  });
});
