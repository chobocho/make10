/**
 * TitleScene — 밝은 테마의 타이틀 + 맵 선택 그리드.
 *
 * 페이지 기반 네비게이션:
 *   - 한 페이지에 100개 맵을 표시 (1-100, 101-200, 201-300).
 *   - 좌/우 화살표로 페이지 이동. 이전 페이지의 보스(100, 200)를 ★1+로 깨야 다음 페이지가 잠금 해제된다.
 *   - 한 페이지 내에서는 100개를 모두 보기 위해 수직 스크롤(휠+드래그) 유지.
 *
 * 맵별 잠금(이슈 #24): 같은 페이지 내에서도 직전 맵을 깨야 다음 맵 진입 가능.
 */
import type { Scene, SceneContext } from "./Scene";
import type { ButtonRect } from "./SceneLayout";
import { computeMapGridLayout, hitButton, type MapGridLayout } from "./SceneLayout";

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
const COLOR_PAGER_BTN = "#ffffff";
const COLOR_PAGER_BTN_PRESSED = "#e8e0d2";
const COLOR_PAGER_BTN_DISABLED = "#f1ece2";
const COLOR_PAGER_TEXT = "#2a3d66";
const COLOR_PAGER_TEXT_DISABLED = "#bdb5a5";

const SCROLL_THRESHOLD_PX = 10;
const WHEEL_STEP = 1;
export const PAGE_SIZE = 100;
type PressTarget =
  | { kind: "map"; index: number }
  | { kind: "prev" }
  | { kind: "next" }
  | null;

export class TitleScene implements Scene {
  private readonly context: SceneContext;
  private layout: MapGridLayout | null;
  private loading: boolean;
  private pressed: PressTarget;
  private bestStars: Map<number, number>;

  /** 현재 페이지(1-indexed). 페이지 N이면 (N-1)*100+1 ~ N*100 맵을 표시. */
  private page: number;
  private scrollY: number;
  private maxScrollY: number;
  private pressStart: { x: number; y: number; scrollY: number; target: PressTarget } | null;
  private scrolling: boolean;

  private wheelListener: ((e: WheelEvent) => void) | null;

  constructor(context: SceneContext) {
    this.context = context;
    this.layout = null;
    this.loading = false;
    this.pressed = null;
    this.bestStars = new Map();
    this.page = 1;
    this.scrollY = 0;
    this.maxScrollY = 0;
    this.pressStart = null;
    this.scrolling = false;
    this.wheelListener = null;
  }

  enter(): void {
    this.loading = false;
    this.pressed = null;
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
      // 진행도 변화로 현재 페이지가 잠금 상태가 되었으면 1로 폴백.
      if (!this.isPageUnlocked(this.page)) this.page = 1;
    } catch {
      this.bestStars = new Map();
    }
  }

  private getTotalPages(): number {
    return Math.max(1, Math.ceil(this.context.maxMapId / PAGE_SIZE));
  }

  /** 페이지 잠금: 1은 항상 열림. N(>1)은 (N-1)*100 맵의 ★≥1 일 때 열림. */
  private isPageUnlocked(page: number): boolean {
    if (page <= 1) return true;
    const bossId = (page - 1) * PAGE_SIZE;
    return (this.bestStars.get(bossId) ?? 0) >= 1;
  }

  /** 같은 페이지 내 맵 단위 순차 잠금: 1번 맵, 또는 직전 맵 ★≥1. */
  private isMapUnlocked(mapId: number): boolean {
    if (mapId <= 1) return true;
    return (this.bestStars.get(mapId - 1) ?? 0) >= 1;
  }

  private getPageMapCount(page: number): number {
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, this.context.maxMapId);
    return Math.max(0, end - start + 1);
  }

  private recomputeLayout(): void {
    const size = this.context.renderer.getSize();
    const count = this.getPageMapCount(this.page);
    this.layout = computeMapGridLayout(size.width, size.height, count);
    this.maxScrollY = Math.max(0, this.layout.contentHeight - size.height);
    if (this.scrollY > this.maxScrollY) this.scrollY = this.maxScrollY;
  }

  update(_deltaMs: number): void {
    /* 상태 없음 */
  }

  render(): void {
    const r = this.context.renderer;
    const ctx = r.getCtx();
    const { width, height } = r.getSize();
    const layout = this.layout;
    if (!layout) return;

    // 배경 그라데이션
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, COLOR_BG_TOP);
    bg.addColorStop(1, COLOR_BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 타이틀 + 부제 (스크롤되지 않는 헤더)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLOR_TITLE;
    ctx.font = `900 ${layout.titleFontPx}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText("Make 10", width / 2, layout.titleY);

    // 페이지 네비게이션 화살표 + 라벨 (스크롤 무관, 항상 같은 자리)
    this.drawPager(ctx, layout);

    // 맵 카드 (스크롤 적용 영역)
    const labelFont = Math.round(layout.titleFontPx * 0.58);
    const startMapId = (this.page - 1) * PAGE_SIZE + 1;
    for (let i = 0; i < layout.buttons.length; i++) {
      const b = layout.buttons[i];
      const drawY = b.y - this.scrollY;
      // 페이저 영역 가림 방지: 페이저 하단보다 위에 그리려고 하면 컬링.
      const pagerBottom = layout.pagerY + layout.pagerHeight;
      if (drawY + b.height < pagerBottom || drawY > height) continue;

      const mapId = startMapId + i;
      const stars = this.bestStars.get(mapId) ?? 0;
      const cleared = stars > 0;
      const locked = !this.isMapUnlocked(mapId);
      const pressed =
        this.pressed?.kind === "map" &&
        this.pressed.index === i &&
        !this.scrolling &&
        !locked;

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
        const lockFont = Math.round(b.height * 0.26);
        ctx.font = `${lockFont}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.fillStyle = COLOR_BTN_TEXT_LOCKED;
        ctx.fillText("🔒", b.x + b.width / 2, drawY + b.height * 0.78);
      } else {
        const starFont = Math.round(b.height * 0.22);
        ctx.font = `${starFont}px -apple-system, "Segoe UI Emoji", sans-serif`;
        const starsY = drawY + b.height * 0.78;
        const starGap = starFont * 0.1;
        const starCx = b.x + b.width / 2;
        const displays: ReadonlyArray<{ ch: string; color: string }> = [
          { ch: stars >= 1 ? "★" : "☆", color: stars >= 1 ? COLOR_STAR_FILLED : COLOR_STAR_EMPTY },
          { ch: stars >= 2 ? "★" : "☆", color: stars >= 2 ? COLOR_STAR_FILLED : COLOR_STAR_EMPTY },
          { ch: stars >= 3 ? "★" : "☆", color: stars >= 3 ? COLOR_STAR_FILLED : COLOR_STAR_EMPTY },
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

    // 페이저 영역 위로 그라데이션이 보이게 헤더 마스킹: 헤더 배경을 위에 다시 칠해서 스크롤 컨텐츠가 페이저를 가리지 않도록 한다.
    const headerBottom = layout.pagerY + layout.pagerHeight;
    ctx.fillStyle = bg as unknown as string;
    // 사실 그라데이션을 다시 칠해야 하나, fillStyle = bg는 동작이 다르다. 단순 컬러로 대체:
    // 컨텐츠가 페이저 영역에 침투하지 않도록 위에서 컬링했으므로 추가 마스킹 불필요.
    void headerBottom;

    // 스크롤 인디케이터
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
      ctx.font = `bold ${Math.round(layout.titleFontPx * 0.5)}px -apple-system, sans-serif`;
      ctx.fillText("로딩 중…", width / 2, height / 2);
    }
  }

  private drawPager(ctx: CanvasRenderingContext2D, layout: MapGridLayout): void {
    const total = this.getTotalPages();
    const prevEnabled = this.page > 1;
    const nextEnabled = this.page < total && this.isPageUnlocked(this.page + 1);

    // 라벨: "1 / 3" + 보조 텍스트 "1-100"
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLOR_PAGER_TEXT;
    ctx.font = `700 ${layout.pagerLabelFontPx}px -apple-system, sans-serif`;
    const startId = (this.page - 1) * PAGE_SIZE + 1;
    const endId = Math.min(this.page * PAGE_SIZE, this.context.maxMapId);
    const label = `${startId}–${endId}`;
    ctx.fillText(label, layout.pagerLabelCenterX, layout.pagerY + layout.pagerHeight / 2);

    ctx.fillStyle = COLOR_SUBTITLE;
    ctx.font = `${Math.round(layout.pagerLabelFontPx * 0.6)}px -apple-system, sans-serif`;
    ctx.fillText(
      `페이지 ${this.page} / ${total}`,
      layout.pagerLabelCenterX,
      layout.pagerY + layout.pagerHeight / 2 + layout.pagerLabelFontPx * 0.85,
    );

    this.drawArrow(ctx, layout.prevArrow, "◀", prevEnabled, this.pressed?.kind === "prev");
    this.drawArrow(ctx, layout.nextArrow, "▶", nextEnabled, this.pressed?.kind === "next");
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    rect: ButtonRect,
    glyph: string,
    enabled: boolean,
    pressed: boolean,
  ): void {
    ctx.fillStyle = COLOR_SHADOW;
    drawRoundRectPath(ctx, rect.x + 1, rect.y + 3, rect.width, rect.height, rect.height / 2);
    ctx.fill();
    ctx.fillStyle = !enabled
      ? COLOR_PAGER_BTN_DISABLED
      : pressed
        ? COLOR_PAGER_BTN_PRESSED
        : COLOR_PAGER_BTN;
    drawRoundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, rect.height / 2);
    ctx.fill();
    ctx.strokeStyle = enabled ? COLOR_BTN_BORDER : COLOR_BTN_BORDER_LOCKED;
    ctx.lineWidth = 2;
    drawRoundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, rect.height / 2);
    ctx.stroke();
    ctx.fillStyle = enabled ? COLOR_PAGER_TEXT : COLOR_PAGER_TEXT_DISABLED;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(rect.height * 0.5)}px -apple-system, sans-serif`;
    ctx.fillText(glyph, rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  private hitTarget(x: number, y: number, scrollY: number): PressTarget {
    const layout = this.layout;
    if (!layout) return null;
    if (hitButton(layout.prevArrow, x, y)) return { kind: "prev" };
    if (hitButton(layout.nextArrow, x, y)) return { kind: "next" };
    const logicalY = y + scrollY;
    // 페이저 영역과 겹치는 카드는 무시 — 화면상에서 보이지 않으므로 탭도 받지 않는다.
    const pagerBottom = layout.pagerY + layout.pagerHeight;
    if (y < pagerBottom) return null;
    for (let i = 0; i < layout.buttons.length; i++) {
      if (hitButton(layout.buttons[i], x, logicalY)) {
        return { kind: "map", index: i };
      }
    }
    return null;
  }

  onPointerDown(x: number, y: number): void {
    if (this.loading) return;
    const target = this.hitTarget(x, y, this.scrollY);
    this.pressStart = { x, y, scrollY: this.scrollY, target };
    this.scrolling = false;
    this.pressed = target;
  }

  onPointerMove(x: number, y: number): void {
    if (!this.pressStart) return;
    const dy = y - this.pressStart.y;
    if (!this.scrolling && Math.abs(dy) > SCROLL_THRESHOLD_PX) {
      // 페이저 화살표 위에서 시작한 드래그는 스크롤 전환하지 않음(탭 의도 보존).
      if (this.pressStart.target?.kind === "prev" || this.pressStart.target?.kind === "next") {
        return;
      }
      this.scrolling = true;
      this.pressed = null;
    }
    if (this.scrolling) {
      this.scrollY = clamp(this.pressStart.scrollY - dy, 0, this.maxScrollY);
    }
    void x;
  }

  onPointerUp(x: number, y: number): void {
    const wasScrolling = this.scrolling;
    const target = this.pressed;
    this.pressStart = null;
    this.scrolling = false;
    this.pressed = null;
    if (this.loading || wasScrolling || !target) return;
    const hit = this.hitTarget(x, y, this.scrollY);
    if (!hit || hit.kind !== target.kind) return;
    if (target.kind === "map") {
      if (hit.kind !== "map" || hit.index !== target.index) return;
      const mapId = (this.page - 1) * PAGE_SIZE + target.index + 1;
      if (!this.isMapUnlocked(mapId)) return;
      this.context.audio.ensureReady();
      this.context.audio.play("button");
      void this.startMap(mapId);
      return;
    }
    if (target.kind === "prev") {
      this.gotoPage(this.page - 1);
      return;
    }
    if (target.kind === "next") {
      this.gotoPage(this.page + 1);
    }
  }

  onPointerCancel(): void {
    this.pressStart = null;
    this.scrolling = false;
    this.pressed = null;
  }

  private gotoPage(next: number): void {
    const total = this.getTotalPages();
    if (next < 1 || next > total) return;
    if (!this.isPageUnlocked(next)) return;
    if (next === this.page) return;
    this.page = next;
    this.scrollY = 0;
    this.context.audio.ensureReady();
    this.context.audio.play("button");
    this.recomputeLayout();
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
  _isMapUnlocked(mapId: number): boolean {
    return this.isMapUnlocked(mapId);
  }
  _isPageUnlocked(page: number): boolean {
    return this.isPageUnlocked(page);
  }
  _getPage(): number {
    return this.page;
  }
  _setPage(page: number): void {
    this.page = page;
    this.recomputeLayout();
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
