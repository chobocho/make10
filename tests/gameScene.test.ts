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
    initialBoard: [[4, 6]],
  };
}

describe("GameScene", () => {
  test("enter: 기본 상태 초기화 (점수 0, 미종료)", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context);
    await scene.enter({ map: tinyMap() });
    assertEqual(scene._getScore(), 0);
    assertFalse(scene._isEnded());
  });

  test("보드 클릭(down) 후 인접 셀 드래그(move) → up: 합 10 제거 & 클리어", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls, transitions } = makeCtx(r);
    const scene = new GameScene(context);
    await scene.enter({ map: tinyMap() });
    scene.render(); // 레이아웃 반영
    // 보드 레이아웃상 두 셀의 중심 좌표로 드래그
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const cx1 = layout.originX + layout.cellSize / 2;
    const cx2 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx1, cy);
    scene.onPointerMove!(cx2, cy);
    scene.onPointerUp!(cx2, cy);
    assertTrue(audioCalls.includes("remove"));
    assertTrue(scene._isEnded());
    const last = transitions[transitions.length - 1];
    assertEqual(last.next, "result");
    const res = last.args as GameResult;
    assertTrue(res.cleared);
    // 점수: 100 (pair) + 남은 초 * 10 = clear 보너스 포함
    assertTrue(res.score >= 100);
  });

  test("타이머 만료 → gameover 전환", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls, transitions } = makeCtx(r);
    const scene = new GameScene(context);
    await scene.enter({ map: { ...tinyMap(), timeLimit: 1 } });
    scene.update(2000);
    assertTrue(scene._isEnded());
    assertTrue(audioCalls.includes("gameover"));
    assertEqual(transitions[transitions.length - 1].next, "result");
    const res = transitions[transitions.length - 1].args as GameResult;
    assertFalse(res.cleared);
  });

  test("힌트 버튼 press + release 시에만 힌트 재생", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context);
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
    const scene = new GameScene(context);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const btn = (scene as unknown as {
      uiLayout: { hintButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.hintButton;
    scene.onPointerDown!(btn.x + 1, btn.y + 1);
    scene.onPointerUp!(-10, -10);
    assertFalse(audioCalls.includes("hint"));
  });

  test("쌍 제거 후 중력: 위 행의 셀들이 아래로 내려옴", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context);
    const map: MapData = {
      id: 1,
      name: "gravity-test",
      cols: 2,
      rows: 3,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      initialBoard: [
        [1, 9],
        [2, 8],
        [3, 7],
      ],
    };
    await scene.enter({ map });
    scene.render();
    // 맨 위 행 (1,9) 제거
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 중력 적용 후 맨 위 행은 비어있고 원래 row1, row2 가 아래로 내려와야 함
    const board = (scene as unknown as { board: { snapshot(): number[][] } }).board;
    const snap = board.snapshot();
    assertEqual(snap[0][0], 0);
    assertEqual(snap[0][1], 0);
    assertEqual(snap[1][0], 2);
    assertEqual(snap[1][1], 8);
    assertEqual(snap[2][0], 3);
    assertEqual(snap[2][1], 7);
  });

  test("유효 조합 소진 시 stuck reason으로 종료", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    const scene = new GameScene(context);
    // (3,7) 쌍 제거 후 남는 (1,1)은 합=2라 조합 없음
    await scene.enter({
      map: {
        id: 1,
        name: "stuck",
        cols: 2,
        rows: 2,
        timeLimit: 60,
        hintCount: 0,
        targetScore: 0,
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
    const scene = new GameScene(context);
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
