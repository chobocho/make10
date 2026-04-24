import { describe, test, assertTrue, assertFalse, assertEqual } from "./runner";
import { computeUILayout, isHintButtonHit } from "../src/renderer/UIRenderer";

describe("UIRenderer layout", () => {
  test("computeUILayout: 타이머 바 + HUD 조합, clamp 적용", () => {
    const l = computeUILayout(400, 800);
    assertTrue(l.timerBar.height >= 6 && l.timerBar.height <= 14);
    assertEqual(l.timerBar.x, 0);
    assertEqual(l.timerBar.y, 0);
    assertEqual(l.timerBar.width, 400);
    assertEqual(l.hudY, l.timerBar.height);
    // HUD 본체 높이 (전체 - 바) 는 60~110 범위
    const hudH = l.uiHeight - l.hudY;
    assertTrue(hudH >= 60 && hudH <= 110);
    assertTrue(l.hintButton.y >= l.hudY);
    assertTrue(l.hintButton.x + l.hintButton.width <= 400);
  });

  test("매우 좁은 뷰: 타이머 바 최소 6px", () => {
    const l = computeUILayout(200, 100);
    assertTrue(l.timerBar.height >= 6);
    assertTrue(l.hintButton.width >= 96);
  });

  test("매우 넓은 뷰: 타이머 바 최대 14px", () => {
    const l = computeUILayout(4000, 3000);
    assertTrue(l.timerBar.height <= 14);
    assertTrue(l.hintButton.width <= 160);
  });

  test("타이머 바는 항상 뷰포트 전체 폭", () => {
    const l = computeUILayout(768, 1024);
    assertEqual(l.timerBar.width, 768);
  });

  test("isHintButtonHit: 버튼 영역 안/밖", () => {
    const l = computeUILayout(400, 800);
    const b = l.hintButton;
    assertTrue(isHintButtonHit(l, b.x + 5, b.y + 5));
    assertFalse(isHintButtonHit(l, b.x - 5, b.y));
    assertFalse(isHintButtonHit(l, b.x, b.y + b.height + 1));
  });
});
