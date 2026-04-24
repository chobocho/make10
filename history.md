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
