// ===== 패스키 클라이언트 — 서버 API + WebAuthn 호출 래퍼 =====
const PKC = (() => {
  const B = () => window.API_BASE;
  const TOK_KEY = 'pk8-session';
  const ACCT_KEY = 'pk8-account';

  const b64u = buf => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64u = s => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const supported = () => typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;
  const token = () => localStorage.getItem(TOK_KEY);
  const account = () => localStorage.getItem(ACCT_KEY);
  const remember = (acct, tok) => { localStorage.setItem(ACCT_KEY, acct); localStorage.setItem(TOK_KEY, tok); };
  const forget = () => { localStorage.removeItem(ACCT_KEY); localStorage.removeItem(TOK_KEY); };

  async function api(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(`${B()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  /* 서버 options JSON → navigator.credentials용 (문자열 → ArrayBuffer) */
  const credOptFix = o => ({
    ...o,
    id: o.id ? unb64u(o.id) : o.id,
    transports: o.transports,
  });
  function regOptionsToNative(opts) {
    return {
      ...opts,
      challenge: unb64u(opts.challenge),
      user: { ...opts.user, id: unb64u(opts.user.id) },
      excludeCredentials: (opts.excludeCredentials || []).map(credOptFix),
    };
  }
  function authOptionsToNative(opts) {
    return {
      ...opts,
      challenge: unb64u(opts.challenge),
      allowCredentials: (opts.allowCredentials || []).map(credOptFix),
    };
  }

  /* 자격증명 → 서버 전송용 JSON */
  function credToJSON(c) {
    const r = c.response;
    const out = {
      id: c.id, rawId: b64u(c.rawId), type: c.type,
      response: { clientDataJSON: b64u(r.clientDataJSON) },
    };
    if (r.attestationObject) out.response.attestationObject = b64u(r.attestationObject);
    if (r.authenticatorData) out.response.authenticatorData = b64u(r.authenticatorData);
    if (r.signature) out.response.signature = b64u(r.signature);
    if (r.userHandle) out.response.userHandle = b64u(r.userHandle);
    out.response.transports = r.getTransports ? (r.getTransports() || []) : [];
    if (c.getClientExtensionResults) out.clientExtensionResults = c.getClientExtensionResults();
    return out;
  }

  /* ===== 흐름 ===== */
  async function register(account, name) {
    const o = await api('/api/register/options', { method: 'POST', body: { account }, auth: true });
    if (!o.ok) return { ok: false, status: o.status, error: o.data.error };
    let cred;
    try {
      cred = await navigator.credentials.create({ publicKey: regOptionsToNative(o.data) });
    } catch (e) {
      return { ok: false, cancelled: e.name === 'NotAllowedError', error: e.name === 'NotAllowedError' ? '취소했습니다' : e.message };
    }
    if (!cred) return { ok: false, cancelled: true, error: '취소했습니다' };
    const v = await api('/api/register/verify', { method: 'POST', body: { account, name, response: credToJSON(cred) }, auth: true });
    return v.ok ? { ok: true, data: v.data } : { ok: false, status: v.status, error: v.data.error, stack: v.data.stack };
  }

  async function login(account) {
    const o = await api('/api/login/options', { method: 'POST', body: { account } });
    if (!o.ok) return { ok: false, status: o.status, error: o.data.error };
    let asrt;
    try {
      asrt = await navigator.credentials.get({ publicKey: authOptionsToNative(o.data) });
    } catch (e) {
      return { ok: false, cancelled: e.name === 'NotAllowedError', error: e.name === 'NotAllowedError' ? '취소했습니다' : e.message };
    }
    if (!asrt) return { ok: false, cancelled: true, error: '취소했습니다' };
    const v = await api('/api/login/verify', { method: 'POST', body: { account, response: credToJSON(asrt) } });
    if (v.ok) { remember(account, v.data.token); return { ok: true }; }
    return { ok: false, status: v.status, error: v.data.error };
  }

  async function logout() {
    await api('/api/logout', { method: 'POST', auth: true });
    forget();
  }

  const privateGet = (want) => api(`/api/private${want ? `?account=${encodeURIComponent(want)}` : ''}`, { auth: true });
  const privatePut = items => api('/api/private', { method: 'PUT', body: { items }, auth: true });
  const passkeys = () => api('/api/passkeys', { auth: true });
  const delPasskey = id => api(`/api/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });

  return { supported, token, account, remember, forget, api, register, login, logout, privateGet, privatePut, passkeys, delPasskey };
})();
