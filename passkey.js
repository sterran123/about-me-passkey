// ===== 패스키(WebAuthn) 공통 유틸 =====
// 비밀번호 없이 "내 인증기(폰·생체·보안키)"만 통과시키는 잠금의 심장부.
// - 등록(setup): 공개키를 꺼내 passkey-config.js에 박는다
// - 해제(index): authenticator의 서명을 WebCrypto로 직접 검증한다

const PK = (() => {

  /* ---- base64url <-> ArrayBuffer ---- */
  const b64u = buf => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64u = str => {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  };

  /* ---- RP ID — 도메인 최상위(github.io 등록자 영역)로 고정 ---- */
  // sterran123.github.io / localhost 양쪽에서 같은 사이트로 인식되게 한다.
  const rpId = () => {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' ? h : h.split('.').slice(-2).join('.');
  };

  const randomChallenge = () => {
    const c = new Uint8Array(32);
    crypto.getRandomValues(c);
    return c;
  };

  /* ---- 지원 여부 ---- */
  const supported = () =>
    typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;

  /* ---- DER(ECDSA) 서명 → WebCrypto용 원시 r||s 64바이트 ---- */
  function derToP1363(der) {
    const b = new Uint8Array(der);
    if (b[0] !== 0x30) throw new Error('서명 형식이 아닙니다');
    let off = 2;
    if (b[1] & 0x80) off = 2 + (b[1] & 0x7f); // long-form length
    const readInt = () => {
      if (b[off++] !== 0x02) throw new Error('서명 정수가 아닙니다');
      const len = b[off++];
      const v = b.slice(off, off + len);
      off += len;
      return v;
    };
    const norm = v => {
      let x = v;
      while (x.length > 32 && x[0] === 0) x = x.slice(1); // 앞의 0 패딩 제거
      const out = new Uint8Array(32);
      out.set(x.slice(-32), 32 - x.length);
      return out;
    };
    const r = norm(readInt()), s = norm(readInt());
    const raw = new Uint8Array(64);
    raw.set(r, 0); raw.set(s, 32);
    return raw.buffer;
  }

  /* ---- 등록: 자격증명 만들고 공개키 꺼내기 ---- */
  async function create({ userName = 'owner' } = {}) {
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId(), name: '민기 소개 페이지' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: userName,
          displayName: '김민기',
        },
        challenge: randomChallenge(),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },    // ES256 (P-256)
          { type: 'public-key', alg: -257 },  // RS256 (폴백)
        ],
        authenticatorSelection: { userVerification: 'required' },
        attestation: 'none',
        timeout: 120000,
      },
    });
    if (!cred) throw new Error('취소되었습니다');
    const spki = cred.response.getPublicKey();
    const alg = cred.response.getPublicKeyAlgorithm?.() ?? -7;
    return {
      id: b64u(cred.rawId),          // credential id (base64url)
      spki: spki ? b64u(spki) : '',  // DER 공개키 (base64url) — ES256일 때 사용
      alg,
    };
  }

  /* ---- 해제: 서명 받아서 검증 ---- */
  async function unlock(cfg) {
    const challenge = randomChallenge();
    const assertion = await navigator.credentials.get({
      publicKey: {
        rpId: rpId(),
        challenge,
        allowCredentials: cfg.credentials.map(c => ({ type: 'public-key', id: unb64u(c.id) })),
        userVerification: 'required',
        timeout: 120000,
      },
    });
    if (!assertion) throw new Error('취소되었습니다');

    const credCfg = cfg.credentials.find(c => c.id === b64u(assertion.rawId));
    if (!credCfg) throw new Error('등록되지 않은 패스키입니다');

    // 1) clientDataJSON 확인 — 종류·챌린지·출처
    const clientJSON = JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON));
    if (clientJSON.type !== 'webauthn.get') throw new Error('응답 종류가 다릅니다');
    if (clientJSON.challenge !== b64u(challenge)) throw new Error('챌린지가 일치하지 않습니다');
    const origin = location.origin.replace(/\/$/, '');
    if (!clientJSON.origin.startsWith(origin) && clientJSON.origin !== origin.replace(/^https?:\/\//, 'https://'))
      throw new Error('출처가 일치하지 않습니다');

    // 2) authenticatorData — rpId 해시·플래그·카운터
    const authData = new Uint8Array(assertion.response.authenticatorData);
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId())));
    for (let i = 0; i < 32; i++) if (authData[i] !== rpHash[i]) throw new Error('사이트가 일치하지 않습니다');
    const flags = authData[32];
    if (!(flags & 0x01)) throw new Error('사용자 존재 확인이 없습니다');
    if (!(flags & 0x04)) throw new Error('사용자 검증(생체·PIN)이 없습니다');
    const signCount = new DataView(authData.buffer, 33).getUint32(0, false);

    // 3) 서명 검증 — WebCrypto (signature || authData + sha256(clientDataJSON))
    if (credCfg.spki) {
      const clientHash = await crypto.subtle.digest('SHA-256', assertion.response.clientDataJSON);
      const signed = new Uint8Array(authData.length + 32);
      signed.set(authData, 0); signed.set(new Uint8Array(clientHash), authData.length);
      const spkiBuf = unb64u(credCfg.spki);
      let ok = false;
      try { // ES256 — 대부분의 패스키
        const key = await crypto.subtle.importKey('spki', spkiBuf,
          { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
          derToP1363(assertion.response.signature), signed);
      } catch {
        try { // RS256 — 일부 인증기 폴백
          const key = await crypto.subtle.importKey('spki', spkiBuf,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
          ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key,
            assertion.response.signature, signed);
        } catch { ok = false; }
      }
      if (!ok) throw new Error('서명이 유효하지 않습니다');
    }

    return { credentialId: credCfg.id, signCount };
  }

  return { b64u, unb64u, rpId, randomChallenge, supported, create, unlock, derToP1363 };
})();
