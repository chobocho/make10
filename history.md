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
