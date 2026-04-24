/**
 * FSM — 씬 전환 유한 상태 머신.
 *
 * 각 SceneId에 해당하는 Scene 인스턴스를 미리 등록해 두고, `transition(id, args)`
 * 호출 시 현재 씬의 `exit`를 실행한 뒤 다음 씬의 `enter(args)`를 호출한다.
 * 루프에서 `update`/`render`/`onPointer*`를 FSM에 위임하면 현재 씬이 받는다.
 */
import type { Scene, SceneId } from "../scenes/Scene";

export class FSM {
  private readonly scenes: Map<SceneId, Scene> = new Map();
  private currentId: SceneId | null = null;
  private current: Scene | null = null;
  private transitioning: boolean = false;

  register(id: SceneId, scene: Scene): void {
    this.scenes.set(id, scene);
  }

  async start(id: SceneId, args?: unknown): Promise<void> {
    await this.transition(id, args);
  }

  async transition(id: SceneId, args?: unknown): Promise<void> {
    const next = this.scenes.get(id);
    if (!next) {
      throw new Error(`FSM.transition: 미등록 씬 '${id}'.`);
    }
    if (this.transitioning) {
      // 전환 중 중첩 호출은 무시(직렬화 보장).
      return;
    }
    this.transitioning = true;
    try {
      if (this.current) this.current.exit();
      this.currentId = id;
      this.current = next;
      await next.enter(args);
    } finally {
      this.transitioning = false;
    }
  }

  getCurrentId(): SceneId | null {
    return this.currentId;
  }

  getCurrent(): Scene | null {
    return this.current;
  }

  update(deltaMs: number): void {
    this.current?.update(deltaMs);
  }

  render(): void {
    this.current?.render();
  }

  onPointerDown(x: number, y: number): void {
    this.current?.onPointerDown?.(x, y);
  }

  onPointerMove(x: number, y: number): void {
    this.current?.onPointerMove?.(x, y);
  }

  onPointerUp(x: number, y: number): void {
    this.current?.onPointerUp?.(x, y);
  }

  onPointerCancel(): void {
    this.current?.onPointerCancel?.();
  }
}
