/**
 * TitleScene — 밝은 테마의 타이틀 + 맵 선택 그리드.
 *
 * - 그라데이션 배경 + 둥근 모서리 카드형 버튼.
 * - 100 개 맵을 한 화면에 표시할 수 없으므로 **수직 스크롤** 지원.
 *   - 휠(desktop) / 드래그(mobile+mouse) 제스처로 스크롤.
 *   - 드래그 이동량이 임계값을 넘으면 버튼 탭이 아닌 스크롤로 간주한다.
 */
import type { Scene, SceneContext } from "./Scene";
import type { ButtonRect } from "./SceneLayout";
import { computeMapGridLayout, hitButton } from "./SceneLayout";

const COLOR_BG_TOP = "#fff6ec";
const COLOR_BG_BOTTOM = "#e8f4fa";
const COLOR_TITLE = "#2a3d66";
const COLOR_SUBTITLE = "#7f8ea0";
const COLOR_BTN_BG = "#ffffff";
const COLOR_BTN_BG_PRESSED = "#f0ebe3";
const COLOR_BTN_BG_CLEARED = "#eaf6e4";
const COLOR_BTN_BG_CLEARED_PRESSED = "#d8ecce";
const COLOR_BTN_BG_LOCKED = "#ece7df";
const COLOR_BTN_BORDER = "#e2d6c3";
const COLOR_BTN_BORDER_CLEARED = "#9bcf94";
const COLOR_BTN_BORDER_LOCKED = "#cfc6b6";
const COLOR_BTN_TEXT = "#3d4a5c";
const COLOR_BTN_TEXT_LOCKED = "#a8a094";
const COLOR_STAR_FILLED = "#f5a623";
const COLOR_STAR_EMPTY = "#d6cdc2";
const COLOR_SHADOW = "rgba(45, 50, 60, 0.10)";
const COLOR_OVERLAY = "rgba(255, 255, 255, 0.7)";

const SCROLL_THRESHOLD_PX = 10;
const WHEEL_STEP = 1;

export class TitleScene implements Scene {
  private readonly context: SceneContext;
  private buttons: ReadonlyArray<ButtonRect>;
  private titleFontPx: number;
  private titleY: number;
  private loading: boolean;
  private pressedIndex: number;
  private bestStars: Map<number, number>;

  private scrollY: number;
  private maxScrollY: number;
  private pressStart: { x: number; y: number; scrollY: number } | null;
  private scrolling: boolean;

  private wheelListener: ((e: WheelEvent) => void) | null;

  constructor(context: SceneContext) {
    this.context = context;
    this.buttons = [];
    this.titleFontPx = 48;
    this.titleY = 80;
    this.loading = false;
    this.pressedIndex = -1;
    this.bestStars = new Map();
    this.scrollY = 0;
    this.maxScrollY = 0;
    this.pressStart = null;
    this.scrolling = false;
    this.wheelListener = null;
  }

  enter(): void {
    this.loading = false;
    this.pressedIndex = -1;
    this.pressStart = null;
    this.scrolling = false;
    this.recomputeLayout();
    this.context.renderer.onResize(() => this.recomputeLayout());
    this.attachWheel();
    void this.reloadProgress();
  }

  exit(): void {
    this.detachWheel();
  }

  private attachWheel(): void {
    if (this.wheelListener) return;
    const canvas = this.context.renderer.getCanvas();
    if (!canvas || typeof canvas.addEventListener !== "function") return;
    this.wheelListener = (e: WheelEvent) => {
      if (this.maxScrollY <= 0) return;
      const delta = e.deltaY * WHEEL_STEP;
      this.scrollY = clamp(this.scrollY + delta, 0, this.maxScrollY);
      if (typeof e.preventDefault === "function") e.preventDefault();
    };
    canvas.addEventListener("wheel", this.wheelListener, { passive: false });
  }

  private detachWheel(): void {
    if (!this.wheelListener) return;
    const canvas = this.context.renderer.getCanvas();
    if (canvas && typeof canvas.removeEventListener === "function") {
      canvas.removeEventListener("wheel", this.wheelListener);
    }
    this.wheelListener = null;
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

  private recomputeLayout(): void {
    const size = this.context.renderer.getSize();
    const layout = computeMapGridLayout(size.width, size.height, this.context.maxMapId);
    this.buttons = layout.buttons;
    this.titleFontPx = layout.titleFontPx;
    this.titleY = layout.titleY;
    this.maxScrollY = Math.max(0, layout.contentHeight - size.height);
    if (this.scrollY > this.maxScrollY) this.scrollY = this.maxScrollY;
  }

  update(_deltaMs: number): void {
    /* 상태 없음 */
  }

  render(): void {
    const r = this.context.renderer;
    const ctx = r.getCtx();
    const { width, height } = r.getSize();

    // 배경 그라데이션
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, COLOR_BG_TOP);
    bg.addColorStop(1, COLOR_BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 타이틀 + 부제는 스크롤되지 않는 영역으로 두면 UX상 보기 좋지만
    // 간결성 유지를 위해 콘텐츠와 함께 스크롤한다.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLOR_TITLE;
    ctx.font = `900 ${this.titleFontPx}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText("Make 10", width / 2, this.titleY - this.scrollY);

    ctx.font = `${Math.round(this.titleFontPx * 0.34)}px -apple-system, sans-serif`;
    ctx.fillStyle = COLOR_SUBTITLE;
    ctx.fillText(
      "맵을 선택하세요",
      width / 2,
      this.titleY - this.scrollY + this.titleFontPx * 0.75,
    );

    const labelFont = Math.round(this.titleFontPx * 0.58);
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      const drawY = b.y - this.scrollY;
      if (drawY + b.height < 0 || drawY > height) continue; // 컬링

      const mapId = i + 1;
      const stars = this.bestStars.get(mapId) ?? 0;
      const cleared = stars > 0;
      const locked = !this.isUnlocked(mapId);
      const pressed = i === this.pressedIndex && !this.scrolling && !locked;

      // 소프트 그림자
      ctx.fillStyle = COLOR_SHADOW;
      drawRoundRectPath(ctx, b.x + 2, drawY + 4, b.width, b.height, 14);
      ctx.fill();

      // 본체
      ctx.fillStyle = locked
        ? COLOR_BTN_BG_LOCKED
        : pressed
          ? cleared
            ? COLOR_BTN_BG_CLEARED_PRESSED
            : COLOR_BTN_BG_PRESSED
          : cleared
            ? COLOR_BTN_BG_CLEARED
            : COLOR_BTN_BG;
      drawRoundRectPath(ctx, b.x, drawY, b.width, b.height, 14);
      ctx.fill();

      // 외곽선
      ctx.strokeStyle = locked
        ? COLOR_BTN_BORDER_LOCKED
        : cleared
          ? COLOR_BTN_BORDER_CLEARED
          : COLOR_BTN_BORDER;
      ctx.lineWidth = 2;
      drawRoundRectPath(ctx, b.x, drawY, b.width, b.height, 14);
      ctx.stroke();

      // 숫자
      ctx.fillStyle = locked ? COLOR_BTN_TEXT_LOCKED : COLOR_BTN_TEXT;
      ctx.font = `800 ${labelFont}px -apple-system, "Segoe UI", sans-serif`;
      ctx.fillText(String(mapId), b.x + b.width / 2, drawY + b.height * 0.42);

      if (locked) {
        // 별 자리에 자물쇠 한 개. 잠긴 맵은 별점 자체가 의미 없다.
        const lockFont = Math.round(b.height * 0.26);
        ctx.font = `${lockFont}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.fillStyle = COLOR_BTN_TEXT_LOCKED;
        ctx.fillText("🔒", b.x + b.width / 2, drawY + b.height * 0.78);
      } else {
        // 별 3개 (회색 + 채워짐)
        const starFont = Math.round(b.height * 0.22);
        ctx.font = `${starFont}px -apple-system, "Segoe UI Emoji", sans-serif`;
        const starsY = drawY + b.height * 0.78;
        const starGap = starFont * 0.1;
        const starCx = b.x + b.width / 2;
        const displays: ReadonlyArray<{ ch: string; color: string }> = [
          {
            ch: stars >= 1 ? "★" : "☆",
            color: stars >= 1 ? COLOR_STAR_FILLED : COLOR_STAR_EMPTY,
          },
          {
            ch: stars >= 2 ? "★" : "☆",
            color: stars >= 2 ? COLOR_STAR_FILLED : COLOR_STAR_EMPTY,
          },
          {
            ch: stars >= 3 ? "★" : "☆",
            color: stars >= 3 ? COLOR_STAR_FILLED : COLOR_STAR_EMPTY,
          },
        ];
        const totalW = starFont * 3 + starGap * 2;
        let sx = starCx - totalW / 2 + starFont / 2;
        for (const d of displays) {
          ctx.fillStyle = d.color;
          ctx.fillText(d.ch, sx, starsY);
          sx += starFont + starGap;
        }
      }
    }

    // 스크롤 인디케이터 (콘텐츠 우측)
    if (this.maxScrollY > 0) {
      const trackH = height * 0.5;
      const trackY = (height - trackH) / 2;
      const trackX = width - 6;
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.fillRect(trackX, trackY, 3, trackH);
      const ratio = this.scrollY / this.maxScrollY;
      const thumbH = Math.max(24, trackH * 0.2);
      const thumbY = trackY + (trackH - thumbH) * ratio;
      ctx.fillStyle = "rgba(45, 50, 60, 0.35)";
      ctx.fillRect(trackX, thumbY, 3, thumbH);
    }

    if (this.loading) {
      ctx.fillStyle = COLOR_OVERLAY;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = COLOR_TITLE;
      ctx.font = `bold ${Math.round(this.titleFontPx * 0.5)}px -apple-system, sans-serif`;
      ctx.fillText("로딩 중…", width / 2, height / 2);
    }
  }

  onPointerDown(x: number, y: number): void {
    if (this.loading) return;
    this.pressStart = { x, y, scrollY: this.scrollY };
    this.scrolling = false;
    const logicalY = y + this.scrollY;
    for (let i = 0; i < this.buttons.length; i++) {
      if (hitButton(this.buttons[i], x, logicalY)) {
        this.pressedIndex = i;
        return;
      }
    }
    this.pressedIndex = -1;
  }

  onPointerMove(x: number, y: number): void {
    if (!this.pressStart) return;
    const dy = y - this.pressStart.y;
    if (!this.scrolling && Math.abs(dy) > SCROLL_THRESHOLD_PX) {
      this.scrolling = true;
      this.pressedIndex = -1;
    }
    if (this.scrolling) {
      this.scrollY = clamp(
        this.pressStart.scrollY - dy,
        0,
        this.maxScrollY,
      );
    }
    void x;
  }

  onPointerUp(x: number, y: number): void {
    const wasScrolling = this.scrolling;
    const idx = this.pressedIndex;
    this.pressStart = null;
    this.scrolling = false;
    this.pressedIndex = -1;
    if (this.loading || wasScrolling) return;
    if (idx < 0 || idx >= this.buttons.length) return;
    const logicalY = y + this.scrollY;
    if (!hitButton(this.buttons[idx], x, logicalY)) return;
    const mapId = idx + 1;
    if (!this.isUnlocked(mapId)) return;
    this.context.audio.ensureReady();
    this.context.audio.play("button");
    void this.startMap(mapId);
  }

  onPointerCancel(): void {
    this.pressStart = null;
    this.scrolling = false;
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

  /**
   * 순차 잠금 정책: map 1은 항상 가능, 그 외는 직전 맵을 ★1 이상으로 클리어해야 가능.
   */
  private isUnlocked(mapId: number): boolean {
    if (mapId <= 1) return true;
    return (this.bestStars.get(mapId - 1) ?? 0) >= 1;
  }

  // --- 테스트용 접근자 ---
  _getScrollY(): number {
    return this.scrollY;
  }
  _getMaxScrollY(): number {
    return this.maxScrollY;
  }
  _scrollBy(delta: number): void {
    this.scrollY = clamp(this.scrollY + delta, 0, this.maxScrollY);
  }
  _isUnlocked(mapId: number): boolean {
    return this.isUnlocked(mapId);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function drawRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
