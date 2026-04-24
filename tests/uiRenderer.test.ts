import { describe, test, assertTrue, assertFalse, assertEqual } from "./runner";
import {
  computeUILayout,
  isHintButtonHit,
  isPauseButtonHit,
} from "../src/renderer/UIRenderer";

describe("UIRenderer layout", () => {
  test("computeUILayout: 타이머 바 + HUD + 양쪽 버튼, clamp 적용", () => {
    const l = computeUILayout(400, 800);
    assertTrue(l.timerBar.height >= 6 && l.timerBar.height <= 14);
    assertEqual(l.timerBar.x, 0);
    assertEqual(l.timerBar.y, 0);
    assertEqual(l.timerBar.width, 400);
    assertEqual(l.hudY, l.timerBar.height);
    const hudH = l.uiHeight - l.hudY;
    assertTrue(hudH >= 60 && hudH <= 110);
    assertTrue(l.hintButton.y >= l.hudY);
    assertTrue(l.pauseButton.y >= l.hudY);
    assertTrue(l.pauseButton.x >= 0);
    assertTrue(l.hintButton.x + l.hintButton.width <= 400);
    // 좌측(pause) 과 우측(hint) 버튼이 겹치지 않음
    assertTrue(l.pauseButton.x + l.pauseButton.width < l.hintButton.x);
  });

  test("매우 좁은 뷰: 버튼 최소 크기 유지", () => {
    const l = computeUILayout(240, 120);
    assertTrue(l.timerBar.height >= 6);
    assertTrue(l.pauseButton.width >= 56);
    assertTrue(l.hintButton.width >= 84);
    assertTrue(l.pauseButton.x + l.pauseButton.width < l.hintButton.x);
  });

  test("매우 넓은 뷰: 버튼 최대 크기 캡", () => {
    const l = computeUILayout(4000, 3000);
    assertTrue(l.timerBar.height <= 14);
    assertTrue(l.pauseButton.width <= 100);
    assertTrue(l.hintButton.width <= 150);
  });

  test("타이머 바는 항상 뷰포트 전체 폭", () => {
    const l = computeUILayout(768, 1024);
    assertEqual(l.timerBar.width, 768);
  });

  test("isHintButtonHit / isPauseButtonHit: 버튼 영역 판별", () => {
    const l = computeUILayout(400, 800);
    const h = l.hintButton;
    const p = l.pauseButton;
    assertTrue(isHintButtonHit(l, h.x + 5, h.y + 5));
    assertFalse(isHintButtonHit(l, p.x + 5, p.y + 5));
    assertTrue(isPauseButtonHit(l, p.x + 5, p.y + 5));
    assertFalse(isPauseButtonHit(l, h.x + 5, h.y + 5));
  });
});
