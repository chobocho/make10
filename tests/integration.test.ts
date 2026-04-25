/**
 * Integration 테스트 — Title → Game → Result 전 사이클.
 * DOM/Canvas를 프록시 페이크로 대체하고 FSM + 세 씬 + 실제 맵 JSON을 함께 돌려 전환·상태·점수·저장을 검증한다.
 */
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
import type { MapData } from "../src/data/MapLoader";
import {
  computeMapGridLayout,
  computeResultButtonsLayout,
} from "../src/scenes/SceneLayout";

function fakeRenderer(w = 480, h = 800): CanvasRenderer {
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    { createLinearGradient: () => gradient } as unknown as Record<string, unknown>,
    {
      get(target, p) {
        if (p in target) return target[p as string];
        return () => {};
      },
      set(target, p, v) {
        target[p as string] = v;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
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

/**
 * 통합 테스트용 픽스처 — 중력이 작동해도 결정적으로 클리어 가능한 보드.
 * 모든 행이 (x, 10-x) 쌍으로 구성되어, 위에서 아래로 순차 제거 시 전체 클리어.
 */
function pairTiledFixture(id = 1, rows = 3, cols = 2): MapData {
  const initialBoard: number[][] = [];
  const pairs = [
    [3, 7],
    [4, 6],
    [2, 8],
    [1, 9],
    [5, 5],
  ];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c += 2) {
      const p = pairs[(r + c) % pairs.length];
      row.push(p[0], p[1]);
    }
    initialBoard.push(row);
  }
  return {
    id,
    name: `fixture${id}`,
    cols,
    rows,
    timeLimit: 30,
    hintCount: 1,
    targetScore: 0,
    starThresholds: [100, 500, 1000],
    initialBoard,
  };
}

/** 타임아웃 유도용 — 유효 조합이 존재하지만 빨리 클리어되지 않는 작은 보드 */
function slowFixture(id = 2): MapData {
  return {
    id,
    name: `slow${id}`,
    cols: 2,
    rows: 3,
    timeLimit: 5,
    hintCount: 0,
    targetScore: 0,
    starThresholds: [100, 500, 1000],
    initialBoard: [
      [3, 7],
      [4, 6],
      [2, 8],
    ],
  };
}

function buildContext(mapProvider: (id: number) => MapData = (id) => pairTiledFixture(id)) {
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
    loadMap: async (id) => mapProvider(id),
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

/**
 * GameScene 안에서 보드를 모두 비우는 드래그 시퀀스를 실행.
 * 픽스처는 행별 가로 쌍 합=10 구성이며, 중력이 작동해도 **위에서 아래로** 제거하면
 * 빈 행이 자연스럽게 하단에 쌓여 결국 모든 셀이 제거된다.
 * 각 행 제거 후에는 중력으로 위쪽 값들이 내려오므로 매 반복마다 행 0 을 기준으로 제거한다.
 */
async function clearAllPairs(scene: GameScene, map: MapData): Promise<void> {
  scene.render();
  const layout = (scene as unknown as {
    boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
  }).boardRenderer.getLayout();
  // 각 반복: 가장 위에 남아있는 (비어있지 않은) 행을 제거.
  // 픽스처 구조상 모든 유효 행은 가로 쌍 합=10이므로 rows 만큼 반복.
  for (let iter = 0; iter < map.rows; iter++) {
    // 가장 아래쪽 비어있지 않은 행을 찾는다 (중력 후 값들은 아래쪽에 모임).
    const board = (scene as unknown as { board: { snapshot(): number[][] } }).board;
    const snap = board.snapshot();
    let targetRow = -1;
    for (let r = snap.length - 1; r >= 0; r--) {
      if (snap[r].some((v) => v !== 0)) {
        targetRow = r;
        break;
      }
    }
    if (targetRow < 0) break;
    for (let c = 0; c < map.cols; c += 2) {
      const a = cellCenter(layout, c, targetRow);
      const b = cellCenter(layout, c + 1, targetRow);
      scene.onPointerDown!(a.x, a.y);
      scene.onPointerMove!(b.x, b.y);
      scene.onPointerUp!(b.x, b.y);
    }
  }
}

describe("Integration: Title → Game → Result", () => {
  test("맵1 선택 → 매치 반복(보드 리필) → 타이머 만료 → result → retry", async () => {
    const { ctx, fsm, audioCalls } = buildContext();
    fsm.register("title", new TitleScene(ctx));
    fsm.register("game", new GameScene(ctx, Math.random, 0));
    fsm.register("result", new ResultScene(ctx));

    await fsm.start("title");
    assertEqual(fsm.getCurrentId(), "title");
    fsm.render();

    // 타이틀의 1번 버튼 탭
    const size = ctx.renderer.getSize();
    const grid = computeMapGridLayout(size.width, size.height, ctx.maxMapId);
    const firstBtn = grid.buttons[0];
    fsm.onPointerDown(firstBtn.x + firstBtn.width / 2, firstBtn.y + firstBtn.height / 2);
    fsm.onPointerUp(firstBtn.x + firstBtn.width / 2, firstBtn.y + firstBtn.height / 2);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "game");

    // 한 번 매치 (리필로 보드는 가득 유지)
    const gameScene = fsm.getCurrent() as GameScene;
    const map = pairTiledFixture(1);
    await clearAllPairs(gameScene, map);
    // 매치 후에도 game 씬 유지 (리필되므로 clear/stuck 모두 발생 X with Math.random)
    assertTrue((gameScene as unknown as { _getScore(): number })._getScore() >= 100);
    // 보드 가득 차있음 확인
    const snap = (gameScene as unknown as { board: { snapshot(): number[][] } }).board.snapshot();
    for (const row of snap) for (const v of row) assertTrue(v !== 0);

    // 타이머 강제 만료 → result 전환. 점수 100 < ★1(500) → cleared=false.
    // (fixture starThresholds=[100,500,1000], pair 1회=100점 → 0★ 또는 1★ 가능 — 정확한 수는
    //  매치 횟수에 따라 다름. 여기서는 result 전환만 확정 검증.)
    fsm.update(300_000);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "result");
    assertTrue(
      audioCalls.includes("gameover") || audioCalls.includes("clear"),
      "종료 사운드(gameover/clear) 중 하나가 재생되어야 함",
    );

    // retry
    const btns = computeResultButtonsLayout(size.width, size.height);
    fsm.onPointerDown(btns.retry.x + 1, btns.retry.y + 1);
    fsm.onPointerUp(btns.retry.x + 1, btns.retry.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "game");
  });

  test("타이머 만료 → reason=timeup 결과에서 next 가능", async () => {
    const { ctx, fsm } = buildContext((id) => slowFixture(id));
    fsm.register("title", new TitleScene(ctx));
    fsm.register("game", new GameScene(ctx, Math.random, 0));
    fsm.register("result", new ResultScene(ctx));
    await fsm.start("game", { map: slowFixture(2) });
    fsm.update(300_000);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "result");
    const result = (fsm.getCurrent() as unknown as { result: GameResult | null }).result;
    assertTrue(result !== null);
    assertFalse(result!.cleared);
    assertEqual(result!.reason, "timeup");

    const size = ctx.renderer.getSize();
    const btns = computeResultButtonsLayout(size.width, size.height);
    fsm.onPointerDown(btns.next.x + 1, btns.next.y + 1);
    fsm.onPointerUp(btns.next.x + 1, btns.next.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "game");
  });

  test("클리어 → ResultScene saveBest → TitleScene bestStars 갱신", async () => {
    const winMap: MapData = {
      id: 7,
      name: "winnable",
      cols: 2,
      rows: 1,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300], // ★1 컷=50 → 한 번 매치(100점)면 ★★
      initialBoard: [[4, 6]],
    };
    const { ctx, fsm, saveManager } = buildContext(() => winMap);
    fsm.register("title", new TitleScene(ctx));
    fsm.register("game", new GameScene(ctx, () => 0, 0));
    fsm.register("result", new ResultScene(ctx));

    // 직접 게임으로 진입 — 한 번 매치 후 stuck(RNG=0 → 모두 1) 으로 종료
    await fsm.start("game", { map: winMap });
    const scene = fsm.getCurrent() as GameScene;
    scene.render();
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    const a = cellCenter(layout, 0, 0);
    const b = cellCenter(layout, 1, 0);
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "result");
    // 점수 100 ≥ ★1=50 → cleared=true, stars=1
    const res = (fsm.getCurrent() as unknown as { result: GameResult | null }).result;
    assertTrue(res !== null);
    assertTrue(res!.cleared);
    assertEqual(res!.stars, 1);

    // saveBest는 ResultScene.enter에서 fire-and-forget. 마이크로태스크 정착 대기.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const saved = await saveManager.load(7);
    assertTrue(saved !== null, "saveBest 로 점수가 저장되어야 함");
    assertEqual(saved!.stars, 1);
    assertEqual(saved!.score, 100);

    // 타이틀로 → bestStars 에 7번 맵의 ★1 반영
    const size = ctx.renderer.getSize();
    const btns = computeResultButtonsLayout(size.width, size.height);
    fsm.onPointerDown(btns.title.x + 1, btns.title.y + 1);
    fsm.onPointerUp(btns.title.x + 1, btns.title.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "title");
    const title = fsm.getCurrent() as TitleScene;
    const bestStars = (title as unknown as { bestStars: Map<number, number> }).bestStars;
    assertEqual(bestStars.get(7), 1, "타이틀 진입 시 직전 클리어 ★ 반영");
  });

  test("리필 후에도 조합 없으면 reason=stuck (RNG 주입으로 모두 1 생성)", async () => {
    const stuckMap: MapData = {
      id: 1,
      name: "stuck-test",
      cols: 2,
      rows: 2,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [200, 500, 1000],
      initialBoard: [
        [3, 7],
        [1, 1],
      ],
    };
    const { ctx, fsm } = buildContext(() => stuckMap);
    // RNG=0 → 리필이 모두 1 → 2x2 전체 1 → stuck. introDurationMs=0으로 즉시 시작.
    fsm.register("game", new GameScene(ctx, () => 0, 0));
    fsm.register("result", new ResultScene(ctx));
    await fsm.start("game", { map: stuckMap });
    const scene = fsm.getCurrent() as GameScene;
    scene.render();
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    // (3,7) 쌍 선택·제거
    const a = cellCenter(layout, 0, 0);
    const b = cellCenter(layout, 1, 0);
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "result");
    const result = (fsm.getCurrent() as unknown as { result: GameResult | null }).result;
    assertEqual(result?.reason, "stuck");
    assertFalse(result?.cleared ?? true);
  });
});
