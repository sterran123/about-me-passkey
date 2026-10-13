// ===== API 주소 설정 =====
// Deno Deploy에 올라간 서버 (console.deno.com → sterran123 → pds-passkey)
window.API_BASE = 'https://pds-passkey.sterran123.deno.net';
// 로컬 개발(Deno)에서는 같은 출처를 쓴다
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  window.API_BASE = 'http://localhost:8000';
