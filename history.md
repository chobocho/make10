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

## 2026-04-24 — 버그 수정: 성공 기록 유지 안 되는 문제

**증상**: 맵 클리어 후 타이틀에 돌아가도 클리어 표시가 없고, 재플레이 시 이전 최고 점수가 더 낮은 점수로 덮이는 문제.

**원인**:
1. `SaveManager.save`는 동일 `mapId`의 기존 레코드를 무조건 덮어써 최고 점수가 보존되지 않음.
2. `TitleScene`이 `saveManager.list()`를 읽지 않아 UI에 클리어 표시/최고 점수가 노출되지 않음.

**수정**:
- `SaveManager.saveBest(record)` 추가 — 기존 점수보다 높을 때만 덮어씀(동점/미만은 유지). `ResultScene`에서 클리어 저장은 `saveBest`로 교체.
- `TitleScene` — 진입 시 `saveManager.list()` 로드해 `bestScores: Map<mapId, score>` 구성. 클리어된 버튼은 녹색 톤 + `★ NNN` 배지로 렌더링. 타이틀 재진입(결과→타이틀) 시 재로드되어 직전 플레이 결과 즉시 반영.
- 테스트 추가: `saveBest`(높음/낮음/동점 4건) + ResultScene이 `saveBest` 사용 검증 + `cleared=false` 시 저장 안 함 + TitleScene 진입 로딩/재진입 재로딩 (누적 143/143 pass).

## 2026-04-24 — 규칙 변경: 중력 적용 + 랜덤 맵

**변경**: 셀 제거 후 Bejeweled 스타일 **중력** 적용. 맵은 자명하게 클리어 가능할 필요가 없으며, 유효 조합이 소진되면 종료.

- `CLAUDE.md` §2-3 / §2-6 업데이트 — 중력 규칙 명시, 종료 조건 3종(cleared/timeup/stuck).
- `Board.applyGravity()` 추가 — 각 열에서 비어있지 않은 셀을 아래로 모음(상대 순서 유지). 이동 발생 여부 반환.
- `GameScene.onPointerUp` — 유효 제거 직후 `applyGravity` + `hint.clear()` + `findValidCombination` 체크. 전체 클리어면 `cleared`, 유효 조합 없으면 `stuck` 로 종료.
- `GameResult`에 `reason: 'cleared' | 'timeup' | 'stuck'` 필드 추가. `ResultScene` 헤드라인이 stuck 시 `🏁 진행 불가` 로 표시.
- `tools/gen-maps.ts` — 수평 합-10 쌍 타일링 제거. 1~9 랜덤 생성 후 초기 유효 조합 존재할 때까지 재시도(최대 200회). cols 짝수 제약 해제.
- `data/map001.json` ~ `map100.json` 모두 재생성 (`mulberry32` 시드 재사용으로 동일 id는 결정적).
- `tests/board.test.ts` — 중력 4건 추가.
- `tests/gameScene.test.ts` — 중력 동작 + stuck reason 2건 추가.
- `tests/integration.test.ts` — 디스크 맵 대신 in-memory 픽스처 사용. stuck 종료 플로우 추가.
- `tests/mapLoader.test.ts` — "수평 쌍 합=10" 주장 제거, "모든 셀 1~9" 로 완화.
- `README.md` — 중력/종료 조건/맵 생성 설명 업데이트.
- 최종: `npx tsc --noEmit` 에러 0, 테스트 **150/150 pass**, 번들 재생성.

## 2026-04-24 — UI 변경: 타이머 숫자 → 무지개 진행 바

- `UILayout` 에 `timerBar` + `hudY` 추가, `computeUILayout` 이 뷰포트 폭 전체 폭의 얇은 바(6~14px)를 상단에 배치.
- `HUDState.timeLeft`(정수 초) → `timeProgress`(0~1 비율) 로 변경 — 매 프레임 매끄럽게 감소.
- `UIRenderer.drawHUD` 에 `createLinearGradient` 로 ROYGBIV 7색 stops. 남은 비율만큼 왼쪽부터 채워 시간이 줄면 오른쪽(보라)부터 사라지고 결국 붉은 띠만 남아 긴박감 전달.
- HUD 본체에서 `⏱ N` 텍스트 제거, 점수는 중앙 정렬로 이동.
- `GameScene.render` — `timer.getRemainingMs() / getLimitMs()` 로 연속 진행도 전달.
- 테스트: UIRenderer 레이아웃 4건 갱신 + 모든 fake ctx에 `createLinearGradient` 스텁 추가. 누적 **151/151 pass**.

## 2026-04-24 — 규칙 변경: 블럭 리필 (보드 항상 가득)

**변경**: 중력 적용 후 상단의 빈 칸이 **새 임의 블럭(1~9)**으로 채워져, 보드가 항상 가득 찬 상태를 유지. 시각적으로 "위에서 새 블럭이 내려오는" 효과.

- `Board.refill(randomFn?)` 추가 — 남은 빈 칸을 1~9로 채움. 주입된 RNG로 결정적 테스트 가능. 반환값은 채워진 셀 수.
- `GameScene` — `randomFn` 생성자 인자(기본 `Math.random`) + 매치 성공 시 `clearCells` → `applyGravity` → `refill(randomFn)` 순서로 처리.
- `isCleared()` 분기 제거 (리필로 실질적으로 false). `stuck` 검사는 유지하지만 확률적으로 드뭄.
- `CLAUDE.md` §2-3/§2-6 업데이트 — 리필 규칙 명시, 주 종료 경로를 timeup 으로.
- `README.md` — 리필 동작 설명 추가, 점수 규칙에서 클리어 보너스 삭제.
- 테스트:
  - `board.test.ts` — refill 3건 (채워진 수/RNG 주입/불변).
  - `gameScene.test.ts` — 매치 후 보드 가득 유지, refill 값 검증, stuck 은 RNG=0 주입으로 강제.
  - `integration.test.ts` — "클리어" 플로우 → "매치 후 타이머 만료 → result → retry" 로 교체. stuck 플로우는 `new GameScene(ctx, () => 0)` 로 RNG 주입.
- 최종: `npx tsc --noEmit` 에러 0, 테스트 **154/154 pass**, 번들 재생성.

## 2026-04-24 — 별 3개 단계(★★★) 도입

**규칙**: 맵별 3개 임계값(`starThresholds`)으로 성공 여부와 별점 결정. 시작 시 인트로 오버레이로 기준 점수 안내.

- `src/game/Scoring.ts` — `computeStars`, `starsString`, `defaultStarThresholds` 순수 함수.
- `MapData.starThresholds: [s1,s2,s3]` 추가 (오름차순), `validateMap` 에서 엄격 검증.
- `tools/gen-maps.ts` — 각 맵에 `defaultStarThresholds(cols,rows,timeLimit)` 로 자동 계산 + 100단위 반올림.
- `data/map001~100.json` 재생성 (starThresholds 필드 추가).
- `GameResult` — `stars`, `starThresholds` 필드 추가. `cleared = stars >= 1`.
- `GameScene`:
  - 생성자 3번째 인자 `introDurationMs` (기본 2500ms, 테스트 주입 시 0).
  - 인트로 오버레이: 맵 이름 + ★/★★/★★★ 임계값 + 탭/시간 경과 안내. 인트로 중 타이머는 정지, 보드 입력 무시 (탭은 인트로 해제 전용).
  - HUD 중앙 점수 옆 `★★☆` 실시간 표시.
  - 종료 시 stars/임계값을 GameResult에 포함.
- `ResultScene`:
  - 헤드라인 아래에 획득 별(`★★☆`) 크게 표시.
  - 각 별 단계 임계값과 달성 여부(✓/·) 나열.
  - 점수 저장 시 `stars` 필드 포함.
- `TitleScene`:
  - 각 맵 버튼 하단에 최고 별점(`★★☆`) 표시. `saveManager.list()` 에서 `stars` 필드 사용.
- `ProgressRecord.stars` 필드 추가 (선택 필드, 과거 레코드 호환).
- 테스트 (168/168 pass):
  - `scoring.test.ts` 8건 — 컷오프/표기/기본 임계값.
  - `gameScene.test.ts` — 인트로 표시/탭-해제/자동-해제 3건, 인트로 중 보드 입력 차단, stars/임계값 포함 결과.
  - `mapLoader.test.ts` — starThresholds 누락/오름차순 위반 거부 케이스.
  - 기존 픽스처 전부에 `starThresholds` 추가, 일부 임계값을 테스트 의도에 맞게 조정.
- CLAUDE.md §2-7 / README 업데이트.

## 2026-04-24 — 일시정지/재개 기능

- HUD 레이아웃에 `pauseButton` 필드 추가 (좌측, 힌트 버튼과 대칭). `computeUILayout` 이 너비 기준 clamp 으로 양쪽 버튼 크기 산정.
- `UIRenderer.drawHUD` — 좌측 `⏸`/`▶` 아이콘 토글, `HUDState.paused` 로 배경색 강조.
- `GameScene`:
  - `pauseGame()` / `resumeGame()` / `isPaused()` API 노출. 인트로 중·종료 후에는 일시정지 요청 무시.
  - pause 시 타이머 정지 + 현재 선택/힌트 하이라이트 초기화.
  - `update()` — 일시정지면 timer/hint tick 건너뜀.
  - `onPointerDown` — `⏸` 버튼 tap → pause, 일시정지 중 보드 탭 → resume, 일시정지 중에는 힌트 버튼 무시.
  - `onPointerUp` — 일시정지 버튼은 press+release 인 바운스 처리.
  - pause 오버레이 렌더링 — "⏸ 일시정지" 헤드라인 + 안내 문구.
- 테스트 5건 추가 (pause 토글 / tick 무시 / 보드 탭 재개 / 힌트 차단 / 인트로 중 요청 무시). 누적 **173/173 pass**.

## 2026-04-24 — 레벨 선택 밝은 테마 + 스크롤 버그 수정

**버그**: 100개 맵 중 약 8개(첫 2줄)만 화면에 보이고 나머지는 접근 불가 — 스크롤 미구현.

**수정 + 리디자인**:
- `SceneLayout.computeMapGridLayout` 반환에 `contentHeight` 추가 (전체 그리드 + 하단 패딩 포함 총 높이).
- `TitleScene` 전면 재작성:
  - **밝은 테마**: 상단 크림(`#fff6ec`) → 하단 하늘(`#e8f4fa`) 수직 그라데이션. 둥근 모서리 카드형 버튼(흰 본체 + 얇은 경계 + 소프트 그림자). 클리어한 맵은 연한 녹색 바디 + 진녹색 경계.
  - **별 3개 렌더링**: 금색(`#f5a623`) 채움 + 연한 베이지(`#d6cdc2`) 빈 별.
  - **타이포**: 타이틀 900 weight 네이비, "맵을 선택하세요" 서브타이틀.
  - **스크롤**:
    - 드래그 제스처: 임계값(10px) 초과 시 스크롤 모드 전환 → 버튼 press 취소.
    - 휠: canvas 에 `wheel` 리스너 직접 등록, `deltaY` 적용 + `preventDefault`.
    - 우측 얇은 스크롤바 썸 표시 (콘텐츠가 넘칠 때만).
    - `scrollY` 클램프 `[0, maxScrollY]`. 히트 테스트는 `y + scrollY` 로 로지컬 좌표 변환.
    - 가시 영역 밖 버튼은 컬링으로 생략.
- 테스트 4건 추가 (100 맵 시 maxScrollY>0, 드래그 스크롤로 탭 취소, 미세 이동은 탭 유지, 스크롤 후 탭 정확히 히트). 누적 **177/177 pass**.

## 2026-04-25 — 튜토리얼에 ㄱ자/L자 실습 단계 추가 (총 5단계)

**변경**: 직선 3셀 실습만 있던 튜토리얼에 꺾인 경로(ㄱ/L자) 실습을 추가.

- 신규 phase 4: 보드 `[[5, 3, 1], [4, 2, 6]]`. 2셀 합=10 조합 없음, 3셀 직선도 없음 → 사용자가 반드시 꺾인 경로를 사용해야 함.
- 유효 경로: `5→3→2`, `3→1→6` (그리고 그 역방향). 어느 ㄱ자 경로든 정답 인식.
- 안내 문구: "꺾어서도 가능 — 5 → 3 → 2"
- 단계 흐름: `텍스트 → 2셀 → 3셀 직선 → 3셀 ㄱ자(NEW) → 텍스트 시작`
- 페이지 인디케이터 5개로 자동 확장 (`PHASES.length` 기반).
- 테스트 (258/258 pass): 기존 phase 3 종료 테스트를 phase 3→4 전환 검증으로 분리, 신규 3건 추가:
  - phase 4 진입 시 미니 보드 차원 3×2 검증
  - 5→3→2 ㄱ자 드래그 → success → phase 5
  - 3→1→6 다른 ㄱ자 경로도 정답 인식
  - phase 5 finale 텍스트 탭 → 종료 + 완료 마킹

## 2026-04-25 — 이슈 #33 만능(?) 블럭

어떤 숫자와도 합 10 매치를 만드는 wildcard 블럭 도입.
무한 게임 흐름을 위해 stuck 시 자동 회복 + 랜덤 타임 자동 스폰.

### 데이터 모델 (Board)
- 4번째 생성자 인자 `initialWildcards` 추가 + 별도 `wildcards[r][c]` 배열.
- 만능 셀 규약: grid=0, lives≥1(자동 1 보정), obstacle=false. 장애물과 상호 배타.
- `isEmpty(c,r)` 시맨틱 보정: `grid===0 && !wild` (만능은 빈칸 아님 → 선택 가능).
- `isWildcard(c,r)`, `wildcardsSnapshot()`, `convertToWildcard(c,r)` API.
- `applyMatch` → 파괴 시 wild 플래그도 false 로 정리.
- `applyGravity` → 만능도 일반 블럭처럼 떨어짐 (wild 플래그 보존).
- `refill` → 만능 셀은 보존(refill 대상 아님).
- `nonEmptyCells` → wild 필드 추가.

### 매칭 규칙 (Selector / Hint)
- 신규 헬퍼 `isWildSum10(positions, board)` (`Selector.ts`).
  - W=만능 개수, S=고정 셀 합. `(10-S) ∈ [W, 9·W]` 이면 매치 가능.
  - W=0이면 기존 규칙(S=10).
  - (W,X) 가로 인접: X∈[1,9]면 항상 매치. (W,W): 매치. (W,X,Y): X+Y∈[1,9].
- `Selector.isValidForRemoval`, `Hint.findValidCombination` 모두 새 규칙 사용.

### 렌더 + 이펙트
- `BoardRenderer`: 만능 셀은 보라→핑크 그라데이션 배경 + 흰 ? 글리프 + 흰 외곽선.
- `EffectLayer.spawnWildcardEntrance(col, row, layout)` 신규:
  - 외곽 14개 파티클이 중심으로 수렴 + 보라색 확장 링 + "?" 라벨 팝업.
- `AudioManager`: `wild` 사운드 추가 (660~1320Hz, 360ms, sine).

### GameScene 통합
- 상수: `WILD_SPAWN_MIN_MS=12000`, `MAX_MS=25000`, `MAX_ON_BOARD=3`.
- `nextWildSpawnMs` 카운트다운 (활성 시간만 누적, 일시정지 중 멈춤). 0 도달 → `trySpawnWildcard()` + 인터벌 재추첨.
- **stuck 회복**: 매치 후 `findValidCombination=null` 이면 `trySpawnWildcard` → 그래도 없으면 `endGame("stuck")`.
- `trySpawnWildcard`: 비-장애물·비-만능·비-빈칸 후보 중 랜덤 1개 변환. cap 3개. 사운드 + 등장 이펙트.
- `_setWildEnabled(false)` 테스트 토글 — 기존 stuck 흐름 검증을 위한 옵트아웃.
- 세션 저장에 `boardWildcards` 포함.

### MapLoader / SaveManager
- `MapData.initialWildcards`, `ProgressRecord.boardWildcards` 옵셔널 필드 + 검증(0/1, 만능 자리 board=0 + obstacle=0).

### 테스트 (20건 추가)
- Board 9건: 생성자/검증/convertToWildcard/applyGravity/refill/snapshot.
- Selector 3건: (W,X)/(W,W)/(W,X,Y).
- Hint 4건: 만능 인접 매치 발견, 격리된 만능은 null.
- GameScene 4건: trySpawnWildcard, stuck 회복, 자동 타이머 스폰, _setWildEnabled.
- 기존 8건은 `_setWildEnabled(false)` 옵트아웃 또는 nonEmptyCells 시그니처 보정.
- 검증: 350/350 pass (5회 안정), 번들 114.0 → 123.8KB.

## 2026-04-25 — 이슈 #32 3셀 매치 점수 400 → 300

밸런스 조정 — 400 은 셀당 133점이라 2셀(100/셀) 대비 33% 우위로 다소 강했음.
300으로 낮춰 셀당 100점 동등, 한 번의 3셀(300) > 두 번의 2셀(200) 정도의 적정 격차.

- `SCORE_TRIPLE` 400 → 300 (`src/scenes/GameScene.ts`).
- `EffectLayer` 팝업 라벨 "+400" → "+300" + 주석 동기화.
- 테스트 1건 점수 단언 갱신. 330/330 pass.

## 2026-04-25 — 이슈 #31 연쇄 보너스 (1초 이내 매치)

게임성 평가 후속 — "연쇄(chain) 부재로 보상감 부족" 피드백 반영.

- **로직** (`src/scenes/GameScene.ts`):
  - `CHAIN_WINDOW_MS=1000`, `CHAIN_BONUS_STEP=50`, `CHAIN_BONUS_CAP=250` 상수.
  - `elapsedMs` (단조 증가, 일시정지/인트로/튜토리얼 중에는 멈춤) 도입 — 외부 시계 의존성 없이 테스트 가능.
  - `chainCount`, `lastMatchAtMs` 추적. 매 매치마다 `elapsedMs - lastMatchAtMs ≤ 1000` 이면 chain += 1, 아니면 1로 리셋.
  - 보너스: `chain >= 2` 일 때 `min(CAP, STEP * (chain - 1))` → 50, 100, 150, 200, 250(cap).
  - score 적용: `base(100/400) + chainBonus`.
  - 세션 복원 / restartMap 시에도 항상 0으로 리셋.
- **시각** (`src/renderer/EffectLayer.ts`):
  - `RemovalOptions { chainBonus, chainDepth }` 추가, `spawnRemoval` 4번째 인자로 전달.
  - 베이스 팝업 위쪽에 "⚡ +50 x2" 형태의 하늘색 배지 ScorePopup 1개 추가.
- **테스트** (10건 추가):
  - `gameScene.test`: chainMap (6×6 4/6 교차, 결정적 RNG로 무한 자체순환) 헬퍼 도입.
    1) 첫 매치 보너스 없음, 2) 1초 이내 +50, 3) 1초 초과 끊김, 4) 3연쇄 누적,
    5) 7번 반복으로 cap 검증(delta 100→150→200→250→300→350→350), 6) 배지 팝업 추가, 7) restartMap 리셋.
  - `effectLayer.test`: chainBonus 옵션 시 +1 팝업, chainBonus=0이면 추가 없음 3건.
  - 기존 `fakeRenderer` ctx 에 `arc`/`fill`/`globalAlpha`/`strokeText` 추가 (이펙트 렌더 호환).
- 검증: 330/330 pass, 번들 112.8 → 114.0KB.

## 2026-04-25 — 이슈 #30 3셀 매치 점수 250 → 400 인상

게임성 평가 후속 — 3셀 매치 보상이 약했던 점(2셀×2=200 < 3셀=250, 셀당 83점) 보강.

- `SCORE_TRIPLE` 250 → 400 (`src/scenes/GameScene.ts`).
- 셀당 100→133, 2셀×2=200 < 3셀=400 으로 명확한 우월성.
- 점수 팝업 라벨 "+250" → "+400" 동기화 (`EffectLayer.ts`).
- 별 임계값(`defaultStarThresholds`)은 보드/시간 기반이라 변경 없음 — 결과적으로 3셀 활용 플레이어의 별점 획득이 쉬워짐(의도).
- 테스트 1건 추가: 2셀 매치 후 score=100, 3셀 매치 후 score=400, 3셀이 2×2셀보다 큼 단언. 320/320 pass.

## 2026-04-25 — 이슈 #29 매치 이펙트 강화

매치 시 즉발적이던 셀 제거에 시각 피드백 추가. 3셀 매치는 더 강한 이펙트.

- **신규**: `src/renderer/EffectLayer.ts` — 게임 로직과 분리된 이펙트 레이어.
  - `ParticleBurst` — 셀 중심에서 방사형으로 튀는 파티클(중력+마찰 적용).
  - `ScorePopup` — 위로 떠오르며 페이드되는 "+100" / "+250" 텍스트(외곽선 포함).
  - `ExpandingRing` — easeOutCubic로 확장하며 페이드되는 링 (3셀 전용).
  - `spawnRemoval(cells, layout, kind)` — pair / triple 두 모드.
- **차등 강도**:
  - **pair (+100)**: 파티클 9개/셀, 수명 ~420ms, 흰/노/하늘 팔레트, 팝업 한 개.
  - **triple (+250)**: 파티클 16개/셀, 수명 ~620ms, 골드/오렌지 팔레트, 팝업 + 링 2개(외곽 + 내부).
- **GameScene 통합** (`src/scenes/GameScene.ts`):
  - 매치 적용 **전** `boardRenderer.getLayout()` 캡처 + 셀별 lives 캡처 → applyMatch 후 lives→0 으로 실제 파괴된 셀만 destroyed 목록에 포함.
  - 멀티라이프로 살아남은 셀은 파티클 안 나옴(시각적 정합성).
  - update 루프에서 effects.update(), render 시 보드 위·HUD 아래에 합성.
  - exit/restartMap 시 effects.clear() 로 정리.
- **테스트** (13건 추가):
  - `tests/effectLayer.test.ts` 10건 — pair/triple 이펙트 개수 차이, 빈 셀 무시, 만료 정리, 0ms 노옵, clear, 렌더 스모크, triple 수명 > pair.
  - `tests/gameScene.test.ts` 3건 — 2셀/3셀 매치 시 이펙트 활성, 멀티라이프 생존 셀은 파티클 미스폰 (개수 동일 검증).
- 검증: 319/319 pass, 번들 105.3 → 112.8KB.

## 2026-04-25 — 이슈 #28 101-199 장애물 추가 (≤2%)

장애물 도입 시작점을 200 → 101로 낮춤. 단 101-199 구간은 가벼운 도입(≤2%).

- **gen-maps.ts** (`tools/gen-maps.ts`)
  - `OBSTACLE_MIN_ID`: 200 → 101.
  - `obstacleRatiosFor(id)` 도입 — 101-199는 [1%, 2%] cap 2%, 200+는 [3%, 5%] cap 5%.
  - `genObstacles(cols, rows, rand, id)` 시그니처에 id 추가.
- **데이터** — `data/map101.json ~ map199.json` 재생성(시드 동일하지만 genObstacles 호출이 추가되어 RNG 시퀀스가 시프트됨, 보드 자체는 새로 샘플링).
- **mapLoader.test** — `id<200 obstacles 없음` → `id<101 없음` + `101-199 ≤ 2%` + `≥200 ≤ 5%`로 분리.
- 검증: 284/284 pass, 번들 105.3KB.

## 2026-04-25 — 이슈 #25/#26/#27 맵 200/300 확장 + 장애물 + 페이지 네비

전체 사이즈 100→300 확장. 200판부터 페이지 단위로 잠금 + 장애물 도입.

### #25 장애물 코어 지원
- **Board** (`src/game/Board.ts`): 3번째 인자 `initialObstacles` 추가. 내부 `obstacles[r][c]` 배열로 추적.
  - 장애물 셀은 grid=0, lives=0 강제. 생성자 정합성 검증.
  - `isObstacle(c,r)`, `obstaclesSnapshot()` API.
  - **applyGravity 재작성**: 각 열에서 비-장애물 슬롯만 모아 가상 스택으로 처리. 위쪽 블럭이 장애물을 통과해 아래쪽 빈칸에 쌓임. 장애물은 절대 이동/제거 안 됨.
  - **refill**: 장애물 셀은 건드리지 않음.
- **MapData/MapLoader** (`src/data/MapLoader.ts`): 옵셔널 `initialObstacles: number[][]` 필드 + 검증(0/1 외 값 거부, 1 자리 board=0 강제, 차원 일치).
- **BoardRenderer** (`src/renderer/BoardRenderer.ts`): 어두운 회갈색 배경 + 🪨 이모지로 장애물 시각화. 컨텍스트는 보드 본체와 동일.
- **GameScene** (`src/scenes/GameScene.ts`): Board 생성/세션 저장에 obstacles 연결. `boardObstacles`(0/1) 세션 필드 추가.
- **SaveManager**: `ProgressRecord.boardObstacles` 옵셔널 추가.
- 테스트 9건 추가(Board 7건, MapLoader 5건).

### #26 페이지 기반 TitleScene
- **SceneLayout** (`src/scenes/SceneLayout.ts`): `MapGridLayout` 인터페이스화 + `pagerY/pagerHeight/prevArrow/nextArrow/pagerLabelFontPx/pagerLabelCenterX` 추가.
- **TitleScene** (`src/scenes/TitleScene.ts`): 스크롤 단일 그리드 → 100단위 페이지(1-100/101-200/201-300).
  - 헤더 고정, 좌우 화살표 + "1-100 / 페이지 1 / 3" 라벨.
  - **페이지 잠금**: 페이지 N(>1)은 (N-1)*100 맵의 ★≥1 클리어 필요.
  - **맵 잠금(#24)** 페이지 내에서도 그대로 적용.
  - 스크롤은 페이지 내부에서 유지(헤더 위로 침투하지 않게 컬링).
  - `_isMapUnlocked / _isPageUnlocked / _getPage / _setPage` 테스트 접근자.
- **main.ts**: `MAX_MAP_ID = 100 → 300`.
- 테스트 6건 추가, 기존 `_isUnlocked` 호출은 `_isMapUnlocked`로 일괄 갱신, 스크롤 후 카드 탭 테스트는 페이저 영역 회피하도록 idx 12→24 로 변경.

### #27 맵 101-300 + gen-maps 확장
- **gen-maps.ts** (`tools/gen-maps.ts`):
  - presetFor 확장 — 마스터/그랜드마스터/장애물 입문/장애물 마스터 단계.
  - `OBSTACLE_MIN_ID=200`, `OBSTACLE_MAX_RATIO=0.05` 상수.
  - `genObstacles()` — id≥200 에서 보드 셀의 3-5%(절대 5% 미만)을 장애물로 셔플 배치.
  - `genBoardWithInitialCombo` — obstacles 인자 받아 검증 시 `new Board(board, undefined, obstacles)` 로 유효 조합 존재 확인.
  - 장애물 자리 lives=0 강제.
- **data/map101.json ~ map300.json** 200개 신규 생성. 200~300은 `initialObstacles` 포함.
- **mapLoader.test**: MAP_COUNT 100→300 확장. 검증 시 obstacles 함께 전달. `id<200` obstacles 부재, `id≥200` 비율 ≤5% 단언.
- 검증: 283/283 pass, 번들 105.3KB.

## 2026-04-25 — 이슈 #24 레벨 순차 잠금

**변경**: 직전 맵을 ★1 이상으로 클리어해야 다음 맵에 진입 가능. map 1은 항상 열림.

- **TitleScene** (`src/scenes/TitleScene.ts`)
  - `isUnlocked(mapId)` 추가 — `mapId === 1` 또는 `bestStars[mapId-1] >= 1` 일 때 true.
  - 잠긴 맵 카드: 회색 배경/테두리 + 별 자리에 🔒 이모지 (별점 의미 없음).
  - 잠긴 카드 탭 시 `loadMap`/`transition` 호출하지 않음 (사운드도 미발생).
  - 테스트 접근자 `_isUnlocked(mapId)` 노출.
- **ResultScene** (`src/scenes/ResultScene.ts`)
  - `hasNext()`에 `result.cleared` 조건 추가 — 실패 결과(timeup/stuck)에서는 다음 버튼 비활성.
  - 비활성 시 기존 `COLOR_BTN_DISABLED` 스타일이 그대로 적용된다.
- **테스트** (`tests/titleResultScene.test.ts`, `tests/integration.test.ts`)
  - 신규 5건: 최초 진입 시 1번만 해제 / 클리어 후 다음 맵 해제 / stars=0은 미해제 / 잠금 카드 탭 무시 / 실패 후 next 무시.
  - 기존 `타이머 만료 → next 가능` 테스트는 정책에 맞게 `next 비활성: result에 머문다`로 갱신.
  - 기존 `스크롤 후 버튼 탭` 테스트는 잠금 정책상 idx=12 진입을 위해 사전 12개 클리어 기록 주입.
- 검증: 263/263 pass, 번들 96.9KB.

## 2026-04-25 — 인터랙티브 튜토리얼 (실습 단계 도입)

**변경**: 텍스트 3슬라이드였던 튜토리얼을 4단계 인터랙티브로 업그레이드.

- **단계 구성**:
  1. 텍스트 — 🎯 합 10 만들기 (목표 안내, 탭 진행)
  2. **실습** — `[[3, 7]]` 미니 보드. 사용자가 직접 드래그해 합 10 매치
  3. **실습** — `[[1, 2, 7]]` 3셀 매치
  4. 텍스트 — ⭐ 점수와 별 (+100/+250/★1 클리어, 탭으로 시작)
- **피드백**:
  - 정답 매치 → ✓ "잘했어요!" 800ms 표시 후 자동 다음 단계
  - 합≠10인 2~3셀 선택 → "다시 시도해보세요" 1000ms 표시 후 같은 단계 유지
  - 1셀만 탭 후 떼는 등 미선택은 무시
- **건너뛰기**: 우상단 버튼은 모든 단계에서 즉시 종료 + `markTutorialDone` 호출.
- **모듈 분리**: `src/scenes/TutorialOverlay.ts` 신규 — 자체 미니 Board/Selector + BoardRenderer 인스턴스 보유. GameScene 은 위임만(`update`/`render`/`onPointer*` 모두 라우팅, 반환값 `'completed'|'skipped'|'continue'` 로 종료 시점 통보).
- **GameScene 변경**: `tutorial: TutorialOverlay` 단일 필드로 단순화. 기존 `tutorialActive`/`tutorialSlide`/`pressedTutorialSkip`/`tutorialSkipBtn` 4개 필드 제거. `recomputeLayout` 시 튜토리얼 미니 보드도 재계산.
- **테스트 (255/255 pass)**:
  - 기존 튜토리얼 9건 갱신 (slide → phase 용어, phase kind 검증).
  - 신규: phase 1→2 전환 + 미니 보드 레이아웃 / phase 2 정답 드래그 → 자동 phase 3 / 1+2+7 3셀 매치 → 종료 / 실습 단계 건너뛰기.
  - 테스트 접근자: `_getTutorialPhase` / `_getTutorialPhaseKind` / `_getTutorialFeedback` / `_getTutorialBoardLayout` 신규.

## 2026-04-25 — 1판 튜토리얼 모드 + 메타 영속 저장

**요청**: 첫 맵에서 게임 방법을 안내하는 튜토리얼이 노출되어야 하고, 한 번 보면 DB에 기록해 다시 안 보여야 한다.

**구현**:
- **저장 계층**: IndexedDB `make10db` 에 `meta` 스토어 신설 (DB v2→v3, 누락된 스토어만 생성하므로 기존 progress/session 데이터 보존). 키-값 영속.
- **MetaStore 인터페이스** + `MemoryMetaStore` (테스트) + `IndexedDbMetaStore` (실제). `SaveManager` 생성자에 세 번째 인자로 주입.
- **SaveManager API**: `markTutorialDone()`, `isTutorialDone()`, `resetTutorial()` (테스트/디버그). 모두 metaStore 미주입 시 false 폴백.
- **튜토리얼 흐름** (GameScene):
  - `enter`에서 `mapId === 1` 이고 `isTutorialDone === false` 일 때만 `startTutorial()`.
  - 3개 슬라이드 (목표 / 선택 규칙 / 점수와 별), 탭으로 전진, 마지막 슬라이드 탭 시 종료.
  - 우상단 "건너뛰기" 버튼 (press+release 인 바운스). 종료 시 자동으로 `markTutorialDone()` 호출.
  - 튜토리얼 활성 중에는 `update`/`pauseGame`/`onPointerMove` 등 모든 게임 입력 차단. 인트로 오버레이도 가려진 상태로 대기.
  - 튜토리얼 종료 → 기존 인트로(맵별 ★ 임계값) → 게임 시작 흐름.
- **테스트 (252/252 pass)**:
  - `saveManager.test.ts` 4건 — 메타 기본값/마킹/리셋/폴백.
  - `gameScene.test.ts` 9건 — 튜토리얼 트리거 조건 / 슬라이드 전진 / 건너뛰기 / press-out / pause·update 차단 / 보드 입력 차단 / 영속성.
  - `integration.test.ts` `buildContext`에 MetaStore 주입 + 튜토리얼 사전 시딩(동기 Map 접근으로 microtask race 회피).
  - 기존 GameScene 테스트 중 `id: 1` 인라인 맵 2개를 `id: 2` 로 조정.

## 2026-04-25 — 멀티라이프 블럭 도입 (id ≥ 10)

**규칙**: id 10부터 보드 일부 셀이 lives 2~5의 멀티라이프 블럭이 되어, 매치마다 lives -1 되고 0이 되어야 제거된다. 색맹 접근성을 고려해 파랑 단색조 명도 그라데이션 + 좌상단 lives 배지로 표시.

- **출현 규칙**:
  - id < 10: 멀티라이프 없음(기존과 동일).
  - 최대 lives = `min(5, 1 + floor(id/10))` → 10s=2, 20s=3, 30s=4, 40s=5+.
  - 초기 보드 셀의 15% 이하 비율로 멀티라이프 셀 배치(난이도 상승에 따라 비율도 5%→15%로 증가). 리필은 항상 lives=1.
- **데미지 규칙**:
  - 2셀 매치, 양쪽 모두 lives ≥ 2: damage = `min(A.lives, B.lives)`. 양쪽에서 그만큼 차감 → 작은 쪽 즉시 제거, 큰 쪽 잔여만큼 살아남음(같으면 둘 다 제거).
  - 그 외(2셀 한쪽만 멀티 / 3셀 매치): 셀당 1 데미지, 0 도달 셀만 제거.
  - 점수: 매치당 +100/+250 동일 (데미지든 제거든 무관).
- **시각화**:
  - 색상 매핑(lives → 배경): 1=흰, 2=`#d4ebf8`, 3=`#8cc1de`, 4=`#4291bd`, 5=`#1e4d80`.
  - 좌상단 `xN` 텍스트 배지로 lives 카운트 표시 (색맹 보조 — 명도 외에도 텍스트로 명확).
- **데이터 스키마**:
  - `MapData.initialLives?: number[][]` 옵셔널 필드. 미지정이면 모두 1.
  - `validateMap`: 차원/[1..5] 범위/빈칸-lives 정합성 엄격 검증.
  - `ProgressRecord.boardLives?` 추가 — 세션 복원 시 lives 보존.
- **Board 변경**:
  - 평행 `lives` 그리드 추가 (grid와 차원 동일).
  - `applyMatch(positions): number` 신규 — 위 데미지 규칙 적용, 제거된 셀 수 반환.
  - `applyGravity` / `refill` 이 lives 도 함께 처리. `refill` 은 새 셀에 lives=1 부여.
  - `getLives`, `livesSnapshot` 신규.
  - `nonEmptyCells` 결과에 `lives` 필드 추가.
- **GameScene**: `clearCells` → `applyMatch` 로 교체. 세션 저장 시 `livesSnapshot` 포함, 복원 시 Board 생성자에 전달.
- **gen-maps.ts**: `maxLifeForId` + `genInitialLives` 추가. id 10~100 재생성 (mulberry32 시드 동일하므로 보드 face value는 결정적).
- **테스트 (216/216 pass)**:
  - `board.test.ts` 9건 — initialLives 검증/applyMatch 분기/중력·리필 lives 보존.
  - `mapLoader.test.ts` 7건 — initialLives 옵셔널 검증 + 100개 맵 라이브 비율 ≤ 15% 회귀.
  - `gameScene.test.ts` 3건 — 멀티+일반 매치/양쪽 멀티 매치/세션 boardLives 보존.

## 2026-04-25 — 진행 중 게임 자동 저장/복구 (탭 전환 + 브라우저 종료 대응)

**요청**: 게임 도중 다른 창으로 이동하거나 브라우저를 종료한 뒤 다시 열면, 이어하기/다시하기/메인 버튼이 있는 일시정지 팝업이 떠야 함.

**구현**:
- `SaveManager` 확장 — 기존 `progress` 스토어(최고 점수 보존)와 분리된 `session` 스토어 신설. IndexedDB 버전 1→2 업그레이드, 누락 스토어만 생성하므로 기존 데이터 유지. SaveManager 생성자에 두 번째 인자 `sessionStore` 추가(기본 null → 폴백). API: `saveSession`, `loadSession`, `clearSession`, `listSessions`(timestamp 내림차순).
- `ProgressRecord`에 `hintsLeft?: number` 선택 필드 추가 — 세션 복원 시 남은 힌트 횟수 보존, progress 레코드는 무시.
- `Timer.setElapsedMs(ms)` 추가 — 세션 복원 시 경과 시간을 직접 설정. 한도 이상이면 즉시 만료(콜백 미호출 — 복원은 만료 이벤트가 아님).
- `GameScene`:
  - `enter({ map, resumeFrom })` — `resumeFrom` 있으면 보드/점수/타이머/힌트를 복원, 인트로 스킵, 즉시 일시정지 메뉴 노출.
  - `pauseGame()` — 자동으로 `saveSession()` 호출 (mapId/boardState/score/stars/timeLeft/hintsLeft/timestamp).
  - `endGame()`/`restartMap()`/`goToTitle()` — 진행 종료/폐기 시 `clearSession(mapId)` 호출.
  - `document.visibilitychange` 리스너 — `enter`에서 부착, `exit`에서 해제. hidden 진입 시 `pauseGame()` 자동 호출. SSR/test 환경(`typeof document === "undefined"`)에서는 no-op.
- `GameApp.start()` — 부팅 시 `saveManager.listSessions()` 조회. 최신 세션이 있으면 해당 맵 로드 후 `fsm.start("game", { map, resumeFrom })`로 직행. 없거나 실패 시 타이틀로 폴백.
- 테스트 (195/195 pass):
  - `saveManager.test.ts` 5건 — session API 왕복/격리/clear/timestamp 정렬/sessionStore=null 폴백.
  - `timer.test.ts` 3건 — setElapsedMs 정상/만료/예외.
  - `gameScene.test.ts` 6건 — pauseGame이 세션 저장 / resumeFrom으로 보드+점수+타이머+힌트 복원 / 재개 후 세션 유지 / 종료(timeup) 시 세션 삭제 / 다시하기 시 세션 삭제 / 메인 시 세션 삭제.
  - 기존 `gameScene.test.ts` fake ctx에 `strokeRect` 스텁 추가(복원 시 즉시 일시정지 오버레이 그려져 호출됨).

## 2026-04-24 — 일시정지 오버레이에 다시하기 / 메인 버튼 추가

**누락**: 게임 화면에서 타이틀로 나가거나 현재 맵을 재시작할 UI 없음.

- `SceneLayout.computePauseMenuLayout(width, height, topOffset)` 추가 — 3개 세로 버튼(resume/restart/exit) + 타이틀 위치 반환.
- `GameScene`:
  - `setupGame()` 추출 — `enter` 와 `restartMap()` 가 공유해 상태/타이머 초기화.
  - 공개 `restartMap()` (현재 `this.map` 재사용, 인트로 다시 표시).
  - private `goToTitle()` — `context.transition("title")`.
  - pauseGame 시 `computePauseMenu()` 호출해 버튼 레이아웃 계산.
  - `drawPauseOverlay` — 헤드라인 "⏸ 일시정지" + `▶ 재개 / 🔁 다시하기 / 🏠 메인` 3개 버튼 세로 스택.
  - `onPointerDown` — paused 상태에서 버튼 영역 히트 테스트 후 `pressedPauseMenuBtn` 기록.
  - `onPointerUp` — press+release 인 바운스로 버튼 확정: resume → `resumeGame`, restart → `restartMap`, exit → `goToTitle`.
  - 이전의 "보드 탭으로 재개" 동작은 제거 (명시적 버튼으로만 재개).
- 테스트 3건 추가(재개/다시하기/메인 각각) + 기존 "보드 탭 재개" 테스트 업데이트 + "빈 영역 탭 시 유지" 테스트. 누적 **180/180 pass**.
- README: 일시정지 메뉴 구성 설명 업데이트.
