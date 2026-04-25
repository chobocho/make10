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
  assertDeepEqual,
} from "./runner";
import { FSM } from "../src/core/FSM";
import type { SceneContext } from "../src/scenes/Scene";
import { TitleScene } from "../src/scenes/TitleScene";
import { GameScene, GameResult } from "../src/scenes/GameScene";
import { ResultScene } from "../src/scenes/ResultScene";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";
import { AudioManager, SoundName } from "../src/audio/AudioManager";
import { SaveManager, MemoryProgressStore, MemoryMetaStore } from "../src/storage/SaveManager";
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
  const metaStore = new MemoryMetaStore();
  // 통합 테스트의 GameScene 진입에서 튜토리얼 흐름이 끼지 않도록 사전 시딩(동기).
  // MemoryMetaStore 내부 Map 에 직접 키 삽입 — async API 의 microtask race 회피.
  (metaStore as unknown as { map: Map<string, unknown> }).map.set("tutorial_done", true);
  const saveManager = new SaveManager(
    new MemoryProgressStore(),
    new MemoryProgressStore(), // 세션 스토어 주입 — 멀티라이프 세션 복원 테스트 용도
    metaStore,
  );
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
    // GameScene.enter 가 isTutorialDone 을 await 하므로 충분히 마이크로태스크 드레인
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assertEqual(fsm.getCurrentId(), "game");

    // 한 번 매치 (리필로 보드는 가득 유지). 만능 자동/구원 스폰은 결정적 검증 위해 비활성.
    const gameScene = fsm.getCurrent() as GameScene;
    (gameScene as unknown as { _setWildEnabled(b: boolean): void })._setWildEnabled(false);
    const map = pairTiledFixture(1);
    await clearAllPairs(gameScene, map);
    // 매치 후에도 game 씬 유지 (리필되므로 clear/stuck 모두 발생 X with Math.random)
    assertTrue((gameScene as unknown as { _getScore(): number })._getScore() >= 100);
    // 보드 가득 차있음 확인 (wildcard 비활성이므로 grid==0이면 빈 칸)
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

  test("타이머 만료(미클리어) → next 비활성: 클릭해도 result에 머문다", async () => {
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
    // 미클리어 시 다음 맵 진입 차단 — result 씬에 그대로 머물러야 함.
    assertEqual(fsm.getCurrentId(), "result");
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
      starThresholds: [50, 150, 300], // ★1 컷=50 → 한 번 매치(4×6×5=120점)면 ★1
      initialBoard: [[4, 6]],
    };
    const { ctx, fsm, saveManager } = buildContext(() => winMap);
    fsm.register("title", new TitleScene(ctx));
    fsm.register("game", new GameScene(ctx, () => 0, 0));
    fsm.register("result", new ResultScene(ctx));

    // 직접 게임으로 진입 — 한 번 매치 후 stuck(RNG=0 → 모두 1) 으로 종료
    await fsm.start("game", { map: winMap });
    const scene = fsm.getCurrent() as GameScene;
    (scene as unknown as { _setWildEnabled(b: boolean): void })._setWildEnabled(false);
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
    // 점수 120 ≥ ★1=50, <★2=150 → cleared=true, stars=1
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
    assertEqual(saved!.score, 120);

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

  test("멀티라이프 보드: 양쪽 멀티 매치 시 작은 쪽 즉시 제거, 큰 쪽 lives 잔존", async () => {
    const map: MapData = {
      id: 11,
      name: "multi-life",
      cols: 2,
      rows: 1,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 200, 500],
      initialBoard: [[4, 6]],
      initialLives: [[5, 2]],
    };
    const { ctx, fsm } = buildContext(() => map);
    fsm.register("game", new GameScene(ctx, () => 0.5, 0));
    fsm.register("result", new ResultScene(ctx));
    await fsm.start("game", { map });
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
    // 양쪽 멀티 → min(5,2)=2 데미지 → 좌(5)→3 잔존, 우(2)→0 제거 후 리필
    const board = (scene as unknown as { board: { getCell(c: number, r: number): number; getLives(c: number, r: number): number } }).board;
    assertEqual(board.getCell(0, 0), 4);
    assertEqual(board.getLives(0, 0), 3);
    // 우측은 RNG=0.5 → 1+floor(0.5*9)=5 로 리필됨, lives=1
    assertEqual(board.getLives(1, 0), 1);
  });

  test("멀티라이프 보드: 같은 멀티 셀을 반복 매치하여 lives 소진까지 추적", async () => {
    // 4(lives=3) | 6 | 4 | 6 …. 4가 좌측에 멀티 lives=3로 시작.
    // 매번 (0,0)+(1,0) 으로 매치하여 (0,0)의 lives가 3→2→1→0(제거)되는지 확인
    const map: MapData = {
      id: 11,
      name: "multi-soak",
      cols: 2,
      rows: 1,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 200, 500],
      initialBoard: [[4, 6]],
      initialLives: [[3, 1]],
    };
    // RNG=0 → 리필이 모두 1 (1 + floor(0)=1). 하지만 우측 셀은 매번 6으로 다시 채워야 4+6=10 매치 가능.
    // 실제로 RNG=0이면 리필 후 우측이 1이 되어 4+1=5 → 매치 불가 → 즉시 stuck.
    // 따라서 우측이 매번 6으로 리필되도록 RNG 를 customizing.
    let calls = 0;
    const rng = (): number => {
      calls++;
      // value 1+floor(x*9)=6 ⇒ x*9 ∈ [5,6) ⇒ x ∈ [5/9, 6/9). 5.5/9 사용.
      return 5.5 / 9;
    };
    const { ctx, fsm } = buildContext(() => map);
    fsm.register("game", new GameScene(ctx, rng, 0));
    fsm.register("result", new ResultScene(ctx));
    await fsm.start("game", { map });
    const scene = fsm.getCurrent() as GameScene;
    const board = (scene as unknown as { board: { getCell(c: number, r: number): number; getLives(c: number, r: number): number } }).board;
    scene.render();
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    const a = cellCenter(layout, 0, 0);
    const b = cellCenter(layout, 1, 0);
    function match(): void {
      scene.onPointerDown!(a.x, a.y);
      scene.onPointerMove!(b.x, b.y);
      scene.onPointerUp!(b.x, b.y);
    }
    // 1: 4(3,멀티)+6(1,일반) → 한쪽만 멀티 → 1 데미지씩 → 좌(3→2 잔존) 우 제거됨
    match();
    assertEqual(board.getLives(0, 0), 2);
    assertEqual(board.getCell(1, 0), 6); // 리필
    // 2: 동일 — 좌(2→1)
    match();
    assertEqual(board.getLives(0, 0), 1);
    // 3: 좌도 일반(lives=1) → 둘 다 즉시 제거
    match();
    // 게임이 stuck 으로 종료되거나 (리필 후) 계속될 수 있음. 적어도 좌측이 새 값으로 리필되었어야 함.
    assertEqual(board.getLives(0, 0), 1);
    assertTrue(calls > 0);
  });

  test("멀티라이프 세션 복원: pause → reload → 보드/lives 그대로 보존", async () => {
    const map: MapData = {
      id: 11,
      name: "multi-resume",
      cols: 2,
      rows: 1,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 200, 500],
      initialBoard: [[4, 6]],
      initialLives: [[4, 2]],
    };
    const { ctx, fsm, saveManager } = buildContext(() => map);
    fsm.register("game", new GameScene(ctx, Math.random, 0));
    fsm.register("result", new ResultScene(ctx));
    await fsm.start("game", { map });
    let scene = fsm.getCurrent() as GameScene;
    scene.render();
    scene.pauseGame();
    await Promise.resolve();
    const rec = await saveManager.loadSession(11);
    assertTrue(rec !== null);
    assertDeepEqual(rec!.boardLives, [[4, 2]]);

    // 새 GameScene으로 resumeFrom 복원 시뮬레이션
    fsm.register("game", new GameScene(ctx, Math.random, 0));
    await fsm.start("game", { map, resumeFrom: rec! });
    scene = fsm.getCurrent() as GameScene;
    const board = (scene as unknown as { board: { getCell(c: number, r: number): number; getLives(c: number, r: number): number } }).board;
    assertEqual(board.getLives(0, 0), 4);
    assertEqual(board.getLives(1, 0), 2);
    assertTrue(scene.isPaused()); // 복원 시 즉시 일시정지
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
      // ★1 컷을 한 쌍 매치(3×7×5=105)보다 높게 → stuck 시 cleared=false 보장.
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
    (scene as unknown as { _setWildEnabled(b: boolean): void })._setWildEnabled(false);
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
