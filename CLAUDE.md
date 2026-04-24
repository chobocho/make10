# CLAUDE.md — Make10 웹앱 프로젝트

> Claude Code 운용 지침서. 이 파일을 읽은 후 작업을 시작하라.
> 작업 전 반드시 `Todo.md`와 `history.md`를 확인하라.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 앱 이름 | Make10 |
| 목적 | 숫자 합산 퍼즐 웹앱 (Bejeweled 스타일) |
| 언어 | TypeScript (ES2020 target) |
| 렌더링 | HTML5 Canvas 단일 파일 기반 |
| 실행 | `python -m http.server 8001` (외부 런타임 라이브러리 **금지**) |
| 지원 환경 | PC 브라우저, 모바일 터치, Galaxy Fold 7 (펼침/접힘) |
| 저장소 | https://github.com/seunghwacho |

---

## 2. 게임 규칙 (구현 기준 명세)

### 2-1. 보드 구성
- 격자: N×M 크기 (맵 JSON에서 정의, 기본 6×9)
- 셀 값: 1~9 정수 (맵 JSON에서 초기값 정의)
- 빈 셀(0)은 렌더링하지 않음

### 2-2. 선택 규칙
- **드래그**로 상하좌우 **연속** 2개 또는 3개 셀 선택
- 대각선 선택 **불가**
- 선택한 셀의 합이 **정확히 10**이면 삭제 가능
- 합이 10이 아닌 상태에서 손을 떼면 선택 취소

### 2-3. 삭제 & 중력
- 삭제 조건 충족 시 이펙트(애니메이션) + 사운드 재생 후 셀 제거
- **연쇄(chain)는 없음** — 삭제 후 추가 자동 매칭 없음
- 삭제된 셀은 빈 칸으로 남음 (위에서 떨어지는 중력 **없음**)

### 2-4. 타이머
- 맵별 제한 시간 (맵 JSON의 `timeLimit` 초)
- 타이머 0 도달 시 게임 오버 씬 전환
- 일시정지 지원 (`pauseGame()` / `resumeGame()`)

### 2-5. 힌트
- 힌트 버튼 누르면 유효한 조합 1개를 3초간 하이라이트
- 힌트 사용 횟수는 맵 JSON의 `hintCount` 에 정의

### 2-6. 클리어 조건
- 보드의 **모든 셀이 비워지면** 클리어 (타이머 소진 전)
- 또는 맵 JSON의 `targetScore` 점수 달성 시 클리어 (추후 확장용)

### 2-7. 점수
- 2개 삭제: +100점
- 3개 삭제: +250점
- 남은 시간 보너스: 남은 초 × 10점

---

## 3. 기술 스택 & 빌드

### 3-1. TypeScript 컴파일

```bash
# 개발 (watch 모드)
npx tsc --watch

# 번들 (단일 dist.js 산출)
npx esbuild src/main.ts --bundle --outfile=dist/dist.js --target=es2020
```

- `tsconfig.json` 필수 (`strict: true`, `target: ES2020`, `module: ESNext`)
- **외부 런타임 라이브러리 import 금지** (esbuild, tsc는 devDependency OK)

### 3-2. 빌드 산출물
- `dist/dist.js` — 단일 번들 파일
- `build.sh` — release 폴더 복사 스크립트 (Linux/macOS)
- `build.bat` — release 폴더 복사 스크립트 (Windows, CP949 인코딩)
- `release/` 폴더에는 `index.html` + `dist.js` + `data/` 만 포함

---

## 4. 디렉토리 구조

```
make10/
├── CLAUDE.md          # 이 파일
├── Todo.md            # 이슈 목록 (Claude Code가 여기서 다음 작업 선택)
├── history.md         # 작업 이력 (한글)
├── README.md          # 사용자 문서 (한글)
├── tsconfig.json
├── package.json       # devDependencies만 (esbuild, typescript)
├── index.html         # 진입점
├── build.sh
├── build.bat
├── src/
│   ├── main.ts            # 진입점, GameApp 초기화
│   ├── core/
│   │   ├── GameApp.ts     # 게임 루프 (60 FPS requestAnimationFrame)
│   │   ├── FSM.ts         # 씬 상태 머신
│   │   └── EventBus.ts    # 이벤트 버스
│   ├── scenes/
│   │   ├── TitleScene.ts
│   │   ├── GameScene.ts   # 메인 게임
│   │   └── ResultScene.ts
│   ├── game/
│   │   ├── Board.ts       # 격자 데이터 & 규칙
│   │   ├── Selector.ts    # 드래그 선택 로직
│   │   ├── Timer.ts       # 카운트다운 타이머
│   │   └── Hint.ts        # 힌트 계산
│   ├── renderer/
│   │   ├── CanvasRenderer.ts  # HiDPI Canvas 래퍼
│   │   ├── BoardRenderer.ts
│   │   └── UIRenderer.ts
│   ├── input/
│   │   ├── PointerInput.ts    # 마우스+터치 통합
│   │   └── InputManager.ts
│   ├── audio/
│   │   └── AudioManager.ts    # Web Audio API, base64 에셋 내장
│   ├── data/
│   │   └── MapLoader.ts       # JSON 맵 로드
│   └── storage/
│       └── SaveManager.ts     # IndexedDB CRUD
├── data/
│   ├── map001.json
│   └── ...                # map001~map100
└── tests/
    ├── runner.ts          # 경량 테스트 러너 (외부 라이브러리 없이 직접 구현)
    ├── board.test.ts
    ├── selector.test.ts
    └── timer.test.ts
```

---

## 5. 작업 규칙 (Claude Code 필독)

### 5-1. 작업 순서 (매 세션 시작 시)
1. `Todo.md` 읽기 → **`[ ]` 상태인 첫 번째 이슈** 선택
2. 해당 이슈의 설계 확인 → 모호하면 `Todo.md`에 질문 기록 후 중단
3. `tests/` 폴더의 관련 테스트 먼저 확인
4. 설계 → 테스트 작성 → 구현 → 검증 순서 준수
5. 테스트 전부 통과 확인 후 `git commit -m "[#이슈번호] 설명"`
6. `history.md` 업데이트 (한글, 날짜 포함)
7. `git push origin main`
8. `Todo.md`의 해당 이슈 `[x]`로 마킹
9. **한 번에 하나의 이슈만** — 다음 이슈로 자동 진행 금지

### 5-2. 금지 사항
- `global` 변수 사용 **금지**
- 하드코딩된 좌표/크기 값 **금지** (Canvas 크기 기준 비율 계산 사용)
- 외부 런타임 CDN import **금지**
- 사용하지 않는 코드/에셋 즉시 삭제
- 이슈 완료 전 다음 이슈 착수 **금지**

### 5-3. 코딩 컨벤션
- 변수명: `camelCase` / 클래스명: `PascalCase` / 상수: `UPPER_SNAKE_CASE`
- 주석: 코드의 **의도**를 설명 (무엇이 아닌 왜)
- 게임 루프: `requestAnimationFrame` 기반 60 FPS 고정
- 모든 모듈은 단일 책임 원칙 준수

---

## 6. 테스트 규칙

- 테스트 프레임워크: **직접 구현한 경량 테스트 러너** (`tests/runner.ts`)
  - 외부 Jest/Mocha 런타임 **금지** (devDependency로 타입만 사용 가능)
- 각 이슈 구현 전 테스트 파일 먼저 작성
- 테스트 실행: `npx ts-node tests/runner.ts`
- 새 기능 추가 시 기존 테스트 회귀 확인 필수

---

## 7. 리소스 규칙

| 유형 | 규칙 |
|------|------|
| 이미지 | 이모지 최우선 사용 |
| 무료 이미지 | 사용 시 출처 `README.md`에 표기 |
| 오디오 | Web Audio API 사용, base64로 변환하여 `AudioManager.ts`에 내장 |
| 무료 오디오 | 사용 시 출처 `README.md`에 표기 |

---

## 8. 데이터 & 저장

### 8-1. 맵 JSON 형식

```json
{
  "id": 1,
  "name": "Tutorial",
  "cols": 6,
  "rows": 9,
  "timeLimit": 120,
  "hintCount": 3,
  "targetScore": 0,
  "initialBoard": [
    [1, 2, 3, 4, 5, 6],
    [7, 8, 9, 1, 2, 3]
  ]
}
```

### 8-2. IndexedDB 구조
- DB명: `make10db` / 버전: `1`
- Store: `progress` — 키: `mapId`, 값: `{ mapId, boardState, score, timeLeft, timestamp }`
- DB 오류/손상 시 예외 처리 후 **게임은 계속 동작** (저장 없이 진행)
- 다시하기 시 `confirm()` 다이얼로그로 사용자 확인 후 진행

---

## 9. 화면 지원

| 환경 | 대응 방법 |
|------|-----------|
| PC 브라우저 | 마우스 이벤트 |
| 모바일 터치 | `touchstart/move/end` 이벤트 |
| Galaxy Fold 7 접힘 | ~376px 너비 기준 레이아웃 |
| Galaxy Fold 7 펼침 | ~768px 너비 기준 레이아웃 |
| HiDPI (고해상도) | `devicePixelRatio` 적용 Canvas 스케일링 |

---

## 10. 이슈 목록 → Todo.md 참조

현재 열린 이슈는 `Todo.md`에서 관리한다.  
Claude Code는 매 세션 시작 시 `Todo.md`를 읽고 첫 번째 미완료 이슈를 수행한다.
