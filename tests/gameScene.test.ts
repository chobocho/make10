import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
} from "./runner";

// assertFalse는 아래에서 사용된다.
void assertFalse;
import { GameScene, GameResult } from "../src/scenes/GameScene";
import type { SceneContext, SceneId } from "../src/scenes/Scene";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";
import { AudioManager, SoundName } from "../src/audio/AudioManager";
import { SaveManager, MemoryProgressStore } from "../src/storage/SaveManager";
import type { MapData } from "../src/data/MapLoader";

function makeFakeRenderer(width = 480, height = 800): CanvasRenderer {
  const gradient = { addColorStop() {} };
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "top",
    fillRect() {},
    clearRect() {},
    fillText() {},
    setTransform() {},
    save() {},
    restore() {},
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    createLinearGradient: () => gradient,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  const r = new CanvasRenderer(canvas);
  r.resize(width, height, 1);
  return r;
}

function makeCtx(renderer: CanvasRenderer): {
  context: SceneContext;
  audioCalls: SoundName[];
  transitions: Array<{ next: SceneId; args: unknown }>;
} {
  const audioCalls: SoundName[] = [];
  const audio = new AudioManager({ ctxCtor: null });
  (audio as unknown as { play: (n: SoundName) => void }).play = (n: SoundName) => {
    audioCalls.push(n);
  };
  const transitions: Array<{ next: SceneId; args: unknown }> = [];
  const context: SceneContext = {
    renderer,
    audio,
    saveManager: new SaveManager(new MemoryProgressStore()),
    transition: (next, args) => transitions.push({ next, args }),
    loadMap: async () => {
      throw new Error("not used");
    },
    maxMapId: 10,
  };
  return { context, audioCalls, transitions };
}

function tinyMap(): MapData {
  return {
    id: 99,
    name: "t",
    cols: 2,
    rows: 1,
    timeLimit: 5,
    hintCount: 1,
    targetScore: 0,
    starThresholds: [50, 150, 300],
    initialBoard: [[4, 6]],
  };
}

describe("GameScene", () => {
  test("enter: 기본 상태 초기화 (점수 0, 미종료)", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    assertEqual(scene._getScore(), 0);
    assertFalse(scene._isEnded());
  });

  test("인트로 오버레이: 기본은 표시됨, 탭하면 해제되고 타이머 시작", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: tinyMap() });
    assertTrue(scene._isInIntro());
    // 탭해서 인트로 해제
    scene.onPointerDown!(100, 100);
    assertFalse(scene._isInIntro());
    // 이 시점에서 timer.running === true 여야 함
    const timer = (scene as unknown as { timer: { isRunning(): boolean } }).timer;
    assertTrue(timer.isRunning());
  });

  test("인트로 중 update: 시간 경과 시 자동 해제, 타이머 시작", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 1000);
    await scene.enter({ map: tinyMap() });
    scene.update(500);
    assertTrue(scene._isInIntro());
    scene.update(600);
    assertFalse(scene._isInIntro());
    const timer = (scene as unknown as { timer: { isRunning(): boolean } }).timer;
    assertTrue(timer.isRunning());
  });

  test("인트로 중 보드 선택 불가", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 5000);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const bx = layout.originX + layout.cellSize / 2;
    const by = layout.originY + layout.cellSize / 2;
    // 인트로 상태에서 down → 인트로만 해제, select 사운드 없음
    scene.onPointerDown!(bx, by);
    assertFalse(audioCalls.includes("select"));
  });

  test("종료 시 GameResult 에 stars + starThresholds 포함", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        starThresholds: [50, 150, 300],
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 2x1 + 모두 1 리필 → stuck, 점수 100 → ★★ (≥150 아님, ≥50 맞음 → ★1)
    const res = transitions[transitions.length - 1].args as GameResult;
    assertEqual(res.stars, 1);
    assertTrue(res.cleared);
    assertEqual(res.starThresholds[0], 50);
  });

  test("합 10 드래그 → remove 사운드 + 점수 +100 + 보드 리필로 가득 유지", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    // RNG=0 → 리필 값은 모두 1 (2x1 맵에서는 1+1=2라 유효 조합 없음 → stuck)
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const cx1 = layout.originX + layout.cellSize / 2;
    const cx2 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx1, cy);
    scene.onPointerMove!(cx2, cy);
    scene.onPointerUp!(cx2, cy);
    assertTrue(audioCalls.includes("remove"));
    // 점수 반영
    assertTrue(scene._getScore() >= 100);
    // 보드는 리필되어 여전히 꽉참 (빈 칸 0이 없음)
    const snap = (scene as unknown as { board: { snapshot(): number[][] } }).board.snapshot();
    for (const row of snap) for (const v of row) assertTrue(v !== 0);
  });

  test("타이머 만료 → gameover 전환", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls, transitions } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: { ...tinyMap(), timeLimit: 1 } });
    scene.update(2000);
    assertTrue(scene._isEnded());
    assertTrue(audioCalls.includes("gameover"));
    assertEqual(transitions[transitions.length - 1].next, "result");
    const res = transitions[transitions.length - 1].args as GameResult;
    assertFalse(res.cleared);
  });

  test("일시정지 버튼: press+release 로 pause, 다시 눌러 resume", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const pauseBtn = (scene as unknown as {
      uiLayout: { pauseButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.pauseButton;
    const cx = pauseBtn.x + pauseBtn.width / 2;
    const cy = pauseBtn.y + pauseBtn.height / 2;
    scene.onPointerDown!(cx, cy);
    scene.onPointerUp!(cx, cy);
    assertTrue(scene.isPaused());
    assertTrue(audioCalls.includes("button"));
    // 다시 누르면 resume
    scene.onPointerDown!(cx, cy);
    scene.onPointerUp!(cx, cy);
    assertFalse(scene.isPaused());
  });

  test("일시정지 중: timer.tick / hint.tick 무시", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: { ...tinyMap(), timeLimit: 10 } });
    scene.render();
    scene.pauseGame();
    const timer = (scene as unknown as { timer: { getRemainingMs(): number } }).timer;
    const before = timer.getRemainingMs();
    scene.update(2000);
    assertEqual(timer.getRemainingMs(), before);
  });

  test("일시정지 중 보드 탭 → 재개", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    assertTrue(scene.isPaused());
    // 보드 영역 탭
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    scene.onPointerDown!(
      layout.originX + layout.cellSize / 2,
      layout.originY + layout.cellSize / 2,
    );
    assertFalse(scene.isPaused());
  });

  test("일시정지 중에는 힌트 버튼 입력 무시", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    const hintBtn = (scene as unknown as {
      uiLayout: { hintButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.hintButton;
    scene.onPointerDown!(
      hintBtn.x + hintBtn.width / 2,
      hintBtn.y + hintBtn.height / 2,
    );
    scene.onPointerUp!(
      hintBtn.x + hintBtn.width / 2,
      hintBtn.y + hintBtn.height / 2,
    );
    assertFalse(audioCalls.includes("hint"));
  });

  test("인트로 중에는 pauseGame 요청 무시", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 5000);
    await scene.enter({ map: tinyMap() });
    scene.pauseGame();
    assertFalse(scene.isPaused());
  });

  test("힌트 버튼 press + release 시에만 힌트 재생", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const btn = (scene as unknown as {
      uiLayout: { hintButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.hintButton;
    const cx = btn.x + btn.width / 2;
    const cy = btn.y + btn.height / 2;
    scene.onPointerDown!(cx, cy);
    assertFalse(audioCalls.includes("hint"));
    scene.onPointerUp!(cx, cy);
    assertTrue(audioCalls.includes("hint"));
  });

  test("힌트 버튼 press 후 밖에서 release → 힌트 미발사", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const btn = (scene as unknown as {
      uiLayout: { hintButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.hintButton;
    scene.onPointerDown!(btn.x + 1, btn.y + 1);
    scene.onPointerUp!(-10, -10);
    assertFalse(audioCalls.includes("hint"));
  });

  test("쌍 제거 후 중력 + 리필: 빈 자리가 새 블럭으로 채워져 보드 가득 유지", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    // RNG=0 → 리필은 1로 채움 (1 + floor(0*9) = 1).
    const scene = new GameScene(context, () => 0, 0);
    const map: MapData = {
      id: 1,
      name: "gravity-test",
      cols: 2,
      rows: 3,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [100, 500, 1000],
      initialBoard: [
        [1, 9],
        [2, 8],
        [3, 7],
      ],
    };
    await scene.enter({ map });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 원본 row1/row2 는 유지, 맨 위는 리필(1)로 채워짐
    const board = (scene as unknown as { board: { snapshot(): number[][] } }).board;
    const snap = board.snapshot();
    assertEqual(snap[0][0], 1);
    assertEqual(snap[0][1], 1);
    assertEqual(snap[1][0], 2);
    assertEqual(snap[1][1], 8);
    assertEqual(snap[2][0], 3);
    assertEqual(snap[2][1], 7);
  });

  test("리필 후에도 유효 조합 소진 시 stuck reason으로 종료", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    // RNG=0 → 리필 값이 모두 1. 2x2 보드에서 모두 1이면 합=10 조합 없음.
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: {
        id: 1,
        name: "stuck",
        cols: 2,
        rows: 2,
        timeLimit: 60,
        hintCount: 0,
        targetScore: 0,
        // ★1 임계값을 한 번의 쌍 제거 점수(100)보다 높게 → stuck 시 cleared=false 예측 가능.
        starThresholds: [200, 500, 1000],
        initialBoard: [
          [3, 7],
          [1, 1],
        ],
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    assertTrue(scene._isEnded());
    const res = transitions[transitions.length - 1].args as GameResult;
    assertEqual(res.reason, "stuck");
    assertFalse(res.cleared);
  });

  test("무효 선택 시 invalid 사운드", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        initialBoard: [[1, 2]], // 합 3, 무효
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const cx1 = layout.originX + layout.cellSize / 2;
    const cx2 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx1, cy);
    scene.onPointerMove!(cx2, cy);
    scene.onPointerUp!(cx2, cy);
    assertTrue(audioCalls.includes("invalid"));
    assertFalse(scene._isEnded());
  });
});
