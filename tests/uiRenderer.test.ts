import { describe, test, assertTrue, assertFalse } from "./runner";
import { computeUILayout, isHintButtonHit } from "../src/renderer/UIRenderer";

describe("UIRenderer layout", () => {
  test("computeUILayout: 비율 기반 + clamp 적용", () => {
    const l = computeUILayout(400, 800);
    // 800*0.1 = 80 → clamp(60, 110) = 80
    assertTrue(l.uiHeight >= 60 && l.uiHeight <= 110);
    assertTrue(l.hintButton.width >= 96);
    assertTrue(l.hintButton.x + l.hintButton.width <= 400);
  });

  test("매우 좁은 뷰: clamp 하한 적용", () => {
    const l = computeUILayout(200, 100);
    assertTrue(l.uiHeight >= 60);
    assertTrue(l.hintButton.width >= 96);
  });

  test("매우 넓은 뷰: clamp 상한 적용", () => {
    const l = computeUILayout(4000, 3000);
    assertTrue(l.uiHeight <= 110);
    assertTrue(l.hintButton.width <= 160);
  });

  test("isHintButtonHit: 버튼 영역 안/밖", () => {
    const l = computeUILayout(400, 800);
    const b = l.hintButton;
    assertTrue(isHintButtonHit(l, b.x + 5, b.y + 5));
    assertFalse(isHintButtonHit(l, b.x - 5, b.y));
    assertFalse(isHintButtonHit(l, b.x, b.y + b.height + 1));
  });
});
