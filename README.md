# withChii

맥 화면 위를 돌아다니며 눈 휴식·스트레칭·물 마시기를 알려주는 데스크톱 펫 (Electron + TypeScript).

```bash
npm install
npm run dev        # 개발 실행 (메뉴바 아이콘으로 설정)
npm run dev:fast   # 알림 간격을 분→초로 줄여 빠르게 확인
npm run typecheck
npm run dist       # dist/withChii-*.dmg 생성
```

설정은 메뉴바 트레이 아이콘에서 바꾸며 `~/Library/Application Support/withchii/settings.json`에 저장된다.

## 문서

- [ROADMAP.md](ROADMAP.md) — 단계별 개발 계획과 진행 상태
- [docs/sprite-guide.md](docs/sprite-guide.md) — 캐릭터 이미지 에셋 규격과 현재 적용된 스킨 추출 방법 (`scripts/extract-sprites.py`)
- [docs/notification-mirroring.md](docs/notification-mirroring.md) — macOS 알림을 그대로 받아 보여주는 방식의 설계(미구현)
