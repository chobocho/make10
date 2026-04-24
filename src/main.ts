/**
 * Make10 — 진입점.
 * 브라우저 DOMContentLoaded 시 Canvas를 찾아 GameApp을 시작한다.
 */
import { GameApp } from "./core/GameApp";

const MAX_MAP_ID = 10;

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("gameCanvas 엘리먼트를 찾을 수 없습니다.");
  }
  const app = new GameApp({ canvas, maxMapId: MAX_MAP_ID });
  await app.start();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void bootstrap();
    },
    { once: true },
  );
} else {
  void bootstrap();
}
