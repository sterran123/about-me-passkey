# 김민기 — 나를 소개하는 한 페이지 + 나만의 자리 (패스키)

과제1의 소개 페이지는 **그대로 공개**로 두고, 끝에 "나만의 자리"라는 **비공개 구역**을 새로 붙였습니다.
비밀번호는 만들지 않습니다 — 내 인증기(폰·보안키)의 패스키 서명이 서버 검증을 통과해야만 비공개 내용이 내려옵니다.

## 구조

```
[공개 페이지]                      [서버]
GitHub Pages  ──패스키 서명──▶  Deno Deploy API
  index.html                     server/server.ts
  나만의 자리 섹션                · 일회용 질문 발급·소비
  (내용은 소스에 없음!)           · 공개키 저장·서명 검증
                                 · 세션 토큰 발급·무효화
                                 · 비공개 자료 401/403 격리
```

## 파일 구성

- `index.html` — 공개 소개 페이지 + `#vault`(나만의 자리) 섹션
- `styles.css` — 디자인·반응형 + 자리 잠금 스타일
- `pk-client.js` — API 호출 + WebAuthn 래퍼 (base64url 변환·자격증명 직렬화)
- `private.js` — 나만의 자리 화면 (잠금/로그인/등록/항목·패스키 관리)
- `api-config.js` — API 서버 주소
- `server/server.ts` — Deno 백엔드 (질문·세션·공개키·비공개 자료를 KV에 보관)
- `docs/AUTH.md` — 인증 구현 설명서 여섯 항목 (①~⑥)
- `checks/` — 잠금 화면·등록 폼 스크린샷 + 검증 요청/응답 `t08-evidence.json`

## 서버가 하는 일 (과제 요구)

| 요구 | 구현 |
|---|---|
| 서버가 일회용 질문을 만들고 보관 | `POST /api/register/options`·`/api/login/options` — 챌린지를 KV에 10분 보관 |
| 이미 쓴 질문은 다시 통하지 않음 | 검증 요청 시 `atomic.check().delete()`로 소비 — 재사용 401 |
| 공개키만 서버로 보낸다 | 등록 응답의 공개키(COSE)만 저장 — 개인키는 인증기를 절대 떠나지 않음 |
| 로그인 뒤 사람을 알아본다 | 세션 토큰(KV, 7일) Bearer 인증 — 로그아웃 시 즉시 삭제 |
| 비공개 자료는 인증 없이 못 읽는다 | `GET /api/private` — 토큰 없음 401, 다른 계정 403 |
| 패스키 두 개·삭제 후 남은 걸로 로그인 | `GET /api/passkeys` 목록, `DELETE` 지원, 마지막 하나는 409 |

## 배포

- **프론트**: GitHub Pages — `https://sterran123.github.io/about-me-passkey/`
- **백엔드**: Deno Deploy — GitHub 저장소 연결, entrypoint `server/server.ts`
  → 배포되면 나오는 주소를 `api-config.js`의 `API_BASE`에 넣는다.

## 로컬에서 보기

```
# 정적 파일 (8080)
node tools/serve.mjs

# API 서버 (8000) — Deno 필요
cd server
deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv server.ts
```

## 배포 전 마지막 점검

- [ ] `api-config.js`의 `API_BASE`가 실제 Deno Deploy 주소인가
- [ ] 시크릿 창에서 공개 소개 페이지가 통째로 보이는가 (나만의 자리만 잠김)
- [ ] 패스키 등록 → 로그인 → 비공개 항목 3개 이상 보이는가
- [ ] 다른 계정 자리 조회가 403으로 거절되는가
- [ ] 로그아웃 후 같은 토큰 재사용이 401인가
- [ ] 마지막 패스키 삭제가 409로 막히는가
