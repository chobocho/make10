/**
 * TitleScene — 타이틀 + 맵 선택.
 *
 * 10x20 그리드 중 `maxMapId` 만큼 버튼을 렌더링. 클릭 시 context.loadMap으로
 * JSON을 받아 GameScene으로 전환한다.
 */
import type { Scene, SceneContext } from "./Scene";
import type { ButtonRect } from "./SceneLayout";
import { computeMapGridLayout, hitButton } from "./SceneLayout";

const COLOR_BG = "#101820";
const COLOR_TITLE = "#e0e6ee";
const COLOR_BTN = "#3b4252";
const COLOR_BTN_HOVER = "#4c566a";
const COLOR_BTN_CLEARED = "#48604a";
const COLOR_BTN_TEXT = "#eceff4";
const COLOR_STAR = "#ebcb8b";

export class TitleScene implements Scene {
  private readonly context: SceneContext;
  private buttons: ReadonlyArray<ButtonRect>;
  private titleFontPx: number;
  private titleY: number;
  private loading: boolean;
  private pressedIndex: number;
  private bestStars: Map<number, number>;

  constructor(context: SceneContext) {
    this.context = context;
    this.buttons = [];
    this.titleFontPx = 48;
    this.titleY = 80;
    this.loading = false;
    this.pressedIndex = -1;
    this.bestStars = new Map();
  }

  enter(): void {
    this.loading = false;
    this.pressedIndex = -1;
    this.recomputeLayout();
    this.context.renderer.onResize(() => this.recomputeLayout());
    // 저장된 최고 기록 로드 (타이틀 재진입마다 최신 반영).
    void this.reloadProgress();
  }

  private async reloadProgress(): Promise<void> {
    try {
      const records = await this.context.saveManager.list();
      this.bestStars = new Map(
        records.map((r) => [r.mapId, typeof r.stars === "number" ? r.stars : 0]),
      );
    } catch {
      this.bestStars = new Map();
    }
  }

  exit(): void {
    /* 정리할 상태 없음 */
  }

  private recomputeLayout(): void {
    const size = this.context.renderer.getSize();
    const layout = computeMapGridLayout(size.width, size.height, this.context.maxMapId);
    this.buttons = layout.buttons;
    this.titleFontPx = layout.titleFontPx;
    this.titleY = layout.titleY;
  }

  update(_deltaMs: number): void {
    /* 상태 없음 */
  }

  render(): void {
    const r = this.context.renderer;
    r.clear(COLOR_BG);
    const ctx = r.getCtx();
    const { width } = r.getSize();

    ctx.fillStyle = COLOR_TITLE;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${this.titleFontPx}px -apple-system, sans-serif`;
    ctx.fillText("Make 10", width / 2, this.titleY);

    const labelFont = Math.round(this.titleFontPx * 0.55);
    for (let i = 0; i < this.buttons.length; i++) {
      const mapId = i + 1;
      const stars = this.bestStars.get(mapId) ?? 0;
      const cleared = stars > 0;
      const b = this.buttons[i];
      ctx.fillStyle =
        i === this.pressedIndex
          ? COLOR_BTN_HOVER
          : cleared
            ? COLOR_BTN_CLEARED
            : COLOR_BTN;
      ctx.fillRect(b.x, b.y, b.width, b.height);

      ctx.fillStyle = COLOR_BTN_TEXT;
      ctx.font = `bold ${labelFont}px -apple-system, "Segoe UI Emoji", sans-serif`;
      const labelYOffset = cleared ? -b.height * 0.12 : 0;
      ctx.fillText(
        String(mapId),
        b.x + b.width / 2,
        b.y + b.height / 2 + labelYOffset,
      );

      if (cleared) {
        const subFont = Math.round(b.height * 0.18);
        ctx.font = `${subFont}px -apple-system, "Segoe UI Emoji", sans-serif`;
        ctx.fillStyle = COLOR_STAR;
        const starsDisplay =
          "★".repeat(stars) + "☆".repeat(3 - stars);
        ctx.fillText(starsDisplay, b.x + b.width / 2, b.y + b.height * 0.78);
      }
    }

    if (this.loading) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, width, this.context.renderer.getSize().height);
      ctx.fillStyle = COLOR_TITLE;
      ctx.font = `${Math.round(this.titleFontPx * 0.6)}px sans-serif`;
      ctx.fillText("로딩 중…", width / 2, this.context.renderer.getSize().height / 2);
    }
  }

  onPointerDown(x: number, y: number): void {
    if (this.loading) return;
    for (let i = 0; i < this.buttons.length; i++) {
      if (hitButton(this.buttons[i], x, y)) {
        this.pressedIndex = i;
        return;
      }
    }
    this.pressedIndex = -1;
  }

  onPointerUp(x: number, y: number): void {
    if (this.loading) return;
    const idx = this.pressedIndex;
    this.pressedIndex = -1;
    if (idx < 0 || idx >= this.buttons.length) return;
    if (!hitButton(this.buttons[idx], x, y)) return;
    this.context.audio.ensureReady();
    this.context.audio.play("button");
    void this.startMap(idx + 1);
  }

  onPointerCancel(): void {
    this.pressedIndex = -1;
  }

  private async startMap(mapId: number): Promise<void> {
    this.loading = true;
    try {
      const map = await this.context.loadMap(mapId);
      this.loading = false;
      this.context.transition("game", { map });
    } catch (err) {
      this.loading = false;
      console.error(`TitleScene: map ${mapId} 로드 실패`, err);
    }
  }
}
