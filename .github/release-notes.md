퇴근까지 남은 시간을 알려주는 눈알 위젯입니다. 아래 **Assets**에서 내 컴퓨터에 맞는 파일을 받으세요.

### Windows 설치

1. 아래 **Assets**에서 `OffWork-Eyes-Setup-…exe`를 받아서 더블클릭합니다. 설치가 끝나면 바로 실행됩니다.
2. "Windows의 PC 보호" 화면이 나오면 **추가 정보 → 실행**을 누릅니다.

회사 보안 프로그램 때문에 설치가 막히면 `OffWork-Eyes-Portable-…exe`를 받으세요. 설치 없이 바로 실행됩니다.

### Mac 설치 (Intel, M 시리즈 모두)

**터미널**을 열고(Spotlight에서 "터미널" 검색) 아래 한 줄을 붙여 넣은 뒤 Enter를 누릅니다. 내려받기, 설치, 실행이 한 번에 끝납니다.

```
curl -fsSL https://raw.githubusercontent.com/hyerin98/offwork-eyes/main/install-mac.sh | bash
```

<details>
<summary>터미널 없이 dmg로 설치하기</summary>

1. 아래 **Assets**에서 `OffWork-Eyes-…-mac.dmg`를 받아서 열고, 앱을 **응용 프로그램(Applications)** 폴더로 드래그합니다.
2. 앱을 엽니다. "확인할 수 없음" 경고가 나오면 **완료**를 누르고, **시스템 설정 → 개인정보 보호 및 보안**에서 **그래도 열기**를 누릅니다.
3. "손상되었기 때문에 열 수 없습니다"라는 메시지가 나오면, 터미널에서 아래 명령을 실행한 뒤 다시 엽니다.

   ```
   xattr -cr "/Applications/OffWork Eyes.app"
   ```

</details>

### 사용 방법

- **말풍선**을 클릭하면 설정 패널이 열립니다. 퇴근 시간, 색상, 눈동자 모양을 바꿀 수 있습니다.
- **캐릭터**를 클릭하면 무작위 모션이 나옵니다.
- 캐릭터를 **드래그**하면 위치를 옮길 수 있습니다.
- 종료는 캐릭터를 우클릭하거나, 작업 표시줄(Mac은 메뉴 막대)의 눈 아이콘을 눌러서 **종료**를 선택합니다.
