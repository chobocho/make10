/**
 * Integration 테스트 — Title → Game → Result 전 사이클.
 * DOM/Canvas를 프록시 페이크로 대체하고 FSM + 세 씬 + 실제 맵 JSON을 함께 돌려 전환·상태·점수·저장을 검증한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
} from "./runner";
import { FSM } from "../src/core/FSM";
import type { SceneContext } from "../src/scenes/Scene";
import { TitleScene } from "../src/scenes/TitleScene";
import { GameScene, GameResult } from "../src/scenes/GameScene";
import { ResultScene } from "../src/scenes/ResultScene";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";
import { AudioManager, SoundName } from "../src/audio/AudioManager";
import { SaveManager, MemoryProgressStore } from "../src/storage/SaveManager";
import { parseMapJson, MapData } from "../src/data/MapLoader";
import {
  computeMapGridLayout,
  computeResultButtonsLayout,
} from "../src/scenes/SceneLayout";

function fakeRenderer(w = 480, h = 800): CanvasRenderer {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, p) {
      if (p in target) return target[p as string];
      return () => {};
    },
    set(target, p, v) {
      target[p as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  const r = new CanvasRenderer(canvas);
  r.resize(w, h, 1);
  return r;
}

function readMapFromDisk(id: number): MapData {
  return parseMapJson(
    readFileSync(
      join(__dirname, "..", "data", `map${String(id).padStart(3, "0")}.json`),
      "utf-8",
    ),
  );
}

function buildContext() {
  const renderer = fakeRenderer();
  const audioCalls: SoundName[] = [];
  const audio = new AudioManager({ ctxCtor: null });
  (audio as unknown as { play: (n: SoundName) => void }).play = (n) =>
    audioCalls.push(n);
  (audio as unknown as { ensureReady: () => void }).ensureReady = () => {};
  const saveManager = new SaveManager(new MemoryProgressStore());
  const fsm = new FSM();

  const ctx: SceneContext = {
    renderer,
    audio,
    saveManager,
    transition: (next, args) => {
      void fsm.transition(next, args);
    },
    loadMap: async (id) => readMapFromDisk(id),
    maxMapId: 100,
  };
  return { ctx, fsm, renderer, audioCalls, saveManager };
}

function cellCenter(
  layout: { originX: number; originY: number; cellSize: number },
  col: number,
  row: number,
): { x: number; y: number } {
  return {
    x: layout.originX + col * layout.cellSize + layout.cellSize / 2,
    y: layout.originY + row * layout.cellSize + layout.cellSize / 2,
  };
}

/** GameScene 안에서 보드를 모두 비우는 드래그 시퀀스를 실행. map이 가로 2셀 쌍 타일링이므로 모든 쌍을 순차 제거. */
async function clearAllPairs(
  scene: GameScene,
  map: MapData,
): Promise<void> {
  // GameScene은 첫 render 이후 레이아웃이 계산된다.
  scene.render();
  const layout = (scene as unknown as { boardRenderer: { getLayout(): typeof import("../src/renderer/BoardRenderer").BoardLayout extends infer T ? T : never } }).boardRenderer.getLayout() as unknown as {
    originX: number;
    originY: number;
    cellSize: number;
  };
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c += 2) {
      const a = cellCenter(layout, c, r);
      const b = cellCenter(layout, c + 1, r);
      scene.onPointerDown!(a.x, a.y);
      scene.onPointerMove!(b.x, b.y);
      scene.onPointerUp!(b.x, b.y);
    }
  }
}

describe("Integration: Title → Game → Result", () => {
  test("맵1 선택 → 클리어 → result에 전환 → retry 반복", async () => {
    const { ctx, fsm, audioCalls, saveManager } = buildContext();
    fsm.register("title", new TitleScene(ctx));
    fsm.register("game", new GameScene(ctx));
    fsm.register("result", new ResultScene(ctx));

    await fsm.start("title");
    assertEqual(fsm.getCurrentId(), "title");
    fsm.render();

    // 타이틀의 1번 버튼 탭
    const size = ctx.renderer.getSize();
    const grid = computeMapGridLayout(size.width, size.height, ctx.maxMapId);
    const firstBtn = grid.buttons[0];
    fsm.onPointerDown(
      firstBtn.x + firstBtn.width / 2,
      firstBtn.y + firstBtn.height / 2,
    );
    fsm.onPointerUp(
      firstBtn.x + firstBtn.width / 2,
      firstBtn.y + firstBtn.height / 2,
    );
    // 비동기 loadMap 대기
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "game");

    // 게임 씬의 현재 map 정보 얻기
    const gameScene = fsm.getCurrent() as GameScene;
    const map = readMapFromDisk(1);
    await clearAllPairs(gameScene, map);

    // 전환은 fire-and-forget transition 내부에서 일어나므로 flush
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "result");
    assertTrue(audioCalls.includes("clear"));

    // 저장 확인
    await Promise.resolve();
    const savedList = await saveManager.list();
    assertTrue(savedList.some((r) => r.mapId === 1));

    // Result 의 retry 탭
    const btns = computeResultButtonsLayout(size.width, size.height);
    fsm.onPointerDown(btns.retry.x + 1, btns.retry.y + 1);
    fsm.onPointerUp(btns.retry.x + 1, btns.retry.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "game");

    // 한 번 더 클리어
    await clearAllPairs(fsm.getCurrent() as GameScene, map);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "result");
  });

  test("타이머 만료 → gameover 결과에서 next 가능 (mapId<100)", async () => {
    const { ctx, fsm } = buildContext();
    fsm.register("title", new TitleScene(ctx));
    fsm.register("game", new GameScene(ctx));
    fsm.register("result", new ResultScene(ctx));
    await fsm.start("game", { map: readMapFromDisk(2) });
    // dt를 큰 값으로 tick → 타이머 만료
    fsm.update(300_000);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "result");
    const result = (fsm.getCurrent() as unknown as { result: GameResult | null }).result;
    assertTrue(result !== null);
    assertFalse(result!.cleared);

    const size = ctx.renderer.getSize();
    const btns = computeResultButtonsLayout(size.width, size.height);
    fsm.onPointerDown(btns.next.x + 1, btns.next.y + 1);
    fsm.onPointerUp(btns.next.x + 1, btns.next.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "game");
  });

  test("최고 난이도(100) 맵도 기본적으로 solvable — 이론적 검증", () => {
    const map = readMapFromDisk(100);
    assertTrue(map.initialBoard.length === map.rows);
    assertTrue(map.cols % 2 === 0);
    // 모든 쌍이 수평으로 합 10 → 명시적으로 검증
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c += 2) {
        assertEqual(map.initialBoard[r][c] + map.initialBoard[r][c + 1], 10);
      }
    }
  });
});
