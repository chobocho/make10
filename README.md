# Make10

합이 10이 되는 이웃 셀을 드래그로 골라 제거하는 숫자 퍼즐 웹앱.

## 게임 방법

- 격자의 셀을 **상하좌우**로 드래그해 **2개 또는 3개**를 선택합니다 (대각선 불가).
- 3셀 선택은 직선뿐 아니라 **ㄱ자/L자 등 꺾인 경로**도 가능합니다.
- 선택한 셀의 **합이 정확히 10**이면 제거됩니다.
- 제거 후 **중력**이 작동해 위에 있던 블럭이 빈 칸을 채우며 낙하 → 상단에는 **새 블럭이 생성**되어 보드가 항상 가득 찬 상태를 유지합니다 (Bejeweled 스타일).
- 상단의 **무지개 띠**가 남은 시간을 표시합니다 (오른쪽부터 줄어듦).
- 종료 조건
  - **⏱ 시간 초과**: 타이머가 0에 도달 (주 종료 경로)
  - **🏁 진행 불가**: 리필 후에도 유효 조합(합=10)이 전혀 남지 않을 때 (드뭄)
- **⏸ 일시정지** (좌측 상단 버튼): 누르면 타이머와 힌트가 멈추고 메뉴 오버레이가 뜹니다. 오버레이 버튼: **▶ 재개 / 🔁 다시하기 / 🏠 메인**.
- 우측 상단의 **💡 힌트** 버튼으로 유효 조합을 3초간 표시 (맵별 횟수 제한).
- 점수: 2셀 제거 +100 / 3셀 제거 +250.
- **별 3개 단계**: 맵 시작 시 ★/★★/★★★ 목표 점수를 안내. 종료 시 최종 점수로 별 개수 결정.
  - ★ 이상이면 성공으로 기록되며 타이틀 화면에 별이 표시됩니다.

### 1판 인터랙티브 튜토리얼

첫 방문 시 1판에 들어가면 5단계 튜토리얼이 노출됩니다 (한 번 끝낸 뒤로는 재노출 없음, IndexedDB에 영속 저장).

1. 🎯 목표 안내 (텍스트)
2. ✏️ 2셀 실습 — `[3, 7]` 미니 보드에서 직접 드래그
3. ✨ 3셀 직선 실습 — `[1, 2, 7]`
4. ↳ 3셀 ㄱ자 실습 — `[[5, 3, 1], [4, 2, 6]]` (꺾인 경로만 정답)
5. ⭐ 점수와 별 안내 (텍스트)

우상단 **건너뛰기** 버튼은 어느 단계에서든 즉시 종료(완료 처리).

### 멀티라이프 블럭 (id ≥ 10)

10판부터 일부 셀에 **lives 2~5**의 멀티라이프 블럭이 등장합니다. 매치 한 번에 사라지지 않고 lives가 깎이며, 0이 되어야 제거됩니다.

- **최대 lives** = `min(5, 1 + floor(id/10))` → 10s=2, 20s=3, 30s=4, 40s=5+.
- **출현 비율** ≤ 15% (난이도에 따라 5%→15%로 증가).
- **데미지 규칙**:
  - 2셀 매치, 양쪽 모두 lives ≥ 2 → `min(A.lives, B.lives)` 만큼 양쪽 차감 (작은 쪽 즉시 제거).
  - 그 외(2셀 한쪽만 멀티 / 3셀 매치) → 매치된 셀당 1 데미지, 0이면 제거.
- **시각화**: 적록 색맹을 고려해 **파랑 단색조 명도 그라데이션** + 좌상단 `xN` 텍스트 배지.
  - lives 1=흰, 2=연하늘, 3=하늘, 4=중파랑, 5=네이비.

### 자동 저장 & 이어하기

게임 진행 중 다른 탭/앱으로 이동하거나 화면이 잠기면 **자동으로 일시정지 + 세션 저장**됩니다. 다시 돌아오거나 브라우저를 재실행하면 곧장 일시정지 메뉴(이어하기/다시하기/메인)가 뜹니다.

- 저장 항목: 보드 상태(face value + lives), 점수, 남은 시간, 남은 힌트, 타임스탬프.
- 게임 종료/메인메뉴 진입/다시하기 시 세션 자동 삭제.

## 지원 환경

| 환경 | 비고 |
|------|------|
| PC 브라우저 | 마우스 드래그 |
| 모바일 터치 | 한 손가락 드래그 |
| Galaxy Fold 7 접힘(~376px) · 펼침(~768px) | 레이아웃 비율 자동 조정 |
| HiDPI (Retina 등) | `devicePixelRatio` 자동 스케일 |

## 저장소 (IndexedDB)

DB명 `make10db`, 버전 3. 세 object store 로 구성됩니다.

| 스토어 | 키 | 내용 |
|--------|-----|------|
| `progress` | `mapId` | 맵별 최고 점수/별점 (saveBest로 더 높을 때만 갱신) |
| `session` | `mapId` | 진행 중 게임 상태 (자동 저장/복원, 종료 시 삭제) |
| `meta` | `key` | 키-값 영속 플래그 (예: `tutorial_done`) |

DB 미지원/오류 환경에서는 조용히 폴백하며 게임은 정상 진행됩니다.

## 실행

정적 서버에서 그대로 열립니다 (외부 런타임 라이브러리 없음).

```bash
./build.sh            # release/ 폴더 생성
python -m http.server 8001 -d release
```

브라우저에서 [http://localhost:8001](http://localhost:8001) 열기.

개발 중에는 루트에서 곧장 서빙해도 됩니다 (`dist/dist.js` 경로).

```bash
npm install           # devDependencies 설치 (최초 1회)
npx esbuild src/main.ts --bundle --outfile=dist/dist.js --target=es2020 --format=iife
python -m http.server 8001
```

## 빌드

| 스크립트 | 플랫폼 |
|----------|--------|
| `build.sh` | Linux / macOS |
| `build.bat` | Windows |

둘 다 `release/` 폴더를 재생성합니다.
결과물: `release/{index.html, dist.js, data/map001.json ... map100.json}`.

## 테스트

```bash
npx ts-node tests/runner.ts
```

직접 구현한 경량 러너로 250건 이상의 단위/통합 테스트를 실행합니다 (외부 프레임워크 없음).

## 맵 생성

```bash
npx ts-node tools/gen-maps.ts 1 100   # map001 ~ map100 재생성
```

맵은 결정적(`mulberry32` 시드 고정)이며, 1~9 사이 숫자를 랜덤 배치합니다. 초기 보드에 유효 조합이 최소 1개 이상 존재할 때까지 재시도하며, 중력 규칙 하에서 자명하게 전체 클리어가 되는 보장은 없습니다 (실전 퍼즐 난이도). id ≥ 10 맵은 추가로 `initialLives` 필드(2~maxLife)를 가집니다.

## 리소스

- 이모지: 시스템 이모지 폰트 (Apple Color Emoji / Segoe UI Emoji 등). 외부 자산 없음.
- 오디오: Web Audio API `OscillatorNode` 합성. 효과음 파일 없음.

## Architecture

PlantUML 소스는 [`docs/uml/`](./docs/uml/) 에 있고, 아래 PNG는 `plantuml -tpng docs/uml/*.puml` 로 재생성합니다.

### Class diagram

전체 모듈/클래스 관계 — `core` → `scenes` → `game logic` / `renderer` / `storage` 의존 흐름.

![Class architecture](./docs/uml/class-architecture.png)

### Sequence: match flow

드래그 → 합 10 판정 → `applyMatch` (멀티라이프 데미지 분기) → 중력 → 리필 → stuck 판정.

![Match sequence](./docs/uml/sequence-match.png)

### Sequence: session persistence

탭 전환 시 `visibilitychange` → 세션 자동 저장. 부팅 시 최신 세션 발견하면 곧장 일시정지된 GameScene 으로 진입.

![Session sequence](./docs/uml/sequence-session.png)

### Sequence: tutorial flow

1판 첫 진입 시 5단계 튜토리얼(텍스트 → 2셀 실습 → 3셀 직선 → 3셀 ㄱ자 → 텍스트). 종료/스킵 시 `meta` 스토어에 영속 마킹 → 재진입 시 미노출.

![Tutorial sequence](./docs/uml/sequence-tutorial.png)

## 디렉토리

```
make10/
├── index.html             # 진입점
├── src/                   # TypeScript 원본
│   ├── core/              # GameApp, FSM
│   ├── scenes/            # Title / Game / Result + TutorialOverlay
│   ├── game/              # Board, Selector, Timer, Hint, Scoring (순수 로직)
│   ├── renderer/          # CanvasRenderer, BoardRenderer, UIRenderer
│   ├── input/             # PointerInput
│   ├── audio/             # AudioManager
│   ├── data/              # MapLoader
│   └── storage/           # SaveManager (IndexedDB: progress / session / meta)
├── data/                  # map001~map100.json
├── docs/uml/              # PlantUML 소스 + 생성된 PNG
├── tests/                 # 단위 + 통합 테스트
├── tools/                 # gen-maps.ts 등 개발 스크립트
├── build.sh / build.bat   # 릴리스 빌드
└── release/               # 배포 산출물 (빌드 결과)
```

## 라이선스

MIT. 자세한 내용은 [LICENSE](./LICENSE) 참조.
