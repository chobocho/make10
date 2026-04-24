# Make10

합이 10이 되는 이웃 셀을 드래그로 골라 제거하는 숫자 퍼즐 웹앱.

## 게임 방법

- 격자의 셀을 **상하좌우**로 드래그해 **2개 또는 3개**를 선택합니다. (대각선 불가)
- 선택한 셀의 **합이 정확히 10**이면 제거됩니다.
- 제거 후 **중력**이 작동해 위에 있던 블럭이 빈 칸을 채우며 낙하합니다 (Bejeweled 스타일).
- 종료 조건
  - **🎉 클리어**: 보드의 모든 셀이 비워지면
  - **⏱ 시간 초과**: 타이머가 0에 도달
  - **🏁 진행 불가**: 중력 적용 후 유효 조합(합=10)이 남지 않을 때
- 우측 상단의 **💡 힌트** 버튼으로 유효 조합을 3초간 표시 (맵별 횟수 제한).
- 점수: 2셀 제거 +100 / 3셀 제거 +250 / 클리어 보너스 = 남은 초 × 10.

## 지원 환경

| 환경 | 비고 |
|------|------|
| PC 브라우저 | 마우스 드래그 |
| 모바일 터치 | 한 손가락 드래그 |
| Galaxy Fold 7 접힘(~376px) · 펼침(~768px) | 레이아웃 비율 자동 조정 |
| HiDPI (Retina 등) | `devicePixelRatio` 자동 스케일 |

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

직접 구현한 경량 러너로 136건 이상의 단위/통합 테스트를 실행합니다.

## 맵 생성

```bash
npx ts-node tools/gen-maps.ts 1 100   # map001 ~ map100 재생성
```

맵은 결정적(`mulberry32` 시드 고정)이며, 1~9 사이 숫자를 랜덤 배치합니다. 초기 보드에 유효 조합이 최소 1개 이상 존재할 때까지 재시도하며, 중력 규칙 하에서 자명하게 전체 클리어가 되는 보장은 없습니다 (실전 퍼즐 난이도).

## 리소스

- 이모지: 시스템 이모지 폰트 (Apple Color Emoji / Segoe UI Emoji 등). 외부 자산 없음.
- 오디오: Web Audio API `OscillatorNode` 합성. 효과음 파일 없음.

## 디렉토리

```
make10/
├── index.html             # 진입점
├── src/                   # TypeScript 원본
│   ├── core/              # GameApp, FSM
│   ├── scenes/            # Title / Game / Result
│   ├── game/              # Board, Selector, Timer, Hint (순수 로직)
│   ├── renderer/          # CanvasRenderer, BoardRenderer, UIRenderer
│   ├── input/             # PointerInput
│   ├── audio/             # AudioManager
│   ├── data/              # MapLoader
│   └── storage/           # SaveManager (IndexedDB)
├── data/                  # map001~map100.json
├── tests/                 # 단위 + 통합 테스트
├── tools/                 # gen-maps.ts 등 개발 스크립트
├── build.sh / build.bat   # 릴리스 빌드
└── release/               # 배포 산출물 (빌드 결과)
```

## 라이선스

MIT. 자세한 내용은 [LICENSE](./LICENSE) 참조.
