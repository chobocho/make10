/**
 * GameApp — 브라우저 실행 진입점. Canvas 초기화·게임 루프·씬 FSM 배선을 담당.
 *
 * 60 FPS 고정 requestAnimationFrame 기반 루프 (CLAUDE.md §5-3).
 * dt는 실제 경과 밀리초로 산출되며, 백그라운드 탭에서 값이 커지는 것을 방지해 상한선을 둔다.
 */
import { CanvasRenderer } from "../renderer/CanvasRenderer";
import { AudioManager } from "../audio/AudioManager";
import { createDefaultSaveManager, SaveManager } from "../storage/SaveManager";
import { PointerInput } from "../input/PointerInput";
import { FSM } from "./FSM";
import { TitleScene } from "../scenes/TitleScene";
import { GameScene } from "../scenes/GameScene";
import { ResultScene } from "../scenes/ResultScene";
import type { SceneContext } from "../scenes/Scene";
import { loadMap, MapData } from "../data/MapLoader";

const DT_MAX_MS = 100;

export interface GameAppOptions {
  readonly canvas: HTMLCanvasElement;
  readonly window?: Window;
  readonly maxMapId?: number;
  readonly loadMap?: (mapId: number) => Promise<MapData>;
  readonly saveManager?: SaveManager;
}

export class GameApp {
  private readonly renderer: CanvasRenderer;
  private readonly audio: AudioManager;
  private readonly saveManager: SaveManager;
  private readonly pointer: PointerInput;
  private readonly fsm: FSM;
  private readonly maxMapId: number;
  private readonly loadMapFn: (mapId: number) => Promise<MapData>;
  private readonly win: Window;
  private rafId: number;
  private lastTs: number;
  private running: boolean;

  constructor(options: GameAppOptions) {
    this.win = options.window ?? window;
    this.renderer = new CanvasRenderer(options.canvas);
    this.audio = new AudioManager();
    this.saveManager = options.saveManager ?? createDefaultSaveManager();
    this.maxMapId = options.maxMapId ?? 10;
    this.loadMapFn = options.loadMap ?? ((id) => loadMap(id));
    this.fsm = new FSM();
    this.pointer = new PointerInput(options.canvas, {
      onDown: (x, y) => {
        this.audio.ensureReady();
        this.fsm.onPointerDown(x, y);
      },
      onMove: (x, y) => this.fsm.onPointerMove(x, y),
      onUp: (x, y) => this.fsm.onPointerUp(x, y),
      onCancel: () => this.fsm.onPointerCancel(),
    });
    this.rafId = 0;
    this.lastTs = 0;
    this.running = false;
  }

  async start(): Promise<void> {
    this.renderer.attachToWindow(this.win);
    this.pointer.attach();
    const context: SceneContext = {
      renderer: this.renderer,
      audio: this.audio,
      saveManager: this.saveManager,
      transition: (next, args) => {
        void this.fsm.transition(next, args);
      },
      loadMap: this.loadMapFn,
      maxMapId: this.maxMapId,
    };
    this.fsm.register("title", new TitleScene(context));
    this.fsm.register("game", new GameScene(context));
    this.fsm.register("result", new ResultScene(context));
    // 진행 중 세션이 남아 있으면 곧장 일시정지된 게임 씬으로 진입한다
    // (탭/브라우저 종료 후 재진입 시 이어하기/다시하기/메인 팝업이 보이게).
    const resumed = await this.tryResumeSession();
    if (!resumed) await this.fsm.start("title");
    this.running = true;
    this.lastTs = (this.win.performance?.now?.() ?? Date.now());
    this.loop();
  }

  /**
   * 가장 최근 세션을 조회해 해당 맵을 로드한 뒤 GameScene을 paused 상태로 시작한다.
   * 세션 없음/맵 로드 실패 시 false 를 반환해 호출자가 타이틀로 폴백하도록 한다.
   */
  private async tryResumeSession(): Promise<boolean> {
    try {
      const sessions = await this.saveManager.listSessions();
      const latest = sessions[0];
      if (!latest) return false;
      const map = await this.loadMapFn(latest.mapId);
      await this.fsm.start("game", { map, resumeFrom: latest });
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId && typeof this.win.cancelAnimationFrame === "function") {
      this.win.cancelAnimationFrame(this.rafId);
    }
    this.pointer.detach();
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = this.win.performance?.now?.() ?? Date.now();
    let dt = now - this.lastTs;
    this.lastTs = now;
    if (dt > DT_MAX_MS) dt = DT_MAX_MS;
    if (dt < 0) dt = 0;
    this.fsm.update(dt);
    this.fsm.render();
    this.rafId = this.win.requestAnimationFrame(this.loop);
  };
}
