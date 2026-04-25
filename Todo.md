# Todo.md

> Claude Code는 이 파일에서 다음 작업을 선택한다.
> 완료된 이슈는 `[x]`로 마킹 후 history.md에 기록한다.

---

## 진행 중

없음

---

## 대기 중

- [x] #01 프로젝트 초기 설정 — tsconfig.json, package.json, index.html, 디렉토리 구조 생성
- [x] #02 경량 테스트 러너 구현 — tests/runner.ts (외부 라이브러리 없이 직접 구현)
- [x] #03 Board 모듈 구현 — 격자 데이터 구조, 셀 값 관리, 삭제 로직 + 테스트
- [x] #04 Selector 모듈 구현 — 드래그 선택, 합계 검증, 방향 유효성 + 테스트
- [x] #05 Timer 모듈 구현 — 카운트다운, 일시정지/재개 + 테스트
- [x] #06 Hint 모듈 구현 — 유효 조합 탐색 알고리즘 + 테스트
- [x] #07 CanvasRenderer 구현 — HiDPI 지원, devicePixelRatio 스케일링
- [x] #08 BoardRenderer 구현 — 셀 이모지 렌더링, 선택/하이라이트 상태
- [x] #09 PointerInput 구현 — 마우스+터치 통합 드래그 이벤트
- [x] #10 AudioManager 구현 — Web Audio API, 삭제 효과음 base64 내장
- [x] #11 SaveManager 구현 — IndexedDB CRUD, 오류 시 폴백
- [x] #12 맵 JSON 데이터 생성 — map001~map010 (우선 10개)
- [x] #13 GameScene 통합 — Board + Renderer + Input + Timer + Hint 연결
- [x] #14 TitleScene / ResultScene 구현
- [x] #15 FSM (씬 전환 상태머신) 구현
- [x] #16 빌드 스크립트 — build.sh, build.bat (CP949), release 폴더 정리
- [x] #17 맵 map011~map100 생성
- [x] #18 전체 통합 테스트 & 버그 수정

---

## 완료

- [x] #01 프로젝트 초기 설정 (2026-04-24)
- [x] #02 경량 테스트 러너 구현 (2026-04-24)
- [x] #03 Board 모듈 구현 (2026-04-24)
- [x] #04 Selector 모듈 구현 (2026-04-24)
- [x] #05 Timer 모듈 구현 (2026-04-24)
- [x] #06 Hint 모듈 구현 (2026-04-24)
- [x] #07 CanvasRenderer 구현 (2026-04-24)
- [x] #08 BoardRenderer 구현 (2026-04-24)
- [x] #09 PointerInput 구현 (2026-04-24)
- [x] #10 AudioManager 구현 (2026-04-24)
- [x] #11 SaveManager 구현 (2026-04-24)
- [x] #12 맵 JSON 데이터 생성 map001~map010 + MapLoader (2026-04-24)
- [x] #13 GameScene 통합 + Scene 인터페이스 + UIRenderer (2026-04-24)
- [x] #14 TitleScene / ResultScene 구현 + SceneLayout 유틸 (2026-04-24)
- [x] #15 FSM + GameApp + main.ts 배선 (2026-04-24)
- [x] #16 빌드 스크립트 build.sh / build.bat (2026-04-24)
- [x] #17 맵 map011~map100 생성 (2026-04-24)
- [x] #18 통합 테스트, 버그 수정, README 정비 (2026-04-24)
- [x] #19 진행 중 게임 자동 저장/복구 (탭 전환 + 브라우저 종료 대응) (2026-04-25)
- [x] #20 멀티라이프 블럭 도입 (id ≥ 10, 파랑 명도 그라데이션, 색맹 보조 배지) (2026-04-25)
- [x] #21 1판 튜토리얼 모드 + 메타 스토어(DB v3) 영속 저장 (2026-04-25)
- [x] #22 인터랙티브 튜토리얼 — 실습 단계 도입 (TutorialOverlay 모듈 분리) (2026-04-25)
- [x] #23 튜토리얼 ㄱ자/L자 3셀 실습 단계 추가 (총 5단계) (2026-04-25)
- [x] #24 레벨 순차 잠금 — 이전 맵 미클리어 시 다음 맵 진입 불가 (2026-04-25)
- [x] #25 장애물 코어 지원 — Board obstacles + 중력 통과 + refill/render (2026-04-25)
- [x] #26 페이지 기반 TitleScene — 100단위 페이지·화살표·페이지 잠금 (2026-04-25)
- [x] #27 맵 101-300 생성 + 200+ 장애물 (≤5%) (2026-04-25)
- [x] #28 101-199 장애물 추가 (≤2%) (2026-04-25)
- [x] #29 매치 이펙트 강화 — 파티클·점수팝업·(3셀) 링 (2026-04-25)
- [x] #30 3셀 매치 점수 250 → 400 인상 (2셀×2=200 보다 우월) (2026-04-25)
