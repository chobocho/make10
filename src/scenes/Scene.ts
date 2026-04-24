/**
 * Scene — 씬 인터페이스 (Title/Game/Result 공통).
 * 실제 전환은 `core/FSM.ts`가 `SceneContext.transition`으로 호출한다.
 */
import type { CanvasRenderer } from "../renderer/CanvasRenderer";
import type { AudioManager } from "../audio/AudioManager";
import type { SaveManager } from "../storage/SaveManager";
import type { MapData } from "../data/MapLoader";

export type SceneId = "title" | "game" | "result";

export interface SceneContext {
  readonly renderer: CanvasRenderer;
  readonly audio: AudioManager;
  readonly saveManager: SaveManager;
  readonly transition: (next: SceneId, args?: unknown) => void;
  readonly loadMap: (mapId: number) => Promise<MapData>;
  readonly maxMapId: number;
}

export interface Scene {
  enter(args?: unknown): void | Promise<void>;
  exit(): void;
  update(deltaMs: number): void;
  render(): void;
  onPointerDown?(x: number, y: number): void;
  onPointerMove?(x: number, y: number): void;
  onPointerUp?(x: number, y: number): void;
  onPointerCancel?(): void;
}
