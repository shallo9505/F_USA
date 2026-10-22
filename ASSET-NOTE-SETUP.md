# MY ASSET NOTE 통합 화면 (베타)

원본 `index.html`은 수정하지 않았습니다.

## 새 페이지
- `asset-note.html`: 해외 주식 / 국내주식 / 가계부 전환 및 공통 설정
- 해외 주식 탭: 원본 `index.html`을 iframe으로 그대로 표시합니다.
- 국내주식: 보유종목·거래내역·배당금 입력과 평가손익
- 가계부: 지출·수입·고정지출·월별 집계
- 브라우저 localStorage에 각각 저장하고, 통합 JSON 다운로드/복원 가능

## GitHub 로그인과 클라우드 백업 활성화 (배포 전 수동 설정 필요)
GitHub Pages는 OAuth의 client secret을 안전하게 보관할 수 없으므로 서버리스 인증 기능이 필요합니다.
1. Cloudflare Workers에 `auth-worker/worker.js` 배포
2. GitHub Settings > Developer settings > OAuth Apps > New OAuth App에서 앱 등록. Homepage URL은 실제 자산노트 URL, Authorization callback URL은 `https://YOUR_WORKER.workers.dev/auth/callback`.
3. Worker 비밀 환경변수 `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (무작위 32자 이상)을 설정.
4. 일반 환경변수 `SITE_ORIGIN` (예: https://shallo9505.github.io), `WORKER_ORIGIN` (예: https://YOUR_WORKER.workers.dev), `REPO` (비공개 백업 저장소 owner/repo), `ALLOWED_GITHUB_LOGIN` (허용 GitHub 로그인 ID)을 설정.
5. 새 통합 페이지의 데이터 관리에서 Worker의 HTTPS 주소 저장, GitHub로 로그인, 전체 백업 테스트.

**주의:** 이 구현은 OAuth에 `repo` 권한을 요청합니다. 본인의 비공개 저장소 이외의 저장소에도 광범위한 권한이 부여될 수 있어 전용 계정이나 제한된 GitHub App 기반 인증으로 전환하기 전에는 동의 화면을 확인해야 합니다. Worker와 GitHub Pages가 서로 다른 사이트라 쿠키 차단 브라우저에서는 로그인이 유지되지 않을 수 있습니다. 운영 환경에서는 동일 사이트의 커스텀 도메인으로 배포하는 편이 좋습니다. 환경변수에 PAT를 저장할 필요는 없습니다.

### 보안 및 데이터 주의
- 저장소를 공개하면 개인 거래·가계부 정보가 공개될 수 있습니다. `REPO`는 반드시 private 확인.
- 통합 JSON 파일에 종전 해외주식의 로컬 저장 상태를 복사합니다. 해외주식의 기존 GitHub 원격 백업은 자동 이관되지 않습니다.
- 원본 해외주식 화면의 기존 GitHub 설정·백업 UI는 **그대로 남아 있습니다**. 따라서 완전히 단일 백업 UI로 전환하려면 원본을 수정하거나 기존 화면의 설정 UI를 별도로 숨기는 후속 통합이 필요합니다.
- 새 페이지는 실제 계좌·시세 API와 연결되지 않습니다. 국내주식 현재가는 직접 입력하고 변경해야 합니다.
- 원격 OAuth 구성 전에는 로컬 JSON 백업을 이용하세요.
- OAuth 인증은 GitHub 본인 계정에 대한 것이며, 사이트 자체를 다른 방문자로부터 비공개로 만들지는 않습니다. GitHub Pages 사이트가 공개라면 별도 접근통제가 필요합니다.
- 복원 전에 기존 백업 JSON 파일을 별도로 보관하세요.
