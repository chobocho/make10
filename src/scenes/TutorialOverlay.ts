/**
 * TutorialOverlay — 1판 첫 진입 시 노출되는 인터랙티브 튜토리얼 오버레이.
 *
 * 4단계 흐름:
 *   1) 텍스트 인트로 — 게임 목표 안내, 탭으로 진행
 *   2) 2셀 실습 — `[[3, 7]]` 미니 보드에서 사용자가 직접 드래그해 합 10 매치
 *   3) 3셀 실습 — `[[1, 2, 7]]` 미니 보드에서 3셀 매치
 *   4) 텍스트 마무리 — 점수/별 안내, 탭으로 종료
 *
 * 정답 매치: 800ms ✓ 피드백 후 자동 다음 단계.
 * 오답(2~3셀 선택했지만 합≠10): 1000ms "다시" 피드백 후 같은 단계 유지.
 * 우상단 "건너뛰기" 버튼: 어느 단계에서든 즉시 종료(완료 처리).
 *
 * GameScene 으로의 이벤트 통신은 `update`/`onPointerUp` 의 반환값으로 한다.
 */
import type { CanvasRenderer } from "../renderer/CanvasRenderer";
import {
  BoardRenderer,
  hitTestCell,
  type BoardLayout,
} from "../renderer/BoardRenderer";
import { Board } from "../game/Board";
import { Selector } from "../game/Selector";
import type { ButtonRect } from "./SceneLayout";
import { hitButton } from "./SceneLayout";

export type TutorialResult = "continue" | "completed" | "skipped";

type TutorialPhaseSpec =
  | {
      readonly kind: "text";
      readonly title: string;
      readonly body: ReadonlyArray<string>;
      readonly footer: string;
    }
  | {
      readonly kind: "practice";
      readonly title: string;
      readonly prompt: string;
      readonly board: ReadonlyArray<ReadonlyArray<number>>;
    };

const PHASES: ReadonlyArray<TutorialPhaseSpec> = [
  {
    kind: "text",
    title: "🎯 합 10 만들기",
    body: [
      "인접한 숫자를 드래그해",
      "합이 정확히 10이 되도록 만드세요.",
    ],
    footer: "탭해서 다음",
  },
  {
    kind: "practice",
    title: "✏️ 직접 해보세요",
    prompt: "3과 7을 드래그해 합 10!",
    board: [[3, 7]],
  },
  {
    kind: "practice",
    title: "✨ 3개도 가능!",
    prompt: "1 → 2 → 7 (합 10)",
    board: [[1, 2, 7]],
  },
  {
    kind: "practice",
    title: "↳ ㄱ자/L자도 OK!",
    // 보드 [[5,3,1],[4,2,6]]:
    //   2셀 합=10 조합 없음, 3셀 직선 합=10 없음 → 사용자는 반드시 꺾인 경로(ㄱ/L) 사용.
    //   유효 경로: 5→3→2 (ㄱ), 3→1→6 (ㄱ), 그리고 그 역방향들.
    prompt: "꺾어서도 가능 — 5 → 3 → 2",
    board: [
      [5, 3, 1],
      [4, 2, 6],
    ],
  },
  {
    kind: "text",
    title: "⭐ 점수와 별",
    body: [
      "2개 매치 = +100점",
      "3개 매치 = +250점",
      "시간 내 ★1 이상이면 클리어!",
    ],
    footer: "탭해서 시작",
  },
];

const SUCCESS_MS = 800;
const RETRY_MS = 1000;

type Feedback = "none" | "success" | "retry";

export class TutorialOverlay {
  private readonly renderer: CanvasRenderer;
  private readonly boardRenderer: BoardRenderer;

  /** 0 = 비활성, 1..PHASES.length = 활성 단계 */
  private phase: number;
  private board: Board | null;
  private selector: Selector | null;
  private boardLayout: BoardLayout | null;
  private feedback: Feedback;
  private feedbackMs: number;
  private skipBtn: ButtonRect | null;
  private pressedSkip: boolean;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
    this.boardRenderer = new BoardRenderer(renderer);
    this.phase = 0;
    this.board = null;
    this.selector = null;
    this.boardLayout = null;
    this.feedback = "none";
    this.feedbackMs = 0;
    this.skipBtn = null;
    this.pressedSkip = false;
  }

  isActive(): boolean {
    return this.phase > 0;
  }

  start(): void {
    this.phase = 1;
    this.feedback = "none";
    this.feedbackMs = 0;
    this.pressedSkip = false;
    this.setupPhase();
  }

  /** 외부 리사이즈 시 미니 보드 레이아웃 재계산. */
  recomputeLayout(): void {
    if (this.board) this.recomputeBoardLayout();
  }

  private setupPhase(): void {
    const spec = PHASES[this.phase - 1];
    if (!spec) return;
    if (spec.kind === "practice") {
      this.board = new Board(spec.board.map((row) => row.slice()));
      this.selector = new Selector(this.board);
      this.recomputeBoardLayout();
    } else {
      this.board = null;
      this.selector = null;
      this.boardLayout = null;
    }
  }

  private recomputeBoardLayout(): void {
    if (!this.board) return;
    const { width, height } = this.renderer.getSize();
    const minDim = Math.min(width, height);
    const cellSize = Math.round(minDim * 0.18);
    const cols = this.board.getCols();
    const rows = this.board.getRows();
    const boardW = cellSize * cols;
    const x = Math.round((width - boardW) / 2);
    const y = Math.round(height * 0.42);
    this.boardLayout = { cellSize, originX: x, originY: y, cols, rows };
    this.boardRenderer.setLayout(this.boardLayout);
  }

  private advance(): TutorialResult {
    this.phase += 1;
    if (this.phase > PHASES.length) {
      this.end();
      return "completed";
    }
    this.feedback = "none";
    this.feedbackMs = 0;
    this.setupPhase();
    return "continue";
  }

  private end(): void {
    this.phase = 0;
    this.board = null;
    this.selector = null;
    this.boardLayout = null;
    this.feedback = "none";
    this.feedbackMs = 0;
    this.pressedSkip = false;
    this.skipBtn = null;
  }

  update(deltaMs: number): TutorialResult {
    if (!this.isActive()) return "continue";
    if (this.feedbackMs > 0) {
      this.feedbackMs -= deltaMs;
      if (this.feedbackMs <= 0) {
        const wasSuccess = this.feedback === "success";
        this.feedback = "none";
        this.feedbackMs = 0;
        if (wasSuccess) return this.advance();
      }
    }
    return "continue";
  }

  onPointerDown(x: number, y: number): void {
    if (!this.isActive()) return;
    // 우선순위: 건너뛰기 버튼
    if (this.skipBtn && hitButton(this.skipBtn, x, y)) {
      this.pressedSkip = true;
      return;
    }
    // 성공 피드백 진행 중에는 입력 무시
    if (this.feedback === "success") return;
    // 실습 단계: 미니 보드에서 selector.begin
    if (this.selector && this.boardLayout) {
      const cell = hitTestCell(this.boardLayout, x, y);
      if (cell) this.selector.begin(cell[0], cell[1]);
    }
  }

  onPointerMove(x: number, y: number): void {
    if (!this.isActive()) return;
    if (!this.selector || !this.selector.isActive() || !this.boardLayout) return;
    const cell = hitTestCell(this.boardLayout, x, y);
    if (cell) this.selector.extend(cell[0], cell[1]);
  }

  onPointerUp(x: number = Number.NaN, y: number = Number.NaN): TutorialResult {
    if (!this.isActive()) return "continue";

    // 건너뛰기 버튼 인 바운스
    if (this.pressedSkip) {
      this.pressedSkip = false;
      const inSkip =
        !Number.isFinite(x) || !Number.isFinite(y)
          ? true
          : this.skipBtn !== null && hitButton(this.skipBtn, x, y);
      if (inSkip) {
        this.end();
        return "skipped";
      }
      return "continue";
    }

    // 실습 단계 — 활성 selector commit 결과로 분기
    if (this.selector && this.selector.isActive()) {
      const result = this.selector.commit();
      if (result.valid) {
        this.feedback = "success";
        this.feedbackMs = SUCCESS_MS;
      } else if (result.positions.length >= 2) {
        this.feedback = "retry";
        this.feedbackMs = RETRY_MS;
      }
      return "continue";
    }

    // 텍스트 단계 — 탭으로 진행
    const spec = PHASES[this.phase - 1];
    if (spec && spec.kind === "text") {
      return this.advance();
    }
    return "continue";
  }

  onPointerCancel(): void {
    this.pressedSkip = false;
    if (this.selector) this.selector.cancel();
  }

  // -------------- 렌더링 --------------

  render(): void {
    if (!this.isActive()) return;
    const ctx = this.renderer.getCtx();
    const { width, height } = this.renderer.getSize();

    // 반투명 배경
    ctx.fillStyle = "rgba(16, 24, 32, 0.92)";
    ctx.fillRect(0, 0, width, height);

    const spec = PHASES[this.phase - 1];
    if (!spec) return;

    const minDim = Math.min(width, height);
    const titleFont = Math.round(minDim * 0.06);
    const bodyFont = Math.round(minDim * 0.04);
    const footerFont = Math.round(minDim * 0.032);
    const indicatorFont = Math.round(minDim * 0.028);
    const lineGap = Math.round(bodyFont * 1.6);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cx = width / 2;
    let y = Math.round(height * 0.18);

    // 제목
    ctx.fillStyle = "#e0e6ee";
    ctx.font = `bold ${titleFont}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.fillText(spec.title, cx, y);

    if (spec.kind === "text") {
      y += titleFont * 1.4;
      ctx.fillStyle = "#cdd5df";
      ctx.font = `${bodyFont}px -apple-system, sans-serif`;
      for (const line of spec.body) {
        ctx.fillText(line, cx, y);
        y += lineGap;
      }
      // 페이지 인디케이터
      y += lineGap * 0.6;
      ctx.fillStyle = "#7f8ea0";
      ctx.font = `${indicatorFont}px -apple-system, sans-serif`;
      ctx.fillText(this.indicatorString(), cx, y);
      // 하단 안내
      y += lineGap * 1.2;
      ctx.fillStyle = "#a3b3c2";
      ctx.font = `${footerFont}px -apple-system, sans-serif`;
      ctx.fillText(spec.footer, cx, y);
    } else {
      // 안내 문구
      y += titleFont * 1.2;
      ctx.fillStyle = "#cdd5df";
      ctx.font = `${bodyFont}px -apple-system, sans-serif`;
      ctx.fillText(spec.prompt, cx, y);

      // 미니 보드
      if (this.board && this.boardLayout && this.selector) {
        const sel = this.selector.getPositions();
        const invalid = sel.length >= 2 && !this.selector.isValidForRemoval();
        this.boardRenderer.draw(this.board, {
          selection: sel,
          invalidSelection: invalid,
        });
      }

      // 피드백
      if (this.feedback !== "none" && this.boardLayout && this.board) {
        const fbY =
          this.boardLayout.originY +
          this.boardLayout.cellSize * this.board.getRows() +
          bodyFont * 1.5;
        ctx.font = `bold ${bodyFont}px -apple-system, "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (this.feedback === "success") {
          ctx.fillStyle = "#a3be8c";
          ctx.fillText("✓ 잘했어요!", cx, fbY);
        } else {
          ctx.fillStyle = "#bf616a";
          ctx.fillText("다시 시도해보세요", cx, fbY);
        }
      }

      // 하단 페이지 인디케이터
      ctx.fillStyle = "#7f8ea0";
      ctx.font = `${indicatorFont}px -apple-system, sans-serif`;
      ctx.fillText(this.indicatorString(), cx, height - bodyFont * 1.5);
    }

    // 우상단 건너뛰기 버튼 (모든 단계 공통)
    this.drawSkipButton(ctx, width, minDim);
  }

  private indicatorString(): string {
    let s = "";
    for (let i = 1; i <= PHASES.length; i++) {
      s += i === this.phase ? "●" : "○";
      if (i < PHASES.length) s += " ";
    }
    return s;
  }

  private drawSkipButton(
    ctx: CanvasRenderingContext2D,
    width: number,
    minDim: number,
  ): void {
    const skipPadX = Math.round(minDim * 0.04);
    const skipFont = Math.round(minDim * 0.034);
    const label = "건너뛰기";
    const labelW = Math.round(skipFont * label.length * 0.7);
    const btnW = labelW + skipPadX * 2;
    const btnH = Math.round(skipFont * 1.8);
    const btnX = width - btnW - Math.round(minDim * 0.03);
    const btnY = Math.round(minDim * 0.03);
    this.skipBtn = { x: btnX, y: btnY, width: btnW, height: btnH };

    ctx.fillStyle = this.pressedSkip ? "#4c566a" : "#3b4252";
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = "#5d6872";
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
    ctx.font = `600 ${skipFont}px -apple-system, sans-serif`;
    ctx.fillStyle = "#eceff4";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, btnX + btnW / 2, btnY + btnH / 2);
  }

  // -------------- 테스트/디버그 접근자 --------------

  _getPhase(): number {
    return this.phase;
  }
  _getPhaseKind(): "inactive" | "text" | "practice" {
    if (this.phase === 0) return "inactive";
    return PHASES[this.phase - 1].kind;
  }
  _getFeedback(): Feedback {
    return this.feedback;
  }
  _getFeedbackMs(): number {
    return this.feedbackMs;
  }
  _getSkipBtn(): ButtonRect | null {
    return this.skipBtn;
  }
  _getBoardLayout(): BoardLayout | null {
    return this.boardLayout;
  }
  static phaseCount(): number {
    return PHASES.length;
  }
}
