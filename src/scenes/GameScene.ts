/**
 * GameScene — 메인 게임 씬. Board/Selector/Timer/Hint + 입력/렌더링을 엮는다.
 *
 * 라이프사이클: enter(map) → update/render 루프 → endGame → transition('result').
 */
import type { Scene, SceneContext } from "./Scene";
import type { MapData } from "../data/MapLoader";
import { Board } from "../game/Board";
import { Selector } from "../game/Selector";
import { Timer } from "../game/Timer";
import { Hint, findValidCombination } from "../game/Hint";
import { computeStars, starsString } from "../game/Scoring";
import {
  BoardRenderer,
  computeBoardLayout,
  hitTestCell,
} from "../renderer/BoardRenderer";
import { EffectLayer } from "../renderer/EffectLayer";
import {
  UIRenderer,
  computeUILayout,
  isHintButtonHit,
  isPauseButtonHit,
  UILayout,
} from "../renderer/UIRenderer";
import {
  computePauseMenuLayout,
  hitButton,
  ButtonRect,
} from "./SceneLayout";
import type { ProgressRecord } from "../storage/SaveManager";
import { TutorialOverlay } from "./TutorialOverlay";

export interface GameSceneArgs {
  readonly map: MapData;
  /**
   * 진행 중 세션에서 복원할 때 전달. 보드/점수/타이머/힌트 잔량을 그대로 복원하고
   * 인트로를 건너뛴 뒤 즉시 일시정지 오버레이를 띄운다.
   */
  readonly resumeFrom?: ProgressRecord;
}

export type GameEndReason = "cleared" | "timeup" | "stuck";

export interface GameResult {
  readonly mapId: number;
  readonly mapName: string;
  /** `stars >= 1` 과 동일 — 기준점수(★1) 달성 여부. */
  readonly cleared: boolean;
  readonly score: number;
  readonly stars: number;
  readonly timeLeft: number;
  readonly reason: GameEndReason;
  readonly starThresholds: readonly [number, number, number];
}

/** 매치 점수 = 셀 값들의 곱 × 셀 개수별 배수. 만능(?)은 WILD_VALUE 로 환산. */
const SCORE_PAIR_MULT = 5;
const SCORE_TRIPLE_MULT = 12;
/** 만능(?) 블럭의 점수 환산 값 — 매치 시 곱셈에 5 로 참여 (1~9 의 기대값). */
const WILD_VALUE = 5;
const DEFAULT_INTRO_MS = 2500;
/** 연쇄(chain) 인정 윈도우 — 직전 매치로부터 이 시간 안에 다음 매치를 성공시키면 연쇄. */
const CHAIN_WINDOW_MS = 1000;
/** 연쇄 단계당 추가 보너스. 첫 연쇄(depth=2)는 +50, 다음은 +100, ..., 캡 적용. */
const CHAIN_BONUS_STEP = 50;
const CHAIN_BONUS_CAP = 250;
/** 만능(?) 블럭 자동 스폰 — 매 [MIN, MAX] 사이 랜덤 인터벌마다 1개. */
const WILD_SPAWN_MIN_MS = 12_000;
const WILD_SPAWN_MAX_MS = 25_000;
/** 보드에 동시에 존재할 수 있는 만능 블럭 최대 개수 — 게임이 너무 쉬워지지 않도록. */
const WILD_MAX_ON_BOARD = 3;
/** 보너스(×2) 블럭 자동 스폰 — 매 [MIN, MAX] 사이 랜덤 인터벌마다 1개. */
const BONUS_SPAWN_MIN_MS = 10_000;
const BONUS_SPAWN_MAX_MS = 12_000;
/** 스폰된 보너스 블럭이 만료되기까지의 윈도우 — [MIN, MAX]. 이 시간 안에 매치해야 ×2. */
const BONUS_WINDOW_MIN_MS = 2_000;
const BONUS_WINDOW_MAX_MS = 5_000;
/** 보너스 매치 시 점수 배수. */
const BONUS_MULTIPLIER = 2;

export class GameScene implements Scene {
  private readonly context: SceneContext;
  private readonly boardRenderer: BoardRenderer;
  private readonly uiRenderer: UIRenderer;
  private readonly randomFn: () => number;
  private readonly introDurationMs: number;

  private map: MapData | null;
  private board: Board | null;
  private selector: Selector | null;
  private timer: Timer | null;
  private hint: Hint | null;
  private uiLayout: UILayout;
  private score: number;
  private ended: boolean;
  private pressedHintBtn: boolean;
  private pressedPauseBtn: boolean;
  private pressedPauseMenuBtn: "resume" | "restart" | "exit" | null;
  private introMsLeft: number;
  private paused: boolean;
  private pauseMenuLayout: ReturnType<typeof computePauseMenuLayout> | null;
  /** 1판 첫 진입 시 노출되는 인터랙티브 튜토리얼. 비활성 상태 = isActive() false. */
  private readonly tutorial: TutorialOverlay;
  /** 매치/제거 시각 이펙트 레이어 (파티클·점수 팝업·링). */
  private readonly effects: EffectLayer;
  /** 일시정지 중에는 멈추는 단조 증가 시계 — 연쇄 윈도우 판정에 사용. */
  private elapsedMs: number;
  /** 마지막 매치 성공 시점(elapsedMs 단위). -Infinity 면 매치 없음. */
  private lastMatchAtMs: number;
  /** 현재 연쇄 길이. 0=매치 없음, 1=단발, 2+=연쇄. */
  private chainCount: number;
  /** 다음 자동 만능(?) 스폰까지 남은 시간(ms). 0 도달 시 스폰 후 다시 랜덤 인터벌로 리셋. */
  private nextWildSpawnMs: number;
  /** 만능 메커니즘(자동 스폰 + stuck 회복) 전체 토글. 테스트가 결정적 흐름을 위해 끌 수 있다. */
  private wildEnabled: boolean;
  /** 다음 자동 보너스(×2) 스폰까지 남은 시간(ms). */
  private nextBonusSpawnMs: number;
  /** 현재 활성 보너스 셀 위치 + 만료 시각(elapsedMs 단위). 한 번에 1개만 활성. */
  private bonusCell: { col: number; row: number; expireAtMs: number } | null;
  /** 보너스 메커니즘 토글 — 테스트 옵트아웃용. */
  private bonusEnabled: boolean;

  constructor(
    context: SceneContext,
    randomFn: () => number = Math.random,
    introDurationMs: number = DEFAULT_INTRO_MS,
  ) {
    this.context = context;
    this.boardRenderer = new BoardRenderer(context.renderer);
    this.uiRenderer = new UIRenderer(context.renderer);
    this.randomFn = randomFn;
    this.introDurationMs = Math.max(0, introDurationMs);
    this.map = null;
    this.board = null;
    this.selector = null;
    this.timer = null;
    this.hint = null;
    this.uiLayout = computeUILayout(1, 1);
    this.score = 0;
    this.ended = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
    this.introMsLeft = 0;
    this.paused = false;
    this.pauseMenuLayout = null;
    this.tutorial = new TutorialOverlay(context.renderer);
    this.effects = new EffectLayer(this.randomFn);
    this.elapsedMs = 0;
    this.lastMatchAtMs = Number.NEGATIVE_INFINITY;
    this.chainCount = 0;
    this.nextWildSpawnMs = 0;
    this.wildEnabled = true;
    this.nextBonusSpawnMs = 0;
    this.bonusCell = null;
    this.bonusEnabled = true;
  }

  async enter(args?: unknown): Promise<void> {
    const a = args as GameSceneArgs | undefined;
    if (!a?.map) throw new Error("GameScene.enter: map 인자 필요.");
    this.map = a.map;
    // 신규 진입에서만 ★3 carryover 소비 (세션 복원은 저장된 hintsLeft 우선).
    let extraHints = 0;
    if (!a.resumeFrom) {
      try {
        extraHints = await this.context.saveManager.consumeHintCarryover();
      } catch {
        extraHints = 0;
      }
    }
    this.setupGame(a.resumeFrom, extraHints);
    this.recomputeLayout();
    this.context.renderer.onResize(() => this.recomputeLayout());
    this.attachVisibilityListener();
    // 세션 복원이면 인트로 없이 즉시 일시정지 메뉴 노출 (이어하기 / 다시하기 / 메인).
    if (a.resumeFrom) {
      this.pauseGame();
      return;
    }
    // map id=1 첫 진입(튜토리얼 미완료) 시 튜토리얼 오버레이를 인트로 앞에 노출.
    if (a.map.id === 1) {
      const done = await this.context.saveManager.isTutorialDone();
      if (!done) this.tutorial.start();
    }
  }

  /**
   * 현재 `this.map`을 기반으로 게임 상태를 초기화/재초기화한다.
   * `resumeFrom`이 주어지면 해당 스냅샷(보드/점수/남은 시간/남은 힌트)으로 복원한다.
   * `extraHints` 는 ★3 클리어로 누적된 carryover 보너스(첫 진입 시에만 적용).
   * mapId 가 8의 배수면 힌트가 최소 3 이상이 되도록 보충 ("8마다 힌트 채우기").
   */
  private setupGame(resumeFrom?: ProgressRecord, extraHints = 0): void {
    if (!this.map) return;
    const initialBoard = resumeFrom?.boardState ?? this.map.initialBoard;
    const initialLives = resumeFrom?.boardLives ?? this.map.initialLives;
    const initialObstacles =
      resumeFrom?.boardObstacles ?? this.map.initialObstacles;
    const initialWildcards =
      resumeFrom?.boardWildcards ?? this.map.initialWildcards;
    this.board = new Board(
      initialBoard,
      initialLives,
      initialObstacles,
      initialWildcards,
    );
    this.selector = new Selector(this.board);
    this.timer = new Timer(this.map.timeLimit);
    if (resumeFrom) {
      const remainingMs = Math.max(0, resumeFrom.timeLeft) * 1000;
      const elapsedMs = Math.max(0, this.timer.getLimitMs() - remainingMs);
      this.timer.setElapsedMs(elapsedMs);
    }
    let hintCount: number;
    if (resumeFrom) {
      // 세션 복원: 저장된 잔량 그대로 — carryover/8배수 보충 재적용 안 함.
      hintCount = resumeFrom.hintsLeft ?? this.map.hintCount;
    } else {
      // 신규 진입: 맵 기본 + ★3 carryover. 그리고 mapId%8===0이면 최소 3 보장.
      hintCount = this.map.hintCount + Math.max(0, extraHints);
      if (this.map.id % 8 === 0) hintCount = Math.max(hintCount, 3);
    }
    this.hint = new Hint(this.board, hintCount);
    this.score = resumeFrom?.score ?? 0;
    // 연쇄 상태는 세션 복원에도 항상 리셋 — 시간 격차로 인해 의미 없음.
    this.elapsedMs = 0;
    this.lastMatchAtMs = Number.NEGATIVE_INFINITY;
    this.chainCount = 0;
    this.nextWildSpawnMs = this.pickNextWildInterval();
    this.nextBonusSpawnMs = this.pickNextBonusInterval();
    this.bonusCell = null;
    this.ended = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
    this.paused = false;
    this.introMsLeft = resumeFrom ? 0 : this.introDurationMs;
    this.timer.onExpired(() => this.endGame("timeup"));
    // 복원 경로는 caller(`enter`)에서 즉시 pauseGame 으로 전환되므로 여기서 timer.start 호출 안 함.
    if (this.introMsLeft <= 0 && !resumeFrom) this.timer.start();
  }

  private isInIntro(): boolean {
    return this.introMsLeft > 0;
  }

  private dismissIntro(): void {
    if (this.introMsLeft > 0) {
      this.introMsLeft = 0;
      this.timer?.start();
    }
  }

  private isInTutorial(): boolean {
    return this.tutorial.isActive();
  }

  /** 튜토리얼 종료(완료/스킵) 시 1회 호출. 메타 스토어에 완료 기록. */
  private onTutorialFinished(): void {
    void this.context.saveManager.markTutorialDone();
  }

  pauseGame(): void {
    if (this.paused || this.ended || this.isInIntro() || this.isInTutorial()) return;
    this.paused = true;
    this.timer?.pause();
    this.selector?.cancel();
    this.hint?.clear();
    this.pressedHintBtn = false;
    this.computePauseMenu();
    this.persistSaveSession();
  }

  resumeGame(): void {
    if (!this.paused || this.ended) return;
    this.paused = false;
    this.timer?.resume();
    this.pressedPauseMenuBtn = null;
    // 세션은 일부러 유지 — 다시 일시정지/탭전환 시 갱신, 정상 종료 시 endGame에서 삭제.
  }

  /** 현재 맵을 재시작 (점수/보드/타이머 리셋, 인트로 재표시). 진행 중 세션은 폐기. */
  restartMap(): void {
    if (!this.map) return;
    this.persistClearSession(this.map.id);
    this.effects.clear();
    this.setupGame();
  }

  /** 타이틀로 이동. 진행 중 세션은 폐기 (사용자가 명시적으로 나가는 선택). */
  private goToTitle(): void {
    if (this.map) this.persistClearSession(this.map.id);
    this.ended = true; // update()/입력 처리 중단
    this.context.transition("title");
  }

  /** 현재 진행 상태를 세션 스토어에 저장(fire-and-forget). */
  private persistSaveSession(): void {
    if (!this.map || !this.board || !this.timer || !this.hint) return;
    const record: ProgressRecord = {
      mapId: this.map.id,
      boardState: this.board.snapshot(),
      boardLives: this.board.livesSnapshot(),
      boardObstacles: this.board.obstaclesSnapshot().map((row) => row.map((v) => (v ? 1 : 0))),
      boardWildcards: this.board.wildcardsSnapshot().map((row) => row.map((v) => (v ? 1 : 0))),
      boardBonus: this.board.bonusSnapshot().map((row) => row.map((v) => (v ? 1 : 0))),
      score: this.score,
      stars: computeStars(this.score, this.map.starThresholds),
      timeLeft: this.timer.getRemainingSeconds(),
      hintsLeft: this.hint.getRemaining(),
      timestamp: Date.now(),
    };
    void this.context.saveManager.saveSession(record);
  }

  private persistClearSession(mapId: number): void {
    void this.context.saveManager.clearSession(mapId);
  }

  /** 탭/창 전환·홈버튼·화면잠금 등 visibility hidden 시 자동 일시정지. */
  private onVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) this.pauseGame();
  };

  private attachVisibilityListener(): void {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private detachVisibilityListener(): void {
    if (typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private computePauseMenu(): void {
    const size = this.context.renderer.getSize();
    this.pauseMenuLayout = computePauseMenuLayout(
      size.width,
      size.height,
      this.uiLayout.uiHeight,
    );
  }

  isPaused(): boolean {
    return this.paused;
  }

  exit(): void {
    this.detachVisibilityListener();
    this.timer?.pause();
    this.paused = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
    this.effects.clear();
  }

  private recomputeLayout(): void {
    if (!this.map) return;
    const size = this.context.renderer.getSize();
    this.uiLayout = computeUILayout(size.width, size.height);
    const bounds = {
      x: 0,
      y: this.uiLayout.uiHeight,
      width: size.width,
      height: Math.max(0, size.height - this.uiLayout.uiHeight),
    };
    const layout = computeBoardLayout(bounds, this.map.cols, this.map.rows);
    this.boardRenderer.setLayout(layout);
    if (this.paused) this.computePauseMenu();
    if (this.tutorial.isActive()) this.tutorial.recomputeLayout();
  }

  update(deltaMs: number): void {
    if (this.ended) return;
    if (this.isInTutorial()) {
      const r = this.tutorial.update(deltaMs);
      if (r === "completed" || r === "skipped") this.onTutorialFinished();
      return;
    }
    if (this.isInIntro()) {
      this.introMsLeft -= deltaMs;
      if (this.introMsLeft <= 0) {
        this.introMsLeft = 0;
        this.timer?.start();
      }
      return;
    }
    if (this.paused) return;
    this.timer?.tick(deltaMs);
    this.hint?.tick(deltaMs);
    // 일시정지/인트로/튜토리얼 외 활성 시간만 누적 — 연쇄 윈도우가 일시정지로 인해 부풀지 않게.
    this.elapsedMs += deltaMs;
    // 이펙트는 활성 상태에서만 진행 — 매치 직후에도 자연스럽게 흐름.
    this.effects.update(deltaMs);
    // 자동 만능 스폰 타이머.
    if (this.wildEnabled) {
      this.nextWildSpawnMs -= deltaMs;
      if (this.nextWildSpawnMs <= 0) {
        this.trySpawnWildcard();
        this.nextWildSpawnMs = this.pickNextWildInterval();
      }
    }
    // 보너스 스폰 + 만료.
    if (this.bonusEnabled) {
      // 만료 체크 — 활성 보너스가 있고 elapsedMs가 윈도우 종료를 넘으면 해제.
      if (this.bonusCell && this.elapsedMs >= this.bonusCell.expireAtMs) {
        this.expireBonus();
      }
      // 새 스폰 타이머 — 활성 보너스가 없을 때만 카운트다운.
      if (!this.bonusCell) {
        this.nextBonusSpawnMs -= deltaMs;
        if (this.nextBonusSpawnMs <= 0) {
          this.trySpawnBonus();
          this.nextBonusSpawnMs = this.pickNextBonusInterval();
        }
      }
    }
  }

  private pickNextBonusInterval(): number {
    return BONUS_SPAWN_MIN_MS + this.randomFn() * (BONUS_SPAWN_MAX_MS - BONUS_SPAWN_MIN_MS);
  }

  private pickBonusWindow(): number {
    return BONUS_WINDOW_MIN_MS + this.randomFn() * (BONUS_WINDOW_MAX_MS - BONUS_WINDOW_MIN_MS);
  }

  /**
   * 보너스 블럭 스폰 — 일반 숫자 셀(grid>0, 비-장애물·비-만능·비-보너스) 중 임의 선택.
   * 활성 보너스가 이미 존재하면 무시(한 번에 1개).
   * @returns 스폰 성공 여부.
   */
  private trySpawnBonus(): boolean {
    if (!this.board) return false;
    if (this.bonusCell) return false;
    const candidates: Array<readonly [number, number]> = [];
    for (let r = 0; r < this.board.getRows(); r++) {
      for (let c = 0; c < this.board.getCols(); c++) {
        if (this.board.isObstacle(c, r)) continue;
        if (this.board.isWildcard(c, r)) continue;
        if (this.board.isBonus(c, r)) continue;
        if (this.board.isEmpty(c, r)) continue;
        candidates.push([c, r] as const);
      }
    }
    if (candidates.length === 0) return false;
    const idx = Math.floor(this.randomFn() * candidates.length);
    const [c, r] = candidates[idx];
    if (!this.board.markBonus(c, r)) return false;
    this.bonusCell = {
      col: c,
      row: r,
      expireAtMs: this.elapsedMs + this.pickBonusWindow(),
    };
    this.effects.spawnBonusEntrance(c, r, this.boardRenderer.getLayout());
    this.context.audio.play("bonus");
    return true;
  }

  /** 만료: 보너스 플래그 해제. 셀 자체는 일반 셀로 남는다. 시각 피드백은 생략(은은하게). */
  private expireBonus(): void {
    if (!this.bonusCell || !this.board) {
      this.bonusCell = null;
      return;
    }
    const { col, row } = this.bonusCell;
    this.board.unmarkBonus(col, row);
    this.bonusCell = null;
  }

  /**
   * 중력 적용 후 bonusCell 추적 — bonus 플래그가 다른 좌표로 이동했을 수 있음.
   * 보드 전체에서 bonus 플래그를 가진 셀을 찾아 bonusCell 좌표 업데이트.
   * 플래그가 사라졌다면(파괴됨) bonusCell = null.
   */
  private syncBonusCellAfterMutation(): void {
    if (!this.bonusCell || !this.board) return;
    let found: { col: number; row: number } | null = null;
    outer: for (let r = 0; r < this.board.getRows(); r++) {
      for (let c = 0; c < this.board.getCols(); c++) {
        if (this.board.isBonus(c, r)) {
          found = { col: c, row: r };
          break outer;
        }
      }
    }
    if (!found) {
      this.bonusCell = null;
    } else {
      this.bonusCell = {
        col: found.col,
        row: found.row,
        expireAtMs: this.bonusCell.expireAtMs,
      };
    }
  }

  private pickNextWildInterval(): number {
    const span = WILD_SPAWN_MAX_MS - WILD_SPAWN_MIN_MS;
    return WILD_SPAWN_MIN_MS + this.randomFn() * span;
  }

  /**
   * 보드의 임의 셀(비-장애물·비-만능·비-빈칸)을 만능(?) 블럭으로 변환.
   * 캡(WILD_MAX_ON_BOARD) 도달 시 또는 후보가 없으면 무시.
   * @returns 변환에 성공했으면 true.
   */
  private trySpawnWildcard(): boolean {
    if (!this.board) return false;
    let wildCount = 0;
    const candidates: Array<readonly [number, number]> = [];
    for (let r = 0; r < this.board.getRows(); r++) {
      for (let c = 0; c < this.board.getCols(); c++) {
        if (this.board.isWildcard(c, r)) {
          wildCount++;
          continue;
        }
        if (this.board.isObstacle(c, r)) continue;
        if (this.board.isEmpty(c, r)) continue;
        candidates.push([c, r] as const);
      }
    }
    if (wildCount >= WILD_MAX_ON_BOARD) return false;
    if (candidates.length === 0) return false;
    const idx = Math.floor(this.randomFn() * candidates.length);
    const [c, r] = candidates[idx];
    if (!this.board.convertToWildcard(c, r)) return false;
    this.effects.spawnWildcardEntrance(c, r, this.boardRenderer.getLayout());
    this.context.audio.play("wild");
    return true;
  }

  render(): void {
    const r = this.context.renderer;
    r.clear("#101820");
    if (!this.board || !this.selector || !this.hint || !this.timer || !this.map) return;
    const selection = this.selector.getPositions();
    const invalid =
      selection.length >= 2 && !this.selector.isValidForRemoval();
    this.boardRenderer.draw(this.board, {
      selection,
      invalidSelection: invalid,
      highlight: this.hint.getHighlighted(),
      phaseMs: this.elapsedMs,
    });
    // 이펙트는 보드 위, HUD 아래.
    if (this.effects.hasActive()) {
      this.effects.render(this.context.renderer.getCtx());
    }
    const limitMs = this.timer.getLimitMs();
    const timeProgress =
      limitMs > 0 ? this.timer.getRemainingMs() / limitMs : 0;
    const stars = computeStars(this.score, this.map.starThresholds);
    this.uiRenderer.drawHUD(this.uiLayout, {
      timeProgress,
      score: this.score,
      stars,
      hintsLeft: this.hint.getRemaining(),
      highlighting: this.hint.isHighlighting(),
      paused: this.paused,
    });
    if (this.isInTutorial()) this.tutorial.render();
    else if (this.isInIntro()) this.drawIntroOverlay();
    else if (this.paused) this.drawPauseOverlay();
  }

  private drawPauseOverlay(): void {
    if (!this.pauseMenuLayout) this.computePauseMenu();
    const layout = this.pauseMenuLayout;
    if (!layout) return;
    const ctx = this.context.renderer.getCtx();
    const { width, height } = this.context.renderer.getSize();

    // 반투명 배경 (HUD 제외 영역)
    ctx.fillStyle = "rgba(16, 24, 32, 0.86)";
    ctx.fillRect(0, this.uiLayout.uiHeight, width, height - this.uiLayout.uiHeight);

    // 헤드라인
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e0e6ee";
    ctx.font = `bold ${layout.titleFontPx}px -apple-system, "Segoe UI Emoji", sans-serif`;
    ctx.fillText("⏸ 일시정지", width / 2, layout.titleY);

    // 3개 버튼
    this.drawPauseMenuButton(ctx, layout.resume, "resume", "▶  재개");
    this.drawPauseMenuButton(ctx, layout.restart, "restart", "🔁  다시하기");
    this.drawPauseMenuButton(ctx, layout.exit, "exit", "🏠  메인");
  }

  private drawPauseMenuButton(
    ctx: CanvasRenderingContext2D,
    rect: ButtonRect,
    id: "resume" | "restart" | "exit",
    label: string,
  ): void {
    const pressed = this.pressedPauseMenuBtn === id;
    const bg = pressed ? "#4c566a" : "#3b4252";
    ctx.fillStyle = bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = "#5d6872";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    ctx.fillStyle = "#eceff4";
    const fontPx = Math.round(rect.height * 0.42);
    ctx.font = `600 ${fontPx}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  private hitPauseMenuButton(x: number, y: number): "resume" | "restart" | "exit" | null {
    if (!this.pauseMenuLayout) return null;
    if (hitButton(this.pauseMenuLayout.resume, x, y)) return "resume";
    if (hitButton(this.pauseMenuLayout.restart, x, y)) return "restart";
    if (hitButton(this.pauseMenuLayout.exit, x, y)) return "exit";
    return null;
  }

  private drawIntroOverlay(): void {
    if (!this.map) return;
    const ctx = this.context.renderer.getCtx();
    const { width, height } = this.context.renderer.getSize();
    // 반투명 배경
    ctx.fillStyle = "rgba(16, 24, 32, 0.92)";
    ctx.fillRect(0, 0, width, height);

    const mapTitleFont = Math.round(Math.min(width, height) * 0.06);
    const bodyFont = Math.round(Math.min(width, height) * 0.045);
    const footerFont = Math.round(Math.min(width, height) * 0.032);
    const lineGap = Math.round(bodyFont * 1.6);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cx = width / 2;
    let y = height * 0.28;

    ctx.fillStyle = "#e0e6ee";
    ctx.font = `bold ${mapTitleFont}px -apple-system, sans-serif`;
    ctx.fillText(`맵 ${this.map.id}: ${this.map.name}`, cx, y);

    y += mapTitleFont * 1.2;
    ctx.font = `${footerFont}px -apple-system, sans-serif`;
    ctx.fillStyle = "#a3b3c2";
    ctx.fillText("목표 점수", cx, y);

    y += footerFont * 1.6;
    const [s1, s2, s3] = this.map.starThresholds;
    const starFont = `${bodyFont}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.font = starFont;

    ctx.fillStyle = "#ebcb8b";
    ctx.fillText(`★        ${s1}`, cx, y);
    y += lineGap;
    ctx.fillText(`★ ★       ${s2}`, cx, y);
    y += lineGap;
    ctx.fillText(`★ ★ ★      ${s3}`, cx, y);

    y += lineGap * 1.2;
    ctx.fillStyle = "#7f8ea0";
    ctx.font = `${footerFont}px -apple-system, sans-serif`;
    const remainSec = Math.ceil(this.introMsLeft / 1000);
    ctx.fillText(`화면을 탭하거나 ${remainSec}초 후 시작`, cx, y);
  }

  onPointerDown(x: number, y: number): void {
    if (this.ended || !this.selector || !this.hint) return;
    if (this.isInTutorial()) {
      this.tutorial.onPointerDown(x, y);
      return;
    }
    if (this.isInIntro()) {
      this.dismissIntro();
      return;
    }
    if (y < this.uiLayout.uiHeight) {
      if (isPauseButtonHit(this.uiLayout, x, y)) {
        this.pressedPauseBtn = true;
      } else if (!this.paused && isHintButtonHit(this.uiLayout, x, y)) {
        this.pressedHintBtn = true;
      }
      return;
    }
    if (this.paused) {
      // 일시정지 오버레이의 버튼 영역 press.
      this.pressedPauseMenuBtn = this.hitPauseMenuButton(x, y);
      return;
    }
    const layout = this.boardRenderer.getLayout();
    const p = hitTestCell(layout, x, y);
    if (!p) return;
    if (this.selector.begin(p[0], p[1])) {
      this.context.audio.play("select");
    }
  }

  onPointerMove(x: number, y: number): void {
    if (this.isInTutorial()) {
      this.tutorial.onPointerMove(x, y);
      return;
    }
    if (
      this.ended ||
      this.isInIntro() ||
      this.paused ||
      !this.selector ||
      !this.selector.isActive()
    ) {
      return;
    }
    const layout = this.boardRenderer.getLayout();
    const p = hitTestCell(layout, x, y);
    if (!p) return;
    const changed = this.selector.extend(p[0], p[1]);
    if (changed) this.context.audio.play("select");
  }

  onPointerUp(x: number = Number.NaN, y: number = Number.NaN): void {
    if (this.ended) return;

    if (this.isInTutorial()) {
      const r = this.tutorial.onPointerUp(x, y);
      if (r === "completed" || r === "skipped") this.onTutorialFinished();
      return;
    }

    // 일시정지 버튼 press → release 인 바운스
    if (this.pressedPauseBtn) {
      this.pressedPauseBtn = false;
      const hit = !Number.isFinite(x) || !Number.isFinite(y)
        ? true
        : isPauseButtonHit(this.uiLayout, x, y);
      if (hit) {
        this.context.audio.play("button");
        if (this.paused) this.resumeGame();
        else this.pauseGame();
      }
      return;
    }

    if (this.pressedHintBtn) {
      const pressed = this.pressedHintBtn;
      this.pressedHintBtn = false;
      if (pressed && Number.isFinite(x) && Number.isFinite(y)) {
        if (isHintButtonHit(this.uiLayout, x, y)) {
          this.requestHint();
        }
      } else if (pressed) {
        this.requestHint();
      }
      return;
    }

    // 일시정지 오버레이 버튼 press → release 인 바운스
    if (this.pressedPauseMenuBtn) {
      const btn = this.pressedPauseMenuBtn;
      this.pressedPauseMenuBtn = null;
      if (!Number.isFinite(x) || !Number.isFinite(y) || this.hitPauseMenuButton(x, y) === btn) {
        this.context.audio.play("button");
        if (btn === "resume") this.resumeGame();
        else if (btn === "restart") this.restartMap();
        else if (btn === "exit") this.goToTitle();
      }
      return;
    }

    if (this.paused) return;
    if (!this.selector || !this.board) return;
    const result = this.selector.commit();
    if (result.valid) {
      // 매치 적용 전 보드 좌표/lives/bonus 캡처 → 실제로 lives→0 으로 파괴된 셀과 보너스 적중 판단.
      // 점수 산출도 applyMatch 가 셀 값을 0으로 비우기 전에 미리 계산해 두어야 한다.
      const boardLayout = this.boardRenderer.getLayout();
      const positions = result.positions;
      const preLives: number[] = [];
      let hitBonus = false;
      let product = 1;
      for (const [c, r] of positions) {
        preLives.push(this.board.getLives(c, r));
        if (this.board.isBonus(c, r)) hitBonus = true;
        product *= this.board.isWildcard(c, r) ? WILD_VALUE : this.board.getCell(c, r);
      }
      this.board.applyMatch(positions);
      const destroyed: Array<readonly [number, number]> = [];
      for (let i = 0; i < positions.length; i++) {
        const [c, r] = positions[i];
        if (preLives[i] >= 1 && this.board.getCell(c, r) === 0) {
          destroyed.push([c, r] as const);
        }
      }
      // 연쇄 판정.
      const within = this.elapsedMs - this.lastMatchAtMs <= CHAIN_WINDOW_MS;
      this.chainCount = within ? this.chainCount + 1 : 1;
      this.lastMatchAtMs = this.elapsedMs;
      // 베이스 점수 — 셀 값들의 곱에 매치 크기별 배수. 만능(?)은 WILD_VALUE 로 환산.
      const baseScore =
        product * (positions.length === 2 ? SCORE_PAIR_MULT : SCORE_TRIPLE_MULT);
      const chainBonus =
        this.chainCount >= 2
          ? Math.min(CHAIN_BONUS_CAP, CHAIN_BONUS_STEP * (this.chainCount - 1))
          : 0;
      // 보너스(×2) 적중: 베이스+연쇄 합계에 배수 적용.
      const subtotal = baseScore + chainBonus;
      const total = hitBonus ? subtotal * BONUS_MULTIPLIER : subtotal;
      // 베이스가 동적이므로 항상 scoreOverride 로 실제 점수 표기.
      this.effects.spawnRemoval(destroyed, boardLayout, positions.length === 3 ? "triple" : "pair", {
        chainBonus: chainBonus > 0 ? chainBonus : undefined,
        chainDepth: chainBonus > 0 ? this.chainCount : undefined,
        scoreOverride: total,
        multiplier: hitBonus ? BONUS_MULTIPLIER : undefined,
      });
      this.board.applyGravity();
      this.board.refill(this.randomFn);
      this.hint?.clear();
      // 중력으로 bonusCell 위치가 이동했거나 파괴되어 사라졌을 수 있으므로 동기화.
      this.syncBonusCellAfterMutation();
      this.score += total;
      this.context.audio.play("remove");
      // stuck 구원: 유효 조합이 없으면 만능 블럭을 임의 위치에 스폰해 게임 계속.
      // 만능 변환 후에도 여전히 매치 경로가 없는 극단 상황이면 endGame.
      if (findValidCombination(this.board) === null) {
        if (this.wildEnabled) {
          const spawned = this.trySpawnWildcard();
          if (spawned) this.nextWildSpawnMs = this.pickNextWildInterval();
        }
        if (findValidCombination(this.board) === null) {
          this.endGame("stuck");
        }
      }
    } else if (result.positions.length >= 2) {
      this.context.audio.play("invalid");
    }
  }

  onPointerCancel(): void {
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
    this.tutorial.onPointerCancel();
    this.selector?.cancel();
  }

  private requestHint(): void {
    if (!this.hint) return;
    const combo = this.hint.request();
    if (combo) this.context.audio.play("hint");
    else this.context.audio.play("invalid");
  }

  private endGame(reason: GameEndReason): void {
    if (this.ended || !this.timer || !this.map) return;
    this.ended = true;
    this.persistClearSession(this.map.id);
    this.timer.pause();
    const finalScore = this.score;
    const stars = computeStars(finalScore, this.map.starThresholds);
    const cleared = stars >= 1;
    if (cleared) {
      this.context.audio.play("clear");
    } else {
      this.context.audio.play("gameover");
    }
    const result: GameResult = {
      mapId: this.map.id,
      mapName: this.map.name,
      cleared,
      score: finalScore,
      stars,
      timeLeft: this.timer.getRemainingSeconds(),
      reason,
      starThresholds: this.map.starThresholds,
    };
    this.context.transition("result", result);
  }

  // --- 테스트/디버그용 접근자 ---
  _getScore(): number {
    return this.score;
  }
  _isEnded(): boolean {
    return this.ended;
  }
  _isInIntro(): boolean {
    return this.isInIntro();
  }
  _dismissIntro(): void {
    this.dismissIntro();
  }
  _isCleared(): boolean {
    return this.board?.isCleared() ?? false;
  }
  _isInTutorial(): boolean {
    return this.isInTutorial();
  }
  _getTutorialPhase(): number {
    return this.tutorial._getPhase();
  }
  _getTutorialPhaseKind(): "inactive" | "text" | "practice" {
    return this.tutorial._getPhaseKind();
  }
  _getTutorialFeedback(): string {
    return this.tutorial._getFeedback();
  }
  _getTutorialSkipBtn(): ButtonRect | null {
    return this.tutorial._getSkipBtn();
  }
  _getTutorialBoardLayout(): import("../renderer/BoardRenderer").BoardLayout | null {
    return this.tutorial._getBoardLayout();
  }
  _setWildEnabled(enabled: boolean): void {
    this.wildEnabled = enabled;
    if (!enabled) this.nextWildSpawnMs = Number.POSITIVE_INFINITY;
  }
  _trySpawnWildcard(): boolean {
    return this.trySpawnWildcard();
  }
  _getNextWildSpawnMs(): number {
    return this.nextWildSpawnMs;
  }
  _setBonusEnabled(enabled: boolean): void {
    this.bonusEnabled = enabled;
    if (!enabled) {
      this.nextBonusSpawnMs = Number.POSITIVE_INFINITY;
      if (this.bonusCell && this.board) {
        this.board.unmarkBonus(this.bonusCell.col, this.bonusCell.row);
      }
      this.bonusCell = null;
    }
  }
  _trySpawnBonus(): boolean {
    return this.trySpawnBonus();
  }
  _getBonusCell(): { col: number; row: number; expireAtMs: number } | null {
    return this.bonusCell;
  }
  _getNextBonusSpawnMs(): number {
    return this.nextBonusSpawnMs;
  }
}

// starsString 는 ResultScene 등에서 직접 사용.
export { starsString };
