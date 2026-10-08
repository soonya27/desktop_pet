# macOS 알림 미러링 설계 (3차 후보)

> 상태: 설계만 정리. 구현 전 사용자 결정 필요. 작성 2026-10-08.
> 목적: Slack·캘린더 등 서비스별 OAuth 연동 대신, **macOS 알림센터에 도착한 알림을 그대로 캐릭터 말풍선으로** 보여준다.

## 1. 한 줄 요약

알림센터가 모든 알림을 저장하는 로컬 SQLite 파일을 앱이 몇 초마다 읽어 새 레코드를 캐릭터에게 전달한다. 공식 API가 없어 **비공식** 구조에 의존하며, 사용자가 앱에 **전체 디스크 접근** 권한을 한 번 허용해야 한다.

## 2. 왜 이 방식인가

| | 서비스별 OAuth (기존 3-2·3-3) | macOS 알림 미러링 (이 문서) |
|---|---|---|
| 사용자 준비 | Google Cloud 클라이언트, Slack 앱 생성·토큰 | 시스템 설정에서 권한 1회 허용 |
| 커버 범위 | 연동한 서비스만 | 알림을 보내는 모든 앱 (메일, 카톡, 캘린더, Slack…) |
| 안정성 | 공식 API, 장기적으로 안정 | 비공식 DB 구조, macOS 업데이트로 깨질 수 있음 |
| 지연 | 폴링 주기(수 분) 또는 실시간 | 알림 표시 후 1~5초 |
| 내용 | 원문 전체 접근 가능 | 알림에 실린 제목·본문만 (앱이 가린 본문은 못 봄) |

## 3. 동작 원리

### 3-1. 데이터 위치

```
~/Library/Group Containers/group.com.apple.usernoted/db2/db      (SQLite, WAL 모드)
```

- 알려진 구조(커뮤니티 정보, macOS 12~15 기준. **구현 시 사용자 맥에서 `.schema`로 반드시 재확인**):
  - `app` 테이블: `app_id`(정수 PK), `identifier`(번들 ID, 예 `com.tinyspeck.slackmacgap`)
  - `record` 테이블: `rec_id`, `app_id`, `uuid`, `data`(BLOB, 바이너리 plist), `request_date`, `delivered_date`, `presented`(알림이 실제 표시됐는지), `style`
- `data` plist 안의 `req` 딕셔너리에 `titl`(제목), `subt`(부제), `body`(본문), `iden`, 그리고 상위에 `app`(번들 ID), `date`.
- 날짜는 Core Data 기준(2001-01-01부터 초). JS: `new Date((v + 978307200) * 1000)`.

### 3-2. 읽기 방법 (네이티브 모듈 없이)

1. macOS 내장 `/usr/bin/sqlite3`를 `child_process.execFile`로 호출. 읽기 전용: `sqlite3 -readonly <db> "<SQL>"`.
2. `SELECT r.rec_id, a.identifier, hex(r.data), r.delivered_date, r.presented FROM record r JOIN app a ON a.app_id = r.app_id WHERE r.rec_id > ? ORDER BY r.rec_id`
3. `hex(data)`를 Buffer로 되돌려 순수 JS 파서(`bplist-parser`)로 plist 디코드.
4. 마지막으로 처리한 `rec_id`를 메모리와 `state.json`에 저장해 재시작 후 중복 표시를 막는다. 앱 시작 시점보다 오래된 레코드는 건너뛴다.

폴링 주기 3초. `powerMonitor` 유휴 5분 이상이면 폴링을 멈추고(자리 비움 중 알림은 복귀 시 "놓친 알림 N건"으로 한 번에), 잠자기 해제 시 재개.

### 3-3. 권한

- 그 파일은 **전체 디스크 접근(Full Disk Access)** 없이는 `unable to open database` 또는 `authorization denied`로 실패한다.
- 앱은 첫 실행(또는 기능 켤 때) 읽기를 시도하고, 실패하면 캐릭터 말풍선으로 안내 + 버튼으로 설정 화면을 연다:
  `shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")`
- 권한 대상은 **실행 파일**이다. 패키징된 `withChii.app`에 허용하면 되고, 개발 중에는 `node_modules/electron/dist/Electron.app`에 허용해야 하며 Electron 버전을 올리면 다시 허용해야 한다.
- 권한은 사용자가 시스템 설정에서 직접 토글해야 하며 앱이 프로그램적으로 요청할 수 없다.

## 4. 앱 안에서의 흐름

```
notificationMirror.ts (main)          noticeQueue.ts (main)        renderer
 ┌ 3초 polling ──┐
 │ sqlite3 → plist │ → 필터(허용 앱, 자기 자신 제외, 중복) → Notice{source:"mac", title, body, app} → 말풍선
 └────────────────┘                                                   ↑ "열기" = `open -b <bundleId>`
```

- 3-0 "Notice 일반화"가 선행된다. 휴식 알림과 같은 큐·우선순위·스누즈 체계를 쓴다.
- 알림 하나당 말풍선 하나. 같은 앱에서 10초 안에 여러 건이면 "Slack 메시지 3건"으로 묶는다.
- macOS 알림도 이미 떠 있으므로, 미러링 소스는 **네이티브 알림을 다시 띄우지 않는다**(설정 `nativeNotification`과 무관).

## 5. 설정 (3-1 설정 창)

```ts
notificationMirror: {
  enabled: boolean;          // 기본 false (권한 안내 후 켬)
  apps: string[];            // 허용 번들 ID. 비어 있으면 전부
  showBody: boolean;         // 본문 표시 (false면 제목만)
  bundleEvery: number;       // 같은 앱 묶기 간격(초), 기본 10
}
```

- "앱 선택" UI는 DB의 `app` 테이블에 있는 번들 ID 목록을 보여 주고, 번들 ID → 앱 이름은 `app.getApplicationNameForProtocol` 대신 `/Applications/*.app/Contents/Info.plist`의 `CFBundleIdentifier`를 한 번 훑어 매핑한다(없으면 번들 ID 그대로).

## 6. 개인정보

- 알림 내용은 메모리에서만 다루고, 디스크에는 마지막 `rec_id`만 저장한다. 로그에 제목·본문을 남기지 않는다.
- 외부 전송 없음.

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| macOS 업데이트로 경로·스키마 변경 | 시작 시 `.schema` 검사, 기대 컬럼이 없으면 기능을 끄고 말풍선으로 알림 |
| WAL 때문에 최신 레코드 지연 | `-readonly`로 열되 `immutable`은 쓰지 않음(WAL 반영 필요) |
| 권한 미허용 | 기능 꺼짐 + 안내. 앱은 정상 동작 |
| 자기 자신(withChii)의 알림 | 번들 ID `com.simjuyeon.withchii`(개발: `com.github.Electron`) 제외 |
| 방해금지 중 도착한 알림 | `presented = 0`이면 기본 숨김(설정으로 포함 가능) |

## 8. 검증 계획

1. 권한 허용 후 `sqlite3 -readonly <db> ".schema record"`로 구조 확인.
2. 테스트 알림: `osascript -e 'display notification "본문" with title "제목"'` → 5초 안에 말풍선.
3. Slack DM 수신 → 말풍선. 허용 목록에서 Slack을 빼면 안 뜸.
4. 권한을 끄면 안내 말풍선이 뜨고 앱은 계속 동작.

## 9. 구현 규모

- 메인 `notificationMirror.ts` 약 150줄, 설정 항목, 설정 창의 앱 선택 UI. 의존성 `bplist-parser` 1개.
- 선행: 3-0 Notice 일반화, 3-1 설정 창.
