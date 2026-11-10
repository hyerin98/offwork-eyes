# OffWork Eyes

퇴근 시간까지 남은 시간을 말풍선으로 보여주는 눈알 캐릭터 데스크톱 위젯입니다.
Electron 앱이며 Windows와 macOS에 배포합니다. 사용자는 회사 동료들입니다(Mac 사용자는 2명).

- 저장소: https://github.com/hyerin98/offwork-eyes (public)
- 배포: 태그 `vX.Y.Z`를 푸시하면 GitHub Actions(`.github/workflows/build.yml`)가 빌드하고 Release를 만듭니다.
- 사용자용 링크: https://github.com/hyerin98/offwork-eyes/releases/latest

## 작업 규칙 (사용자 요청)

- 기능을 바꾼 뒤에는 **사용자가 직접 확인하고 "푸시해"라고 말한 다음에** 커밋·푸시·Release를 진행합니다.
- 사용자가 직접 확인하겠다고 하면, 설치된 앱을 대신 종료하거나 다시 실행하지 않습니다.
- 커밋 메시지는 `commit-convention` 스킬 형식(`<type>(<scope>): 한국어 제목`)을 따르고, 변경을 기능 단위로 나눕니다.
- 새 버전을 낼 때는 `npm version X.Y.Z --no-git-tag-version` → 버전 커밋 → `git tag vX.Y.Z` → `git push origin main vX.Y.Z` 순서입니다. 태그와 `package.json` 버전이 다르면 빌드가 실패합니다.

## 구조

| 파일 | 역할 |
|---|---|
| `src/main.js` | 메인 프로세스: 투명 위젯 창, 커서 추적(적응형 폴링), 클릭 통과, 드래그/클릭 구분, 설정 패널 창, 트레이 메뉴, 스포이드 오버레이, 설정 검증(`sanitize`) |
| `src/renderer.js`, `index.html`, `style.css` | 위젯: 말풍선 카운트다운(분이 바뀔 때만 갱신), 눈동자 추적, 깜빡임, 퇴근 시 웃는 눈 |
| `src/shapes.js` | 표정 12종(`window.Eyes`). 눈꺼풀은 SVG mask, 눈꺼풀 선은 각 눈 흰자로 clip. 키 목록은 `main.js`의 `SHAPES`와 맞춰야 합니다 |
| `src/panel.*` | 설정 패널: 퇴근 시간, 몸/눈동자 색상(5색 팔레트 + 색상 선택기 + 스포이드 + HEX), 표정, 크기, 항상 위, 자동 실행, 업데이트 안내, 현재 버전 |
| `src/eyedropper.*` | Windows용 전체 화면 스포이드. 패널이 열려 있는 동안 창을 미리 만들어 두고, 투명하게 먼저 띄운 뒤 화면을 캡처합니다 |
| `src/updater.js` | 업데이트: Windows 설치형은 electron-updater, Mac은 GitHub API로 확인 후 `install-mac.sh` 실행, Portable은 다운로드 페이지 열기. 시작 15초 후·1시간마다 확인, 화면 잠금/절전 중에는 멈춤 |
| `src/store.js` | `%APPDATA%/OffWork Eyes/settings.json` 저장. 예전 키(`color`) 변환 포함 |
| `install-mac.sh` | Mac 설치·업데이트 스크립트. curl로 받으면 quarantine이 붙지 않아 "손상" 경고 없이 열립니다 |
| `scripts/make-icons.js` | 의존성 없이 아이콘 PNG 생성(`npm run icons`) |

## 알아 둘 점

- 코드 서명이 없습니다. Windows는 SmartScreen에서 "추가 정보 → 실행", Mac은 터미널 설치 명령을 안내합니다. Mac ad-hoc 서명은 빌드에서 검증합니다.
- 배포 파일 이름에 공백을 쓰면 안 됩니다(`OffWork-Eyes-*`). GitHub가 공백을 점으로 바꿔서 `latest.yml`과 이름이 어긋나고 자동 업데이트가 실패합니다.
- 리소스 최적화가 중요합니다: GPU 가속 끔, 반복 애니메이션 없음, 커서 폴링은 움직일 때만 30fps, 패널·스포이드 창은 필요할 때만 생성.
- 로컬에서 Windows 설치 파일을 빌드할 때 경로가 길면 NSIS가 실패합니다. 짧은 경로(예: `D:\personal\offwork-eyes`)에서 빌드하거나 `subst`로 임시 드라이브를 연결합니다.
- `npm ci` 뒤에 Electron 실행 파일이 내려받아지지 않을 수 있습니다(npm의 allowScripts). 그럴 때는 `node node_modules/electron/install.js`를 실행합니다.
- PowerShell 5의 `Get-Content`/`Set-Content`는 UTF-8 한글을 깨뜨립니다. 파일 수정은 편집 도구나 Node로 합니다.
- Windows 검색에서 "offwork"를 입력하면 바탕화면의 예전 Setup 파일도 함께 나옵니다. 설치 파일을 실행하면 그 버전으로 되돌아가므로, 사용자에게는 "앱"으로 표시된 항목을 실행하라고 안내합니다.
- 이 PC에서는 git 자격 증명이 Terminal 패널 쪽에만 있어서, 푸시는 Terminal 탭에서 실행합니다.

## 다음에 해 볼 만한 것

- 출근 시각 자동 추정(그날 처음 켜진 시각 + 근무 시간), 요일별 퇴근 시간, 오늘만 바꾸기
- flex 연동: 사내 Open API 사용 가능 여부를 HR에 확인해야 합니다
- 주말 숨기기, 퇴근 알림, 점심시간 카운트다운
