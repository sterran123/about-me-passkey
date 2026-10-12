# 백엔드 배포 — Deno Deploy (약 2분)

패스키 검증은 서버가 해야 해서 API를 Deno Deploy에 올립니다.
프론트(GitHub Pages)는 이미 배포됐고, 이 서버만 올리면 끝입니다.

## 1) Deno Deploy 계정 만들기 (처음 한 번만)

1. https://dash.deno.com 접속 → **GitHub로 로그인**
2. 권한 승인 — 저장소 연결용

## 2) 프로젝트 만들기

1. **New Project** → **Link a GitHub repository**
2. 저장소: `sterran123/about-me-passkey` 선택 (Deno Deploy GitHub 앱 설치 승인)
3. **Entrypoint**: `server/server.ts`
4. Deploy → 몇 초 뒤 주소가 나옵니다 (예: `https://<프로젝트명>.sterran123.deno.net`)

## 3) 주소를 알려주세요

나온 주소를 저에게 보내주면 `api-config.js`에 넣고 push합니다.
프로젝트 이름을 `pds-passkey`로 만들면 주소는 보통 `https://pds-passkey.sterran123.deno.net`입니다.

## 확인

- 브라우저에서 `주소/api/health` → `{"ok":true}` 나오면 서버 정상
- 이후 나만의 자리에서 계정 두 개 + 패스키 두 개 등록을 진행합니다

## 참고

- Deno Deploy 무료 요금제로 충분 (KV 포함, 카드 불필요)
- `server/deno.json`에 start 태스크가 정의돼 있고, Deno KV는 Deploy에서 자동 제공됩니다
