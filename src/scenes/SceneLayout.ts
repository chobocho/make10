/**
 * 여러 씬이 공유하는 순수 레이아웃 계산 함수들.
 * 비율 + clamp 기반으로 PC/모바일/폴드 등 다양한 뷰포트에 대응한다.
 */
export interface ButtonRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function hitButton(btn: ButtonRect, x: number, y: number): boolean {
  return x >= btn.x && x < btn.x + btn.width && y >= btn.y && y < btn.y + btn.height;
}

/**
 * Title 화면의 N개 맵 버튼 그리드. 뷰포트 폭에 따라 열 수 결정.
 * 반환 배열의 index는 mapId-1에 대응한다.
 * `contentHeight` 는 스크롤 가능한 최하단까지의 총 높이.
 */
export function computeMapGridLayout(
  viewWidth: number,
  viewHeight: number,
  count: number,
): {
  readonly titleFontPx: number;
  readonly titleY: number;
  readonly buttons: ReadonlyArray<ButtonRect>;
  readonly contentHeight: number;
} {
  const titleY = Math.round(clamp(viewHeight * 0.12, 60, 160));
  const titleFontPx = Math.round(clamp(viewHeight * 0.07, 32, 72));

  const cols = viewWidth < 480 ? 3 : viewWidth < 800 ? 4 : 5;
  const gridTop = titleY + titleFontPx + Math.round(clamp(viewHeight * 0.05, 20, 60));
  const gridPadX = Math.round(clamp(viewWidth * 0.06, 16, 60));
  const available = viewWidth - gridPadX * 2;
  const gap = Math.round(clamp(viewWidth * 0.02, 10, 22));
  const btnW = Math.floor((available - gap * (cols - 1)) / cols);
  const btnH = Math.round(btnW * 0.9);
  const buttons: ButtonRect[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    buttons.push({
      x: gridPadX + c * (btnW + gap),
      y: gridTop + r * (btnH + gap),
      width: btnW,
      height: btnH,
    });
  }
  const rows = Math.ceil(count / cols);
  const bottomPad = Math.round(clamp(viewHeight * 0.06, 24, 80));
  const contentHeight = gridTop + rows * btnH + (rows - 1) * gap + bottomPad;
  return { titleFontPx, titleY, buttons, contentHeight };
}

/**
 * Result 화면의 3버튼(다시/다음/타이틀) 레이아웃. 하단 중앙 정렬.
 */
export function computeResultButtonsLayout(
  viewWidth: number,
  viewHeight: number,
): {
  readonly headlineFontPx: number;
  readonly bodyFontPx: number;
  readonly retry: ButtonRect;
  readonly next: ButtonRect;
  readonly title: ButtonRect;
} {
  const headlineFontPx = Math.round(clamp(viewHeight * 0.08, 36, 80));
  const bodyFontPx = Math.round(clamp(viewHeight * 0.04, 18, 36));
  const btnH = Math.round(clamp(viewHeight * 0.09, 50, 100));
  const gap = Math.round(clamp(viewWidth * 0.02, 10, 24));
  const sidePad = Math.round(clamp(viewWidth * 0.08, 20, 80));
  const totalW = viewWidth - sidePad * 2;
  const btnW = Math.floor((totalW - gap * 2) / 3);
  const y = viewHeight - btnH - Math.round(clamp(viewHeight * 0.08, 30, 80));
  return {
    headlineFontPx,
    bodyFontPx,
    retry: { x: sidePad, y, width: btnW, height: btnH },
    next: { x: sidePad + btnW + gap, y, width: btnW, height: btnH },
    title: { x: sidePad + (btnW + gap) * 2, y, width: btnW, height: btnH },
  };
}
