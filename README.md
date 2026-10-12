# 김민기 — 나를 소개하는 한 페이지 + 패스키 잠금

과제1의 소개 페이지에 **패스키(WebAuthn) 잠금**을 얹은 두 번째 버전입니다.
비밀번호 없이, 소유자의 인증기(폰·생체·보안키)만 통과하는 "나만 들어가기" 페이지입니다.

## 파일 구성

- `index.html` — 페이지 구조와 문구
- `styles.css` — 디자인·반응형 + 잠금 화면 스타일
- `script.js` — 아코디언·인사 바꾸기·움직임 줄이기
- `passkey.js` — WebAuthn 등록·서명 검증(공통 라이브러리)
- `passkey-config.js` — 등록된 소유자 패스키의 **공개키** 목록 (비밀 아님)
- `lock.js` — 잠금 화면 오버레이·해제 로직
- `setup.html` / `setup.js` — 소유자용 패스키 등록 도구
- `docs/AUTH.md` — 패스키를 어떻게 붙였는지, 무엇을 지키고 무엇을 못 지키는지
- `assets/favicon.svg` — 파비콘
- `tools/serve.mjs` — 로컬 확인용 서버
- `tools/check-contrast.mjs` — 명암 대비 검사 스크립트
- `checks/` — 잠금·등록·해제·거절 검증 스크린샷

## 로컬에서 보기

```
node tools/serve.mjs
```

→ http://localhost:8080 접속 (Node.js만 있으면 됩니다)
※ 패스키는 `localhost` 또는 `https`에서만 동작합니다 (브라우저 규칙).

## 패스키가 동작하는 방식 (요약)

1. `setup.html`에서 소유자가 `navigator.credentials.create()`로 패스키를 만듭니다 — 폰 QR 스캔이나 기기 생체 인증.
2. 만들어진 자격증명의 **공개키**를 `passkey-config.js`에 박아 둡니다 (공개키는 비밀이 아니라 안전).
3. 방문자가 index에 오면 잠금 화면이 뜨고, "패스키로 들어가기"를 누르면 `navigator.credentials.get()`이 인증기에 서명을 시킵니다.
4. 받은 서명을 WebCrypto로 직접 검증합니다 — 사이트 해시(rpId)·챌린지·사용자 검증 플래그·서명 카운터까지 확인.
5. 통과하면 잠금이 풀리고 페이지가 열립니다 — 개인키는 인증기를 절대 떠나지 않습니다.

## 배포

- GitHub Pages (repo: `about-me-passkey` → `https://sterran123.github.io/about-me-passkey/`)
- HTTPS가 자동 적용되므로 패스키가 바로 동작합니다.
- rpId는 `sterran123.github.io` — 같은 도메인 안에서는 같은 자격증명이 인식됩니다.

## 배포 전 마지막 점검

- [ ] `setup.html`에서 실제 소유자 패스키를 만들어 `passkey-config.js`에 박았는가
- [ ] 시크릿 창에서 잠금 화면이 뜨고 본문이 안 보이는가
- [ ] 소유자 패스키로 통과되는가 / 다른 기기·계정 패스키로는 거절되는가
- [ ] F12 콘솔에 빨간 오류가 없는가
