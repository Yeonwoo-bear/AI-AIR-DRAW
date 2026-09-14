# AI Air Draw — 배포 가이드 (GitHub Pages, 약 10~15분)

## 0. 준비물
- GitHub 계정 (없으면 github.com 에서 1분 가입)
- 이 폴더의 3개 파일: `index.html`, `style.css`, `script.js`

## 1. 새 저장소(repository) 만들기
1. github.com 로그인 → 오른쪽 위 **+** → **New repository**
2. Repository name 예: `ai-air-draw`
3. **Public** 선택 (Pages 무료로 쓰려면 Public이어야 함, 또는 유료 플랜이면 Private도 가능)
4. **Create repository** 클릭 (README 자동 생성 체크는 꺼도 됨)

## 2. 파일 업로드 (git 명령어 없이, 웹에서 바로)
1. 방금 만든 저장소 페이지에서 **uploading an existing file** 클릭
   (또는 상단 **Add file → Upload files**)
2. `index.html`, `style.css`, `script.js` 3개 파일을 한 번에 드래그 앤 드롭
3. 아래 **Commit changes** 클릭

> git을 이미 쓸 줄 안다면:
> ```bash
> git init
> git add index.html style.css script.js
> git commit -m "AI Air Draw"
> git branch -M main
> git remote add origin https://github.com/내계정/ai-air-draw.git
> git push -u origin main
> ```

## 3. GitHub Pages 켜기
1. 저장소 상단 **Settings** 탭
2. 왼쪽 메뉴 **Pages**
3. **Build and deployment → Source**: `Deploy from a branch` 선택
4. **Branch**: `main` / `/(root)` 선택 → **Save**
5. 1~2분 기다리면 페이지 상단에
   `https://내계정.github.io/ai-air-draw/` 링크가 생깁니다.
   (가끔 배포 반영에 몇 분 더 걸릴 수 있어요. 안 뜨면 새로고침)

## 4. 꼭 확인할 것
- **카메라 권한**: `https://...github.io` 주소는 자동으로 HTTPS라서 카메라 권한 요청이 정상적으로 뜹니다. (별도 설정 불필요)
- 부스에서 실제로 쓸 노트북/태블릿 브라우저로 링크 접속 → 카메라 허용 → 손 인식/그림 인식까지 한 번 실전 테스트 해보세요. (와이파이가 느리면 ml5 모델 로딩에 시간이 좀 걸릴 수 있어요)
- **랭킹 데이터는 이 브라우저(기기)에만 저장**됩니다 (localStorage). 즉:
  - 부스에서 노트북 한 대로만 진행한다면 문제 없이 그 노트북 안에서 랭킹이 계속 쌓여요.
  - 여러 기기에서 동시에 진행하면 기기별로 랭킹이 따로 쌓입니다 (서로 공유 안 됨).
  - 브라우저 시크릿 모드로 열면 창을 닫는 순간 데이터가 사라지니 **일반 모드**로 여세요.
  - 같은 브라우저라도 "방문 기록 삭제/사이트 데이터 삭제"를 누르면 랭킹이 초기화됩니다. 행사 끝나고 백업하려면 랭킹보드 화면 하단 **"참가자 연락처 목록"**에서 표를 복사해두세요.

## 5. QR코드로 공유하고 싶다면
`https://내계정.github.io/ai-air-draw/` 링크를 아무 QR 생성 사이트(예: qr-code-generator.com)에 붙여넣고
포스터/테이블에 QR코드를 인쇄해두면 방문자가 바로 접속할 수 있어요.

---
### 나중에 코드 수정하고 싶을 때
GitHub 저장소 페이지에서 해당 파일 클릭 → 연필 아이콘(Edit) → 수정 → Commit
하면 1~2분 뒤 배포 링크에 자동 반영됩니다. (별도 빌드 과정 없음, 순수 정적 파일이라 바로 반영)
