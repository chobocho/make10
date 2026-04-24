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

## 2026-04-24 — 이슈 #08 BoardRenderer 구현

- `src/renderer/BoardRenderer.ts` — 이모지 기반 셀 렌더링 + 선택/힌트 하이라이트.
- 레이아웃 유틸: `computeBoardLayout(bounds, cols, rows, padding)` — 셀 크기 자동 계산 & 중앙 정렬.
- 변환 유틸: `cellRect`, `hitTestCell` — 스크린 ↔ 셀 좌표.
- 키캡 이모지(1️⃣~9️⃣) 사용, 선택 셀 간 경로 라인 표시. 유효/무효 선택을 색상으로 구분.
- `tests/boardRenderer.test.ts` 8건 추가, 전체 pass (누적 79/79).

## 2026-04-24 — 이슈 #09 PointerInput 구현

- `src/input/PointerInput.ts` — PointerEvents API 기반 통합 입력 (마우스/터치/펜).
- 활성 포인터 1개만 추적(멀티터치 방지), `setPointerCapture`로 드래그 이탈 방지.
- 좌표는 대상의 `getBoundingClientRect` 기준 CSS 픽셀 로컬 좌표로 변환.
- fake target으로 DOM 없이 down/move/up, 2번째 포인터 무시, cancel 동작 검증.
- `tests/pointerInput.test.ts` 5건 추가, 전체 pass (누적 84/84).

## 2026-04-24 — 이슈 #10 AudioManager 구현

- `src/audio/AudioManager.ts` — Web Audio API + OscillatorNode 합성 방식 효과음.
- 자산 번들 대신 합성 채택 이유: 번들 크기 최소화 + 외부 런타임 금지 원칙 부합. CLAUDE.md의 base64 내장은 향후 확장 여지로 남겨둠.
- 사운드 7종: select/remove/hint/invalid/clear/gameover/button — 각각 주파수·파형·지속시간 사전 정의.
- 브라우저 자동재생 정책 대응: 컨텍스트 지연 생성 + suspended 시 `resume`.
- 의존성 주입 `ctxCtor`로 Node 테스트에서 fake AudioContext 사용.
- `tests/audioManager.test.ts` 7건 추가, 전체 pass (누적 91/91).

## 2026-04-24 — 이슈 #11 SaveManager 구현

- `src/storage/SaveManager.ts` — IndexedDB 기반 진행 상황 CRUD.
- `ProgressStore` 인터페이스 + `MemoryProgressStore`(테스트용) + `IndexedDbProgressStore`(실제) 분리.
- 모든 실패(미지원, 블록, 트랜잭션 오류)를 삼키고 `false`/`null`/`[]` 반환 → 게임 계속 진행.
- `createDefaultSaveManager()` 팩토리: `globalThis.indexedDB` 유무 자동 감지.
- `tests/saveManager.test.ts` 7건 추가(메모리 스토어 + 예외 스토어), 전체 pass (누적 98/98).

## 2026-04-24 — 이슈 #12 맵 데이터 및 MapLoader

- `tools/gen-maps.ts` — 합이 10인 수평 쌍을 타일링하는 맵 생성기. mulberry32 시드로 맵 id별 결정적 생성. 난이도 프리셋(cols/rows/timeLimit/hintCount)을 id 구간별로 자동 적용.
- `data/map001.json` ~ `data/map010.json` 생성(4x5 ~ 6x9). 모든 맵에서 `findValidCombination` 이 비-null 을 반환함을 테스트로 보장.
- `src/data/MapLoader.ts` — `validateMap` 엄격 스키마 검증 + `parseMapJson` + `loadMap(mapId, fetcher?)`. 테스트/번들 양쪽에서 fetch DI.
- `tests/mapLoader.test.ts` 20건 추가(유효성 6 + 실제 맵 10 + 속성 2 + id 순서 1 + map001 합10 검증 1), 전체 pass (누적 118/118).

## 2026-04-24 — 이슈 #13 GameScene 통합

- `src/scenes/Scene.ts` — 공통 Scene 인터페이스 + SceneContext(renderer/audio/saveManager/transition).
- `src/renderer/UIRenderer.ts` — HUD(타이머/점수/힌트 버튼) + `computeUILayout` 비율 기반 레이아웃 + `isHintButtonHit`. 모든 좌표를 뷰포트 비율에서 clamp(60~110px 등)로 산출 — 하드코딩 금지 규칙 준수.
- `src/scenes/GameScene.ts` — Board/Selector/Timer/Hint + BoardRenderer/UIRenderer/입력을 묶음. 규칙:
  - 2셀 제거 +100, 3셀 +250, 클리어 시 남은 초 × 10 보너스.
  - 유효 합 10 → `remove` 사운드 & 제거, 무효 → `invalid`, 타이머 만료 → `gameover`, 전부 비면 `clear`.
  - 완료 시 `result` 씬으로 `GameResult` 전달.
  - 리사이즈 대응: `renderer.onResize`로 보드/UI 레이아웃 재계산.
- `tests/uiRenderer.test.ts` 4건 + `tests/gameScene.test.ts` 5건 추가, 전체 pass (누적 127/127).

## 2026-04-24 — 이슈 #14 TitleScene / ResultScene

- `SceneContext`에 `loadMap`, `maxMapId` 필드 추가 — 씬이 맵 데이터를 비동기로 가져올 수 있도록.
- `src/scenes/SceneLayout.ts` — 순수 레이아웃 함수 (`computeMapGridLayout`, `computeResultButtonsLayout`, `hitButton`). 테스트 가능한 분리된 수식.
- `src/scenes/TitleScene.ts` — 타이틀 + 맵 선택 그리드 (뷰포트 폭별 3~5열). 클릭 시 `context.loadMap(id)` 비동기 로딩 → GameScene 전환.
- `src/scenes/ResultScene.ts` — 클리어/실패 헤드라인, 점수·남은 시간 표시, `다시/다음/타이틀` 버튼. next는 `maxMapId` 초과 시 비활성. 클리어 시 `saveManager.save` fire-and-forget.
- `tests/titleResultScene.test.ts` 9건 추가(레이아웃 2 + TitleScene 2 + ResultScene 5), 전체 pass (누적 136/136).

## 2026-04-24 — 이슈 #15 FSM + GameApp + main.ts 배선

- `src/core/FSM.ts` — Title/Game/Result 씬 전환 상태머신. `register` → `start/transition` → `update/render/onPointer*` 위임. 전환 중 중첩 호출은 직렬화.
- `src/core/GameApp.ts` — Canvas 초기화, PointerInput 연결, FSM에 씬 등록, 60 FPS requestAnimationFrame 루프. dt 상한(100ms)으로 백그라운드 탭 복귀 시 폭주 방지.
- `src/main.ts` 갱신 — DOMContentLoaded 시 `GameApp.start()`.
- `index.html` — bundle 포맷(IIFE)에 맞춰 `<script type="module">` → `defer` 로드로 수정.
- 첫 번들 빌드: `npx esbuild src/main.ts --bundle --outfile=dist/dist.js --target=es2020 --format=iife` → 48.9kb.
- `tests/fsm.test.ts` 5건 추가, 전체 pass (누적 141/141).

## 2026-04-24 — 이슈 #16 빌드 스크립트

- `build.sh` — `esbuild --minify` 로 번들링 후 `release/` 초기화·재생성. `sed`로 `index.html`의 `dist/dist.js` → `dist.js` 치환하여 평탄화(§3-2 준수).
- `build.bat` — Windows용. CP949/UTF-8 인코딩 이슈 회피를 위해 메시지는 영문 ASCII 유지. 경로 치환은 PowerShell 사용.
- 실행 테스트: `./build.sh` → `release/` 에 `index.html`(dist.js 참조), `dist.js`(27kb 압축), `data/map001~010.json` 정상 생성.

## 2026-04-24 — 이슈 #17 맵 map011~map100 생성

- `npx ts-node tools/gen-maps.ts 11 100` 실행 — 90개 맵 추가. 같은 mulberry32 시드 정책이라 재생성해도 결정적.
- 난이도 프리셋: id ≤10 초급, 11~30 중급(70s/hint 2), 31~60 상급(~65s/hint 1), 61~100 전문가(~60s→56s/hint 1).
- `src/main.ts`의 `MAX_MAP_ID` 를 10 → 100으로 상향.
- `tests/mapLoader.test.ts` 전면 업데이트: 100개 맵 전부 스키마·유효 조합 존재·id 연속성·난이도 경향(후반 평균 시간 < 초반)을 검증. 누적 132/132 pass.
- `./build.sh` 재실행하여 `release/data/` 에 100개 JSON 포함.

## 2026-04-24 — 이슈 #18 통합 테스트 & 버그 수정

- **버그 수정**: `GameScene`의 힌트 버튼이 `pointerdown` 단계에서 즉발(오탭 위험)하던 동작을 **press + release 인 바운스** 패턴으로 변경. `onPointerCancel`도 상태 초기화.
- `tests/integration.test.ts` — Title → Game → Result 왕복 플로우 통합 테스트. 실제 `data/map001.json` · `map002.json` · `map100.json` 을 읽어 파싱/클리어/타임오버/retry/next 흐름을 검증.
- `tests/gameScene.test.ts` 힌트 버튼 테스트 업데이트 — press-only / press-then-release-outside 케이스 추가.
- `README.md` 재작성 — 게임 방법/지원 환경/실행·빌드·테스트 지침/디렉토리 구조/리소스 출처.
- 최종 검증: `npx tsc --noEmit` 에러 0건, `npx ts-node tests/runner.ts` **136/136 pass**, `./build.sh` → `release/dist.js` 27.3kb.
