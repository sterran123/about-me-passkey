// ===== 과제8 패스키 서버 (Deno Deploy) =====
// 서버가 하는 일 — 과제 요구사항 그대로:
//  1) 등록/로그인용 일회용 질문(challenge)을 만들고 보관, 한 번 쓰면 지운다(재사용 거절)
//  2) 공개키만 저장한다(개인키는 인증기를 절대 떠나지 않고 여기로 오지도 않는다)
//  3) 서명을 SimpleWebAuthn 라이브러리로 서버에서 검증한다
//  4) 통과하면 세션 토큰을 발급하고, 로그아웃하면 무효화한다
//  5) 비공개 자료는 세션 없이 요청하면 401, 남의 계정이면 403으로 거절한다

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from 'npm:@simplewebauthn/server@13.1.1';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from 'npm:@simplewebauthn/types@13.1.0';

// 로컬: KV_PATH 환경변수로 파일 지정 (기본은 Deno 관리 위치) / Deploy: 인자 없으면 관리형 KV
const kv = await Deno.openKv(Deno.env.get('KV_PATH') || undefined);

/* ---------- 허용 출처 — 이 출처들만 API를 쓸 수 있다 ---------- */
const ALLOWED_ORIGINS = ['https://sterran123.github.io'];
const isAllowed = (o: string) =>
  ALLOWED_ORIGINS.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

const RP_NAME = '민기 소개 페이지 — 나만의 자리';

// rpId = 출처의 호스트명 — WebAuthn은 공개 접미사(github.io)를 rpId로 못 쓰게 하므로
// sterran123.github.io 전체를 쓴다. 같은 도메인의 다른 저장소 페이지도 인식된다.
const rpIdOf = (origin: string) => new URL(origin).hostname;

/* ---------- 공통 ---------- */
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const randId = () => b64u(crypto.getRandomValues(new Uint8Array(24)));

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });

const err = (status: number, message: string) =>
  json({ error: message, status }, status);

/* ---------- 챌린지 — 일회용, 10분 수명, 쓰는 순간 삭제 ---------- */
const CHAL_TTL = 10 * 60 * 1000;
async function issueChallenge(type: 'reg' | 'auth', account: string) {
  const challenge = randId();
  const exp = Date.now() + CHAL_TTL;
  await kv.set(['chal', challenge], { type, account, exp }, { expireIn: CHAL_TTL });
  return challenge;
}
// atomic check-and-delete: 이미 쓴/만료된 질문은 null → 재사용 불가
async function consumeChallenge(challenge: string, type: 'reg' | 'auth', account: string) {
  const key = ['chal', challenge];
  const got = await kv.get<{ type: string; account: string; exp: number }>(key);
  const ok = got.value && got.value.type === type && got.value.account === account && got.value.exp > Date.now();
  if (got.value) {
    const res = await kv.atomic().check({ key, versionstamp: got.versionstamp }).delete(key).commit();
    if (!res.ok) return null; // 다른 요청이 먼저 가져감 — 재사용으로 간주
  }
  return ok ? got.value : null;
}

/* ---------- 세션 — 통과 기록, 7일 수명, 로그아웃 시 즉시 무효 ---------- */
const SESS_TTL = 7 * 24 * 60 * 60 * 1000;
async function createSession(account: string) {
  const token = randId() + randId();
  await kv.set(['sess', token], { account, exp: Date.now() + SESS_TTL }, { expireIn: SESS_TTL });
  return token;
}
async function sessionOf(req: Request) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const got = await kv.get<{ account: string; exp: number }>(['sess', m[1]]);
  if (!got.value || got.value.exp <= Date.now()) return null;
  return { token: m[1], account: got.value.account };
}

/* ---------- 계정·자격증명·비공개 자료 ---------- */
interface Cred {
  id: string;           // credential id (base64url)
  publicKey: string;    // COSE 공개키 (base64url) — 공개값이라 저장해도 안전
  name: string;
  createdAt: string;
  counter: number;
  transports?: string[];
}

async function credsOf(account: string): Promise<Cred[]> {
  const out: Cred[] = [];
  for await (const e of kv.list<Cred>({ prefix: ['cred', account] })) out.push(e.value);
  return out;
}

const SEED_ITEMS = (account: string) => [
  { id: randId(), title: '준비 중인 프로젝트 메모', body: '(만든 예시) 패스키 소개 페이지 다음에는 방명록에도 패스키 댓글을 붙여 보고 싶다. 서버 없이 되는지 실험해 볼 것.' },
  { id: randId(), title: '10월 회고', body: '(만든 예시) 미니게임 8종을 한 화면에 모으는 데 일주일 걸렸다. 다음엔 처음부터 공통 모듈을 먼저 뺀다.' },
  { id: randId(), title: '지원하려는 곳 목록', body: '(만든 예시) 프론트엔드 신입 — 인터랙션 잘 만드는 팀, 보안 과제가 있는 곳.' },
];

/* ---------- 라우터 ---------- */
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin') || '';
  const allowed = isAllowed(origin) ? origin : '';

  // CORS — 허용된 출처만 브라우저에서 호출 가능
  const cors = allowed
    ? {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Vary': 'Origin',
      }
    : {};
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const send = (body: unknown, status = 200) => json(body, status, cors);
  const fail = (s: number, m: string) => json({ error: m, status: s }, s, cors);

  const expectOrigin = allowed || 'https://sterran123.github.io';
  const rpID = rpIdOf(expectOrigin);

  try {
    /* ===== 등록: 질문 발급 ===== */
    if (req.method === 'POST' && url.pathname === '/api/register/options') {
      const { account } = await req.json();
      if (!account || !/^[\w가-힣@.\-]{2,30}$/.test(account)) return fail(400, '계정 이름 형식이 아닙니다');
      const acct = await kv.get(['acct', account]);
      let sess = await sessionOf(req);
      if (acct.value && (!sess || sess.account !== account))
        return fail(403, '이미 있는 계정입니다 — 패스키를 추가하려면 먼저 로그인하세요');
      const existing = await credsOf(account);
      const opts = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userName: account,
        userDisplayName: `${account}의 자리`,
        attestationType: 'none',
        excludeCredentials: existing.map(c => ({ id: c.id, transports: c.transports as any })),
        authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      });
      // 서버가 만든 일회용 질문을 넣어 보낸다 — 검증 때까지 서버에 보관
      const challenge = await issueChallenge('reg', account);
      (opts as any).challenge = challenge;
      (opts as any).issuedAt = new Date().toISOString();
      return send(opts);
    }

    /* ===== 등록: 공개키 수령·검증·저장 ===== */
    if (req.method === 'POST' && url.pathname === '/api/register/verify') {
      const { account, name, response } = await req.json();
      const resp = response as RegistrationResponseJSON;
      const challenge = challengeFromClient(resp);
      const held = await consumeChallenge(challenge, 'reg', account);
      if (!held) return fail(401, '만료되었거나 이미 쓴 등록 질문입니다 — 다시 시도하세요');
      const v = await verifyRegistrationResponse({
        response: resp,
        expectedChallenge: challenge,
        expectedOrigin: expectOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!v.verified || !v.registrationInfo) return fail(403, '등록 서명이 유효하지 않습니다');
      const { credential } = v.registrationInfo;
      if (!(await kv.get(['acct', account])).value)
        await kv.set(['acct', account], { handle: account, createdAt: new Date().toISOString() });
      if (!(await kv.get(['priv', account])).value)
        await kv.set(['priv', account], { items: SEED_ITEMS(account) });
      const cred: Cred = {
        id: credential.id,
        publicKey: b64u(credential.publicKey),
        name: (name || '패스키').slice(0, 24),
        createdAt: new Date().toISOString(),
        counter: credential.counter,
        transports: resp.response.transports,
      };
      await kv.set(['cred', account, cred.id], cred);
      return send({ ok: true, account, credentialId: cred.id, publicKeyStored: cred.publicKey.slice(0, 40) + '…' }, 201);
    }

    /* ===== 로그인: 질문 발급 ===== */
    if (req.method === 'POST' && url.pathname === '/api/login/options') {
      const { account } = await req.json();
      const existing = await credsOf(account);
      if (!existing.length) return fail(404, '그 계정에는 등록된 패스키가 없습니다');
      const opts = await generateAuthenticationOptions({
        rpID,
        allowCredentials: existing.map(c => ({ id: c.id, transports: c.transports as any })),
        userVerification: 'required',
      });
      const challenge = await issueChallenge('auth', account);
      (opts as any).challenge = challenge;
      (opts as any).issuedAt = new Date().toISOString();
      return send(opts);
    }

    /* ===== 로그인: 서명 검증 → 세션 발급 ===== */
    if (req.method === 'POST' && url.pathname === '/api/login/verify') {
      const { account, response } = await req.json();
      const resp = response as AuthenticationResponseJSON;
      const challenge = challengeFromClient(resp);
      const held = await consumeChallenge(challenge, 'auth', account);
      if (!held) return fail(401, '만료되었거나 이미 쓴 로그인 질문입니다 — 다시 시도하세요');
      const creds = await credsOf(account);
      const cred = creds.find(c => c.id === resp.id);
      if (!cred) return fail(403, '이 계정에 등록되지 않은 패스키입니다');
      const v = await verifyAuthenticationResponse({
        response: resp,
        expectedChallenge: challenge,
        expectedOrigin: expectOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: cred.id, publicKey: unb64u(cred.publicKey), counter: cred.counter, transports: cred.transports as any },
      });
      if (!v.verified) return fail(403, '서명이 유효하지 않습니다');
      await kv.set(['cred', account, cred.id], { ...cred, counter: v.authenticationInfo.newCounter });
      const token = await createSession(account);
      return send({ ok: true, token, account });
    }

    /* ===== 로그아웃 — 세션 즉시 삭제 ===== */
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const sess = await sessionOf(req);
      if (sess) await kv.delete(['sess', sess.token]);
      return send({ ok: true });
    }

    /* ===== 비공개 자료 조회/수정 ===== */
    if (url.pathname === '/api/private') {
      const sess = await sessionOf(req);
      if (!sess) return fail(401, '로그인이 필요합니다 — 패스키로 들어오세요');
      const want = url.searchParams.get('account');
      if (want && want !== sess.account)
        return fail(403, `이 자리는 ${want}의 것 — 당신은 ${sess.account}입니다`);
      if (req.method === 'GET') {
        const got = await kv.get<{ items: unknown[] }>(['priv', sess.account]);
        return send({ account: sess.account, items: got.value?.items || [] });
      }
      if (req.method === 'PUT') {
        const { items } = await req.json();
        if (!Array.isArray(items) || items.length > 20) return fail(400, '항목 형식이 아닙니다');
        const clean = items.slice(0, 20).map((it: any) => ({
          id: String(it.id || randId()), title: String(it.title || '').slice(0, 60), body: String(it.body || '').slice(0, 2000),
        }));
        await kv.set(['priv', sess.account], { items: clean });
        return send({ ok: true });
      }
    }

    /* ===== 패스키 목록/삭제 ===== */
    if (url.pathname === '/api/passkeys' && req.method === 'GET') {
      const sess = await sessionOf(req);
      if (!sess) return fail(401, '로그인이 필요합니다');
      return send({ account: sess.account, passkeys: (await credsOf(sess.account)).map(({ id, name, createdAt, counter }) => ({ id, name, createdAt, counter })) });
    }
    const mDel = url.pathname.match(/^\/api\/passkeys\/([A-Za-z0-9_\-]+)$/);
    if (mDel && req.method === 'DELETE') {
      const sess = await sessionOf(req);
      if (!sess) return fail(401, '로그인이 필요합니다');
      const creds = await credsOf(sess.account);
      const target = creds.find(c => c.id === mDel[1]);
      if (!target) return fail(404, '그 패스키가 없습니다');
      if (creds.length <= 1) return fail(409, '마지막 패스키입니다 — 이걸 지우면 계정에 다시 들어올 방법이 없어서 막아 둡니다');
      await kv.delete(['cred', sess.account, target.id]);
      return send({ ok: true, remaining: creds.length - 1 });
    }

    if (url.pathname === '/api/health') return send({ ok: true, service: 'pds-passkey', rp: rpID });
    return fail(404, '없는 주소입니다');
  } catch (e) {
    return json({ error: String((e as Error).message || e), stack: String((e as Error).stack || '').slice(0, 800), status: 500 }, 500, cors);
  }
});

/* clientDataJSON 안의 challenge를 읽어 서버 보관분과 대조할 키로 쓴다 */
function challengeFromClient(resp: RegistrationResponseJSON | AuthenticationResponseJSON): string {
  try {
    const json = JSON.parse(new TextDecoder().decode(unb64u(resp.response.clientDataJSON as unknown as string)));
    return json.challenge || '';
  } catch {
    return '';
  }
}
