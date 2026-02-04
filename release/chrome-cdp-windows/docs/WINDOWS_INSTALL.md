# Windows 설치 가이드

## Chrome CDP Automation - Windows 실행 파일

### 시스템 요구사항

- Windows 10 또는 Windows 11 (64-bit)
- Chrome 브라우저 (최신 버전 권장)
- RAM: 4GB 이상
- 디스크 공간: 100MB 이상

---

## 설치 방법

### 1. 파일 다운로드

1. `chrome-cdp-automation-windows.zip` 파일을 다운로드합니다.
2. 원하는 위치에 압축을 해제합니다 (예: `C:\Program Files\chrome-cdp-automation`)

### 2. 폴더 구조

```
chrome-cdp-automation/
├── chrome-cdp.exe          ← 실행 파일
├── flows/                  ← 예제 Flow 파일
│   ├── example-flow.yaml
│   └── vision-fallback-example.yaml
├── docs/                   ← 문서
│   ├── USER_GUIDE.md
│   └── RUNBOOK.md
└── README.md
```

### 3. 환경 변수 설정 (선택사항 - 권장)

#### 방법 A: 환경 변수에 등록 (권장)

1. **시작 메뉴** → **시스템 환경 변수 편집** 검색 → 실행
2. **환경 변수** 버튼 클릭
3. **사용자 변수** 섹션에서 **Path** 선택 → **편집**
4. **새로 만들기** 클릭
5. chrome-cdp.exe가 있는 폴더 경로 추가 (예: `C:\Program Files\chrome-cdp-automation`)
6. **확인** 클릭하여 저장

#### 방법 B: 현재 세션에서만 사용

```cmd
set PATH=%PATH%;C:\Program Files\chrome-cdp-automation
```

---

## 사용 방법

### 사전 준비: Chrome CDP 모드로 실행

1. Chrome 브라우저를 닫습니다 (모든 창)
2. **관리자 권한**으로 명령 프롬프트(cmd) 실행
3. 다음 명령으로 Chrome 실행:

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

또는 바로가기 생성:
- Chrome 바로가기 우클릭 → **속성**
- **대상** 필드 끝에 `--remote-debugging-port=9222` 추가
- 예: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222`

### 기본 사용법

#### 1. Flow 검증
```cmd
chrome-cdp.exe validate flows\example-flow.yaml
```

#### 2. Flow 실행
```cmd
chrome-cdp.exe run flows\example-flow.yaml --mode manual
```

#### 3. 사용 가능한 명령어 보기
```cmd
chrome-cdp.exe --help
```

---

## Flow 파일 작성

### 기본 구조

```yaml
name: 예제 Flow
description: 간단한 자동화 예제
url_prefix: https://example.com

steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: 페이지 이동
    timeout: 10

  - step_no: 2
    action: click
    target: "button#submit"
    description: 버튼 클릭
    timeout: 5
```

### 지원하는 Action 타입

- `navigate`: URL로 이동
- `click`: 요소 클릭 (CSS 선택자)
- `click_at`: 특정 좌표 클릭 (x, y)
- `type`: 텍스트 입력
- `wait`: 대기 (밀리초)
- `select`: 드롭다운 선택
- `press`: 키보드 키 입력 (Enter, Tab 등)

### click_at 사용 예시

```yaml
- step_no: 3
  action: click_at
  target: "coordinate-click"
  coordinates:
    x: 500
    y: 300
  description: 좌표 (500, 300) 클릭
  timeout: 5
```

---

## 문제 해결

### 1. "Chrome에 연결할 수 없습니다" 오류

**원인**: Chrome이 CDP 모드로 실행되지 않음

**해결**:
1. Chrome을 완전히 종료 (모든 창)
2. 관리자 권한으로 CMD 실행
3. Chrome CDP 모드로 재실행:
   ```cmd
   taskkill /f /im chrome.exe
   start chrome --remote-debugging-port=9222
   ```

### 2. "Flow 검증 오류"

**원인**: YAML 문법 오류 또는 필수 필드 누락

**해결**:
```cmd
chrome-cdp.exe validate flows\example-flow.yaml
```
오류 메시지를 확인하고 YAML 파일 수정

### 3. 권한 오류

**원인**: 폴더 접근 권한 부족

**해결**:
- chrome-cdp.exe를 **관리자 권한**으로 실행
- 또는 사용자 폴더(C:\Users\사용자명)에 설치

### 4. 바이러스 백신 차단

**원인**: 새로운 실행 파일이라 백신이 차단

**해결**:
- Windows Defender 또는 백신 설정에서 예외 추가
- chrome-cdp.exe 파일 우클릭 → 속성 → "차단 해제" 체크

---

## 로그 확인

실행 후 생성되는 파일:
- `logs\{실행ID}.csv`: 실행 로그
- `artifacts\{실행ID}\`: 스크린샷 및 HTML 파일

---

## 업데이트

새 버전 설치:
1. 기존 폴더 삭제 (flows 폴더 백업 권장)
2. 새 버전 압축 해제
3. flows 폴더 복원 (필요시)

---

## 지원 및 문의

- 문서: `docs\USER_GUIDE.md`
- 문제 해결: `docs\RUNBOOK.md`

---

**버전**: 1.0.0  
**최종 업데이트**: 2026-02-02
