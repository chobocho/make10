/**
 * EffectLayer — 매치/제거 시 일회성 시각 이펙트 모음.
 *
 * 게임 로직(보드 상태)과 분리되어 화면 좌표(CSS 픽셀) 위에서만 동작한다.
 * 호출 흐름:
 *   - 매치 발생 시점에 `spawnRemoval(destroyedCells, layout, comboKind)` 호출.
 *   - 매 프레임 GameScene 이 `update(deltaMs)` → `render(ctx)` 순으로 호출.
 *   - 만료된 이펙트는 자동으로 정리.
 *
 * 디자인 원칙:
 *   - 외부 라이브러리 미사용(요구사항).
 *   - 3셀 매치는 파티클 수↑·색상 강화·확장 링 + 더 큰 점수 팝업으로 강조.
 */

interface Effect {
  update(deltaMs: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  isExpired(): boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number; // px/s
  vy: number;
  life: number; // ms 남음
  maxLife: number;
  size: number;
  color: string;
}

const GRAVITY_PX_PER_S2 = 600; // 파티클 낙하 가속
const FRICTION_PER_S = 1.4; // 속도 감쇠

class ParticleBurst implements Effect {
  private readonly particles: Particle[];

  constructor(particles: Particle[]) {
    this.particles = particles;
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    const sec = deltaMs / 1000;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.vy += GRAVITY_PX_PER_S2 * sec;
      const damp = Math.max(0, 1 - FRICTION_PER_S * sec);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.life -= deltaMs;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  isExpired(): boolean {
    for (const p of this.particles) if (p.life > 0) return false;
    return true;
  }
}

class ExpandingRing implements Effect {
  private life: number;
  private readonly maxLife: number;
  private readonly cx: number;
  private readonly cy: number;
  private readonly maxRadius: number;
  private readonly color: string;
  private readonly thickness: number;

  constructor(
    cx: number,
    cy: number,
    maxRadius: number,
    lifeMs: number,
    color: string,
    thickness: number,
  ) {
    this.cx = cx;
    this.cy = cy;
    this.maxRadius = maxRadius;
    this.life = lifeMs;
    this.maxLife = lifeMs;
    this.color = color;
    this.thickness = thickness;
  }

  update(deltaMs: number): void {
    this.life -= deltaMs;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.life <= 0) return;
    const t = 1 - this.life / this.maxLife; // 0 → 1
    const r = this.maxRadius * easeOutCubic(t);
    const alpha = Math.max(0, 1 - t);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.thickness;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  isExpired(): boolean {
    return this.life <= 0;
  }
}

class ScorePopup implements Effect {
  private life: number;
  private readonly maxLife: number;
  private x: number;
  private y: number;
  private readonly text: string;
  private readonly fontPx: number;
  private readonly color: string;
  private readonly riseSpeed: number; // px/s 위로 상승

  constructor(
    x: number,
    y: number,
    text: string,
    fontPx: number,
    color: string,
    lifeMs: number,
  ) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.fontPx = fontPx;
    this.color = color;
    this.life = lifeMs;
    this.maxLife = lifeMs;
    this.riseSpeed = 70 + fontPx * 0.6;
  }

  update(deltaMs: number): void {
    if (this.life <= 0) return;
    const sec = deltaMs / 1000;
    this.y -= this.riseSpeed * sec;
    this.life -= deltaMs;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.life <= 0) return;
    const t = 1 - this.life / this.maxLife;
    // 0~0.6 구간은 약간 확대(pop), 그 후 원본 크기.
    const scale = t < 0.2 ? 0.6 + (t / 0.2) * 0.6 : 1.2 - Math.min(0.2, t - 0.2);
    const alpha = Math.max(0, 1 - Math.pow(t, 1.5));
    const px = Math.max(8, Math.round(this.fontPx * scale));
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${px}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // 외곽선(짙은 그림자) + 본체 컬러 → 밝은 배경에서도 잘 보임.
    ctx.lineWidth = Math.max(2, Math.round(px * 0.12));
    ctx.strokeStyle = "rgba(20, 25, 40, 0.85)";
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }

  isExpired(): boolean {
    return this.life <= 0;
  }
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export interface CellLayout {
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
}

export type ComboKind = "pair" | "triple";

export class EffectLayer {
  private effects: Effect[] = [];
  private readonly randomFn: () => number;

  constructor(randomFn: () => number = Math.random) {
    this.randomFn = randomFn;
  }

  /**
   * 제거된 셀들에 대해 파티클 폭발 + 점수 팝업(+ 3셀이면 링)을 생성.
   * @param cells 제거된 셀 좌표 (col, row). 비어있으면 점수 팝업도 생성하지 않는다.
   * @param layout 보드 셀의 화면 좌표 변환 정보.
   * @param kind  매치 종류 — "pair" (2셀, +100) 또는 "triple" (3셀, +250).
   */
  spawnRemoval(
    cells: ReadonlyArray<readonly [number, number]>,
    layout: CellLayout,
    kind: ComboKind,
  ): void {
    if (cells.length === 0) return;
    const isTriple = kind === "triple";
    const size = layout.cellSize;
    const particlesPerCell = isTriple ? 16 : 9;
    const particleLife = isTriple ? 620 : 420;
    const baseSpeed = isTriple ? size * 5.0 : size * 3.6;

    const colors = isTriple
      ? ["#fff7c2", "#ffd166", "#ff9a3c", "#ff6f3c"]
      : ["#ffffff", "#fff2a8", "#7dd4fc"];

    const particles: Particle[] = [];
    let sumX = 0;
    let sumY = 0;
    for (const [col, row] of cells) {
      const cx = layout.originX + col * size + size / 2;
      const cy = layout.originY + row * size + size / 2;
      sumX += cx;
      sumY += cy;
      for (let i = 0; i < particlesPerCell; i++) {
        const angle = this.randomFn() * Math.PI * 2;
        const speed = baseSpeed * (0.55 + this.randomFn() * 0.5);
        const life = particleLife * (0.7 + this.randomFn() * 0.5);
        const psize = (isTriple ? 4.5 : 3.2) * (0.7 + this.randomFn() * 0.7);
        const color = colors[Math.floor(this.randomFn() * colors.length)];
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - speed * 0.25, // 살짝 위로 튀게
          life,
          maxLife: life,
          size: psize,
          color,
        });
      }
    }
    this.effects.push(new ParticleBurst(particles));

    // 점수 팝업 — 셀들의 중심점.
    const cx = sumX / cells.length;
    const cy = sumY / cells.length;
    if (isTriple) {
      this.effects.push(
        new ScorePopup(cx, cy, "+250", Math.max(28, size * 0.7), "#ffd166", 950),
      );
      this.effects.push(
        new ExpandingRing(cx, cy, size * 1.8, 520, "#ffd166", Math.max(3, size * 0.06)),
      );
      this.effects.push(
        new ExpandingRing(cx, cy, size * 1.2, 360, "#fff2a8", Math.max(2, size * 0.04)),
      );
    } else {
      this.effects.push(
        new ScorePopup(cx, cy, "+100", Math.max(20, size * 0.5), "#fff7c2", 720),
      );
    }
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    for (const e of this.effects) e.update(deltaMs);
    // 만료 정리 — 비어있을 때 빈 배열 재할당으로 GC 친화.
    let alive = 0;
    for (const e of this.effects) if (!e.isExpired()) alive++;
    if (alive === this.effects.length) return;
    if (alive === 0) {
      this.effects = [];
      return;
    }
    const next: Effect[] = [];
    for (const e of this.effects) if (!e.isExpired()) next.push(e);
    this.effects = next;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.effects.length === 0) return;
    for (const e of this.effects) e.render(ctx);
  }

  hasActive(): boolean {
    return this.effects.length > 0;
  }

  /** 테스트용 — 활성 이펙트 개수. */
  _size(): number {
    return this.effects.length;
  }

  /** 화면 전환 등으로 정리가 필요할 때 사용. */
  clear(): void {
    this.effects = [];
  }
}
