# 작업 이력

> Make10 프로젝트 작업 이력 (한글, 날짜 오름차순).

---

## 2026-04-24 — 이슈 #01 프로젝트 초기 설정

- `tsconfig.json` 생성 — `strict: true`, `target: ES2020`, `module: ESNext`, `lib: [ES2020, DOM, DOM.Iterable]`.
- `package.json` 생성 — devDependencies에만 `typescript`, `esbuild`, `ts-node`, `@types/node` 등록. 런타임 라이브러리 **없음**.
- `index.html` 생성 — Canvas 단일 엘리먼트 진입점, 모바일 뷰포트 메타, HiDPI/터치 고려한 기본 스타일.
- `.gitignore` 생성 — `node_modules/`, `dist/`, `release/` 등 제외.
- `src/main.ts` 스텁 작성 — DOMContentLoaded 후 Canvas 초기화, 추후 이슈에서 `GameApp` 연결 예정.
- 디렉토리 스켈레톤 생성: `src/{core,scenes,game,renderer,input,audio,data,storage}/`, `data/`, `tests/`, `dist/` — 빈 폴더는 `.gitkeep`으로 유지.

## 2026-04-24 — 이슈 #02 경량 테스트 러너 구현

- `tests/runner.ts` 작성 — `describe`/`test`/`assertEqual`/`assertNotEqual`/`assertTrue`/`assertFalse`/`assertDeepEqual`/`assertThrows`/`assertCloseTo` 제공. `readdirSync`로 동일 디렉토리의 `*.test.ts` 자동 등록.
- `tests/runner.test.ts` — 러너 어설션 셀프 체크 7건 추가, 전체 pass.
- `tsconfig.json`에 `ts-node` 블록 추가 — 테스트 실행 시 `module: CommonJS`, `transpileOnly: true`로 오버라이드. `package.json`에서 `"type": "module"` 제거하여 CJS ts-node 호환성 확보.
- 실행: `npx ts-node tests/runner.ts` → 7/7 pass.

## 2026-04-24 — 이슈 #03 Board 모듈 구현

- `src/game/Board.ts` — 격자 데이터 구조 + 제거/질의 API. 셀 값 0(빈 칸)/1~9(유효값). 중력/보충 없음.
- API: `getCols`, `getRows`, `inBounds`, `getCell`, `isEmpty`, `clearCell`, `clearCells`, `isCleared`, `sumAt`, `snapshot`, `remainingCount`, `nonEmptyCells`.
- 좌표 규약: `(col, row)` — x 먼저, y 나중.
- 검증: 잘못된 값(0~9 정수 외)·행 길이 불일치·빈 보드 생성자에서 즉시 에러.
- `tests/board.test.ts` 15건 추가, 전체 pass.

## 2026-04-24 — 이슈 #04 Selector 모듈 구현

- `src/game/Selector.ts` — 드래그 선택 상태 관리. 4방향 인접 강제, 2~3개 길이 제한, 합 10 판정.
- 직전-직전 셀로 돌아가면 마지막을 pop하는 자연스러운 undo 동작.
- 상수 `MIN_SELECTION=2`, `MAX_SELECTION=3`, `TARGET_SUM=10` export.
- `commit()`에서 결과(positions/sum/valid) 반환 후 상태 초기화.
- `tests/selector.test.ts` 18건 추가, 전체 pass (누적 40/40).

## 2026-04-24 — 이슈 #05 Timer 모듈 구현

- `src/game/Timer.ts` — 밀리초 누적 기반 카운트다운. `tick(deltaMs)`로 진행, `pause`/`resume`/`reset` 지원.
- 실제 시계 대신 델타 주입 방식 → 테스트/일시정지 충실도 확보.
- 만료 시 `onExpire` 콜백 1회 호출, 만료 후 `start`/`resume` 무시.
- `tests/timer.test.ts` 11건 추가, 전체 pass (누적 51/51).

## 2026-04-24 — 이슈 #06 Hint 모듈 구현

- `src/game/Hint.ts` — 유효 조합 탐색 + 힌트 횟수/하이라이트 수명 관리.
- `findValidCombination`: 2셀(가로/세로 인접) 우선 탐색 후 3셀 경로(4방향) 탐색, 합 10 검사. ㄱ자 꺾인 경로도 탐지.
- `Hint.request()`: 유효 조합 없거나 횟수 소진 시 카운트 차감하지 않고 null 반환.
- 하이라이트는 `HINT_HIGHLIGHT_MS=3000ms` 수명, `tick(deltaMs)`로 감소.
- `tests/hint.test.ts` 13건 추가, 전체 pass (누적 64/64).

## 2026-04-24 — 이슈 #07 CanvasRenderer 구현

- `src/renderer/CanvasRenderer.ts` — HiDPI 대응. CSS 픽셀 좌표로 그리도록 `setTransform(dpr,0,0,dpr,0,0)` 적용. `attachToWindow`로 브라우저 크기 연동.
- 구조 분리: 콜백(`onResize`) · 접근자(`getCtx`,`getCanvas`,`getSize`) · `clear([color])`.
- 테스트는 fake canvas/ctx 모킹으로 DOM 없이 검증.
- `tests/canvasRenderer.test.ts` 7건 추가, 전체 pass (누적 71/71).
