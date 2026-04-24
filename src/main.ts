/**
 * Make10 — 진입점.
 * 이슈 #01에서는 엔트리 스텁만 둔다. 이후 이슈에서 GameApp 초기화를 연결한다.
 */
function bootstrap(): void {
  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("gameCanvas 엘리먼트를 찾을 수 없습니다.");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D 렌더링 컨텍스트를 얻을 수 없습니다.");
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.fillStyle = "#e0e6ee";
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Make10 — 초기화 완료", canvas.width / 2, canvas.height / 2);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
